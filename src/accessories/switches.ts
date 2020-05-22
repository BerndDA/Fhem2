import { FhemAccessory } from "./base";
import { EventEmitter } from "events";
import {
    Service,
    Characteristic,
    CharacteristicEventTypes,
    CharacteristicValue,
    CharacteristicSetCallback,
    CharacteristicGetCallback,
} from "homebridge";


export abstract class FhemOnOffSwitchable extends FhemAccessory {

    protected characteristic!: Characteristic;

    getPowerState(callback: CharacteristicGetCallback): void {
        this.getFhemStatus().then(status =>
            callback(null, status === "on"),
        );
    }

    setPowerState(value: CharacteristicValue, callback: CharacteristicSetCallback, context: string): void {
        if (context !== "fhem") {
            this.setFhemStatus(value ? "on" : "off");
        }
        callback();
    }

    setValueFromFhem(value: string): void {
        this.log(`received value: ${value} for ${this.name}`);
        this.characteristic.setValue(value === "on", undefined, "fhem");
    }
}

export class FhemSwitch extends FhemOnOffSwitchable {
    getDeviceServices(): Service[] {
        const switchService = new FhemAccessory.hap.Service.Switch(this.name);
        this.characteristic = switchService.getCharacteristic(FhemAccessory.hap.Characteristic.On);
        this.characteristic
            .on(CharacteristicEventTypes.GET, this.getPowerState.bind(this))
            .on(CharacteristicEventTypes.SET, this.setPowerState.bind(this));

        return [switchService];
    }
}

export class FhemLightbulb extends FhemOnOffSwitchable {
    getDeviceServices(): Service[] {
        const service = new FhemAccessory.hap.Service.Lightbulb(this.name);
        this.characteristic = service.getCharacteristic(FhemAccessory.hap.Characteristic.On);
        this.characteristic
            .on(CharacteristicEventTypes.GET, this.getPowerState.bind(this))
            .on(CharacteristicEventTypes.SET, this.setPowerState.bind(this));
        return [service];
    }
}

export class FhemOutlet extends FhemOnOffSwitchable {
    getDeviceServices(): Service[] {
        const service = new FhemAccessory.hap.Service.Outlet(this.name);
        this.characteristic = service.getCharacteristic(FhemAccessory.hap.Characteristic.On);
        this.characteristic
            .on(CharacteristicEventTypes.GET, this.getPowerState.bind(this))
            .on(CharacteristicEventTypes.SET, this.setPowerState.bind(this));
        service.getCharacteristic(FhemAccessory.hap.Characteristic.OutletInUse)
            .on(CharacteristicEventTypes.GET, (callback: CharacteristicGetCallback) => {
                callback(null, true); 
            });
        return [service];
    }
}

enum ButtonEvent {
    ShortPress = "shortpress",
    LongPress = "longpress",
    DoublePress = "doublepress"
}

class ButtonStateMachine extends EventEmitter {

    private isPressed = false;
    private waitDouble = false;
    private static milliWait = 800;

    on(event: ButtonEvent, listener: () => void): this {
        super.on(event, listener);
        return this;
    }

    setPressed(): void {
        this.isPressed = true;
        setTimeout(() => {
            if (this.isPressed) {
                this.emit(ButtonEvent.LongPress);
            }
            this.isPressed = false;
        }, ButtonStateMachine.milliWait);
    }

    setReleased(): void {
        if (this.waitDouble) {
            this.emit(ButtonEvent.DoublePress);
            this.waitDouble = false;
        } else if (this.isPressed) {
            this.emit(ButtonEvent.ShortPress);
            this.waitDouble = true;
            setTimeout(() => {
                this.waitDouble = false;
            }, ButtonStateMachine.milliWait);
        }
        this.isPressed = false;
    }

}

export class FhemProgSwitch extends FhemAccessory {

    private channelMap: Map<string, Characteristic> = new Map();
    private static channels = ["A0", "AI", "B0", "BI"];
    private services: Service[] = [];
    private buttons: Map<string, ButtonStateMachine> = new Map();

    getDeviceServices(): Service[] {
        for (const name of FhemProgSwitch.channels) {

            const service =
                new FhemAccessory.hap.Service.StatelessProgrammableSwitch(`${this.name} ${name}`, `${this.name} ${name}`);
            this.channelMap.set(name, service.getCharacteristic(FhemAccessory.hap.Characteristic.ProgrammableSwitchEvent));
            this.buttons.set(name, new ButtonStateMachine()
                .on(ButtonEvent.ShortPress, () =>
                    this.channelMap.get(name)?.setValue(FhemAccessory.hap.Characteristic.ProgrammableSwitchEvent.SINGLE_PRESS, undefined, "fhem"))
                .on(ButtonEvent.LongPress, () =>
                    this.channelMap.get(name)?.setValue(FhemAccessory.hap.Characteristic.ProgrammableSwitchEvent.LONG_PRESS, undefined, "fhem"))
                .on(ButtonEvent.DoublePress, () =>
                    this.channelMap.get(name)?.setValue(FhemAccessory.hap.Characteristic.ProgrammableSwitchEvent.DOUBLE_PRESS, undefined, "fhem")),
            );
            this.services.push(service);
        }
        return this.services;
    }

    setValueFromFhem(value: string, part2?: string): void {
        if (part2 === "released") {
            this.buttons.forEach((value) => value.setReleased());
        } else if (this.buttons.has(value)) {
this.buttons.get(value)?.setPressed();
        }
    }
}

