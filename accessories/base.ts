import { IFhemObservable } from '../client/broker';
import { IFhemClient, FhemValueType } from '../client/fhemclient';
import { Logging, Service, Characteristic } from 'homebridge';


export abstract class FhemAccessory {
    name: string;
    data: any;
    log: Logging;
    fhemName: string;
    fhemClient: IFhemClient;

    protected constructor(data, log: Logging, fhemClient: IFhemClient, fhemObservable: IFhemObservable) {
        this.data = data;
        this.log = log;
        this.name = data.Attributes.alias ? data.Attributes.alias : data.Name;
        this.fhemName = data.Name;
        this.fhemClient = fhemClient;
        fhemObservable.on(this.fhemName, this.setValueFromFhem.bind(this));
    }

    protected setFhemStatus(status: string): void {
        this.setFhemReading(null, status);
    }

    protected setFhemReading(reading: string|null, value: string): void {
        this.setFhemReadingForDevice(this.fhemName, reading, value);
    }

    protected setFhemReadingForDevice(device: string, reading: string|null, value: string, force: boolean = false): void {
        this.fhemClient.setFhemReadingForDevice(device, reading, value, force);
    }

    protected async getFhemStatus(): Promise<string|null> {
        return this.getFhemNamedValue(FhemValueType.Internals, 'STATE');
    }

    protected async getFhemNamedValue(fhemType: FhemValueType, name: string): Promise<string|null> {
        return this.getFhemNamedValueForDevice(this.fhemName, fhemType, name);
    }

    protected async getFhemNamedValueForDevice(device: string, fhemType: FhemValueType, name: string): Promise<string|null> {
        return this.fhemClient.getFhemNamedValueForDevice(device, fhemType, name);
    }

    abstract setValueFromFhem(value: string, part2?: string): void;

    protected abstract getDeviceServices(): Service[];

    getServices(): Service[] {
        const informationService = new Service.AccessoryInformation();

        informationService
            .setCharacteristic(Characteristic.Manufacturer, 'FHEM')
            .setCharacteristic(Characteristic.Model, this.data.Internals.TYPE)
            .setCharacteristic(Characteristic.SerialNumber, this.data.Internals.NR);
        const deviceServices = this.getDeviceServices();

        return [informationService].concat(deviceServices);
    }

    identify(callback) {
        this.log.info(`Identify requested! ${this.name}`);
        callback(); // success
    }
}