/// <reference types="node" />

'use strict';

import { FhemBroker, IFhemObservable } from './client/broker';
import { IFhemClient, FhemClient } from './client/fhemclient';
import { FhemSwitch, FhemLightbulb, FhemOutlet, FhemProgSwitch } from './accessories/switches';
import { FhemMotionSensor, FhemContactSensor, FhemTemperatureSensor, FhemTemperatureHumiditySensor, FhemTempKW9010 }
    from './accessories/sensors';
import { FhemThermostat, FhemHeatingKW910, FhemEqivaThermostat } from './accessories/thermo';
import { FhemWindowCovering, FhemDoubleTapSwitch } from './accessories/windows';
import { FhemLametricRemote } from './accessories/remote';
import { Logging, API, PlatformConfig, LegacyPlatformPlugin, AccessoryPlugin } from 'homebridge'

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
accessoryTypes['lametricremote'] = FhemLametricRemote;
accessoryTypes['progswitch'] = FhemProgSwitch;
accessoryTypes['updownswitch'] = FhemDoubleTapSwitch;

export default function(homebridge: API) {

    homebridge.registerPlatform('homebridge-fhem2', 'Fhem2', Fhem2Platform as any);
};

class Fhem2Platform implements LegacyPlatformPlugin {
    log: Logging;
    filter: string[];
    fhemBroker: IFhemObservable;
    fhemClient: IFhemClient;

    constructor(log: Logging, config: PlatformConfig) {
        this.log = log;
        this.filter = config.filter;
        const broker = new FhemBroker();
        this.fhemBroker = broker;
        this.fhemClient = new FhemClient(log, broker, `http://${`${config.server}:${config.port}`}`);
        this.fhemClient.subscribeToFhem();
    }

    accessories(cb: (foundAccessories: AccessoryPlugin[]) => void): void {
        this.compileAccessories().then(res => cb(res))
            .catch(e => this.log.error(e));
    }

    private async compileAccessories() {
        const deviceList = await this.fhemClient.getDeviceList();
        const acc: any[] = [];
        for (let i = 0; i < deviceList.Results.length; i++) {
            const device = deviceList.Results[i];
            if (!device.Attributes.homebridgeType || !accessoryTypes[device.Attributes.homebridgeType]) continue;

            if (this.filter.length !== 0 && this.filter.indexOf(device.Attributes.homebridgeType) === -1) continue;
            const accessory =
                new accessoryTypes[device.Attributes.homebridgeType
                ](device, this.log, this.fhemClient, this.fhemBroker);
            acc.push(accessory);
        }
        return acc;
    }
}