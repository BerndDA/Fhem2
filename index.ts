/// <reference path="./Scripts/typings/node/node.d.ts" />

import util = require("util");
import http = require("http");
import dns = require("dns");
import os = require("os");

var allSubscriptions: { [name: string]: FhemAccessory[] } = {};
var accessoryTypes: { [name: string]: any } = {};

var Service, Characteristic;

module.exports = function (homebridge) {
    Service = homebridge.hap.Service;
    Characteristic = homebridge.hap.Characteristic;

    homebridge.registerPlatform("homebridge-fhem2", "Fhem2", Fhem2Platform);
};

interface IConfig {
    server: string;
    port: number;
    filter: string;
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
    filter: string;
    baseUrl: string;

    constructor(log, config: IConfig) {
        this.log = log;
        this.server = config.server;
        this.port = config.port;
        this.filter = config.filter;

        if (config.ssl)
            this.baseUrl = "https://";
        else
            this.baseUrl = "http://";
        this.baseUrl += `${this.server}:${this.port}`;
        this.subscribeToFhem();
    }

    private subscribeToFhem() {
        //delete the notification
        var url = encodeURI(this.baseUrl + "/fhem?cmd=delete nfHomekitdev&XHR=1");
        http.get(url, () => {
            //create notification
            dns.lookup(os.hostname(), (err, add, fam) => {
                var command =
                    encodeURIComponent(`define nfHomekitdev notify .* {my $new = $EVENT =~ s/: /\\//r;; HttpUtils_NonblockingGet({ url=>"http://${add}:2000/$NAME/$new", callback=>sub($$$){} })}`);
                url = `${this.baseUrl}/fhem?cmd=${command}&XHR=1`;
                http.get(url);
            });
        });

        http.createServer((req, res) => {
            res.end("ok"); 
            var splitted = req.url.toString().split("/");
            this.log(req.url.toString());
            if (allSubscriptions[splitted[1]]) {
                allSubscriptions[splitted[1]].forEach((accessory) => {
                    accessory.setFhemValue(splitted[2], splitted.length > 3 ? splitted[3] : null);
                });
            }
        }).listen(2000);
    }

    public accessories(callback): void {
        var cmd = "jsonlist2";
        if (this.filter)
            cmd += " " + this.filter;
        var url = encodeURI(`${this.baseUrl}/fhem?cmd=${cmd}&XHR=1`);

        http.get(url, (response) => {
            response.setEncoding("utf8");
            var data = "";
            response.on("data", (chunk) => {
                data += chunk;
            });
            response.on("end", () => {
                var devicelist = JSON.parse(data);
                var acc = [];
                for (var i = 0; i < devicelist.Results.length; i++) {
                    var device = devicelist.Results[i];
                    if (!device.Attributes.homebridgeType || !accessoryTypes[device.Attributes.homebridgeType]) continue;
                    acc.push(new accessoryTypes[device.Attributes.homebridgeType](device, this.log, this.baseUrl));
                }
                callback(acc);
            });
        }).on("error", (e) => {
            this.log("error in request to FHEM");
        });
    }
}

abstract class FhemAccessory {
    name: string;
    data: any;
    log: (msg: string) => void;
    fhemName: string;
    baseUrl: string;

    constructor(data, log, baseUrl: string) {
        this.data = data;
        this.log = log;
        this.name = data.Attributes.alias ? data.Attributes.alias : data.Name;
        this.fhemName = data.Name;
        this.baseUrl = baseUrl;
        allSubscriptions[this.fhemName] ? allSubscriptions[this.fhemName].push(this) : allSubscriptions[this.fhemName] = [this];
    }

    protected setFhemStatus(status: string): void {
        this.setFhemReading(null, status);
    }

    protected setFhemReading(reading: string, value: string): void {
        this.setFhemReadingForDevice(this.fhemName, reading, value);
    }

    protected setFhemReadingForDevice(device: string, reading: string, value: string, force: boolean = false): void {
        var cmd: string;
        if (!force) {
            cmd = `set ${device} `;
        } else {
            cmd = `setreading ${device} `;
        }
        if (reading) cmd += reading + " ";
        cmd += value;
        this.executeCommand(cmd);
    }

    protected executeCommand(cmd: string): void {
        var url = encodeURI(`${this.baseUrl}/fhem?cmd=${cmd}&XHR=1`);
        http.get(url).on("error", (e) => {
            this.log("error executing: " + cmd +" " + e);
        });
    }

