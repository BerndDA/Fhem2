/// <reference types="node" />

'use strict';

import { FhemBroker, IFhemObservable } from './client/broker';
import { IFhemClient, FhemClient } from './client/fhemclient';
import { FhemAccessory } from './accessories/base';
import { FhemSwitch, FhemLightbulb, FhemOutlet, FhemProgSwitch } from './accessories/switches';
import { FhemMotionSensor, FhemContactSensor, FhemTemperatureSensor, FhemTemperatureHumiditySensor, FhemTempKW9010 } from './accessories/sensors';
import { FhemThermostat, FhemHeatingKW910, FhemEqivaThermostat } from './accessories/thermo';
import { FhemWindowCovering, FhemDoubleTapSwitch } from './accessories/windows';
import { FhemTvTest } from './accessories/test';

let accessoryTypes: { [name: string]: any } = {};
accessoryTypes['heating'] = FhemThermostat;
accessoryTypes['heatingKW9010'] = FhemHeatingKW910;
accessoryTypes['heatingEQ3'] = FhemEqivaThermostat;
accessoryTypes['switch'] = FhemSwitch;
accessoryTypes['lightbulb'] = FhemLightbulb;
accessoryTypes['motionsensor'] = FhemMotionSensor;
accessoryTypes['contactsensor'] = FhemContactSensor;
accessoryTypes['temperaturesensor'] = FhemTemperatureSensor;
accessoryTypes['temperaturehumiditysensor'] = FhemTemperatureHumiditySensor;
accessoryTypes['tempKW9010'] = FhemTempKW9010;
accessoryTypes['outlet'] = FhemOutlet;
accessoryTypes['windowcovering'] = FhemWindowCovering;
accessoryTypes['tvtest'] = FhemTvTest;
accessoryTypes['progswitch'] = FhemProgSwitch;
accessoryTypes['updownswitch'] = FhemDoubleTapSwitch;

export default function(homebridge) {
    FhemAccessory.Service = homebridge.hap.Service;
    FhemAccessory.Characteristic = homebridge.hap.Characteristic;
    FhemAccessory.Characteristic.CurrentHeatingCoolingState.AUTO = 3;
    homebridge.registerPlatform('homebridge-fhem2', 'Fhem2', Fhem2Platform);
};

interface IConfig {
    server: string;
    port: number;
    filter: string[];
    ssl: boolean;
}

class Fhem2Platform {
    log: (msg: string) => void;
    filter: string[];
    fhemBroker: IFhemObservable;
    fhemClient: IFhemClient;

    constructor(log, config: IConfig) {
        this.log = log;
        this.filter = config.filter;
        const broker = new FhemBroker();
        this.fhemBroker = broker;
        this.fhemClient = new FhemClient(log, broker, `http://${`${config.server}:${config.port}`}`);
        this.fhemClient.subscribeToFhem();
    }

    accessories(cb) {
        this.compileAccessories().then(res => cb(res))
            .catch(e => this.log(e));
    }

    private async compileAccessories() {
        const devicelist = await this.fhemClient.getDeviceList();
        const acc = [];
        for (let i = 0; i < devicelist.Results.length; i++) {
            const device = devicelist.Results[i];
            if (!device.Attributes.homebridgeType || !accessoryTypes[device.Attributes.homebridgeType]) continue;

            if (this.filter.length !== 0 && this.filter.indexOf(device.Attributes.homebridgeType) !== -1) continue;
            const accessory =
                new accessoryTypes[device.Attributes.homebridgeType](device, this.log, this.fhemClient, this.fhemBroker);
            acc.push(accessory);
        }
        return acc;
    }
}


