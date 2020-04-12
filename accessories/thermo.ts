import { FhemAccessory } from './base';
import { IFhemClient, FhemValueType } from '../client/fhemclient';
import { IFhemObservable } from '../client/broker';
import { Logging } from 'homebridge';


export class FhemThermostat extends FhemAccessory {

    private currentHeatingCoolingState;
    private targetHeatingCoolingState;
    private currentTemperature;
    private targetTemperature;
    private temperatureDisplayUnits;
    private currentRelativeHumidity;
    protected tempsensor: string;

    constructor(data, log: Logging, fhemClient: IFhemClient, fhemObservable: IFhemObservable) {
        super(data, log, fhemClient, fhemObservable);
        //register on tempsensor
        this.tempsensor = this.data.Internals.TEMPSENSOR;
        fhemObservable.on(this.tempsensor, this.setValueFromFhem.bind(this));
    }

    getDeviceServices(): any[] {
        const service = new FhemAccessory.Service.Thermostat(this.name);
        this.currentHeatingCoolingState =
            service.getCharacteristic(FhemAccessory.Characteristic.CurrentHeatingCoolingState);
        this.currentHeatingCoolingState.on('get', this.getHCState.bind(this));

        this.targetHeatingCoolingState =
            service.getCharacteristic(FhemAccessory.Characteristic.TargetHeatingCoolingState);
        this.targetHeatingCoolingState.on('get', this.getHCState.bind(this))
            .on('set', (value: Number, callback, context: string) => { callback(); });

        this.currentTemperature = service.getCharacteristic(FhemAccessory.Characteristic.CurrentTemperature);
        this.currentTemperature.on('get', this.getCurrentTemp.bind(this));

        this.currentRelativeHumidity =
            service.addCharacteristic(new FhemAccessory.Characteristic.CurrentRelativeHumidity());
        this.currentRelativeHumidity.on('get', this.getCurrentHumidity.bind(this));

        this.targetTemperature = service.getCharacteristic(FhemAccessory.Characteristic.TargetTemperature);
        this.targetTemperature.on('get', this.getTargetTemp.bind(this)).on('set', this.setTargetTemp.bind(this));

        this.temperatureDisplayUnits = service.getCharacteristic(FhemAccessory.Characteristic.TemperatureDisplayUnits);
        this.temperatureDisplayUnits.on('get', (cb) => {
                cb(FhemAccessory.Characteristic.TemperatureDisplayUnits.CELSIUS)
            })
            .on('set', (value: Number, callback, context: string) => { callback(); });

        return [service];
    }

    getHCState(callback): void {
        this.getFhemNamedValue(FhemValueType.Readings, 'actorState').then(status =>
            callback(null,
                status === 'on' ? FhemAccessory.Characteristic.CurrentHeatingCoolingState.HEAT
                : FhemAccessory.Characteristic.CurrentHeatingCoolingState.OFF)
        );
    }

    getCurrentTemp(callback): void {
        this.getFhemNamedValueForDevice(this.tempsensor, FhemValueType.Readings, 'temperature').then(temp =>
            callback(null, Number(temp))
        );
    }

    getCurrentHumidity(callback): void {
        this.getFhemNamedValueForDevice(this.tempsensor, FhemValueType.Readings, 'humidity').then(temp =>
            callback(null, Number(temp))
        );
    }

    getTargetTemp(callback): void {
        this.getFhemNamedValue(FhemValueType.Readings, 'desired-temp').then(temp =>
            callback(null, Number(temp))
        );
    }

    setTargetTemp(value: number, callback, context: string): void {
        if (context !== 'fhem')
            this.setFhemReading('desired-temp', value.toString());
        callback();
    }

    setValueFromFhem(reading: string, value?: string): void {
        if (reading === 'temperature') {
            this.currentTemperature.setValue(Number(value), undefined, 'fhem');
        }
        if (reading === 'humidity') {
            this.currentRelativeHumidity.setValue(Number(value), undefined, 'fhem');
        }
        if (reading === 'desired-temp') {
            this.targetTemperature.setValue(Number(value), undefined, 'fhem');
        }
    }
}

export class FhemEqivaThermostat extends FhemAccessory {

    private currentHeatingCoolingState;
    private targetHeatingCoolingState;
    private currentTemperature;
    private targetTemperature;
    private temperatureDisplayUnits;
    private currentRelativeHumidity;
    protected tempsensor: string;

    constructor(data, log: Logging, fhemClient: IFhemClient, fhemObservable: IFhemObservable) {
        super(data, log, fhemClient, fhemObservable);
        //register on tempsensor
        this.tempsensor = this.data.Attributes.tempsensor;
        fhemObservable.on(this.tempsensor, this.setValueFromFhem.bind(this));
    }

