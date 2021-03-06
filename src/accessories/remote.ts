"use strict";

import { FhemAccessory } from "./base";
import { FhemClient } from "../client/fhemclient";
import { FhemObservable } from "../client/broker";
import {
    Service,
    Characteristic,
    CharacteristicEventTypes,
    CharacteristicGetCallback,
    CharacteristicValue,
    CharacteristicSetCallback,
    Logging,
} from "homebridge";
import { FhemDevice as IFhemDevice  } from "../client/fhemtypes";

export class FhemLametricRemote extends FhemAccessory {
    private active!: Characteristic;
    private activeIdentifier!: Characteristic;
    private configuredName!: Characteristic;
    private sleepDiscoveryMode!: Characteristic;
    private remoteKey!: Characteristic;
    private powerPlug: string;

    constructor(data: IFhemDevice, log: Logging, fhemClient: FhemClient, fhemObservable: FhemObservable) {
        super(data, log, fhemClient, fhemObservable);
        this.powerPlug = data.Attributes.powerPlug;
        fhemObservable.on(this.powerPlug, (value) => {
            if (value === "on") {
                this.turnOn();
            } else if (value === "off") {
                this.turnOff();
            }
        });
    }

    setValueFromFhem(value: string): void {
        if (value === "on") {
            this.active.setValue(FhemAccessory.hap.Characteristic.Active.ACTIVE, undefined, "fhem");
        }
        if (value === "off") {
            this.active.setValue(FhemAccessory.hap.Characteristic.Active.INACTIVE, undefined, "fhem");
        }
    }

    private activeId: CharacteristicValue = 0;

    getDeviceServices(): Service[] {
        const service = new FhemAccessory.hap.Service.Television(this.name, "");
        this.active = service.getCharacteristic(FhemAccessory.hap.Characteristic.Active);

        this.active.on(CharacteristicEventTypes.GET, (cb: CharacteristicGetCallback) => {
            this.getFhemStatus().then(status => cb(null,
                status === "on" ? FhemAccessory.hap.Characteristic.Active.ACTIVE
                    : FhemAccessory.hap.Characteristic.Active.INACTIVE));
        });

        this.active.on(CharacteristicEventTypes.SET,
            (value: CharacteristicValue, cb: CharacteristicSetCallback, context: string) => {
                if (context !== "fhem") {
                    if (value === FhemAccessory.hap.Characteristic.Active.ACTIVE) {
                        this.turnOn();
                        this.setFhemReadingForDevice(this.powerPlug, null, "on");
                    } else {
                        this.turnOff();
                        this.setFhemReadingForDevice(this.powerPlug, null, "off");
                    }
                }
                cb();
            });

        this.activeIdentifier = service.getCharacteristic(FhemAccessory.hap.Characteristic.ActiveIdentifier);
        this.activeIdentifier.on(CharacteristicEventTypes.GET, (cb: CharacteristicGetCallback) => {
            cb(null, this.activeId);
        });
        this.activeIdentifier.on(CharacteristicEventTypes.SET,
            (value: CharacteristicValue, cb: CharacteristicSetCallback) => {
                this.activeId = value;
                cb();
            });

        this.configuredName = service.getCharacteristic(FhemAccessory.hap.Characteristic.ConfiguredName);
        this.configuredName.on(CharacteristicEventTypes.GET, (cb: CharacteristicGetCallback) => {
            cb(null, "lametr");
        });
        this.configuredName.on(CharacteristicEventTypes.SET,
            (_value: CharacteristicValue, cb: CharacteristicSetCallback) => {
                cb();
            });

        this.sleepDiscoveryMode = service.getCharacteristic(FhemAccessory.hap.Characteristic.SleepDiscoveryMode);
        this.sleepDiscoveryMode.on(CharacteristicEventTypes.GET, (cb: CharacteristicGetCallback) => {
            cb(null, FhemAccessory.hap.Characteristic.SleepDiscoveryMode.ALWAYS_DISCOVERABLE);
        });

        this.remoteKey = service.getCharacteristic(FhemAccessory.hap.Characteristic.RemoteKey);
        this.remoteKey.on(CharacteristicEventTypes.SET, this.setKey.bind(this));

        return [service];
    }

    private async turnOn() {
        await this.setFhemStatus("on");
        await this.setFhemStatus("play");
    }

    private async turnOff() {
        await this.setFhemStatus("stop");
        await this.setFhemStatus("off");
    }

    private setKey(value: CharacteristicValue, cb: CharacteristicSetCallback) {
        this.log(`key pressed: ${value}`);
        if (value === FhemAccessory.hap.Characteristic.RemoteKey.ARROW_RIGHT) {
            this.setFhemStatus("channelUp");
        }
        if (value === FhemAccessory.hap.Characteristic.RemoteKey.ARROW_LEFT) {
            this.setFhemStatus("channelDown");
        }
        if (value === FhemAccessory.hap.Characteristic.RemoteKey.ARROW_UP) {
            this.setFhemStatus("volumeUp");
        }
        if (value === FhemAccessory.hap.Characteristic.RemoteKey.ARROW_DOWN) {
            this.setFhemStatus("volumeDown");
        }
        if (value === FhemAccessory.hap.Characteristic.RemoteKey.SELECT) {
            this.getFhemStatus().then(status => {
                if (status === "on") {
                    this.turnOff();
                    this.setFhemReadingForDevice(this.powerPlug, null, "off");
                } else {
                    this.turnOn();
                    this.setFhemReadingForDevice(this.powerPlug, null, "on");
                }
            });
        }
        cb();
    }

}