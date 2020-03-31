/// <reference types="node" />

'use strict';

import http = require('http');
import getContent from './util/promiseHttpGet';

import dns = require('dns');
import os = require('os');


let allSubscriptions: { [name: string]: FhemAccessory[] } = {};
let accessoryTypes: { [name: string]: any } = {};

let Service, Characteristic;


export default function(homebridge) {
    Service = homebridge.hap.Service;
    Characteristic = homebridge.hap.Characteristic;
    //Add missing auto mode constant
    Characteristic.CurrentHeatingCoolingState.AUTO = 3;
    homebridge.registerPlatform('homebridge-fhem2', 'Fhem2', Fhem2Platform);
};

interface IConfig {
    server: string;
    port: number;
    filter: string[];
    ssl: boolean;
}

enum FhemValueType {
    "Internals",
    "Readings",
    "Attributes",
}

class Fhem2Platform {
    log: (msg: string) => void;
    server: string;
    port: number;
    filter: string[];
    baseUrl: string;

    constructor(log, config: IConfig) {
        this.log = log;
        this.server = config.server;
        this.port = config.port;
        this.filter = config.filter;

        if (config.ssl)
            this.baseUrl = 'https://';
        else
            this.baseUrl = 'http://';
        this.baseUrl += `${this.server}:${this.port}`;
        this.subscribeToFhem();
    }

    private async subscribeToFhem() {
        try {
            //delete the notification
            let url = encodeURI(this.baseUrl + '/fhem?cmd=delete nfHomekitdev&XHR=1');
            await getContent(url);

            const address = await dns.promises.resolve4(os.hostname());
            const command =
                encodeURIComponent(
                    `define nfHomekitdev notify .* {my $new = $EVENT =~ s/: /\\//r;; HttpUtils_NonblockingGet({ url=>"http://${
                    address[0]}:2000/$NAME/$new", callback=>sub($$$){} })}`);
            url = `${this.baseUrl}/fhem?cmd=${command}&XHR=1`;
            await getContent(url);
        } catch (e) {
            this.log(e);
        }
        http.createServer((req, res) => {
            res.statusCode = 200;
            res.end('ok');
            var splitted = req.url.toString().split('/');
            this.log(req.url.toString());
            if (allSubscriptions[splitted[1]]) {
                allSubscriptions[splitted[1]].forEach((accessory) => {
                    accessory.setValueFromFhem(splitted[2], splitted.length > 3 ? splitted[3] : null);
                });
            }
        }).listen(2000);
    }

    accessories(cb) {
        this.compileAccessories().then(res => cb(res))
            .catch(e => this.log(e));
    }

    private async compileAccessories() {
        const cmd = 'jsonlist2';

        const url = encodeURI(`${this.baseUrl}/fhem?cmd=${cmd}&XHR=1`);

        const devicelist = await getContent(url);
        const acc = [];
        for (let i = 0; i < devicelist.Results.length; i++) {
            const device = devicelist.Results[i];
            if (!device.Attributes.homebridgeType || !accessoryTypes[device.Attributes.homebridgeType]) continue;

            if (this.filter.length !== 0 && this.filter.indexOf(device.Attributes.homebridgeType) !== -1) continue;

            acc.push(new accessoryTypes[device.Attributes.homebridgeType](device, this.log, this.baseUrl));
        }
        return acc;
    }
}

abstract class FhemAccessory {
    name: string;
    data: any;
    log: (msg: string) => void;
    fhemName: string;
    baseUrl: string;

    protected constructor(data, log, baseUrl: string) {
        this.data = data;
        this.log = log;
        this.name = data.Attributes.alias ? data.Attributes.alias : data.Name;
        this.fhemName = data.Name;
        this.baseUrl = baseUrl;
        allSubscriptions[this.fhemName] ? allSubscriptions[this.fhemName].push(this) : allSubscriptions[this.fhemName] =
            [this];
    }

    protected setFhemStatus(status: string): void {
        this.setFhemReading(null, status);
    }

    protected setFhemReading(reading: string, value: string): void {
        this.setFhemReadingForDevice(this.fhemName, reading, value);
    }