    getDeviceServices(): any[] {
        const service = new FhemAccessory.Service.Thermostat(this.name);
        this.currentHeatingCoolingState =
            service.getCharacteristic(FhemAccessory.Characteristic.CurrentHeatingCoolingState);
        this.currentHeatingCoolingState.on('get', this.getHCState.bind(this));

        this.targetHeatingCoolingState =
            service.getCharacteristic(FhemAccessory.Characteristic.TargetHeatingCoolingState);
        this.targetHeatingCoolingState.on('get', this.getHCState.bind(this)).on('set', this.setHCState.bind(this));

        this.currentTemperature = service.getCharacteristic(FhemAccessory.Characteristic.CurrentTemperature);
        this.currentTemperature.on('get', this.getCurrentTemp.bind(this));

        this.currentRelativeHumidity =
            service.addCharacteristic(new FhemAccessory.Characteristic.CurrentRelativeHumidity());
        this.currentRelativeHumidity.on('get', this.getCurrentHumidity.bind(this));

        this.targetTemperature = service.getCharacteristic(FhemAccessory.Characteristic.TargetTemperature);
        this.targetTemperature.on('get', this.getTargetTemp.bind(this)).on('set', this.setTargetTemp.bind(this));

        this.temperatureDisplayUnits = service.getCharacteristic(FhemAccessory.Characteristic.TemperatureDisplayUnits);
        this.temperatureDisplayUnits.on('get', (cb) => {
                cb(FhemAccessory.Characteristic.TemperatureDisplayUnits.CELSIUS)
            })
            .on('set', (value: Number, callback, context: string) => { callback(); });

        return [service];
    }

    getHCState(callback): void {
        this.getFhemNamedValue(FhemValueType.Readings, 'desiredTemperature').then(temp =>
            callback(null,
                Number(temp) > 4.5 ? FhemAccessory.Characteristic.CurrentHeatingCoolingState.AUTO
                : FhemAccessory.Characteristic.CurrentHeatingCoolingState.OFF)
        );
    }

    getCurrentTemp(callback): void {
        this.getFhemNamedValueForDevice(this.tempsensor, FhemValueType.Readings, 'temperature').then((temp) =>
            callback(null, Number(temp))
        );
    }

    getCurrentHumidity(callback): void {
        this.getFhemNamedValueForDevice(this.tempsensor, FhemValueType.Readings, 'humidity').then((temp) =>
            callback(null, Number(temp))
        );
    }

    getTargetTemp(callback): void {
        this.getFhemNamedValue(FhemValueType.Readings, 'desiredTemperature').then(temp =>
            callback(null, Number(temp))
        );
    }

    setTargetTemp(value: number, callback, context: string): void {
        if (context !== 'fhem')
            this.setFhemReading('desiredTemperature', value.toString());
        callback();
    }

    setHCState(value: number, callback, context: string): void {
        if (context !== 'fhem')
            this.setFhemReading('desiredTemperature',
                value === FhemAccessory.Characteristic.CurrentHeatingCoolingState.OFF ? '4.5' : '18.0');
        callback();
    }

    setValueFromFhem(reading: string, value?: string): void {
        if (reading === 'temperature') {
            this.currentTemperature.setValue(Number(value), undefined, 'fhem');
        }
        if (reading === 'humidity') {
            this.currentRelativeHumidity.setValue(Number(value), undefined, 'fhem');
        }
        if (reading === 'desiredTemperature') {
            this.targetTemperature.setValue(Number(value), undefined, 'fhem');
            this.currentHeatingCoolingState.setValue(
                Number(value) > 4.5 ? FhemAccessory.Characteristic.CurrentHeatingCoolingState.AUTO
                : FhemAccessory.Characteristic.CurrentHeatingCoolingState.OFF, undefined, 'fhem');
        }
    }
}

export class FhemHeatingKW910 extends FhemThermostat {
    setValueFromFhem(reading: string, value: string): void {
        super.setValueFromFhem(reading, value);
        if (reading === 'Code') {
            const res = this.calcValues(value);
            this.setFhemReadingForDevice(this.tempsensor, 'temperature', res.T.toString(), true);
            this.setFhemReadingForDevice(this.tempsensor, 'humidity', res.H.toString(), true);
            this.fhemClient.executeCommand(`setstate ${this.tempsensor} T: ${res.T.toString()} H: ${res.H.toString()}`);
        }
    }

    private calcValues(code: string): { T: Number, H: Number } {
        let bin = Number(`0x${code}`).toString(2);
        while (bin.length % 8 != 0) {
            bin = `0${bin}`;
        }
        let temp = parseInt(bin.substr(12, 11).split('').reverse().join(''), 2);
        if (bin[23] === '1') temp -= 2048;
        temp /= 10;
        const hum = parseInt(bin.substr(24, 8).split('').reverse().join(''), 2) - 156;
        return { T: temp, H: hum };
    }
}