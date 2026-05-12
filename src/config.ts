// config.ts - config models for the obsidian-ballistics plugin

import { LogLevel } from "obskit";
import { UnitSystem } from "./units";

export interface BallisticsPluginSettings {
    logLevel: LogLevel;
    units: UnitSystem;
}