    protected getFhemStatus(callback: (string) => void): void {
        this.getFhemNamedValue(FhemValueType.Internals, "STATE", callback);
    }

    protected getFhemNamedValue(fhemType: FhemValueType, name: string, callback: (string) => void): void {
        this.getFhemNamedValueForDevice(this.fhemName, fhemType, name, callback);
    }

    protected getFhemNamedValueForDevice(device: string, fhemType: FhemValueType, name: string, callback: (string) => void): void {
        var url = encodeURI(`${this.baseUrl}/fhem?cmd=jsonlist2 ${device} ${name}&XHR=1`);
        http.get(url, (response) => {
            response.setEncoding("utf8");
            response.on("data", (chunk) => {
                var devicelist = JSON.parse(chunk);
                if (devicelist.Results.length > 0) {
                    var val = devicelist.Results[0][FhemValueType[fhemType]][name];
                    callback(val.Value ? val.Value : val);
                    return;
                }
                callback(null);
            });
        }).on("error", (e) => {
            this.log("error executing: " + url + e);
            callback(null);
        });
    }

    public abstract setFhemValue(value: string, part2?: string): void;
    protected abstract getDeviceService(): any;

    public getServices(): any[] {
        var informationService = new Service.AccessoryInformation();

        informationService
            .setCharacteristic(Characteristic.Manufacturer, "FHEM")
            .setCharacteristic(Characteristic.Model, this.data.Internals.TYPE)
            .setCharacteristic(Characteristic.SerialNumber, this.data.Internals.NR);
        var deviceService = this.getDeviceService();
        var $this = this;
        deviceService.getCharacteristic(Characteristic.Name)
            .on("get", (cb) => {
                cb(null, $this.data.Attributes.siriName ? $this.data.Attributes.siriName : "");
            });
        return [informationService, deviceService];
    }

    public identify(callback) {
        this.log("Identify requested!");
        callback(); // success
    }
}

abstract class FhemOnOffSwitchable extends FhemAccessory {

    characteristic: any;

    public getPowerState(callback): void {
        this.getFhemStatus(status => {
            callback(null, status === "on");
        });
    }

    public setPowerState(value: boolean, callback, context: string): void {
        if (context !== "fhem")
            this.setFhemStatus(value ? "on" : "off");
        callback();
    }

    public setFhemValue(value: string): void {
        this.log(`received value: ${value} for ${this.name}`);
        this.characteristic.setValue(value === "on", undefined, "fhem");
    }
}

class FhemSwitch extends FhemOnOffSwitchable {
    public getDeviceService(): any {
        var switchService = new Service.Switch(this.name);
        this.characteristic = switchService.getCharacteristic(Characteristic.On);
        this.characteristic
            .on("get", this.getPowerState.bind(this))
            .on("set", this.setPowerState.bind(this));
        return switchService;
    }
}

class FhemLightbulb extends FhemOnOffSwitchable {
    public getDeviceService(): any {
        var service = new Service.Lightbulb(this.name);
        this.characteristic = service.getCharacteristic(Characteristic.On);
        this.characteristic
            .on("get", this.getPowerState.bind(this))
            .on("set", this.setPowerState.bind(this));
        return service;
    }
}

class FhemOutlet extends FhemOnOffSwitchable {
    public getDeviceService(): any {
        var service = new Service.Outlet(this.name);
        this.characteristic = service.getCharacteristic(Characteristic.On);
        this.characteristic
            .on("get", this.getPowerState.bind(this))
            .on("set", this.setPowerState.bind(this));
        service.getCharacteristic(Characteristic.OutletInUse).on("get", (callback) => { callback(null, true); });
        return service;
    }
}

abstract class FhemSensor extends FhemAccessory {
    protected characteristic: any;

    public getState(callback): void {
        this.getFhemStatus(status => {
            callback(null, status === "on");
        });
        this.log("call func");
    }

    public setFhemValue(value: string): void {
        this.log(`received value: ${value} for ${this.name}`);
        this.characteristic.setValue(value === "on", undefined, "fhem");
    }
}

class FhemMotionSensor extends FhemSensor {

    public getDeviceService(): any {
        var service = new Service.MotionSensor(this.name);
        this.characteristic = service.getCharacteristic(Characteristic.MotionDetected);
        this.characteristic
            .on("get", this.getState.bind(this));
        return service;
    }
}

class FhemContactSensor extends FhemSensor {

