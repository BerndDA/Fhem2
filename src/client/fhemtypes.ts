'use strict';

export interface IFhemDeviceList {
    // ReSharper disable once InconsistentNaming
    Results: IFhemDevice[]
}

export interface IFhemDevice {
    // ReSharper disable once InconsistentNaming
    Name: string;
    // ReSharper disable once InconsistentNaming
    Attributes: any;
    // ReSharper disable once InconsistentNaming
    Internals: any;
    // ReSharper disable once InconsistentNaming
    Readings: any;
}