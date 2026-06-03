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

type FenceKind = "table" | "chart";

export default class BallisticsPlugin extends Plugin {
    settings!: BallisticsPluginSettings;

    private logger: Logger = Logger.getLogger("main");

    async onload() {
        await this.loadSettings();

        this.addSettingTab(new BallisticsSettingsTab(this.app, this));

        this.registerMarkdownCodeBlockProcessor("ballistics-table", (source, el, ctx) => {
            return this.processFence("table", source, el, ctx);
        });

        this.registerMarkdownCodeBlockProcessor("ballistics-chart", (source, el, ctx) => {
            return this.processFence("chart", source, el, ctx);
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

    private async processFence(
        kind: FenceKind,
        source: string,
        el: HTMLElement,
        ctx: MarkdownPostProcessorContext
    ): Promise<void> {
        const frontmatter = await this.resolveFrontmatter(ctx);
        const parseCtx = this.buildParseContext(ctx, frontmatter);
        const parsed = parseBallisticsBlock(source, parseCtx);

        if (!parsed.ok) {
            this.logger.error(
                `[${ctx.sourcePath}] ballistics-${kind} parse failed: ${parsed.error.message}`
            );
            renderError(el, parsed.error.message);
            return;
        }

        this.renderParsed(kind, el, parsed);
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
                rangeStep: view.rangeStep,
                zeroRange: inputs.zeroRange,
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

    private attachOverlay(el: HTMLElement): void {
        const handle = alignCopyOverlay(el);
        if (!handle) return;
        const parent = el.parentElement;
        if (parent && !hoverAlreadyWired(parent)) {
            this.registerDomEvent(parent, "mouseenter", handle.onEnter);
            this.registerDomEvent(parent, "mouseleave", handle.onLeave);
        }
    }

    private buildParseContext(
        ctx: MarkdownPostProcessorContext,
        frontmatter: Record<string, unknown> | null
    ): ParseContext {
        return {
            frontmatter,
            resolveUse: (linkTarget) => {
                const dest = this.app.metadataCache.getFirstLinkpathDest(
                    linkTarget,
                    ctx.sourcePath
                );
                if (!dest) return null;
                // "use:" targets a separate note; the metadata cache is
                // authoritative for them since we have no live-preview race.
                return this.app.metadataCache.getFileCache(dest)?.frontmatter ?? null;
            },
            view: TABLE_VIEW,
            debug: (msg) => this.logger.debug(`[${ctx.sourcePath}] ${msg}`),
        };
    }

    /**
     * Resolve the current note's frontmatter. `ctx.frontmatter` and the
     * metadata cache are unreliable in live preview — they're often empty
     * or undefined when the codeblock processor first runs. As a robust
     * fallback we read the file content via `vault.cachedRead` and parse
     * the YAML block ourselves.
     */
    private async resolveFrontmatter(
        ctx: MarkdownPostProcessorContext
    ): Promise<Record<string, unknown> | null> {
        const ctxFm = ctx.frontmatter as Record<string, unknown> | null | undefined;
        if (ctxFm && Object.keys(ctxFm).length > 0) return ctxFm;

        const cached = this.app.metadataCache.getCache(ctx.sourcePath)?.frontmatter;
        if (cached && Object.keys(cached).length > 0) return cached;

        const file = this.app.vault.getAbstractFileByPath(ctx.sourcePath);
        if (!(file instanceof TFile)) return null;
        try {
            const text = await this.app.vault.cachedRead(file);
            return parseFrontmatterBlock(text);
        } catch (e) {
            this.logger.debug(`[${ctx.sourcePath}] cachedRead failed: ${String(e)}`);
            return null;
        }
    }
}

/**
 * Extract a flat key/value map from a YAML frontmatter block at the top of
 * a markdown file. Handles the subset of YAML the plugin actually uses:
 * `key: value` lines, optionally quoted strings, numeric values. Returns
 * null if the file has no frontmatter delimiters.
 */
export function parseFrontmatterBlock(text: string): Record<string, unknown> | null {
    const match = text.match(/^---\r?\n([\s\S]*?)\r?\n---\s*(?:\r?\n|$)/);
    if (!match) return null;

    const out: Record<string, unknown> = {};
    for (const raw of match[1].split(/\r?\n/)) {
        const m = raw.match(/^([A-Za-z][\w-]*)\s*:\s*(.*)$/);
        if (!m) continue;
        const key = m[1];
        let val = m[2].trim();
        if (
            (val.startsWith('"') && val.endsWith('"')) ||
            (val.startsWith("'") && val.endsWith("'"))
        ) {
            val = val.slice(1, -1);
        }
        if (val === "") {
            out[key] = "";
            continue;
        }
        const num = Number(val);
        out[key] = Number.isFinite(num) ? num : val;
    }
    return out;
}
