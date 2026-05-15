// main.ts - main entry point for obsidian-ballistics plugin

import { Plugin, TFile, type MarkdownPostProcessorContext } from "obsidian";
import { Logger, LogLevel } from "obskit";
import { BallisticsPluginSettings } from "./config";
import { BallisticsSettingsTab } from "./settings";
import { parseBallisticsBlock, type ParseContext } from "./parser";
import { solveTrajectory } from "./ballistics";
import { renderTrajectoryTable, renderError } from "./tableRenderer";
import { renderTrajectoryChart } from "./chartRenderer";
import { alignCopyOverlay, hoverAlreadyWired } from "./positioning";
import { TABLE_VIEW } from "./views/table";

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

        this.registerMarkdownCodeBlockProcessor("ballistics-table", (source, el, ctx) => {
            this.processBlock(source, el, ctx);
        });

        this.registerMarkdownCodeBlockProcessor("ballistics-chart", (source, el, ctx) => {
            this.processChartBlock(source, el, ctx);
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

    private processBlock(source: string, el: HTMLElement, ctx: MarkdownPostProcessorContext): void {
        const parsed = parseBallisticsBlock(source, this.buildParseContext(ctx));
        if (!parsed.ok) {
            this.logger.error(
                `[${ctx.sourcePath}] ballistics-table parse failed: ${parsed.error.message}`
            );
            renderError(el, parsed.error.message);
            return;
        }
        try {
            const { inputs, view } = parsed.value;
            const rows = solveTrajectory(inputs, this.settings.units, {
                maxRange: view.maxRange,
                rangeStep: view.rangeStep,
                minRange: view.minRange,
            });
            renderTrajectoryTable(el, rows, this.settings.units, {
                includeWindage: inputs.windSpeed > 0,
                minEnergy: view.minEnergy,
                maxEnergy: view.maxEnergy,
            });
            this.attachOverlay(el);
        } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            this.logger.error("Trajectory solver failed", e);
            renderError(el, `solver failure: ${msg}`);
        }
    }

    private processChartBlock(
        source: string,
        el: HTMLElement,
        ctx: MarkdownPostProcessorContext
    ): void {
        const parsed = parseBallisticsBlock(source, this.buildParseContext(ctx));
        if (!parsed.ok) {
            this.logger.error(
                `[${ctx.sourcePath}] ballistics-chart parse failed: ${parsed.error.message}`
            );
            renderError(el, parsed.error.message);
            return;
        }
        try {
            const { inputs, view } = parsed.value;
            const rows = solveTrajectory(inputs, this.settings.units, {
                maxRange: view.maxRange,
                rangeStep: view.rangeStep,
                minRange: view.minRange,
            });
            renderTrajectoryChart(el, rows, this.settings.units, {
                includeWindage: inputs.windSpeed > 0,
                minEnergy: view.minEnergy,
                maxEnergy: view.maxEnergy,
            });
        } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            this.logger.error("Trajectory solver failed", e);
            renderError(el, `solver failure: ${msg}`);
        }
    }

    private attachOverlay(el: HTMLElement): void {
        const handle = alignCopyOverlay(el);
        if (!handle) return;
        const parent = el.parentElement;
        if (parent && !hoverAlreadyWired(parent)) {
            this.registerDomEvent(parent, "mouseenter", handle.onEnter);
            this.registerDomEvent(parent, "mouseleave", handle.onLeave);
        }
    }

    private buildParseContext(ctx: MarkdownPostProcessorContext): ParseContext {
        const ctxFm = ctx.frontmatter as Record<string, unknown> | null | undefined;
        return {
            frontmatter: ctxFm ?? this.readFrontmatter(ctx.sourcePath),
            resolveUse: (linkTarget) => {
                const dest = this.app.metadataCache.getFirstLinkpathDest(
                    linkTarget,
                    ctx.sourcePath
                );
                if (!dest) return null;
                return this.readFrontmatter(dest.path);
            },
            view: TABLE_VIEW,
            debug: (msg) => this.logger.debug(`[${ctx.sourcePath}] ${msg}`),
        };
    }

    private readFrontmatter(path: string): Record<string, unknown> | null {
        const file = this.app.vault.getAbstractFileByPath(path);
        if (!(file instanceof TFile)) return null;
        const cache = this.app.metadataCache.getFileCache(file);
        return cache?.frontmatter ?? null;
    }
}
