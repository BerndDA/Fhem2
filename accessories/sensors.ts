import { FhemAccessory } from './base';
import { FhemValueType } from '../client/fhemclient';

abstract class FhemSensor extends FhemAccessory {
    protected characteristic: any;

    getState(callback): void {
        this.getFhemStatus().then(status => callback(null, status === 'on'));
    }

    setValueFromFhem(value: string): void {
        this.log(`received value: ${value} for ${this.name}`);
        this.characteristic.setValue(value === 'on', undefined, 'fhem');
    }
}

export class FhemMotionSensor extends FhemSensor {

    getDeviceServices(): any[] {
        const service = new FhemAccessory.Service.MotionSensor(this.name);
        this.characteristic = service.getCharacteristic(FhemAccessory.Characteristic.MotionDetected);
        this.characteristic
            .on('get', this.getState.bind(this));
        return [service];
    }
}

export class FhemContactSensor extends FhemSensor {

    getDeviceServices(): any[] {
        const service = new FhemAccessory.Service.ContactSensor(this.name);
        this.characteristic = service.getCharacteristic(FhemAccessory.Characteristic.ContactSensorState);
        this.characteristic
            .on('get', this.getState.bind(this));
        return [service];
    }
}

export class FhemTemperatureSensor extends FhemAccessory {

    private currentTemperature: any;

    getDeviceServices(): any[] {
        const service = new FhemAccessory.Service.TemperatureSensor(this.name);
        this.currentTemperature = service.getCharacteristic(FhemAccessory.Characteristic.CurrentTemperature);
        this.currentTemperature.setProps({ minValue: -25 });
        this.currentTemperature.on('get', this.getCurrentTemp.bind(this));
        return [service];
    }

    setValueFromFhem(reading: string, value: string): void {
        this.log(`received value: ${reading}.${value} for ${this.name}`);
        if (reading === 'temperature') {
            this.currentTemperature.setValue(Number(value), undefined, 'fhem');
        }
    }

    getCurrentTemp(callback): void {
        this.getFhemNamedValue(FhemValueType.Readings, 'temperature').then((temp) =>
            callback(null, Number(temp))
        );
    }
}

export class FhemTemperatureHumiditySensor extends FhemTemperatureSensor {

    private currentHumidity: any;

    getDeviceServices(): any[] {
        const service = new FhemAccessory.Service.HumiditySensor(this.name);
        this.currentHumidity = service.getCharacteristic(FhemAccessory.Characteristic.CurrentRelativeHumidity);
        this.currentHumidity.on('get', this.getCurrentHum.bind(this));
        return [service].concat(super.getDeviceServices());
    }

    setValueFromFhem(reading: string, value: string): void {
        this.log(`received value: ${reading}.${value} for ${this.name}`);
        if (reading === 'humidity') {
            this.currentHumidity.setValue(Number(value), undefined, 'fhem');
        }
        super.setValueFromFhem(reading, value);
    }

    getCurrentHum(callback): void {
        this.getFhemNamedValue(FhemValueType.Readings, 'humidity').then((hum) =>
            callback(null, Number(hum))
        );
    }
}

export class FhemTempKW9010 extends FhemTemperatureSensor {
    setValueFromFhem(reading: string, value: string): void {
        super.setValueFromFhem(reading, value);
        if (reading === 'Code') {
            const res = this.calcValues(value);
            this.setFhemReading('temperature', res.T.toString());
            this.setFhemReadingForDevice(this.fhemName, 'temperature', res.T.toString(), true);
            this.setFhemReadingForDevice(this.fhemName, 'humidity', res.H.toString(), true);
            this.fhemClient.executeCommand(`setstate ${this.fhemName} T: ${res.T.toString()} H: ${res.H.toString()}`);
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