import { FhemAccessory } from "./base";
import { FhemClient, FhemValueType } from "../client/fhemclient";
import { FhemObservable } from "../client/broker";
import { Logging } from "homebridge";
import {
    Service,
    Characteristic,
    CharacteristicEventTypes,
    CharacteristicGetCallback,
    CharacteristicValue,
    CharacteristicSetCallback,
} from "homebridge";
import { FhemDevice as IFhemDevice } from "../client/fhemtypes";

export class FhemThermostat extends FhemAccessory {

    private currentHeatingCoolingState!: Characteristic;
    private targetHeatingCoolingState!: Characteristic;
    private currentTemperature!: Characteristic;
    private targetTemperature!: Characteristic;
    private temperatureDisplayUnits!: Characteristic;
    private currentRelativeHumidity!: Characteristic;
    protected tempsensor: string;

    constructor(data: IFhemDevice, log: Logging, fhemClient: FhemClient, fhemObservable: FhemObservable) {
        super(data, log, fhemClient, fhemObservable);
        //register on tempsensor
        this.tempsensor = this.data.Internals.TEMPSENSOR;
        fhemObservable.on(this.tempsensor, this.setValueFromFhem.bind(this));
    }

    getDeviceServices(): Service[] {
        const service = new FhemAccessory.hap.Service.Thermostat(this.name);
        this.currentHeatingCoolingState =
            service.getCharacteristic(FhemAccessory.hap.Characteristic.CurrentHeatingCoolingState);
        this.currentHeatingCoolingState.on(FhemAccessory.hap.CharacteristicEventTypes.GET, this.getHCState.bind(this));

        this.targetHeatingCoolingState =
            service.getCharacteristic(FhemAccessory.hap.Characteristic.TargetHeatingCoolingState);
        this.targetHeatingCoolingState.on(CharacteristicEventTypes.GET, this.getHCState.bind(this))
            .on(CharacteristicEventTypes.SET, (value: CharacteristicValue, callback: CharacteristicSetCallback) => {
                callback();
            });

        this.currentTemperature = service.getCharacteristic(FhemAccessory.hap.Characteristic.CurrentTemperature);
        this.currentTemperature.on(CharacteristicEventTypes.GET, this.getCurrentTemp.bind(this));

        this.currentRelativeHumidity =
            service.addCharacteristic(new FhemAccessory.hap.Characteristic.CurrentRelativeHumidity());
        this.currentRelativeHumidity.on(CharacteristicEventTypes.GET, this.getCurrentHumidity.bind(this));

        this.targetTemperature = service.getCharacteristic(FhemAccessory.hap.Characteristic.TargetTemperature);
        this.targetTemperature.on(CharacteristicEventTypes.GET, this.getTargetTemp.bind(this))
            .on(CharacteristicEventTypes.SET, this.setTargetTemp.bind(this));

        this.temperatureDisplayUnits = service.getCharacteristic(FhemAccessory.hap.Characteristic.TemperatureDisplayUnits);
        this.temperatureDisplayUnits.on(CharacteristicEventTypes.GET,
            (cb: CharacteristicGetCallback) => cb(null, FhemAccessory.hap.Characteristic.TemperatureDisplayUnits.CELSIUS))
            .on(CharacteristicEventTypes.SET,
                (value: CharacteristicValue, callback: CharacteristicSetCallback) => {
                    callback(); 
                });

        return [service];
    }

    getHCState(callback: CharacteristicGetCallback): void {
        this.getFhemNamedValue(FhemValueType.Readings, "actorState").then(status =>
            callback(null,
                status === "on" ? FhemAccessory.hap.Characteristic.CurrentHeatingCoolingState.HEAT
                    : FhemAccessory.hap.Characteristic.CurrentHeatingCoolingState.OFF),
        );
    }

    getCurrentTemp(callback: CharacteristicGetCallback): void {
        this.getFhemNamedValueForDevice(this.tempsensor, FhemValueType.Readings, "temperature").then(temp =>
            callback(null, Number(temp)),
        );
    }

    getCurrentHumidity(callback: CharacteristicGetCallback): void {
        this.getFhemNamedValueForDevice(this.tempsensor, FhemValueType.Readings, "humidity").then(temp =>
            callback(null, Number(temp)),
        );
    }

    getTargetTemp(callback: CharacteristicGetCallback): void {
        this.getFhemNamedValue(FhemValueType.Readings, "desired-temp").then(temp =>
            callback(null, Number(temp)),
        );
    }

    setTargetTemp(value: CharacteristicValue, callback: CharacteristicSetCallback, context: string): void {
        if (context !== "fhem") {
            this.setFhemReading("desired-temp", value.toString());
        }
        callback();
    }

    setValueFromFhem(reading: string, value?: string): void {
        if (reading === "temperature") {
            this.currentTemperature.setValue(Number(value), undefined, "fhem");
        }
        if (reading === "humidity") {
            this.currentRelativeHumidity.setValue(Number(value), undefined, "fhem");
        }
        if (reading === "desired-temp") {
            this.targetTemperature.setValue(Number(value), undefined, "fhem");
        }
    }
}

export class FhemEqivaThermostat extends FhemAccessory {

    private static autoHeatingCoolingState = 3;

    private currentHeatingCoolingState!: Characteristic;
    private targetHeatingCoolingState!: Characteristic;
    private currentTemperature!: Characteristic;
    private targetTemperature!: Characteristic;
    private temperatureDisplayUnits!: Characteristic;
    private currentRelativeHumidity!: Characteristic;
    protected tempsensor: string;

