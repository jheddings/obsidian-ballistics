// main.ts - main entry point for obsidian-ballistics plugin

import { Plugin, TFile, type MarkdownPostProcessorContext } from "obsidian";
import { Logger, LogLevel } from "obskit";
import { BallisticsPluginSettings } from "./config";
import { BallisticsSettingsTab } from "./settings";
import { parseBallisticsBlock, type ParseContext, type ParseResult } from "./parser";
import { solveTrajectory } from "./ballistics";
import { renderTrajectoryTable, renderError } from "./tableRenderer";
import { renderTrajectoryChart } from "./chartRenderer";
import { alignCopyOverlay, hoverAlreadyWired } from "./positioning";
import { TABLE_VIEW } from "./views/table";

const DEFAULT_SETTINGS: BallisticsPluginSettings = {
    logLevel: LogLevel.ERROR,
    units: "imperial",
};

// Live preview can invoke the processor before metadataCache has populated
// frontmatter for the current note. Wait this long for a `changed` event
// before giving up and rendering the parse error.
const FRONTMATTER_WAIT_MS = 2000;

type FenceKind = "table" | "chart";

export default class BallisticsPlugin extends Plugin {
    settings!: BallisticsPluginSettings;

    private logger: Logger = Logger.getLogger("main");

    async onload() {
        await this.loadSettings();

        this.addSettingTab(new BallisticsSettingsTab(this.app, this));

        this.registerMarkdownCodeBlockProcessor("ballistics-table", (source, el, ctx) => {
            this.processFence("table", source, el, ctx);
        });

        this.registerMarkdownCodeBlockProcessor("ballistics-chart", (source, el, ctx) => {
            this.processFence("chart", source, el, ctx);
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

    private processFence(
        kind: FenceKind,
        source: string,
        el: HTMLElement,
        ctx: MarkdownPostProcessorContext
    ): void {
        const parseCtx = this.buildParseContext(ctx);
        const hadFrontmatter = parseCtx.frontmatter !== null;
        const parsed = parseBallisticsBlock(source, parseCtx);

        if (parsed.ok) {
            this.renderParsed(kind, el, parsed);
            return;
        }

        // Live-preview cache race: frontmatter wasn't available when the
        // processor ran, but the note actually has it. Wait briefly for the
        // metadata cache to resolve, then retry once.
        const couldBeFrontmatterRace =
            !hadFrontmatter && /missing required input/.test(parsed.error.message);
        if (couldBeFrontmatterRace) {
            this.logger.debug(
                `[${ctx.sourcePath}] ballistics-${kind} deferring — frontmatter not yet available`
            );
            this.deferOnFrontmatterReady(
                ctx.sourcePath,
                () => this.retryFence(kind, source, el, ctx),
                () => {
                    this.logger.error(
                        `[${ctx.sourcePath}] ballistics-${kind} parse failed (frontmatter never resolved): ${parsed.error.message}`
                    );
                    renderError(el, parsed.error.message);
                }
            );
            return;
        }

        this.logger.error(
            `[${ctx.sourcePath}] ballistics-${kind} parse failed: ${parsed.error.message}`
        );
        renderError(el, parsed.error.message);
    }

    private retryFence(
        kind: FenceKind,
        source: string,
        el: HTMLElement,
        ctx: MarkdownPostProcessorContext
    ): void {
        const retry = parseBallisticsBlock(source, this.buildParseContext(ctx));
        while (el.firstChild) el.removeChild(el.firstChild);
        if (retry.ok) {
            this.renderParsed(kind, el, retry);
            return;
        }
        this.logger.error(
            `[${ctx.sourcePath}] ballistics-${kind} parse failed after retry: ${retry.error.message}`
        );
        renderError(el, retry.error.message);
    }

    private renderParsed(kind: FenceKind, el: HTMLElement, parsed: ParseResult): void {
        if (!parsed.ok) return;
        try {
            const { inputs, view } = parsed.value;
            const rows = solveTrajectory(inputs, this.settings.units, {
                maxRange: view.maxRange,
                rangeStep: view.rangeStep,
                minRange: view.minRange,
            });
            const opts = {
                includeWindage: inputs.windSpeed > 0,
                minEnergy: view.minEnergy,
                maxEnergy: view.maxEnergy,
            };
            if (kind === "table") {
                renderTrajectoryTable(el, rows, this.settings.units, opts);
                this.attachOverlay(el);
            } else {
                renderTrajectoryChart(el, rows, this.settings.units, opts);
            }
        } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            this.logger.error("Trajectory solver failed", e);
            renderError(el, `solver failure: ${msg}`);
        }
    }

    private deferOnFrontmatterReady(
        sourcePath: string,
        onReady: () => void,
        onTimeout: () => void
    ): void {
        let fired = false;
        const ref = this.app.metadataCache.on("changed", (file) => {
            if (fired || file.path !== sourcePath) return;
            fired = true;
            this.app.metadataCache.offref(ref);
            window.clearTimeout(timer);
            onReady();
        });
        const timer = window.setTimeout(() => {
            if (fired) return;
            fired = true;
            this.app.metadataCache.offref(ref);
            onTimeout();
        }, FRONTMATTER_WAIT_MS);
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
        // Try the path-keyed cache first — it doesn't require the file to be
        // resolvable via the vault, which can lag in live preview.
        const direct = this.app.metadataCache.getCache(path);
        if (direct?.frontmatter) return direct.frontmatter;

        const file = this.app.vault.getAbstractFileByPath(path);
        if (!(file instanceof TFile)) return null;
        const cache = this.app.metadataCache.getFileCache(file);
        return cache?.frontmatter ?? null;
    }
}
