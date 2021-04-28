"use strict";

export interface FhemDeviceList {
    // ReSharper disable once InconsistentNaming
    Results: FhemDevice[];
}

export interface FhemDevice {
    // ReSharper disable once InconsistentNaming
    Name: string;
    // ReSharper disable once InconsistentNaming
    Attributes: Record<string, string>;
    // ReSharper disable once InconsistentNaming
    Internals: Record<string, string>;
    // ReSharper disable once InconsistentNaming
    Readings: Record<string, string>;
}