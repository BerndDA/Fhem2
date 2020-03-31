import { FhemAccessory } from "./base";

export abstract class FhemOnOffSwitchable extends FhemAccessory {

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

export class FhemSwitch extends FhemOnOffSwitchable {
    getDeviceServices(): any[] {
        const switchService = new FhemAccessory.Service.Switch(this.name);
        this.characteristic = switchService.getCharacteristic(FhemAccessory.Characteristic.On);
        this.characteristic
            .on('get', this.getPowerState.bind(this))
            .on('set', this.setPowerState.bind(this));
        return [switchService];
    }
}

export class FhemLightbulb extends FhemOnOffSwitchable {
    getDeviceServices(): any[] {
        const service = new FhemAccessory.Service.Lightbulb(this.name);
        this.characteristic = service.getCharacteristic(FhemAccessory.Characteristic.On);
        this.characteristic
            .on('get', this.getPowerState.bind(this))
            .on('set', this.setPowerState.bind(this));
        return [service];
    }
}

export class FhemOutlet extends FhemOnOffSwitchable {
    getDeviceServices(): any[] {
        const service = new FhemAccessory.Service.Outlet(this.name);
        this.characteristic = service.getCharacteristic(FhemAccessory.Characteristic.On);
        this.characteristic
            .on('get', this.getPowerState.bind(this))
            .on('set', this.setPowerState.bind(this));
        service.getCharacteristic(FhemAccessory.Characteristic.OutletInUse).on('get', (callback) => { callback(null, true); });
        return [service];
    }
}

export class FhemProgSwitch extends FhemAccessory {

    private switchEvent = {};
    private static channels = ['A0', 'AI', 'B0', 'BI'];
    private services = new Array();
    private buttons = {};

    getDeviceServices(): any[] {
        for (let name of FhemProgSwitch.channels) {

            const service = new FhemAccessory.Service.StatelessProgrammableSwitch(`${this.name} ${name}`, `${this.name} ${name}`);
            this.switchEvent[name] = service.getCharacteristic(FhemAccessory.Characteristic.ProgrammableSwitchEvent);
            this.buttons[name] = new ButtonStateMachine(() => {
                this.switchEvent[name].setValue(FhemAccessory.Characteristic.ProgrammableSwitchEvent.SINGLE_PRESS, undefined, 'fhem');
            }, () => {
                    this.switchEvent[name].setValue(FhemAccessory.Characteristic.ProgrammableSwitchEvent.LONG_PRESS, undefined, 'fhem');
            }, () => {
                    this.switchEvent[name].setValue(FhemAccessory.Characteristic.ProgrammableSwitchEvent.DOUBLE_PRESS, undefined, 'fhem');
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