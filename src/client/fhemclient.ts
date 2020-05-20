/// <reference types="node" />

'use strict';

import { IFhemBroker } from './broker';
import * as http from 'http';
import * as dns from 'dns';
import * as os from 'os';
import getContent from '../util/promiseHttpGet';
import { Logging } from 'homebridge';
import { IFhemDeviceList } from './fhemtypes';

export interface IFhemClient {
    subscribeToFhem(): void;
    getDeviceList(): Promise<IFhemDeviceList>;
    getFhemNamedValueForDevice(device: string, fhemType: FhemValueType, name: string): Promise<string | null>;
    setFhemReadingForDevice(device: string, reading: string | null, value: string, force: boolean): Promise<void>;
    executeCommand(cmd: string): Promise<void>;
}

export enum FhemValueType {
    "Internals",
    "Readings",
    "Attributes",
}

export class FhemClient implements IFhemClient {

    private broker: IFhemBroker;
    private baseUrl: string;
    private log: Logging;

    constructor(log: Logging, broker: IFhemBroker, baseUrl: string) {
        this.broker = broker;
        this.log = log;
        this.baseUrl = baseUrl;
    }

    async getDeviceList(): Promise<IFhemDeviceList> {
        const cmd = 'jsonlist2';
        const url = encodeURI(`${this.baseUrl}/fhem?cmd=${cmd}&XHR=1`);
        return getContent(url);
    }

    async getFhemNamedValueForDevice(device: string, fhemType: FhemValueType, name: string): Promise<string | null> {
        const url = encodeURI(`${this.baseUrl}/fhem?cmd=jsonlist2 ${device} ${name}&XHR=1`);
        const response = await getContent(url);
        if (response.Results.length > 0) {
            const val = response.Results[0][FhemValueType[fhemType]][name];
            return val.Value ? val.Value : val;
        }
        return null;
    }

    async setFhemReadingForDevice(device: string, reading: string | null, value: string, force: boolean = false) {
        let cmd: string;
        if (!force) {
            cmd = `set ${device} `;
        } else {
            cmd = `setreading ${device} `;
        }
        if (reading) cmd += reading + ' ';
        cmd += value;
        await this.executeCommand(cmd);
    }

    async executeCommand(cmd: string) {
        try {
            const url = encodeURI(`${this.baseUrl}/fhem?cmd=${cmd}&XHR=1`);
            await getContent(url);
        } catch (e) {
            this.log.error(`error executing: ${cmd} ${e}`);
        }
    }

    async subscribeToFhem() {
        try {
            //delete the notification
            let url = encodeURI(`${this.baseUrl}/fhem?cmd=delete nfHomekit_${os.hostname()}&XHR=1`);
            await getContent(url);

            const address = await dns.promises.resolve4(os.hostname());
            const command =
                encodeURIComponent(
                    `define nfHomekit_${os.hostname()
                    } notify .* {my $new = $EVENT =~ s/: /\\//r;; HttpUtils_NonblockingGet({ url=>"http://${
                    address[0]}:2000/$NAME/$new", callback=>sub($$$){} })}`);
            url = `${this.baseUrl}/fhem?cmd=${command}&XHR=1`;
            await getContent(url);
        } catch (e) {
            this.log.error(e);
        }
        http.createServer((req, res) => {
            res.statusCode = 200;
            res.end('ok');
            if (req.url) {
                const splitted = req.url.toString().split('/');
                this.log.info(`fhem callback: ${req.url}`);
                this.broker.notify(splitted[1], splitted[2], splitted.length > 3 ? splitted[3] : null);
            }
        }).listen(2000);

    }
}