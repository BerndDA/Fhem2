import { IFhemObservable } from '../client/broker';
import { IFhemClient, FhemValueType } from '../client/fhemclient';
import { Logging, Service, Characteristic, AccessoryPlugin, HAP } from 'homebridge';
import { IFhemDevice } from '../client/fhemtypes';

export interface IFhemAccessoryConstructor {
    new(data: IFhemDevice, log: Logging, fhemClient: IFhemClient, fhemObservable: IFhemObservable):AccessoryPlugin;
}

export abstract class FhemAccessory implements AccessoryPlugin {
    name: string;
    data: IFhemDevice;
    log: Logging;
    fhemName: string;
    fhemClient: IFhemClient;
    public static hap: HAP;

    constructor(data: IFhemDevice, log: Logging, fhemClient: IFhemClient, fhemObservable: IFhemObservable) {
        this.data = data;
        this.log = log;
        this.name = data.Attributes.alias ? data.Attributes.alias : data.Name;
        this.fhemName = data.Name;
        this.fhemClient = fhemClient;
        fhemObservable.on(this.fhemName, this.setValueFromFhem.bind(this));
    }

    protected async setFhemStatus(status: string) {
        await this.setFhemReading(null, status);
    }

    protected async setFhemReading(reading: string | null, value: string) {
        await this.setFhemReadingForDevice(this.fhemName, reading, value);
    }

    protected async setFhemReadingForDevice(device: string, reading: string | null, value: string,
        force: boolean = false) {
        await this.fhemClient.setFhemReadingForDevice(device, reading, value, force);
    }

    protected async getFhemStatus(): Promise<string | null> {
        return this.getFhemNamedValue(FhemValueType.Internals, 'STATE');
    }

    protected async getFhemNamedValue(fhemType: FhemValueType, name: string): Promise<string | null> {
        return this.getFhemNamedValueForDevice(this.fhemName, fhemType, name);
    }

    protected async getFhemNamedValueForDevice(device: string, fhemType: FhemValueType, name: string):
        Promise<string | null> {
        return this.fhemClient.getFhemNamedValueForDevice(device, fhemType, name);
    }

    abstract setValueFromFhem(value: string, part2?: string): void;

    protected abstract getDeviceServices(): Service[];

    getServices(): Service[] {
        const informationService = new FhemAccessory.hap.Service.AccessoryInformation();

        informationService
            .setCharacteristic(FhemAccessory.hap.Characteristic.Manufacturer, 'FHEM')
            .setCharacteristic(FhemAccessory.hap.Characteristic.Model, this.data.Internals.TYPE)
            .setCharacteristic(FhemAccessory.hap.Characteristic.SerialNumber, this.data.Internals.NR);
        const deviceServices = this.getDeviceServices();

        return [informationService].concat(deviceServices);
    }

    identify() {
        this.log.info(`Identify requested! ${this.name}`);
    }
}