    public getDeviceService(): any {
        var service = new Service.ContactSensor(this.name);
        this.characteristic = service.getCharacteristic(Characteristic.ContactSensorState);
        this.characteristic
            .on("get", this.getState.bind(this));
        return service;
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
        allSubscriptions[this.tempsensor] ? allSubscriptions[this.tempsensor].push(this) : allSubscriptions[this.tempsensor] = [this];
    }

    public getDeviceService(): any {
        var service = new Service.Thermostat(this.name);
        this.currentHeatingCoolingState = service.getCharacteristic(Characteristic.CurrentHeatingCoolingState);
        this.currentHeatingCoolingState.on("get", this.getHCState.bind(this));

        this.targetHeatingCoolingState = service.getCharacteristic(Characteristic.TargetHeatingCoolingState);
        this.targetHeatingCoolingState.on("get", this.getHCState.bind(this)).on("set", (value: Number, callback, context: string) => { callback(); });

        this.currentTemperature = service.getCharacteristic(Characteristic.CurrentTemperature);
        this.currentTemperature.on("get", this.getCurrentTemp.bind(this));

        this.currentRelativeHumidity = service.addCharacteristic(new Characteristic.CurrentRelativeHumidity());
        this.currentRelativeHumidity.on("get", this.getCurrentHumidity.bind(this));

        this.targetTemperature = service.getCharacteristic(Characteristic.TargetTemperature);
        this.targetTemperature.on("get", this.getTargetTemp.bind(this)).on("set", this.setTargetTemp.bind(this));

        this.temperatureDisplayUnits = service.getCharacteristic(Characteristic.TemperatureDisplayUnits);
        this.temperatureDisplayUnits.on("get", (cb) => { cb(Characteristic.TemperatureDisplayUnits.CELSIUS) })
            .on("set", (value: Number, callback, context: string) => { callback(); });

        return service;
    }

    public getHCState(callback): void {
        this.getFhemNamedValue(FhemValueType.Readings, "actorState", status => {
            callback(null, status === "on" ? Characteristic.CurrentHeatingCoolingState.HEAT : Characteristic.CurrentHeatingCoolingState.OFF);
        });
    }

    public getCurrentTemp(callback): void {
        this.getFhemNamedValueForDevice(this.tempsensor, FhemValueType.Readings, "temperature", (temp) => {
            callback(null, Number(temp));
        });
    }

    public getCurrentHumidity(callback): void {
        this.getFhemNamedValueForDevice(this.tempsensor, FhemValueType.Readings, "humidity", (temp) => {
            callback(null, Number(temp));
        });
    }

    public getTargetTemp(callback): void {
        this.getFhemNamedValue(FhemValueType.Readings, "desired-temp", temp => {
            callback(null, Number(temp));
        });
    }

    public setTargetTemp(value: number, callback, context: string): void {
        if (context !== "fhem")
            this.setFhemReading("desired-temp", value.toString());
        callback();
    }