    constructor(data: IFhemDevice, log: Logging, fhemClient: FhemClient, fhemObservable: FhemObservable) {
        super(data, log, fhemClient, fhemObservable);
        //register on tempsensor
        this.tempsensor = this.data.Attributes.tempsensor;
        fhemObservable.on(this.tempsensor, this.setValueFromFhem.bind(this));

    }

    getDeviceServices(): Service[] {
        const service = new FhemAccessory.hap.Service.Thermostat(this.name);
        this.currentHeatingCoolingState =
            service.getCharacteristic(FhemAccessory.hap.Characteristic.CurrentHeatingCoolingState);
        this.currentHeatingCoolingState.on(CharacteristicEventTypes.GET, this.getHCState.bind(this));

        this.targetHeatingCoolingState =
            service.getCharacteristic(FhemAccessory.hap.Characteristic.TargetHeatingCoolingState);
        this.targetHeatingCoolingState.on(CharacteristicEventTypes.GET, this.getHCState.bind(this))
            .on(CharacteristicEventTypes.SET, this.setHCState.bind(this));

        this.currentTemperature = service.getCharacteristic(FhemAccessory.hap.Characteristic.CurrentTemperature);
        this.currentTemperature.on(CharacteristicEventTypes.GET, this.getCurrentTemp.bind(this));

        this.currentRelativeHumidity =
            service.addCharacteristic(new FhemAccessory.hap.Characteristic.CurrentRelativeHumidity());
        this.currentRelativeHumidity.on(CharacteristicEventTypes.GET, this.getCurrentHumidity.bind(this));

        this.targetTemperature = service.getCharacteristic(FhemAccessory.hap.Characteristic.TargetTemperature);
        this.targetTemperature.on(CharacteristicEventTypes.GET, this.getTargetTemp.bind(this))
            .on(CharacteristicEventTypes.SET, this.setTargetTemp.bind(this));

        this.temperatureDisplayUnits = service.getCharacteristic(FhemAccessory.hap.Characteristic.TemperatureDisplayUnits);
        this.temperatureDisplayUnits.on(CharacteristicEventTypes.GET,
            (cb: CharacteristicGetCallback) => cb(null, FhemAccessory.hap.Characteristic.TemperatureDisplayUnits.CELSIUS))
            .on(CharacteristicEventTypes.SET, (value: CharacteristicValue, callback: CharacteristicSetCallback) => {
                callback();
            });

        return [service];
    }

    getHCState(callback: CharacteristicGetCallback): void {
        this.getFhemNamedValue(FhemValueType.Readings, "desiredTemperature").then(temp =>
            callback(null,
                Number(temp) > 4.5 ? FhemAccessory.hap.Characteristic.CurrentHeatingCoolingState.HEAT
                    : FhemAccessory.hap.Characteristic.CurrentHeatingCoolingState.OFF),
        );
    }

    getCurrentTemp(callback: CharacteristicGetCallback): void {
        this.getFhemNamedValueForDevice(this.tempsensor, FhemValueType.Readings, "temperature").then((temp) =>
            callback(null, Number(temp)),
        );
    }

    getCurrentHumidity(callback: CharacteristicGetCallback): void {
        this.getFhemNamedValueForDevice(this.tempsensor, FhemValueType.Readings, "humidity").then((temp) =>
            callback(null, Number(temp)),
        );
    }

    getTargetTemp(callback: CharacteristicGetCallback): void {
        this.getFhemNamedValue(FhemValueType.Readings, "desiredTemperature").then(temp =>
            callback(null, Number(temp)),
        );
    }

    setTargetTemp(value: CharacteristicValue, callback: CharacteristicSetCallback, context: string): void {
        if (context !== "fhem") {
            this.setFhemReading("desiredTemperature", value.toString());
        }
        callback();
    }

    setHCState(value: CharacteristicValue, callback: CharacteristicSetCallback, context: string): void {
        if (context !== "fhem" && value === FhemAccessory.hap.Characteristic.CurrentHeatingCoolingState.OFF) {
            this.setFhemReading("desiredTemperature", "4.5");
        }
        callback();
    }

    setValueFromFhem(reading: string, value?: string): void {
        if (reading === "temperature") {
            this.currentTemperature.setValue(Number(value), undefined, "fhem");
        }
        if (reading === "humidity") {
            this.currentRelativeHumidity.setValue(Number(value), undefined, "fhem");
        }
        if (reading === "desiredTemperature") {
            this.targetTemperature.setValue(Number(value), undefined, "fhem");
            this.currentHeatingCoolingState.setValue(
                Number(value) > 4.5 ? FhemAccessory.hap.Characteristic.CurrentHeatingCoolingState.HEAT
                    : FhemAccessory.hap.Characteristic.CurrentHeatingCoolingState.OFF, undefined, "fhem");
        }
    }
}

export class FhemHeatingKW910 extends FhemThermostat {
    setValueFromFhem(reading: string, value: string): void {
        super.setValueFromFhem(reading, value);
        if (reading === "Code") {
            const res = this.calcValues(value);
            this.setFhemReadingForDevice(this.tempsensor, "temperature", res.T.toString(), true);
            this.setFhemReadingForDevice(this.tempsensor, "humidity", res.H.toString(), true);
            this.fhemClient.executeCommand(`setstate ${this.tempsensor} T: ${res.T.toString()} H: ${res.H.toString()}`);
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