import { FhemObservable } from "../client/broker";
import { FhemClient, FhemValueType } from "../client/fhemclient";
import { Logging, Service, AccessoryPlugin, HAP } from "homebridge";
import { FhemDevice  } from "../client/fhemtypes";

export interface FhemAccessoryConstructor {
    new(data: FhemDevice, log: Logging, fhemClient: FhemClient, fhemObservable: FhemObservable): AccessoryPlugin;
}

export abstract class FhemAccessory implements AccessoryPlugin {
    name: string;
    data: FhemDevice;
    log: Logging;
    fhemName: string;
    fhemClient: FhemClient;
    public static hap: HAP;

    constructor(data: FhemDevice, log: Logging, fhemClient: FhemClient, fhemObservable: FhemObservable) {
        this.data = data;
        this.log = log;
        this.name = data.Attributes.alias ? data.Attributes.alias : data.Name;
        this.fhemName = data.Name;
        this.fhemClient = fhemClient;
        fhemObservable.on(this.fhemName, this.setValueFromFhem.bind(this));
    }

    protected async setFhemStatus(status: string): Promise<void> {
        await this.setFhemReading(null, status);
    }

    protected async setFhemReading(reading: string | null, value: string): Promise<void> {
        await this.setFhemReadingForDevice(this.fhemName, reading, value);
    }

    protected async setFhemReadingForDevice(device: string, reading: string | null, value: string,
        force = false): Promise<void> {
        await this.fhemClient.setFhemReadingForDevice(device, reading, value, force);
    }

    protected async getFhemStatus(): Promise<string | null> {
        return this.getFhemNamedValue(FhemValueType.Internals, "STATE");
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
            .setCharacteristic(FhemAccessory.hap.Characteristic.Manufacturer, "FHEM")
            .setCharacteristic(FhemAccessory.hap.Characteristic.Model, this.data.Internals.TYPE)
            .setCharacteristic(FhemAccessory.hap.Characteristic.SerialNumber, this.data.Internals.NR);
        const deviceServices = this.getDeviceServices();

        return [informationService].concat(deviceServices);
    }

    identify(): void {
        this.log.info(`Identify requested! ${this.name}`);
    }
}