    protected setFhemReadingForDevice(device: string, reading: string, value: string, force: boolean = false): void {
        let cmd: string;
        if (!force) {
            cmd = `set ${device} `;
        } else {
            cmd = `setreading ${device} `;
        }
        if (reading) cmd += reading + ' ';
        cmd += value;
        this.executeCommand(cmd);
    }

    protected executeCommand(cmd: string): void {
        const url = encodeURI(`${this.baseUrl}/fhem?cmd=${cmd}&XHR=1`);
        getContent(url).catch(e => this.log(`error executing: ${cmd} ${e}`));

    }

    protected async getFhemStatus(): Promise<string> {
        return this.getFhemNamedValue(FhemValueType.Internals, 'STATE');
    }

    protected async getFhemNamedValue(fhemType: FhemValueType, name: string): Promise<string> {
        return this.getFhemNamedValueForDevice(this.fhemName, fhemType, name);
    }

    protected async getFhemNamedValueForDevice(device: string, fhemType: FhemValueType, name: string): Promise<string> {
        const url = encodeURI(`${this.baseUrl}/fhem?cmd=jsonlist2 ${device} ${name}&XHR=1`);
        const response = await getContent(url);
        if (response.Results.length > 0) {
            const val = response.Results[0][FhemValueType[fhemType]][name];
            return val.Value ? val.Value : val;
        }
        return null;
    }

    abstract setValueFromFhem(value: string, part2?: string): void;

    protected abstract getDeviceServices(): any[];

