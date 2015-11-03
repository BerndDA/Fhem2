/// <reference path="./Scripts/typings/node/node.d.ts" />
var __extends = (this && this.__extends) || function (d, b) {
    for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p];
    function __() { this.constructor = d; }
    d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
};
var http = require('http');
var dns = require('dns');
var os = require('os');
var allSubscriptions = {};
var accessoryTypes = {};
var Service, Characteristic;
module.exports = function (homebridge) {
    Service = homebridge.hap.Service;
    Characteristic = homebridge.hap.Characteristic;
    homebridge.registerPlatform("Fhem2", Fhem2Platform);
};
var FhemValueType;
(function (FhemValueType) {
    FhemValueType[FhemValueType["Internals"] = 0] = "Internals";
    FhemValueType[FhemValueType["Readings"] = 1] = "Readings";
    FhemValueType[FhemValueType["Attributes"] = 2] = "Attributes";
})(FhemValueType || (FhemValueType = {}));
var Fhem2Platform = (function () {
    function Fhem2Platform(log, config) {
        this.log = log;
        this.server = config.server;
        this.port = config.port;
        this.filter = config.filter;
        if (config.ssl)
            this.baseUrl = 'https://';
        else
            this.baseUrl = 'http://';
        this.baseUrl += this.server + ':' + this.port;
        this.subscribeToFhem();
    }
    Fhem2Platform.prototype.subscribeToFhem = function () {
        var _this = this;
        //delete the notification
        var url = encodeURI(this.baseUrl + '/fhem?cmd=delete nfHomekitdev&XHR=1');
        http.get(url, function () {
            //create notification
            dns.lookup(os.hostname(), function (err, add, fam) {
                var command = encodeURIComponent('define nfHomekitdev notify .* {my $new = $EVENT =~ s/: /\\//r;; HttpUtils_NonblockingGet({ url => "http://' + add + ':2000/$NAME/$new" })}');
                url = _this.baseUrl + '/fhem?cmd=' + command + '&XHR=1';
                http.get(url);
            });
        });
        http.createServer(function (req, res) {
            res.end("ok");
            var splitted = req.url.toString().split('/');
            _this.log(req.url.toString());
            if (allSubscriptions[splitted[1]]) {
                allSubscriptions[splitted[1]].forEach(function (accessory) {
                    accessory.setFhemValue(splitted[2], splitted.length > 3 ? splitted[3] : null);
                });
            }
        }).listen(2000);
    };
    Fhem2Platform.prototype.accessories = function (callback) {
        var _this = this;
        var cmd = 'jsonlist2';
        if (this.filter)
            cmd += " " + this.filter;
        var url = encodeURI(this.baseUrl + "/fhem?cmd=" + cmd + "&XHR=1");
        http.get(url, function (response) {
            response.setEncoding('utf8');
            var data = '';
            response.on('data', function (chunk) {
                data += chunk;
            });
            response.on('end', function () {
                var devicelist = JSON.parse(data);
                var acc = [];
                for (var i = 0; i < devicelist.Results.length; i++) {
                    var device = devicelist.Results[i];
                    if (!device.Attributes.homebridgeType || !accessoryTypes[device.Attributes.homebridgeType])
                        continue;
                    acc.push(new accessoryTypes[device.Attributes.homebridgeType](device, _this.log, _this.baseUrl));
                }
                callback(acc);
            });
        }).on('error', function (e) {
            _this.log('error in request to FHEM');
        });
    };
    return Fhem2Platform;
})();
var FhemAccessory = (function () {
    function FhemAccessory(data, log, baseUrl) {
        this.data = data;
        this.log = log;
        this.name = data.Attributes.alias ? data.Attributes.alias : data.Name;
        this.fhemName = data.Name;
        this.baseUrl = baseUrl;
        allSubscriptions[this.fhemName] ? allSubscriptions[this.fhemName].push(this) : allSubscriptions[this.fhemName] = [this];
    }
    FhemAccessory.prototype.setFhemStatus = function (status) {
        this.setFhemReading(null, status);
    };
    FhemAccessory.prototype.setFhemReading = function (reading, value) {
        var _this = this;
        var cmd = 'set ' + this.fhemName + ' ';
        if (reading)
            cmd += reading + ' ';
        cmd += value;
        var url = encodeURI(this.baseUrl + "/fhem?cmd=" + cmd + "&XHR=1");
        http.get(url).on('error', function (e) {
            _this.log("error executing: " + url + e);
        });
    };
    FhemAccessory.prototype.getFhemStatus = function (callback) {
        this.getFhemNamedValue(FhemValueType.Internals, "STATE", callback);
    };
    FhemAccessory.prototype.getFhemNamedValue = function (fhemType, name, callback) {
        this.getFhemNamedValueForDevice(this.fhemName, fhemType, name, callback);
    };
    FhemAccessory.prototype.getFhemNamedValueForDevice = function (device, fhemType, name, callback) {
        var _this = this;
        var url = encodeURI(this.baseUrl + "/fhem?cmd=jsonlist2 " + device + ' ' + name + '&XHR=1');
        http.get(url, function (response) {
            response.setEncoding('utf8');
            response.on('data', function (chunk) {
                var devicelist = JSON.parse(chunk);
                if (devicelist.Results.length > 0) {
                    var val = devicelist.Results[0][FhemValueType[fhemType]][name];
                    callback(val.Value ? val.Value : val);
                    return;
                }
                callback(null);
            });
        }).on('error', function (e) {
            _this.log("error executing: " + url + e);
            callback(null);
        });
    };
    FhemAccessory.prototype.getServices = function () {
        var informationService = new Service.AccessoryInformation();
        informationService
            .setCharacteristic(Characteristic.Manufacturer, "FHEM")
            .setCharacteristic(Characteristic.Model, this.data.Internals.TYPE)
            .setCharacteristic(Characteristic.SerialNumber, this.data.Internals.NR);
        var deviceService = this.getDeviceService();
        var $this = this;
        deviceService.getCharacteristic(Characteristic.Name)
            .on('get', function (cb) {
            cb(null, $this.data.Attributes.siriName ? $this.data.Attributes.siriName : '');
        });
        return [informationService, deviceService];
    };
    FhemAccessory.prototype.identify = function (callback) {
        this.log("Identify requested!");
        callback(); // success
    };
    return FhemAccessory;
})();
var FhemOnOffSwitchable = (function (_super) {
    __extends(FhemOnOffSwitchable, _super);
    function FhemOnOffSwitchable() {
        _super.apply(this, arguments);
    }
    FhemOnOffSwitchable.prototype.getPowerState = function (callback) {
        this.getFhemStatus(function (status) {
            callback(null, status === 'on' ? true : false);
        });
    };
    FhemOnOffSwitchable.prototype.setPowerState = function (value, callback, context) {
        if (context !== 'fhem')
            this.setFhemStatus(value ? 'on' : 'off');
        callback();
    };
    FhemOnOffSwitchable.prototype.setFhemValue = function (value) {
        this.log('received value: ' + value + ' for ' + this.name);
        this.characteristic.setValue(value === 'on' ? true : false, undefined, 'fhem');
    };
    return FhemOnOffSwitchable;
})(FhemAccessory);
var FhemSwitch = (function (_super) {
    __extends(FhemSwitch, _super);
    function FhemSwitch() {
        _super.apply(this, arguments);
    }
    FhemSwitch.prototype.getDeviceService = function () {
        var switchService = new Service.Switch(this.name);
        this.characteristic = switchService.getCharacteristic(Characteristic.On);
        this.characteristic
            .on('get', this.getPowerState.bind(this))
            .on('set', this.setPowerState.bind(this));
        return switchService;
    };
    return FhemSwitch;
})(FhemOnOffSwitchable);
var FhemLightbulb = (function (_super) {
    __extends(FhemLightbulb, _super);
    function FhemLightbulb() {
        _super.apply(this, arguments);
    }
    FhemLightbulb.prototype.getDeviceService = function () {
        var service = new Service.Lightbulb(this.name);
        this.characteristic = service.getCharacteristic(Characteristic.On);
        this.characteristic
            .on('get', this.getPowerState.bind(this))
            .on('set', this.setPowerState.bind(this));
        return service;
    };
    return FhemLightbulb;
})(FhemOnOffSwitchable);
var FhemOutlet = (function (_super) {
    __extends(FhemOutlet, _super);
    function FhemOutlet() {
        _super.apply(this, arguments);
    }
    FhemOutlet.prototype.getDeviceService = function () {
        var service = new Service.Outlet(this.name);
        this.characteristic = service.getCharacteristic(Characteristic.On);
        this.characteristic
            .on('get', this.getPowerState.bind(this))
            .on('set', this.setPowerState.bind(this));
        service.getCharacteristic(Characteristic.OutletInUse).on('get', function (callback) { callback(null, true); });
        return service;
    };
    return FhemOutlet;
})(FhemOnOffSwitchable);
var FhemSensor = (function (_super) {
    __extends(FhemSensor, _super);
    function FhemSensor() {
        _super.apply(this, arguments);
    }
    FhemSensor.prototype.getState = function (callback) {
        this.getFhemStatus(function (status) {
            callback(null, status === 'on' ? true : false);
        });
        this.log('call func');
    };
    FhemSensor.prototype.setFhemValue = function (value) {
        this.log('received value: ' + value + ' for ' + this.name);
        this.characteristic.setValue(value === 'on' ? true : false, undefined, 'fhem');
    };
    return FhemSensor;
})(FhemAccessory);
var FhemMotionSensor = (function (_super) {
    __extends(FhemMotionSensor, _super);
    function FhemMotionSensor() {
        _super.apply(this, arguments);
    }
    FhemMotionSensor.prototype.getDeviceService = function () {
        var service = new Service.MotionSensor(this.name);
        this.characteristic = service.getCharacteristic(Characteristic.MotionDetected);
        this.characteristic
            .on('get', this.getState.bind(this));
        return service;
    };
    return FhemMotionSensor;
})(FhemSensor);
var FhemContactSensor = (function (_super) {
    __extends(FhemContactSensor, _super);
    function FhemContactSensor() {
        _super.apply(this, arguments);
    }
    FhemContactSensor.prototype.getDeviceService = function () {
        var service = new Service.ContactSensor(this.name);
        this.characteristic = service.getCharacteristic(Characteristic.ContactSensorState);
        this.characteristic
            .on('get', this.getState.bind(this));
        return service;
    };
    return FhemContactSensor;
})(FhemSensor);
var FhemThermostat = (function (_super) {
    __extends(FhemThermostat, _super);
    function FhemThermostat(data, log, baseUrl) {
        _super.call(this, data, log, baseUrl);
        //register on tempsensor
        var tempsensor = this.data.Internals.TEMPSENSOR;
        allSubscriptions[tempsensor] ? allSubscriptions[tempsensor].push(this) : allSubscriptions[tempsensor] = [this];
    }
    FhemThermostat.prototype.getDeviceService = function () {
        var service = new Service.Thermostat(this.name);
        this.currentHeatingCoolingState = service.getCharacteristic(Characteristic.CurrentHeatingCoolingState);
        this.currentHeatingCoolingState.on('get', this.getHCState.bind(this));
        this.targetHeatingCoolingState = service.getCharacteristic(Characteristic.TargetHeatingCoolingState);
        this.targetHeatingCoolingState.on('get', this.getHCState.bind(this)).on('set', function (value, callback, context) { callback(); });
        this.currentTemperature = service.getCharacteristic(Characteristic.CurrentTemperature);
        this.currentTemperature.on('get', this.getCurrentTemp.bind(this));
        this.currentRelativeHumidity = service.addCharacteristic(new Characteristic.CurrentRelativeHumidity());
        this.currentRelativeHumidity.on('get', this.getCurrentHumidity.bind(this));
        this.targetTemperature = service.getCharacteristic(Characteristic.TargetTemperature);
        this.targetTemperature.on('get', this.getTargetTemp.bind(this)).on('set', this.setTargetTemp.bind(this));
        this.temperatureDisplayUnits = service.getCharacteristic(Characteristic.TemperatureDisplayUnits);
        this.temperatureDisplayUnits.on('get', function (cb) { cb(Characteristic.TemperatureDisplayUnits.CELSIUS); })
            .on('set', function (value, callback, context) { callback(); });
        return service;
    };
    FhemThermostat.prototype.getHCState = function (callback) {
        this.getFhemNamedValue(FhemValueType.Internals, 'actorState', function (status) {
            callback(null, status === 'on' ? Characteristic.CurrentHeatingCoolingState.HEAT : Characteristic.CurrentHeatingCoolingState.OFF);
        });
    };
    FhemThermostat.prototype.getCurrentTemp = function (callback) {
        var _this = this;
        this.getFhemNamedValue(FhemValueType.Internals, 'TEMPSENSOR', function (device) {
            _this.getFhemNamedValueForDevice(device, FhemValueType.Readings, 'temperature', function (temp) {
                callback(null, Number(temp));
            });
        });
    };
    FhemThermostat.prototype.getCurrentHumidity = function (callback) {
        var _this = this;
        this.getFhemNamedValue(FhemValueType.Internals, 'TEMPSENSOR', function (device) {
            _this.getFhemNamedValueForDevice(device, FhemValueType.Readings, 'humidity', function (temp) {
                callback(null, Number(temp));
            });
        });
    };
    FhemThermostat.prototype.getTargetTemp = function (callback) {
        this.getFhemNamedValue(FhemValueType.Readings, 'desired-temp', function (temp) {
            callback(null, Number(temp));
        });
    };
    FhemThermostat.prototype.setTargetTemp = function (value, callback, context) {
        if (context !== 'fhem')
            this.setFhemReading('desired-temp', value.toString());
        callback();
    };
    FhemThermostat.prototype.setFhemValue = function (reading, value) {
        this.log('received value: ' + reading + '.' + value + ' for ' + this.name);
        if (reading === 'temperature') {
            this.currentTemperature.setValue(Number(value), undefined, 'fhem');
        }
        if (reading === 'humidity') {
            this.currentRelativeHumidity.setValue(Number(value), undefined, 'fhem');
        }
        if (reading === 'desired-temp') {
            this.targetTemperature.setValue(Number(value), undefined, 'fhem');
        }
    };
    return FhemThermostat;
})(FhemAccessory);
accessoryTypes['heating'] = FhemThermostat;
accessoryTypes['switch'] = FhemSwitch;
accessoryTypes['lightbulb'] = FhemLightbulb;
accessoryTypes['motionsensor'] = FhemMotionSensor;
accessoryTypes['contactsensor'] = FhemContactSensor;
accessoryTypes['outlet'] = FhemOutlet;
//# sourceMappingURL=index.js.map