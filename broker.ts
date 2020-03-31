/// <reference types="node" />

'use strict';

export interface IFhemObservable {
    subscribe(topic: string, subscriber: IFhemSubscriber)
}

export interface IFhemSubscriber {
    setValueFromFhem(value: string, part2?: string): void
}

export interface IFhemBroker {
    notify(topic: string, value1: string, value2: string): void
}

export class FhemBroker implements IFhemObservable, IFhemBroker {
    private allSubscriptions: { [name: string]: IFhemSubscriber[] } = {};

    subscribe(topic: string, subscriber: IFhemSubscriber) {
        this.allSubscriptions[topic] ? this.allSubscriptions[topic].push(subscriber) : this.allSubscriptions[topic] =
            [subscriber];
    }

    notify(topic: string, value1: string, value2: string) {
        if (this.allSubscriptions[topic]) {
            this.allSubscriptions[topic].forEach((accessory) => {
                accessory.setValueFromFhem(value1, value2 ? value2 : null);
            });
        }
    }
}