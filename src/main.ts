// main.ts - main entry point for obsidian-ballistics plugin

import { Plugin } from "obsidian";
import { Logger, LogLevel } from "obskit";
import { BallisticsPluginSettings } from "./config";
import { BallisticsSettingsTab } from "./settings";
import { parseBallisticsBlock } from "./parser";
import { solveTrajectory } from "./ballistics";
import { renderTrajectoryTable, renderError } from "./renderer";

const DEFAULT_SETTINGS: BallisticsPluginSettings = {
    logLevel: LogLevel.ERROR,
    units: "imperial",
};

export default class BallisticsPlugin extends Plugin {
    settings!: BallisticsPluginSettings;

    private logger: Logger = Logger.getLogger("main");

    async onload() {
        await this.loadSettings();

        this.addSettingTab(new BallisticsSettingsTab(this.app, this));

        this.registerMarkdownCodeBlockProcessor("ballistics-table", (source, el) => {
            this.processBlock(source, el);
        });

        this.logger.info("Plugin loaded");
    }

    onunload() {
        this.logger.info("Plugin unloaded");
    }

    async loadSettings() {
        const data = (await this.loadData()) as Partial<BallisticsPluginSettings> | null;
        this.settings = Object.assign({}, DEFAULT_SETTINGS, data);

        this.applySettings();
    }

    async saveSettings() {
        await this.saveData(this.settings);

        this.applySettings();
    }

    private applySettings() {
        Logger.setGlobalLogLevel(this.settings.logLevel);
    }

    private processBlock(source: string, el: HTMLElement): void {
        const parsed = parseBallisticsBlock(source);
        if (!parsed.ok) {
            renderError(el, parsed.error.message);
            return;
        }
        try {
            const rows = solveTrajectory(parsed.value, this.settings.units);
            renderTrajectoryTable(el, rows, this.settings.units, {
                includeWindage: parsed.value.windSpeed > 0,
            });
        } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            this.logger.error("Trajectory solver failed", e);
            renderError(el, `solver failure: ${msg}`);
        }
    }
}
