// main.ts - main entry point for obsidian-ballistics plugin

import { Plugin, TFile, type MarkdownPostProcessorContext } from "obsidian";
import { Logger, LogLevel } from "obskit";
import { BallisticsPluginSettings } from "./config";
import { BallisticsSettingsTab } from "./settings";
import { parseBallisticsBlock, type ParseContext, type ViewSpec } from "./parser";
import { solveTrajectory } from "./ballistics";
import { renderTrajectoryTable, renderError } from "./renderer";

const TABLE_VIEW: ViewSpec = {
    required: [],
    optional: ["maxRange", "rangeStep", "minEnergy", "maxEnergy"],
    defaults: { maxRange: 1000, rangeStep: 100 },
    validators: {
        maxRange: (n) => (n <= 0 ? `"maxRange" must be positive (got ${n})` : null),
        rangeStep: (n) => (n <= 0 ? `"rangeStep" must be positive (got ${n})` : null),
        minEnergy: (n) => (n < 0 ? `"minEnergy" must be non-negative (got ${n})` : null),
        maxEnergy: (n) => (n < 0 ? `"maxEnergy" must be non-negative (got ${n})` : null),
    },
    crossValidate: (view) => {
        if (view.rangeStep > view.maxRange) {
            return `"rangeStep" (${view.rangeStep}) must not exceed "maxRange" (${view.maxRange})`;
        }
        if (
            view.minEnergy !== undefined &&
            view.maxEnergy !== undefined &&
            view.maxEnergy <= view.minEnergy
        ) {
            return `"maxEnergy" (${view.maxEnergy}) must be greater than "minEnergy" (${view.minEnergy})`;
        }
        return null;
    },
};

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
        const parsed = parseBallisticsBlock(source, this.buildParseContext(ctx.sourcePath));
        if (!parsed.ok) {
            renderError(el, parsed.error.message);
            return;
        }
        try {
            const { inputs, view } = parsed.value;
            const rows = solveTrajectory(inputs, this.settings.units, {
                maxRange: view.maxRange,
                rangeStep: view.rangeStep,
            });
            renderTrajectoryTable(el, rows, this.settings.units, {
                includeWindage: inputs.windSpeed > 0,
                minEnergy: view.minEnergy,
                maxEnergy: view.maxEnergy,
            });
            this.alignCopyToEditButton(el);
        } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            this.logger.error("Trajectory solver failed", e);
            renderError(el, `solver failure: ${msg}`);
        }
    }

    private buildParseContext(sourcePath: string): ParseContext {
        return {
            frontmatter: this.readFrontmatter(sourcePath),
            resolveUse: (linkTarget) => {
                const dest = this.app.metadataCache.getFirstLinkpathDest(linkTarget, sourcePath);
                if (!dest) return null;
                return this.readFrontmatter(dest.path);
            },
            view: TABLE_VIEW,
        };
    }

    private readFrontmatter(path: string): Record<string, unknown> | null {
        const file = this.app.vault.getAbstractFileByPath(path);
        if (!(file instanceof TFile)) return null;
        const cache = this.app.metadataCache.getFileCache(file);
        return cache?.frontmatter ?? null;
    }

    private alignCopyToEditButton(el: HTMLElement): void {
        const block = el.querySelector<HTMLElement>(".ballistics-block");
        const copy = el.querySelector<HTMLElement>(".ballistics-copy");
        if (!block || !copy) return;

        const tryAlign = (): boolean => {
            const wrapper = el.parentElement;
            if (!wrapper) return false;
            const editBtn = wrapper.querySelector<HTMLElement>(".edit-block-button");
            if (!editBtn) return false;
            const blockRect = block.getBoundingClientRect();
            const editRect = editBtn.getBoundingClientRect();
            copy.style.top = `${editRect.bottom - blockRect.top + 4}px`;
            copy.style.right = `${blockRect.right - editRect.right}px`;
            return true;
        };

        const parent = el.parentElement;
        if (parent) this.wireParentHover(parent);

        if (tryAlign()) return;
        if (!parent) return;

        const observer = new MutationObserver(() => {
            if (tryAlign()) observer.disconnect();
        });
        observer.observe(parent, { childList: true, subtree: true });
        window.setTimeout(() => observer.disconnect(), 3000);
    }

    private wireParentHover(parent: HTMLElement): void {
        if (parent.dataset.ballisticsHover === "1") return;
        parent.dataset.ballisticsHover = "1";
        this.registerDomEvent(parent, "mouseenter", () => {
            parent
                .querySelectorAll(".ballistics-copy")
                .forEach((el) => el.classList.add("is-hover"));
        });
        this.registerDomEvent(parent, "mouseleave", () => {
            parent
                .querySelectorAll(".ballistics-copy")
                .forEach((el) => el.classList.remove("is-hover"));
        });
    }
}
