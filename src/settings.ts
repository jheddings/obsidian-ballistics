import { PluginSettingTab, App } from "obsidian";
import { DropdownSetting, LogLevel } from "obskit";
import BallisticsPlugin from "./main";
import { UnitSystem } from "./units";

/**
 * Control the log level user setting.
 */
class LogLevelSetting extends DropdownSetting<LogLevel> {
    constructor(private plugin: BallisticsPlugin) {
        super({
            name: "Log level",
            description: "Set the logging level for console output.",
        });
    }

    get value(): LogLevel {
        return this.plugin.settings.logLevel ?? this.default;
    }

    set value(val: LogLevel) {
        this.plugin.settings.logLevel = val;
        void this.plugin.saveSettings();
    }

    get default(): LogLevel {
        return LogLevel.INFO;
    }

    get options(): { key: string; label: string; value: LogLevel }[] {
        return [
            { key: "debug", label: "Debug", value: LogLevel.DEBUG },
            { key: "info", label: "Info", value: LogLevel.INFO },
            { key: "warn", label: "Warn", value: LogLevel.WARN },
            { key: "error", label: "Error", value: LogLevel.ERROR },
            { key: "silent", label: "Silent", value: LogLevel.SILENT },
        ];
    }
}

/**
 * Control the unit system user setting.
 */
class UnitSystemSetting extends DropdownSetting<UnitSystem> {
    constructor(private plugin: BallisticsPlugin) {
        super({
            name: "Units",
            description: "Unit system for ballistics inputs and table output.",
        });
    }

    get value(): UnitSystem {
        return this.plugin.settings.units ?? this.default;
    }

    set value(val: UnitSystem) {
        this.plugin.settings.units = val;
        void this.plugin.saveSettings();
    }

    get default(): UnitSystem {
        return "imperial";
    }

    get options(): { key: string; label: string; value: UnitSystem }[] {
        return [
            { key: "imperial", label: "Imperial (yd, in, ft/s)", value: "imperial" },
            { key: "metric", label: "Metric (m, cm, m/s)", value: "metric" },
        ];
    }
}

/**
 * Settings tab for the Ballistics plugin.
 */
export class BallisticsSettingsTab extends PluginSettingTab {
    private plugin: BallisticsPlugin;

    constructor(app: App, plugin: BallisticsPlugin) {
        super(app, plugin);
        this.plugin = plugin;
    }

    /**
     * Displays the settings tab UI.
     */
    display(): void {
        const { containerEl } = this;
        containerEl.empty();

        new UnitSystemSetting(this.plugin).display(containerEl);
        new LogLevelSetting(this.plugin).display(containerEl);
    }
}
