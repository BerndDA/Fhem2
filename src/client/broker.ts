/// <reference types="node" />

'use strict';

import events from 'events';

export interface IFhemObservable {
    on(event: string, listener: (value1: string, value2?: string) => void): this;
}

export interface IFhemBroker {
    notify(topic: string, value1: string, value2: string | null): void
}

export class FhemBroker extends events.EventEmitter implements IFhemObservable, IFhemBroker {

    on(event: string, listener: (value1: string, value2?: string) => void): this {
        super.on(event, listener);
        return this;
    }

    notify(topic: string, value1: string, value2: string | null) {
        this.emit(topic, value1, value2 ? value2 : undefined);
    }
}