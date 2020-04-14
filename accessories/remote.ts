'use strict';

import { FhemAccessory } from './base';
import Fhemclient = require('../client/fhemclient');
import IFhemClient = Fhemclient.IFhemClient;
import Broker = require('../client/broker');
import IFhemObservable = Broker.IFhemObservable;

export class FhemLametricRemote extends FhemAccessory {
    private active;
    private activeIdentifier;
    private configuredName;
    private sleepDiscoveryMode;
    private remoteKey;
    private powerPlug:string;

    constructor(data, log, fhemClient: IFhemClient, fhemObservable: IFhemObservable) {
        super(data, log, fhemClient, fhemObservable);
        this.powerPlug = data.Attributes.powerPlug;
        fhemObservable.on(this.powerPlug, (value) => {
            if (value === 'on') this.turnOn();
            else if (value === 'off') this.turnOff();
        });
    }

    setValueFromFhem(value: string, part2?: string): void {
        if(value==='on')
            this.active.setValue(FhemAccessory.Characteristic.Active.ACTIVE, undefined, 'fhem');
        if (value === 'off')
            this.active.setValue(FhemAccessory.Characteristic.Active.INACTIVE, undefined, 'fhem');
    }

    private activeId:Number = 0;

    getDeviceServices(): any[] {
        const service = new FhemAccessory.Service.Television(this.name);
        this.active = service.getCharacteristic(FhemAccessory.Characteristic.Active);

        this.active.on('get', (cb) => {
            this.getFhemStatus().then(status => cb(null,
                status === 'on' ? FhemAccessory.Characteristic.Active.ACTIVE
                : FhemAccessory.Characteristic.Active.INACTIVE));
        });

        this.active.on('set', (value: Number, cb, context:string) => {
            if (context !== 'fhem') {
                if (value === FhemAccessory.Characteristic.Active.ACTIVE) {
                    this.turnOn();
                    this.setFhemReadingForDevice(this.powerPlug, null, 'on');
                } else {
                    this.turnOff();
                    this.setFhemReadingForDevice(this.powerPlug, null, 'off');
                }
            }
            cb();
        });
       
        this.activeIdentifier = service.getCharacteristic(FhemAccessory.Characteristic.ActiveIdentifier);
        this.activeIdentifier.on('get', (cb) => {
            cb(null, this.activeId);
        });
        this.activeIdentifier.on('set', (value: Number, cb) => {
            this.activeId = value;
             cb();
        });

        this.configuredName = service.getCharacteristic(FhemAccessory.Characteristic.ConfiguredName);
        this.configuredName.on('get', (cb) => {
            cb(null, 'lametr');
        });
        this.configuredName.on('set', (value, cb) => {
            cb();
        });

        this.sleepDiscoveryMode = service.getCharacteristic(FhemAccessory.Characteristic.SleepDiscoveryMode);
        this.sleepDiscoveryMode.on('get', (cb) => {
            cb(null, FhemAccessory.Characteristic.SleepDiscoveryMode.ALWAYS_DISCOVERABLE);
        });

        this.remoteKey = service.getCharacteristic(FhemAccessory.Characteristic.RemoteKey);
        this.remoteKey.on('set', this.setKey.bind(this));

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

    private setKey(value: Number, cb) {
        this.log("key pressed: " + value);
        if(value === FhemAccessory.Characteristic.RemoteKey.ARROW_RIGHT)
            this.setFhemStatus('channelUp');
        if (value === FhemAccessory.Characteristic.RemoteKey.ARROW_LEFT)
            this.setFhemStatus('channelDown');
        if (value === FhemAccessory.Characteristic.RemoteKey.ARROW_UP)
            this.setFhemStatus('volumeUp');
        if (value === FhemAccessory.Characteristic.RemoteKey.ARROW_DOWN)
            this.setFhemStatus('volumeDown');
        if (value === FhemAccessory.Characteristic.RemoteKey.SELECT) {
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