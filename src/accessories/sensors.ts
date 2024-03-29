import { FhemAccessory } from "./base";
import { FhemValueType } from "../client/fhemclient";
import { Characteristic, Service, CharacteristicEventTypes, CharacteristicGetCallback } from "homebridge";

abstract class FhemSensor extends FhemAccessory {
    protected characteristic!: Characteristic;

    getState(callback: CharacteristicGetCallback): void {
        this.getFhemStatus().then(status => callback(null, status === "on"));
    }

    setValueFromFhem(value: string): void {
        this.characteristic.setValue(value === "on", undefined, "fhem");
    }
}

export class FhemMotionSensor extends FhemSensor {

    getDeviceServices(): Service[] {
        const service = new FhemAccessory.hap.Service.MotionSensor(this.name);
        this.characteristic = service.getCharacteristic(FhemAccessory.hap.Characteristic.MotionDetected);
        this.characteristic
            .on(CharacteristicEventTypes.GET, this.getState.bind(this));
        return [service];
    }
}

export class FhemContactSensor extends FhemSensor {

    getDeviceServices(): Service[] {
        const service = new FhemAccessory.hap.Service.ContactSensor(this.name);
        this.characteristic = service.getCharacteristic(FhemAccessory.hap.Characteristic.ContactSensorState);
        this.characteristic
            .on(CharacteristicEventTypes.GET, this.getState.bind(this));
        return [service];
    }
}

export class FhemTemperatureSensor extends FhemAccessory {

    private currentTemperature!: Characteristic;

    getDeviceServices(): Service[] {
        const service = new FhemAccessory.hap.Service.TemperatureSensor(this.name);
        this.currentTemperature = service.getCharacteristic(FhemAccessory.hap.Characteristic.CurrentTemperature);
        this.currentTemperature.setProps({ minValue: -25 });
        this.currentTemperature.on(CharacteristicEventTypes.GET, this.getCurrentTemp.bind(this));
        return [service];
    }

    setValueFromFhem(reading: string, value: string): void {
        this.log(`received value: ${reading}.${value} for ${this.name}`);
        if (reading === "temperature") {
            this.currentTemperature.setValue(Number(value), undefined, "fhem");
        }
    }

    getCurrentTemp(callback: CharacteristicGetCallback): void {
        this.getFhemNamedValue(FhemValueType.Readings, "temperature").then((temp) =>
            callback(null, Number(temp)),
        );
    }
}

export class FhemTemperatureHumiditySensor extends FhemTemperatureSensor {

    private currentHumidity!: Characteristic;

    getDeviceServices(): Service[] {
        const service = new FhemAccessory.hap.Service.HumiditySensor(this.name);
        this.currentHumidity = service.getCharacteristic(FhemAccessory.hap.Characteristic.CurrentRelativeHumidity);
        this.currentHumidity.on(CharacteristicEventTypes.GET, this.getCurrentHum.bind(this));
        return [service].concat(super.getDeviceServices());
    }

    setValueFromFhem(reading: string, value: string): void {
        this.log(`received value: ${reading}.${value} for ${this.name}`);
        if (reading === "humidity") {
            this.currentHumidity.setValue(Number(value), undefined, "fhem");
        }
        super.setValueFromFhem(reading, value);
    }

    getCurrentHum(callback: CharacteristicGetCallback): void {
        this.getFhemNamedValue(FhemValueType.Readings, "humidity").then((hum) =>
            callback(null, Number(hum)),
        );
    }
}

export class FhemTempKW9010 extends FhemTemperatureSensor {
    setValueFromFhem(reading: string, value: string): void {
        super.setValueFromFhem(reading, value);
        if (reading === "Code") {
            const res = this.calcValues(value);
            this.setFhemReading("temperature", res.T.toString());
            this.setFhemReadingForDevice(this.fhemName, "temperature", res.T.toString(), true);
            this.setFhemReadingForDevice(this.fhemName, "humidity", res.H.toString(), true);
            this.fhemClient.executeCommand(`setstate ${this.fhemName} T: ${res.T.toString()} H: ${res.H.toString()}`);
        }
    }

    private calcValues(code: string): { T: number; H: number } {
        let bin = Number(`0x${code}`).toString(2);
        while (bin.length % 8 !== 0) {
            bin = `0${bin}`;
        }
        let temp = parseInt(bin.substr(12, 11).split("").reverse().join(""), 2);
        if (bin[23] === "1") {
            temp -= 2048;
        }
        temp /= 10;
        const hum = parseInt(bin.substr(24, 8).split("").reverse().join(""), 2) - 156;
        return { T: temp, H: hum };
    }
}

export class FhemAirQualitySensor extends FhemAccessory {

    private airQuality!: Characteristic;
    private pm25Density!: Characteristic;

    getDeviceServices(): Service[] {
        const service = new FhemAccessory.hap.Service.AirQualitySensor(this.name);
        this.airQuality = service.getCharacteristic(FhemAccessory.hap.Characteristic.AirQuality);
        this.airQuality.on(CharacteristicEventTypes.GET, this.getCurrentQuality.bind(this));
        this.pm25Density = service.getCharacteristic(FhemAccessory.hap.Characteristic.PM2_5Density);
        this.pm25Density.on(CharacteristicEventTypes.GET, this.getCurrentPM25.bind(this));
        return [service];
    }

    setValueFromFhem(reading: string, value: string): void {
        this.log(`received value: ${reading}.${value} for ${this.name}`);
        if (reading === "pm25") {
            this.airQuality.setValue(this.qualityFromPm25(Number(value)), "fhem");
            this.pm25Density.setValue(Number(value), "fhem");
        } 
    }

    getCurrentQuality(callback: CharacteristicGetCallback): void {
        this.getFhemNamedValue(FhemValueType.Readings, "pm25").then((pm25) =>
            callback(null, this.qualityFromPm25(Number(pm25))),
        );
    } 
    getCurrentPM25(callback: CharacteristicGetCallback): void {
        this.getFhemNamedValue(FhemValueType.Readings, "pm25").then((pm25) =>
            callback(null, Number(pm25)),
        );
    }

    qualityFromPm25(pm25: number): number {
        if(pm25 <= 5) {
            return FhemAccessory.hap.Characteristic.AirQuality.EXCELLENT;
        } else if(pm25 <= 10) {
            return FhemAccessory.hap.Characteristic.AirQuality.GOOD;
        } else if(pm25 <= 25) {
            return FhemAccessory.hap.Characteristic.AirQuality.FAIR;
        } else if(pm25 <= 50) {
            return FhemAccessory.hap.Characteristic.AirQuality.INFERIOR;
        }
        return FhemAccessory.hap.Characteristic.AirQuality.POOR;
    }
} 