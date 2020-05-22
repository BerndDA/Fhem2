/// <reference types="node" />

"use strict";

import { EventEmitter } from "events";

export interface FhemObservable {
    on(event: string, listener: (value1: string, value2?: string) => void): this;
}

export interface FhemBroker {
    notify(topic: string, value1: string, value2: string | null): void;
}

export class FhemBroker extends EventEmitter implements FhemObservable, FhemBroker {

    on(event: string, listener: (value1: string, value2?: string) => void): this {
        super.on(event, listener);
        return this;
    }

    notify(topic: string, value1: string, value2: string | null): void {
        this.emit(topic, value1, value2 ? value2 : undefined);
    }
}