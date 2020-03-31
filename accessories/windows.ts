import { FhemAccessory } from './base';
import { FhemValueType } from '../client/fhemclient';

export class FhemDoubleTapSwitch extends FhemAccessory {

    private characteristicUp: any;
    private characteristicDown: any;

    setValueFromFhem(value: string, part2?: string): void {}

    getDeviceServices(): any[] {
        const sUp = new FhemAccessory.Service.Switch('up', 'up');
        this.characteristicUp = sUp.getCharacteristic(FhemAccessory.Characteristic.On)
            .on('get', (cb) => cb(null, false))
            .on('set', this.setUpState.bind(this));
        const sDown = new FhemAccessory.Service.Switch('down', 'down');
        this.characteristicDown = sDown.getCharacteristic(FhemAccessory.Characteristic.On)
            .on('get', (cb) => cb(null, true))
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

export class FhemWindowCovering extends FhemAccessory {
    private currentPosition;
    private targetPosition;
    private positionState;

    setValueFromFhem(value: string, part2?: string): void {
        if (value === 'down') {
            this.positionState.setValue(FhemAccessory.Characteristic.PositionState.INCREASING, undefined, 'fhem');
        } else if (value === 'up') {
            this.positionState.setValue(FhemAccessory.Characteristic.PositionState.DECREASING, undefined, 'fhem');
        } else if (value === 'stop') {
            this.positionState.setValue(FhemAccessory.Characteristic.PositionState.STOPPED, undefined, 'fhem');
        } else if (value === 'open_ack') {
            this.positionState.setValue(FhemAccessory.Characteristic.PositionState.STOPPED, undefined, 'fhem');
            this.currentPosition.setValue(100, undefined, 'fhem');
        } else if (value === 'closed') {
            this.positionState.setValue(FhemAccessory.Characteristic.PositionState.STOPPED, undefined, 'fhem');
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
        const service = new FhemAccessory.Service.WindowCovering(this.name);
        this.currentPosition = service.getCharacteristic(FhemAccessory.Characteristic.CurrentPosition);
        this.currentPosition.on('get', this.getCurrentPosition.bind(this));

        this.targetPosition = service.getCharacteristic(FhemAccessory.Characteristic.TargetPosition);
        this.targetPosition.on('get', this.getCurrentPosition.bind(this)).on('set', this.setTargetPosition.bind(this));

        this.positionState = service.getCharacteristic(FhemAccessory.Characteristic.PositionState);
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
            if (status === 'down' || status === 'closes')
                callback(null, FhemAccessory.Characteristic.PositionState.INCREASING);
            else if (status === 'up' || status === 'opens')
                callback(null, FhemAccessory.Characteristic.PositionState.DECREASING);
            else callback(null, FhemAccessory.Characteristic.PositionState.STOPPED);
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