    getServices(): any[] {
        const informationService = new Service.AccessoryInformation();

        informationService
            .setCharacteristic(Characteristic.Manufacturer, 'FHEM')
            .setCharacteristic(Characteristic.Model, this.data.Internals.TYPE)
            .setCharacteristic(Characteristic.SerialNumber, this.data.Internals.NR);
        const deviceServices = this.getDeviceServices();
        var $this = this;
        deviceServices.forEach((element) => {
            element.getCharacteristic(Characteristic.Name)
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

class FhemDoubleTapSwitch extends FhemAccessory {

    private characteristicUp: any;
    private characteristicDown: any;

    setValueFromFhem(value: string, part2?: string): void {}

    getDeviceServices(): any[] {
        const sUp = new Service.Switch('up', 'up');
        this.characteristicUp = sUp.getCharacteristic(Characteristic.On).on('get', (cb) => cb(null, false))
            .on('set', this.setUpState.bind(this));
        const sDown = new Service.Switch('down', 'down');
        this.characteristicDown = sDown.getCharacteristic(Characteristic.On).on('get', (cb) => cb(null, true))
            .on('set', this.setDownState.bind(this));

        return [sUp, sDown];
    }

    setUpState(value: boolean, callback, context: string): void {
        if (context !== 'fhem' && value) {
            this.setFhemStatus('on');
            setTimeout(() => {
                this.characteristicUp.setValue(false, undefined, 'fhem');
            }, 100);
        }
        callback();
    }

    setDownState(value: boolean, callback, context: string): void {
        if (context !== 'fhem' && !value) {
            this.setFhemStatus('off');
            setTimeout(() => {
                this.characteristicDown.setValue(true, undefined, 'fhem');
            }, 100);
        }
        callback();
    }
}

abstract class FhemOnOffSwitchable extends FhemAccessory {

    characteristic: any;

    getPowerState(callback): void {
        this.getFhemStatus().then(status =>
            callback(null, status === 'on')
        );
    }

    setPowerState(value: boolean, callback, context: string): void {
        if (context !== 'fhem')
            this.setFhemStatus(value ? 'on' : 'off');
        callback();
    }

    setValueFromFhem(value: string): void {
        this.log(`received value: ${value} for ${this.name}`);
        this.characteristic.setValue(value === 'on', undefined, 'fhem');
    }
}

class FhemSwitch extends FhemOnOffSwitchable {
    getDeviceServices(): any[] {
        const switchService = new Service.Switch(this.name);
        this.characteristic = switchService.getCharacteristic(Characteristic.On);
        this.characteristic
            .on('get', this.getPowerState.bind(this))
            .on('set', this.setPowerState.bind(this));
        return [switchService];
    }
}

class FhemLightbulb extends FhemOnOffSwitchable {
    getDeviceServices(): any[] {
        const service = new Service.Lightbulb(this.name);
        this.characteristic = service.getCharacteristic(Characteristic.On);
        this.characteristic
            .on('get', this.getPowerState.bind(this))
            .on('set', this.setPowerState.bind(this));
        return [service];
    }
}

class FhemOutlet extends FhemOnOffSwitchable {
    getDeviceServices(): any[] {
        const service = new Service.Outlet(this.name);
        this.characteristic = service.getCharacteristic(Characteristic.On);
        this.characteristic
            .on('get', this.getPowerState.bind(this))
            .on('set', this.setPowerState.bind(this));
        service.getCharacteristic(Characteristic.OutletInUse).on('get', (callback) => { callback(null, true); });
        return [service];
    }
}

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

class FhemMotionSensor extends FhemSensor {

    getDeviceServices(): any[] {
        const service = new Service.MotionSensor(this.name);
        this.characteristic = service.getCharacteristic(Characteristic.MotionDetected);
        this.characteristic
            .on('get', this.getState.bind(this));
        return [service];
    }
}

class FhemContactSensor extends FhemSensor {

    getDeviceServices(): any[] {
        const service = new Service.ContactSensor(this.name);
        this.characteristic = service.getCharacteristic(Characteristic.ContactSensorState);
        this.characteristic
            .on('get', this.getState.bind(this));
        return [service];
    }
}

class FhemThermostat extends FhemAccessory {

    private currentHeatingCoolingState;
    private targetHeatingCoolingState;
    private currentTemperature;
    private targetTemperature;
    private temperatureDisplayUnits;
    private currentRelativeHumidity;
    protected tempsensor: string;

    constructor(data, log, baseUrl: string) {
        super(data, log, baseUrl);
        //register on tempsensor
        this.tempsensor = this.data.Internals.TEMPSENSOR;
        allSubscriptions[this.tempsensor] ? allSubscriptions[this.tempsensor].push(this)
            : allSubscriptions[this.tempsensor] = [this];
    }

    getDeviceServices(): any[] {
        const service = new Service.Thermostat(this.name);
        this.currentHeatingCoolingState = service.getCharacteristic(Characteristic.CurrentHeatingCoolingState);
        this.currentHeatingCoolingState.on('get', this.getHCState.bind(this));

        this.targetHeatingCoolingState = service.getCharacteristic(Characteristic.TargetHeatingCoolingState);
        this.targetHeatingCoolingState.on('get', this.getHCState.bind(this))
            .on('set', (value: Number, callback, context: string) => { callback(); });

        this.currentTemperature = service.getCharacteristic(Characteristic.CurrentTemperature);
        this.currentTemperature.on('get', this.getCurrentTemp.bind(this));

        this.currentRelativeHumidity = service.addCharacteristic(new Characteristic.CurrentRelativeHumidity());
        this.currentRelativeHumidity.on('get', this.getCurrentHumidity.bind(this));

        this.targetTemperature = service.getCharacteristic(Characteristic.TargetTemperature);
        this.targetTemperature.on('get', this.getTargetTemp.bind(this)).on('set', this.setTargetTemp.bind(this));

        this.temperatureDisplayUnits = service.getCharacteristic(Characteristic.TemperatureDisplayUnits);
        this.temperatureDisplayUnits.on('get', (cb) => { cb(Characteristic.TemperatureDisplayUnits.CELSIUS) })
            .on('set', (value: Number, callback, context: string) => { callback(); });

        return [service];
    }

    getHCState(callback): void {
        this.getFhemNamedValue(FhemValueType.Readings, 'actorState').then(status =>
            callback(null,
                status === 'on' ? Characteristic.CurrentHeatingCoolingState.HEAT
                : Characteristic.CurrentHeatingCoolingState.OFF)
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

    setValueFromFhem(reading: string, value: string): void {
        this.log(`received value: ${reading}.${value} for ${this.name}`);
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

class FhemEqivaThermostat extends FhemAccessory {

    private currentHeatingCoolingState;
    private targetHeatingCoolingState;
    private currentTemperature;
    private targetTemperature;
    private temperatureDisplayUnits;
    private currentRelativeHumidity;
    protected tempsensor: string;

    constructor(data, log, baseUrl: string) {
        super(data, log, baseUrl);
        //register on tempsensor
        this.tempsensor = this.data.Attributes.tempsensor;
        allSubscriptions[this.tempsensor] ? allSubscriptions[this.tempsensor].push(this)
            : allSubscriptions[this.tempsensor] = [this];
    }

    getDeviceServices(): any[] {
        const service = new Service.Thermostat(this.name);
        this.currentHeatingCoolingState = service.getCharacteristic(Characteristic.CurrentHeatingCoolingState);
        this.currentHeatingCoolingState.on('get', this.getHCState.bind(this));

        this.targetHeatingCoolingState = service.getCharacteristic(Characteristic.TargetHeatingCoolingState);
        this.targetHeatingCoolingState.on('get', this.getHCState.bind(this)).on('set', this.setHCState.bind(this));

        this.currentTemperature = service.getCharacteristic(Characteristic.CurrentTemperature);
        this.currentTemperature.on('get', this.getCurrentTemp.bind(this));

        this.currentRelativeHumidity = service.addCharacteristic(new Characteristic.CurrentRelativeHumidity());
        this.currentRelativeHumidity.on('get', this.getCurrentHumidity.bind(this));

        this.targetTemperature = service.getCharacteristic(Characteristic.TargetTemperature);
        this.targetTemperature.on('get', this.getTargetTemp.bind(this)).on('set', this.setTargetTemp.bind(this));

        this.temperatureDisplayUnits = service.getCharacteristic(Characteristic.TemperatureDisplayUnits);
        this.temperatureDisplayUnits.on('get', (cb) => { cb(Characteristic.TemperatureDisplayUnits.CELSIUS) })
            .on('set', (value: Number, callback, context: string) => { callback(); });

        return [service];
    }

    getHCState(callback): void {
        this.getFhemNamedValue(FhemValueType.Readings, 'desiredTemperature').then(temp =>
            callback(null,
                Number(temp) > 4.5 ? Characteristic.CurrentHeatingCoolingState.AUTO
                : Characteristic.CurrentHeatingCoolingState.OFF)
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
                value === Characteristic.CurrentHeatingCoolingState.OFF ? '4.5' : '18.0');
        callback();
    }

    setValueFromFhem(reading: string, value: string): void {
        this.log(`received value: ${reading}.${value} for ${this.name}`);
        if (reading === 'temperature') {
            this.currentTemperature.setValue(Number(value), undefined, 'fhem');
        }
        if (reading === 'humidity') {
            this.currentRelativeHumidity.setValue(Number(value), undefined, 'fhem');
        }
        if (reading === 'desiredTemperature') {
            this.targetTemperature.setValue(Number(value), undefined, 'fhem');
            this.currentHeatingCoolingState.setValue(
                Number(value) > 4.5 ? Characteristic.CurrentHeatingCoolingState.AUTO
                : Characteristic.CurrentHeatingCoolingState.OFF, undefined, 'fhem');
        }
    }
}

class FhemHeatingKW910 extends FhemThermostat {
    setValueFromFhem(reading: string, value: string): void {
        super.setValueFromFhem(reading, value);
        if (reading === 'Code') {
            const res = this.calcValues(value);
            this.setFhemReadingForDevice(this.tempsensor, 'temperature', res.T.toString(), true);
            this.setFhemReadingForDevice(this.tempsensor, 'humidity', res.H.toString(), true);
            this.executeCommand(`setstate ${this.tempsensor} T: ${res.T.toString()} H: ${res.H.toString()}`);
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

class FhemTemperatureSensor extends FhemAccessory {

    private currentTemperature: any;

    getDeviceServices(): any[] {
        const service = new Service.TemperatureSensor(this.name);
        this.currentTemperature = service.getCharacteristic(Characteristic.CurrentTemperature);
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

class FhemTemperatureHumiditySensor extends FhemTemperatureSensor {

    private currentHumidity: any;

    getDeviceServices(): any[] {
        const service = new Service.HumiditySensor(this.name);
        this.currentHumidity = service.getCharacteristic(Characteristic.CurrentRelativeHumidity);
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

class FhemTempKW9010 extends FhemTemperatureSensor {
    setValueFromFhem(reading: string, value: string): void {
        super.setValueFromFhem(reading, value);
        if (reading === 'Code') {
            const res = this.calcValues(value);
            this.setFhemReading('temperature', res.T.toString());
            this.setFhemReadingForDevice(this.fhemName, 'temperature', res.T.toString(), true);
            this.setFhemReadingForDevice(this.fhemName, 'humidity', res.H.toString(), true);
            this.executeCommand(`setstate ${this.fhemName} T: ${res.T.toString()} H: ${res.H.toString()}`);
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

class FhemWindowCovering extends FhemAccessory {
    private currentPosition;
    private targetPosition;
    private positionState;

    setValueFromFhem(value: string, part2?: string): void {
        if (value === 'down') {
            this.positionState.setValue(Characteristic.PositionState.INCREASING, undefined, 'fhem');
        } else if (value === 'up') {
            this.positionState.setValue(Characteristic.PositionState.DECREASING, undefined, 'fhem');
        } else if (value === 'stop') {
            this.positionState.setValue(Characteristic.PositionState.STOPPED, undefined, 'fhem');
        } else if (value === 'open_ack') {
            this.positionState.setValue(Characteristic.PositionState.STOPPED, undefined, 'fhem');
            this.currentPosition.setValue(100, undefined, 'fhem');
        } else if (value === 'closed') {
            this.positionState.setValue(Characteristic.PositionState.STOPPED, undefined, 'fhem');
            this.currentPosition.setValue(0, undefined, 'fhem');
        }
        if (value === 'position') {
            this.targetPosition.setValue(100 - Number(part2), undefined, 'fhem');
            this.getFhemStatus().then((status) => {
                if (status === 'stop') {
                    this.currentPosition.setValue(100 - Number(part2), undefined, 'fhem');
                }
            });
        }
    }

    getDeviceServices(): any[] {
        const service = new Service.WindowCovering(this.name);
        this.currentPosition = service.getCharacteristic(Characteristic.CurrentPosition);
        this.currentPosition.on('get', this.getCurrentPosition.bind(this));

        this.targetPosition = service.getCharacteristic(Characteristic.TargetPosition);
        this.targetPosition.on('get', this.getCurrentPosition.bind(this)).on('set', this.setTargetPosition.bind(this));

        this.positionState = service.getCharacteristic(Characteristic.PositionState);
        this.positionState.on('get', this.getPositionState.bind(this));
        return [service];
    }

    getCurrentPosition(callback): void {
        this.getFhemNamedValue(FhemValueType.Readings, 'position').then((pos) =>
            callback(null, 100 - Number(pos))
        );
    }

    getPositionState(callback): void {
        this.getFhemStatus().then((status) => {
            if (status === 'down' || status === 'closes') callback(null, Characteristic.PositionState.INCREASING);
            else if (status === 'up' || status === 'opens') callback(null, Characteristic.PositionState.DECREASING);
            else callback(null, Characteristic.PositionState.STOPPED);
        });
    }

    setTargetPosition(value: number, callback, context: string): void {
        if (context !== 'fhem') {
            if (value === 100) this.setFhemStatus('opens');
            else if (value === 0) this.setFhemStatus('closes');
            else this.setFhemReading('position', (100 - value).toString());
        }
        callback();
    }
}

class FhemProgSwitch extends FhemAccessory {

    private switchEvent = {};
    private static channels = ['A0', 'AI', 'B0', 'BI'];
    private services = new Array();
    private buttons = {};

    getDeviceServices(): any[] {
        for (let name of FhemProgSwitch.channels) {

            const service = new Service.StatelessProgrammableSwitch(`${this.name} ${name}`, `${this.name} ${name}`);
            this.switchEvent[name] = service.getCharacteristic(Characteristic.ProgrammableSwitchEvent);
            this.buttons[name] = new ButtonStateMachine(() => {
                this.switchEvent[name].setValue(Characteristic.ProgrammableSwitchEvent.SINGLE_PRESS, undefined, 'fhem');
            }, () => {
                this.switchEvent[name].setValue(Characteristic.ProgrammableSwitchEvent.LONG_PRESS, undefined, 'fhem');
            }, () => {
                this.switchEvent[name].setValue(Characteristic.ProgrammableSwitchEvent.DOUBLE_PRESS, undefined, 'fhem');
            });
            this.services.push(service);
        }


        return this.services;
    }

    setValueFromFhem(value: string, part2?: string): void {
        const buttons = this.buttons;
        if (part2 === 'released')
            for (let id in buttons) {
                if (buttons.hasOwnProperty(id)) {
                    this.buttons[id].setReleased();
                }
            }
        if (FhemProgSwitch.channels.indexOf(value) > -1)
            buttons[value].setPressed();
    }
}

class ButtonStateMachine {

    private isPressed = false;
    private waitDouble = false;
    private static milliWait = 800;
    private onShortPress: () => void;
    private onLongPress: () => void;
    private onDoublePress: () => void;

    constructor(shortPress: () => void, longPress: () => void, doublePress: () => void) {
        this.onShortPress = shortPress;
        this.onLongPress = longPress;
        this.onDoublePress = doublePress;
    }

    setPressed(): void {
        this.isPressed = true;
        setTimeout(() => {
            if (this.isPressed) this.onLongPress();
            this.isPressed = false;
        }, ButtonStateMachine.milliWait);
    }

    setReleased(): void {
        if (this.waitDouble) {
            this.onDoublePress();
            this.waitDouble = false;
        } else if (this.isPressed) {
            this.onShortPress();
            this.waitDouble = true;
            setTimeout(() => {
                this.waitDouble = false;
            }, ButtonStateMachine.milliWait);
        }
        this.isPressed = false;
    }

}

class FhemTvTest extends FhemAccessory {
    private active;
    private activeIdentifier;
    private configuredName;
    private sleepDiscoveryMode;
    private mute;

    setValueFromFhem(value: string, part2?: string): void {

    }

    getDeviceServices(): any[] {
        const service = new Service.Television(this.name);
        this.active = service.getCharacteristic(Characteristic.Active);
        this.active.on('get', (cb) => {
            cb(null, Characteristic.Active.ACTIVE);
        });
        this.active.on('set', (value: Number, cb) => { cb(); });
        //this.currentPosition.on('get', this.getCurrentPosition.bind(this));

        this.activeIdentifier = service.getCharacteristic(Characteristic.ActiveIdentifier);
        this.activeIdentifier.on('get', (cb) => {
            cb(null, 1);
        });
        this.activeIdentifier.on('set', (value: Number, cb) => { cb(); });

        this.configuredName = service.getCharacteristic(Characteristic.ConfiguredName);
        this.configuredName.on('get', (cb) => { cb(null, 'lametr') });
        this.configuredName.on('set', (value, cb) => { cb() });

        this.sleepDiscoveryMode = service.getCharacteristic(Characteristic.SleepDiscoveryMode);
        this.sleepDiscoveryMode.on('get', (cb) => { cb(null, Characteristic.SleepDiscoveryMode.ALWAYS_DISCOVERABLE) });

        const volService = new Service.TelevisionSpeaker(this.name + 'volume', 'volService');
        this.mute = volService.getCharacteristic(Characteristic.Mute);
        this.mute.on('get', (cb) => { cb(null, false) }).on('set', (value, cb) => { cb() });
        volService.getCharacteristic(Characteristic.Active)
            .on('get', (cb) => { cb(null, Characteristic.Active.ACTIVE) })
            .on('set', (value: Number, cb) => { cb(); });

        volService.getCharacteristic(Characteristic.Volume).on('get', (cb) => { cb(null, 30) })
            .on('set', (value: Number, cb) => { cb(); });


        var input1 = new Service.InputSource('chann1', 'Channel 1');
        input1.getCharacteristic(Characteristic.ConfiguredName).on('get', (cb) => { cb(null, 'You FM') })
            .on('set', (value, cb) => { cb() });
        input1.getCharacteristic(Characteristic.InputSourceType).on('get', (cb) => {
            cb(null, Characteristic.InputSourceType.TUNER)
        });
        input1.getCharacteristic(Characteristic.IsConfigured).on('get', (cb) => {
            cb(null, Characteristic.IsConfigured.CONFIGURED);
        }).on('set', (value, cb) => { cb() });
        input1.getCharacteristic(Characteristic.CurrentVisibilityState).on('get', (cb) => {
            cb(null, Characteristic.CurrentVisibilityState.SHOWN)
        });
        input1.getCharacteristic(Characteristic.Identifier).on('get', (cb) => { cb(null, Number(0)) });

        var input2 = new Service.InputSource('chann2', 'Channel 2');
        input2.getCharacteristic(Characteristic.ConfiguredName).on('get', (cb) => { cb(null, 'You FMddd') })
            .on('set', (value, cb) => { cb() });
        input2.getCharacteristic(Characteristic.InputSourceType).on('get', (cb) => {
            cb(null, Characteristic.InputSourceType.TUNER)
        });
        input2.getCharacteristic(Characteristic.IsConfigured).on('get', (cb) => {
            cb(null, Characteristic.IsConfigured.CONFIGURED);
        }).on('set', (value, cb) => { cb() });
        input2.getCharacteristic(Characteristic.CurrentVisibilityState).on('get', (cb) => {
            cb(null, Characteristic.CurrentVisibilityState.SHOWN)
        });
        input2.getCharacteristic(Characteristic.Identifier).on('get', (cb) => { cb(null, Number(1)) });

        service.addLinkedService(volService);
        service.addLinkedService(input1);
        service.addLinkedService(input2);
        return [service, volService, input1, input2];
    }

    getCurrentPosition(callback): void {
        this.getFhemNamedValue(FhemValueType.Readings, 'position').then((pos) =>
            callback(null, 100 - Number(pos))
        );
    }

    getPositionState(callback): void {
        this.getFhemStatus().then((status) => {
            if (status === 'down' || status === 'closes') callback(null, Characteristic.PositionState.INCREASING);
            else if (status === 'up' || status === 'opens') callback(null, Characteristic.PositionState.DECREASING);
            else callback(null, Characteristic.PositionState.STOPPED);
        });
    }

    setTargetPosition(value: number, callback, context: string): void {
        if (context !== 'fhem') {
            if (value === 100) this.setFhemStatus('opens');
            else if (value === 0) this.setFhemStatus('closes');
            else this.setFhemReading('position', (100 - value).toString());
        }
        callback();
    }
}

accessoryTypes['heating'] = FhemThermostat;
accessoryTypes['heatingKW9010'] = FhemHeatingKW910;
accessoryTypes['heatingEQ3'] = FhemEqivaThermostat;
accessoryTypes['switch'] = FhemSwitch;
accessoryTypes['lightbulb'] = FhemLightbulb;
accessoryTypes['motionsensor'] = FhemMotionSensor;
accessoryTypes['contactsensor'] = FhemContactSensor;
accessoryTypes['temperaturesensor'] = FhemTemperatureSensor;
accessoryTypes['temperaturehumiditysensor'] = FhemTemperatureHumiditySensor;
accessoryTypes['tempKW9010'] = FhemTempKW9010;
accessoryTypes['outlet'] = FhemOutlet;
accessoryTypes['windowcovering'] = FhemWindowCovering;
accessoryTypes['tvtest'] = FhemTvTest;
accessoryTypes['progswitch'] = FhemProgSwitch;
accessoryTypes['updownswitch'] = FhemDoubleTapSwitch;