    public setFhemValue(reading: string, value: string): void {
        this.log("received value: " + reading + "." + value + " for " + this.name);
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

class FhemHeatingKW910 extends FhemThermostat {
    public setFhemValue(reading: string, value: string): void {
        super.setFhemValue(reading, value);
        if (reading === "Code") {
            var res = this.calcValues(value);
            this.setFhemReadingForDevice(this.tempsensor, "temperature", res.T.toString(), true);
            this.setFhemReadingForDevice(this.tempsensor, "humidity", res.H.toString(), true);
            this.executeCommand("setstate " + this.tempsensor + " T: " + res.T.toString() + " H: " + res.H.toString());
        }
    }

    private calcValues(code: string): { T: Number, H: Number } {
        var bin = Number("0x" + code).toString(2);
        while(bin.length % 8 != 0) {
            bin = "0" + bin;
        }
        var temp = parseInt(bin.substr(12, 11).split("").reverse().join(""), 2);
        if (bin[23] === "1") temp -= 2048;
        temp /= 10;
        var hum = parseInt(bin.substr(24, 8).split("").reverse().join(""), 2) - 156;
        return { T: temp, H: hum };
    }
}

class FhemTemperatureSensor extends FhemAccessory {

    private currentTemperature: any;

    public getDeviceService(): any {
        var service = new Service.TemperatureSensor(this.name);
        this.currentTemperature = service.getCharacteristic(Characteristic.CurrentTemperature);
        this.currentTemperature.setProps({ minValue: -25 });
        this.currentTemperature.on("get", this.getCurrentTemp.bind(this));
        return service;
    }

    public setFhemValue(reading: string, value: string): void {
        this.log("received value: " + reading + "." + value + " for " + this.name);
        if (reading === "temperature") {
            this.currentTemperature.setValue(Number(value), undefined, "fhem");
        }
    }

    public getCurrentTemp(callback): void {
        this.getFhemNamedValue(FhemValueType.Readings, "temperature", (temp) => {
            callback(null, Number(temp));
        });
    }
}

class FhemTempKW9010 extends FhemTemperatureSensor {
    public setFhemValue(reading: string, value: string): void {
        super.setFhemValue(reading, value);
        if (reading === "Code") {
            var res = this.calcValues(value);
            this.setFhemReading("temperature", res.T.toString());
            this.setFhemReadingForDevice(this.fhemName, "temperature", res.T.toString(), true);
            this.setFhemReadingForDevice(this.fhemName, "humidity", res.H.toString(), true);
            this.executeCommand("setstate " + this.fhemName + " T: " + res.T.toString() + " H: " + res.H.toString());
        }
    }

    private calcValues(code: string): { T: Number, H: Number } {
        var bin = Number("0x" + code).toString(2);
        while (bin.length % 8 != 0) {
            bin = "0" + bin;
        }
        var temp = parseInt(bin.substr(12, 11).split("").reverse().join(""), 2);
        if (bin[23] === "1") temp -= 2048;
        temp /= 10;
        var hum = parseInt(bin.substr(24, 8).split("").reverse().join(""), 2) - 156;
        return { T: temp, H: hum };
    }
}

class FhemWindowCovering extends FhemAccessory {
    private currentPosition;
    private targetPosition;
    private positionState;

    setFhemValue(value: string, part2?: string): void {
        if (value === "down") {
            this.positionState.setValue(Characteristic.PositionState.INCREASING, undefined, "fhem");
        } else if (value === "up") {
            this.positionState.setValue(Characteristic.PositionState.DECREASING, undefined, "fhem");
        } else if (value === "stop") {
            this.positionState.setValue(Characteristic.PositionState.STOPPED, undefined, "fhem");
        } else if (value === "open_ack") {
            this.positionState.setValue(Characteristic.PositionState.STOPPED, undefined, "fhem");
            this.currentPosition.setValue(100, undefined, "fhem");
        } else if (value === "closed") {
            this.positionState.setValue(Characteristic.PositionState.STOPPED, undefined, "fhem");
            this.currentPosition.setValue(0, undefined, "fhem");
        }
        if (value === "position") {
            this.currentPosition.setValue(100 - Number(part2), undefined, "fhem");
        }    
    }

    getDeviceService() {
        var service = new Service.WindowCovering(this.name);
        this.currentPosition = service.getCharacteristic(Characteristic.CurrentPosition);
        this.currentPosition.on("get", this.getCurrentPosition.bind(this));

        this.targetPosition = service.getCharacteristic(Characteristic.TargetPosition);
        this.targetPosition.on("get", this.getCurrentPosition.bind(this)).on("set", this.setTargetPosition.bind(this));

        this.positionState = service.getCharacteristic(Characteristic.PositionState);
        this.positionState.on("get", this.getPositionState.bind(this));
        return service;
    }

    public getCurrentPosition(callback): void {
        this.getFhemNamedValue(FhemValueType.Readings, "position", (pos) => {
            callback(null, 100 - Number(pos));
        });
    }

    public getPositionState(callback): void {
        this.getFhemStatus((status) => {
            if (status === "down") callback(null, Characteristic.PositionState.INCREASING);
            else if (status === "up") callback(null, Characteristic.PositionState.DECREASING);
            else callback(null, Characteristic.PositionState.STOPPED);
        });
    }

    public setTargetPosition(value: number, callback, context: string): void {
        if (context !== "fhem")
            this.setFhemReading("position", (100-value).toString());
        callback();
    }
}

accessoryTypes["heating"] = FhemThermostat;
accessoryTypes["heatingKW9010"] = FhemHeatingKW910;
accessoryTypes["switch"] = FhemSwitch;
accessoryTypes["lightbulb"] = FhemLightbulb;
accessoryTypes["motionsensor"] = FhemMotionSensor;
accessoryTypes["contactsensor"] = FhemContactSensor;
accessoryTypes["temperaturesensor"] = FhemTemperatureSensor;
accessoryTypes["tempKW9010"] = FhemTempKW9010;
accessoryTypes["outlet"] = FhemOutlet;
accessoryTypes["windowcovering"] = FhemWindowCovering;
