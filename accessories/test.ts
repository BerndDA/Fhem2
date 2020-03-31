import { FhemAccessory } from './base';
import { FhemValueType } from '../client/fhemclient';

export class FhemTvTest extends FhemAccessory {
    private active;
    private activeIdentifier;
    private configuredName;
    private sleepDiscoveryMode;
    private mute;

    setValueFromFhem(value: string, part2?: string): void {

    }

    getDeviceServices(): any[] {
        const service = new FhemAccessory.Service.Television(this.name);
        this.active = service.getCharacteristic(FhemAccessory.Characteristic.Active);
        this.active.on('get', (cb) => {
            cb(null, FhemAccessory.Characteristic.Active.ACTIVE);
        });
        this.active.on('set', (value: Number, cb) => { cb(); });
        //this.currentPosition.on('get', this.getCurrentPosition.bind(this));

        this.activeIdentifier = service.getCharacteristic(FhemAccessory.Characteristic.ActiveIdentifier);
        this.activeIdentifier.on('get', (cb) => {
            cb(null, 1);
        });
        this.activeIdentifier.on('set', (value: Number, cb) => { cb(); });

        this.configuredName = service.getCharacteristic(FhemAccessory.Characteristic.ConfiguredName);
        this.configuredName.on('get', (cb) => { cb(null, 'lametr') });
        this.configuredName.on('set', (value, cb) => { cb() });

        this.sleepDiscoveryMode = service.getCharacteristic(FhemAccessory.Characteristic.SleepDiscoveryMode);
        this.sleepDiscoveryMode.on('get', (cb) => {
            cb(null, FhemAccessory.Characteristic.SleepDiscoveryMode.ALWAYS_DISCOVERABLE)
        });

        const volService = new FhemAccessory.Service.TelevisionSpeaker(this.name + 'volume', 'volService');
        this.mute = volService.getCharacteristic(FhemAccessory.Characteristic.Mute);
        this.mute.on('get', (cb) => { cb(null, false) }).on('set', (value, cb) => { cb() });
        volService.getCharacteristic(FhemAccessory.Characteristic.Active)
            .on('get', (cb) => { cb(null, FhemAccessory.Characteristic.Active.ACTIVE) })
            .on('set', (value: Number, cb) => { cb(); });

        volService.getCharacteristic(FhemAccessory.Characteristic.Volume).on('get', (cb) => { cb(null, 30) })
            .on('set', (value: Number, cb) => { cb(); });


        var input1 = new FhemAccessory.Service.InputSource('chann1', 'Channel 1');
        input1.getCharacteristic(FhemAccessory.Characteristic.ConfiguredName).on('get', (cb) => { cb(null, 'You FM') })
            .on('set', (value, cb) => { cb() });
        input1.getCharacteristic(FhemAccessory.Characteristic.InputSourceType).on('get', (cb) => {
            cb(null, FhemAccessory.Characteristic.InputSourceType.TUNER);
        });
        input1.getCharacteristic(FhemAccessory.Characteristic.IsConfigured).on('get', (cb) => {
            cb(null, FhemAccessory.Characteristic.IsConfigured.CONFIGURED);
        }).on('set', (value, cb) => { cb() });
        input1.getCharacteristic(FhemAccessory.Characteristic.CurrentVisibilityState).on('get', (cb) => {
            cb(null, FhemAccessory.Characteristic.CurrentVisibilityState.SHOWN);
        });
        input1.getCharacteristic(FhemAccessory.Characteristic.Identifier).on('get', (cb) => { cb(null, Number(0)) });

        var input2 = new FhemAccessory.Service.InputSource('chann2', 'Channel 2');
        input2.getCharacteristic(FhemAccessory.Characteristic.ConfiguredName)
            .on('get', (cb) => { cb(null, 'You FMddd') })
            .on('set', (value, cb) => { cb() });
        input2.getCharacteristic(FhemAccessory.Characteristic.InputSourceType).on('get', (cb) => {
            cb(null, FhemAccessory.Characteristic.InputSourceType.TUNER);
        });
        input2.getCharacteristic(FhemAccessory.Characteristic.IsConfigured).on('get', (cb) => {
            cb(null, FhemAccessory.Characteristic.IsConfigured.CONFIGURED);
        }).on('set', (value, cb) => { cb() });
        input2.getCharacteristic(FhemAccessory.Characteristic.CurrentVisibilityState).on('get', (cb) => {
            cb(null, FhemAccessory.Characteristic.CurrentVisibilityState.SHOWN);
        });
        input2.getCharacteristic(FhemAccessory.Characteristic.Identifier).on('get', (cb) => { cb(null, Number(1)) });

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