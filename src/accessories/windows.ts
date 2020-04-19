import { FhemAccessory } from './base';
import { FhemValueType } from '../client/fhemclient';
import {
    Service,
    Characteristic,
    CharacteristicEventTypes,
    CharacteristicGetCallback,
    CharacteristicValue,
    CharacteristicSetCallback
} from 'homebridge';

export class FhemDoubleTapSwitch extends FhemAccessory {

    private characteristicUp!: Characteristic;
    private characteristicDown!: Characteristic;

    setValueFromFhem(_value: string, _part2?: string): void {}

    getDeviceServices(): any[] {
        const sUp = new Service.Switch('up', 'up');
        this.characteristicUp = sUp.getCharacteristic(Characteristic.On)!
            .on(CharacteristicEventTypes.GET, (cb: CharacteristicGetCallback) => cb(null, false))
            .on(CharacteristicEventTypes.SET, this.setUpState.bind(this));
        const sDown = new Service.Switch('down', 'down');
        this.characteristicDown = sDown.getCharacteristic(Characteristic.On)!
            .on(CharacteristicEventTypes.GET, (cb: CharacteristicGetCallback) => cb(null, true))
            .on(CharacteristicEventTypes.SET, this.setDownState.bind(this));

        return [sUp, sDown];
    }

    setUpState(value: CharacteristicValue, callback: CharacteristicSetCallback, context: string): void {
        if (context !== 'fhem' && value) {
            this.setFhemStatus('on');
            setTimeout(() => {
                this.characteristicUp.setValue(false, undefined, 'fhem');
            }, 100);
        }
        callback();
    }

    setDownState(value: CharacteristicValue, callback: CharacteristicSetCallback, context: string): void {
        if (context !== 'fhem' && !value) {
            this.setFhemStatus('off');
            setTimeout(() => {
                this.characteristicDown.setValue(true, undefined, 'fhem');
            }, 100);
        }
        callback();
    }
}

export class FhemWindowCovering extends FhemAccessory {
    private currentPosition!: Characteristic;
    private targetPosition!: Characteristic;
    private positionState!: Characteristic;

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
        this.currentPosition = service.getCharacteristic(Characteristic.CurrentPosition)!;
        this.currentPosition.on(CharacteristicEventTypes.GET, this.getCurrentPosition.bind(this));

        this.targetPosition = service.getCharacteristic(Characteristic.TargetPosition)!;
        this.targetPosition.on(CharacteristicEventTypes.GET, this.getCurrentPosition.bind(this))
            .on(CharacteristicEventTypes.SET, this.setTargetPosition.bind(this));

        this.positionState = service.getCharacteristic(Characteristic.PositionState)!;
        this.positionState.on(CharacteristicEventTypes.GET, this.getPositionState.bind(this));
        return [service];
    }

    getCurrentPosition(callback: CharacteristicGetCallback): void {
        this.getFhemNamedValue(FhemValueType.Readings, 'position').then((pos) =>
            callback(null, 100 - Number(pos))
        );
    }

    getPositionState(callback: CharacteristicGetCallback): void {
        this.getFhemStatus().then((status) => {
            if (status === 'down' || status === 'closes')
                callback(null, Characteristic.PositionState.INCREASING);
            else if (status === 'up' || status === 'opens')
                callback(null, Characteristic.PositionState.DECREASING);
            else callback(null, Characteristic.PositionState.STOPPED);
        });
    }

    setTargetPosition(value: CharacteristicValue, callback: CharacteristicSetCallback, context: string): void {
        if (context !== 'fhem') {
            if (value === 100) this.setFhemStatus('opens');
            else if (value === 0) this.setFhemStatus('closes');
            else this.setFhemReading('position', (100 - Number(value)).toString());
        }
        callback();
    }
}