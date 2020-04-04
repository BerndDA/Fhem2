/// <reference types="node" />

'use strict';

import { IFhemBroker } from './broker';
import http = require('http');
import dns = require('dns');
import os = require('os');
import getContent from '../util/promiseHttpGet';

export interface IFhemClient {
    subscribeToFhem(): void;
    getDeviceList(): Promise<any>;
    getFhemNamedValueForDevice(device: string, fhemType: FhemValueType, name: string): Promise<string|null>;
    setFhemReadingForDevice(device: string, reading: string|null, value: string, force: boolean): void;
    executeCommand(cmd: string): void;
}

export enum FhemValueType {
    "Internals",
    "Readings",
    "Attributes",
}

export class FhemClient implements IFhemClient {

    private broker: IFhemBroker;
    private baseUrl: string;
    private log: any;

    constructor(log: any, broker: IFhemBroker, baseUrl: string) {
        this.broker = broker;
        this.log = log;
        this.baseUrl = baseUrl;
    }

    async getDeviceList(): Promise<any> {
        const cmd = 'jsonlist2';
        const url = encodeURI(`${this.baseUrl}/fhem?cmd=${cmd}&XHR=1`);
        return getContent(url);
    }

    async getFhemNamedValueForDevice(device: string, fhemType: FhemValueType, name: string): Promise<string|null> {
        const url = encodeURI(`${this.baseUrl}/fhem?cmd=jsonlist2 ${device} ${name}&XHR=1`);
        const response = await getContent(url);
        if (response.Results.length > 0) {
            const val = response.Results[0][FhemValueType[fhemType]][name];
            return val.Value ? val.Value : val;
        }
        return null;
    }

    setFhemReadingForDevice(device: string, reading: string|null, value: string, force: boolean = false): void {
        let cmd: string;
        if (!force) {
            cmd = `set ${device} `;
        } else {
            cmd = `setreading ${device} `;
        }
        if (reading) cmd += reading + ' ';
        cmd += value;
        this.executeCommand(cmd);
    }

    executeCommand(cmd: string): void {
        const url = encodeURI(`${this.baseUrl}/fhem?cmd=${cmd}&XHR=1`);
        getContent(url).catch(e => this.log(`error executing: ${cmd} ${e}`));
    }

    async subscribeToFhem() {
        try {
            //delete the notification
            let url = encodeURI(this.baseUrl + '/fhem?cmd=delete nfHomekitdev&XHR=1');
            await getContent(url);

            const address = await dns.promises.resolve4(os.hostname());
            const command =
                encodeURIComponent(
                    `define nfHomekitdev notify .* {my $new = $EVENT =~ s/: /\\//r;; HttpUtils_NonblockingGet({ url=>"http://${
                    address[0]}:2000/$NAME/$new", callback=>sub($$$){} })}`);
            url = `${this.baseUrl}/fhem?cmd=${command}&XHR=1`;
            await getContent(url);
        } catch (e) {
            this.log(e);
        }
        http.createServer((req, res) => {
            res.statusCode = 200;
            res.end('ok');
            if (req.url) {
                var splitted = req.url.toString().split('/');
                this.log(req.url.toString());
                this.broker.notify(splitted[1], splitted[2], splitted.length > 3 ? splitted[3] : null);
            }
        }).listen(2000);
    }
}