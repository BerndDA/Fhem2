﻿/// <reference types="node" />

"use strict";

import { FhemBroker, FhemObservable } from "./client/broker";
import { FhemClient } from "./client/fhemclient";
import { FhemSwitch, FhemLightbulb, FhemOutlet, FhemProgSwitch } from "./accessories/switches";
import { FhemMotionSensor, FhemContactSensor, FhemTemperatureSensor, FhemTemperatureHumiditySensor, FhemTempKW9010, FhemAirQualitySensor }
    from "./accessories/sensors";
import { FhemThermostat, FhemHeatingKW910, FhemEqivaThermostat } from "./accessories/thermo";
import { FhemWindowCovering, FhemDoubleTapSwitch, FhemWindowCoveringDuofern } from "./accessories/windows";
import { FhemLametricRemote } from "./accessories/remote";
import { Logging, API, PlatformConfig, StaticPlatformPlugin, AccessoryPlugin } from "homebridge";
import { FhemAccessoryConstructor, FhemAccessory } from "./accessories/base";

const accessoryTypes: { [name: string]: FhemAccessoryConstructor } = {
    heating: FhemThermostat,
    heatingKW9010: FhemHeatingKW910,
    heatingEQ3: FhemEqivaThermostat,
    switch: FhemSwitch,
    lightbulb: FhemLightbulb,
    motionsensor: FhemMotionSensor,
    contactsensor: FhemContactSensor,
    temperaturesensor: FhemTemperatureSensor,
    temperaturehumiditysensor: FhemTemperatureHumiditySensor,
    tempKW9010: FhemTempKW9010,
    outlet: FhemOutlet,
    windowcovering: FhemWindowCovering,
    lametricremote: FhemLametricRemote,
    progswitch: FhemProgSwitch,
    updownswitch: FhemDoubleTapSwitch,
    duofernblinds: FhemWindowCoveringDuofern,
    airquality: FhemAirQualitySensor,
};

class Fhem2Platform implements StaticPlatformPlugin {
    log: Logging;
    filter: string[];
    fhemBroker: FhemObservable;
    fhemClient: FhemClient;

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

    private async compileAccessories(): Promise<AccessoryPlugin[]> {
        const deviceList = await this.fhemClient.getDeviceList();
        const acc: AccessoryPlugin[] = [];
        deviceList.Results.forEach((device) => {
            if (!device.Attributes.homebridgeType || !accessoryTypes[device.Attributes.homebridgeType]) {
                return;
            }
            if (this.filter.length !== 0 && this.filter.indexOf(device.Attributes.homebridgeType) === -1) {
                return;
            }

            const accessory =
                new accessoryTypes[device.Attributes.homebridgeType
                ](device, this.log, this.fhemClient, this.fhemBroker);
            acc.push(accessory);
        });
       
        return acc;
    }
}

export default function (homebridge: API): void {
    FhemAccessory.hap = homebridge.hap;
    homebridge.registerPlatform("homebridge-fhem2", "Fhem2", Fhem2Platform);
}