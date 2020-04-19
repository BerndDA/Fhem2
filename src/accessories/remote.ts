'use strict';

import { FhemAccessory } from './base';
import { IFhemClient } from '../client/fhemclient';
import { IFhemObservable } from '../client/broker';
import {
    Service,
    Characteristic,
    CharacteristicEventTypes,
    CharacteristicGetCallback,
    CharacteristicValue,
    CharacteristicSetCallback,
    Logging
} from 'homebridge';
import { IFhemDevice as FhemDevice } from '../client/fhemtypes';

export class FhemLametricRemote extends FhemAccessory {
    private active!: Characteristic;
    private activeIdentifier!: Characteristic;
    private configuredName!: Characteristic;
    private sleepDiscoveryMode!: Characteristic;
    private remoteKey!: Characteristic;
    private powerPlug: string;

    constructor(data: FhemDevice, log: Logging, fhemClient: IFhemClient, fhemObservable: IFhemObservable) {
        super(data, log, fhemClient, fhemObservable);
        this.powerPlug = data.Attributes.powerPlug;
        fhemObservable.on(this.powerPlug, (value) => {
            if (value === 'on') this.turnOn();
            else if (value === 'off') this.turnOff();
        });
    }

    setValueFromFhem(value: string, part2?: string): void {
        if (value === 'on')
            this.active.setValue(Characteristic.Active.ACTIVE, undefined, 'fhem');
        if (value === 'off')
            this.active.setValue(Characteristic.Active.INACTIVE, undefined, 'fhem');
    }

    private activeId: CharacteristicValue = 0;

    getDeviceServices(): Service[] {
        const service = new Service.Television(this.name, '');
        this.active = service.getCharacteristic(Characteristic.Active)!;

        this.active.on(CharacteristicEventTypes.GET, (cb: CharacteristicGetCallback) => {
            this.getFhemStatus().then(status => cb(null,
                status === 'on' ? Characteristic.Active.ACTIVE
                : Characteristic.Active.INACTIVE));
        });

        this.active.on(CharacteristicEventTypes.SET,
            (value: CharacteristicValue, cb: CharacteristicSetCallback, context: string) => {
                if (context !== 'fhem') {
                    if (value === Characteristic.Active.ACTIVE) {
                        this.turnOn();
                        this.setFhemReadingForDevice(this.powerPlug, null, 'on');
                    } else {
                        this.turnOff();
                        this.setFhemReadingForDevice(this.powerPlug, null, 'off');
                    }
                }
                cb();
            });

        this.activeIdentifier = service.getCharacteristic(Characteristic.ActiveIdentifier)!;
        this.activeIdentifier.on(CharacteristicEventTypes.GET, (cb: CharacteristicGetCallback) => {
            cb(null, this.activeId);
        });
        this.activeIdentifier.on(CharacteristicEventTypes.SET,
            (value: CharacteristicValue, cb: CharacteristicSetCallback) => {
                this.activeId = value;
                cb();
            });

        this.configuredName = service.getCharacteristic(Characteristic.ConfiguredName)!;
        this.configuredName.on(CharacteristicEventTypes.GET, (cb: CharacteristicGetCallback) => {
            cb(null, 'lametr');
        });
        this.configuredName.on(CharacteristicEventTypes.SET,
            (_value: CharacteristicValue, cb: CharacteristicSetCallback) => {
                cb();
            });

        this.sleepDiscoveryMode = service.getCharacteristic(Characteristic.SleepDiscoveryMode)!;
        this.sleepDiscoveryMode.on(CharacteristicEventTypes.GET, (cb: CharacteristicGetCallback) => {
            cb(null, Characteristic.SleepDiscoveryMode.ALWAYS_DISCOVERABLE);
        });

        this.remoteKey = service.getCharacteristic(Characteristic.RemoteKey)!;
        this.remoteKey.on(CharacteristicEventTypes.SET, this.setKey.bind(this));

        return [service];
    }

    private async turnOn() {
        await this.setFhemStatus('on');
        await this.setFhemStatus('play');
    }

    private async turnOff() {
        await this.setFhemStatus('stop');
        await this.setFhemStatus('off');
    }

    private setKey(value: CharacteristicValue, cb: CharacteristicSetCallback) {
        this.log(`key pressed: ${value}`);
        if (value === Characteristic.RemoteKey.ARROW_RIGHT)
            this.setFhemStatus('channelUp');
        if (value === Characteristic.RemoteKey.ARROW_LEFT)
            this.setFhemStatus('channelDown');
        if (value === Characteristic.RemoteKey.ARROW_UP)
            this.setFhemStatus('volumeUp');
        if (value === Characteristic.RemoteKey.ARROW_DOWN)
            this.setFhemStatus('volumeDown');
        if (value === Characteristic.RemoteKey.SELECT) {
            this.getFhemStatus().then(status => {
                if (status === 'on') {
                    this.turnOff();
                    this.setFhemReadingForDevice(this.powerPlug, null, 'off');
                } else {
                    this.turnOn();
                    this.setFhemReadingForDevice(this.powerPlug, null, 'on');
                }
            });
        }
        cb();
    }

}