import { IFhemSubscriber, IFhemObservable } from "../client/broker";
import { IFhemClient, FhemValueType } from "../client/fhemclient";



export abstract class FhemAccessory implements IFhemSubscriber {
    name: string;
    data: any;
    log: (msg: string) => void;
    fhemName: string;
    fhemClient: IFhemClient;
    static Service: any;
    static Characteristic: any;


    protected constructor(data, log, fhemClient: IFhemClient, fhemObservable: IFhemObservable) {
        this.data = data;
        this.log = log;
        this.name = data.Attributes.alias ? data.Attributes.alias : data.Name;
        this.fhemName = data.Name;
        this.fhemClient = fhemClient;
        fhemObservable.subscribe(this.fhemName, this);
    }

    protected setFhemStatus(status: string): void {
        this.setFhemReading(null, status);
    }

    protected setFhemReading(reading: string, value: string): void {
        this.setFhemReadingForDevice(this.fhemName, reading, value);
    }

    protected setFhemReadingForDevice(device: string, reading: string, value: string, force: boolean = false): void {
        this.fhemClient.setFhemReadingForDevice(device, reading, value, force);
    }


    protected async getFhemStatus(): Promise<string> {
        return this.getFhemNamedValue(FhemValueType.Internals, 'STATE');
    }

    protected async getFhemNamedValue(fhemType: FhemValueType, name: string): Promise<string> {
        return this.getFhemNamedValueForDevice(this.fhemName, fhemType, name);
    }

    protected async getFhemNamedValueForDevice(device: string, fhemType: FhemValueType, name: string): Promise<string> {
        return this.fhemClient.getFhemNamedValueForDevice(device, fhemType, name);
    }

    abstract setValueFromFhem(value: string, part2?: string): void;

    protected abstract getDeviceServices(): any[];

    getServices(): any[] {
        const informationService = new FhemAccessory.Service.AccessoryInformation();

        informationService
            .setCharacteristic(FhemAccessory.Characteristic.Manufacturer, 'FHEM')
            .setCharacteristic(FhemAccessory.Characteristic.Model, this.data.Internals.TYPE)
            .setCharacteristic(FhemAccessory.Characteristic.SerialNumber, this.data.Internals.NR);
        const deviceServices = this.getDeviceServices();
        var $this = this;
        deviceServices.forEach((element) => {
            element.getCharacteristic(FhemAccessory.Characteristic.Name)
                .on('get', (cb) => {
                    cb(null, $this.data.Attributes.siriName ? $this.data.Attributes.siriName : '');
                });
        });

        return [informationService].concat(deviceServices);
    }

    identify(callback) {
        this.log('Identify requested!');
        callback(); // success
    }
}