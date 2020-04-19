'use strict';

export interface FhemDeviceList {
    Results:FhemDevice[]
}

export interface FhemDevice {
    Name: string,
    Attributes: any,
    Internals: any,
    Readings:any
}