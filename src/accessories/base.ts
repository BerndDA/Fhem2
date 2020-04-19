import { IFhemObservable } from '../client/broker';
import { IFhemClient, FhemValueType } from '../client/fhemclient';
import { Logging, Service, Characteristic, AccessoryPlugin } from 'homebridge';
import { IFhemDevice as FhemDevice } from '../client/fhemtypes';


export abstract class FhemAccessory implements AccessoryPlugin {
    name: string;
    data: FhemDevice;
    log: Logging;
    fhemName: string;
    fhemClient: IFhemClient;

    protected constructor(data: FhemDevice, log: Logging, fhemClient: IFhemClient, fhemObservable: IFhemObservable) {
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
        const informationService = new Service.AccessoryInformation();

        informationService
            .setCharacteristic(Characteristic.Manufacturer, 'FHEM')
            .setCharacteristic(Characteristic.Model, this.data.Internals.TYPE)
            .setCharacteristic(Characteristic.SerialNumber, this.data.Internals.NR);
        const deviceServices = this.getDeviceServices();

        return [informationService].concat(deviceServices);
    }

    identify() {
        this.log.info(`Identify requested! ${this.name}`);
    }
}