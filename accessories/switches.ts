import { FhemAccessory } from './base';
import {
    Service,
    Characteristic,
    CharacteristicEventTypes,
    CharacteristicValue,
    CharacteristicSetCallback,
    CharacteristicGetCallback
} from 'homebridge';


export abstract class FhemOnOffSwitchable extends FhemAccessory {

    protected characteristic!: Characteristic;

    getPowerState(callback: CharacteristicGetCallback): void {
        this.getFhemStatus().then(status =>
            callback(null, status === 'on')
        );
    }

    setPowerState(value: CharacteristicValue, callback: CharacteristicSetCallback, context: string): void {
        if (context !== 'fhem')
            this.setFhemStatus(value ? 'on' : 'off');
        callback();
    }

    setValueFromFhem(value: string): void {
        this.log(`received value: ${value} for ${this.name}`);
        this.characteristic.setValue(value === 'on', undefined, 'fhem');
    }
}

export class FhemSwitch extends FhemOnOffSwitchable {
    getDeviceServices(): Service[] {
        const switchService = new Service.Switch(this.name);
        this.characteristic = switchService.getCharacteristic(Characteristic.On)!;
        this.characteristic
            .on(CharacteristicEventTypes.GET, this.getPowerState.bind(this))
            .on(CharacteristicEventTypes.SET, this.setPowerState.bind(this));

        return [switchService];
    }
}

export class FhemLightbulb extends FhemOnOffSwitchable {
    getDeviceServices(): Service[] {
        const service = new Service.Lightbulb(this.name);
        this.characteristic = service.getCharacteristic(Characteristic.On)!;
        this.characteristic
            .on(CharacteristicEventTypes.GET, this.getPowerState.bind(this))
            .on(CharacteristicEventTypes.SET, this.setPowerState.bind(this));
        return [service];
    }
}

export class FhemOutlet extends FhemOnOffSwitchable {
    getDeviceServices(): Service[] {
        const service = new Service.Outlet(this.name);
        this.characteristic = service.getCharacteristic(Characteristic.On)!;
        this.characteristic
            .on(CharacteristicEventTypes.GET, this.getPowerState.bind(this))
            .on(CharacteristicEventTypes.SET, this.setPowerState.bind(this));
        service.getCharacteristic(Characteristic.OutletInUse)!
            .on(CharacteristicEventTypes.GET, (callback) => { callback(null, true); });
        return [service];
    }
}

export class FhemProgSwitch extends FhemAccessory {

    private switchEvent: Map<string, Characteristic> = new Map();
    private static channels = ['A0', 'AI', 'B0', 'BI'];
    private services: Service[] = new Array();
    private buttons: Map<string, ButtonStateMachine> = new Map();

    getDeviceServices(): Service[] {
        for (let name of FhemProgSwitch.channels) {

            const service =
                new Service.StatelessProgrammableSwitch(`${this.name} ${name}`, `${this.name} ${name}`);
            this.switchEvent.set(name, service.getCharacteristic(Characteristic.ProgrammableSwitchEvent)!);
            this.buttons.set(name, new ButtonStateMachine(() =>
                this.switchEvent.get(name)!.setValue(Characteristic.ProgrammableSwitchEvent.SINGLE_PRESS,
                    undefined, 'fhem'), () =>
                this.switchEvent.get(name)!.setValue(Characteristic.ProgrammableSwitchEvent.LONG_PRESS,
                    undefined, 'fhem'), () =>
                this.switchEvent.get(name)!.setValue(Characteristic.ProgrammableSwitchEvent.DOUBLE_PRESS,
                    undefined, 'fhem')
            ));
            this.services.push(service);
        }
        return this.services;
    }

    setValueFromFhem(value: string, part2?: string): void {
        const buttons = this.buttons;
        if (part2 === 'released')
            buttons.forEach((value) => value.setReleased());

        if (buttons.has(value))
            buttons.get(value)!.setPressed();
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