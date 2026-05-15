# Trajectory Chart Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `ballistics-chart` markdown codefence that renders a trajectory chart (range vs. elevation) from the same inputs as `ballistics-table`, with red dashed bound-markers for `minEnergy` / `maxEnergy`.

**Architecture:** Reuse the existing parser/solver pipeline. Rename the current renderer to `tableRenderer.ts` for symmetry, add a sibling `chartRenderer.ts` backed by uPlot. Pure data-prep helpers are exported for unit testing; the uPlot wrapper is exercised by a smoke test.

**Tech Stack:** TypeScript, esbuild, vitest + happy-dom, [uPlot](https://github.com/leeoniya/uPlot) (canvas-based charting).

**Spec:** `docs/superpowers/specs/2026-05-15-trajectory-chart-design.md`

---

## File Structure

- **Create** `src/chartRenderer.ts` — `renderTrajectoryChart`, `buildChartSeries`, `computeBoundMarkers`
- **Rename** `src/renderer.ts` → `src/tableRenderer.ts` (no content changes)
- **Rename** `tests/renderer.test.ts` → `tests/tableRenderer.test.ts` (update import path)
- **Create** `tests/chartRenderer.test.ts` — unit + smoke tests
- **Modify** `src/main.ts` — register `ballistics-chart` processor, add `processChartBlock`, update import
- **Modify** `styles.css` — add `.ballistics-chart-block` rules
- **Modify** `package.json` — add `uplot` to `dependencies`

---

## Task 1: Add uPlot dependency

**Files:**

- Modify: `package.json`

- [ ] **Step 1: Install uPlot**

```bash
npm install uplot@^1.6.32
```

- [ ] **Step 2: Verify it landed in dependencies (not devDependencies)**

Run: `node -e "console.log(require('./package.json').dependencies)"`
Expected: output contains `uplot`.

- [ ] **Step 3: Verify the bundle still builds**

Run: `npm run build`
Expected: completes with no type errors and `main.js` is regenerated.

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore(deps): add uplot for trajectory charts"
```

---

## Task 2: Rename renderer.ts to tableRenderer.ts

**Files:**

- Rename: `src/renderer.ts` → `src/tableRenderer.ts`
- Rename: `tests/renderer.test.ts` → `tests/tableRenderer.test.ts`
- Modify: `src/main.ts` (update import path)

- [ ] **Step 1: Rename the source file via git**

```bash
git mv src/renderer.ts src/tableRenderer.ts
```

- [ ] **Step 2: Rename the test file via git**

```bash
git mv tests/renderer.test.ts tests/tableRenderer.test.ts
```

- [ ] **Step 3: Update the import path in the test file**

In `tests/tableRenderer.test.ts`, change:

```ts
import { renderTrajectoryTable, renderError } from "../src/renderer";
```

to:

```ts
import { renderTrajectoryTable, renderError } from "../src/tableRenderer";
```

- [ ] **Step 4: Update the import path in main.ts**

In `src/main.ts`, change:

```ts
import { renderTrajectoryTable, renderError } from "./renderer";
```

to:

```ts
import { renderTrajectoryTable, renderError } from "./tableRenderer";
```

- [ ] **Step 5: Verify tests still pass**

Run: `npm test`
Expected: all existing tests pass (no behavior changed).

- [ ] **Step 6: Verify the build still succeeds**

Run: `npm run build`
Expected: completes with no errors.

- [ ] **Step 7: Commit**

```bash
git add src/renderer.ts src/tableRenderer.ts tests/renderer.test.ts tests/tableRenderer.test.ts src/main.ts
git commit -m "refactor: rename renderer to tableRenderer for symmetry with chart"
```

---

## Task 3: Create chartRenderer module with buildChartSeries (TDD)

**Files:**

- Create: `tests/chartRenderer.test.ts`
- Create: `src/chartRenderer.ts`

- [ ] **Step 1: Write the failing test for buildChartSeries**

Create `tests/chartRenderer.test.ts` with:

```ts
import { describe, it, expect } from "vitest";
import { buildChartSeries } from "../src/chartRenderer";
import type { TrajectoryRow } from "../src/ballistics";

function makeRow(over: Partial<TrajectoryRow> = {}): TrajectoryRow {
    return {
        range: 0,
        elevation: 0,
        elevationMoa: 0,
        elevationMil: 0,
        windage: 0,
        windageMoa: 0,
        windageMil: 0,
        time: 0,
        energy: 0,
        velocity: 0,
        ...over,
    };
}

describe("buildChartSeries", () => {
    it("returns arrays of equal length matching the row count", () => {
        const rows = [makeRow({ range: 0 }), makeRow({ range: 100 }), makeRow({ range: 200 })];
        const series = buildChartSeries(rows);
        expect(series.x).toHaveLength(3);
        expect(series.elevation).toHaveLength(3);
    });

    it("preserves range values in order", () => {
        const rows = [makeRow({ range: 0 }), makeRow({ range: 100 }), makeRow({ range: 200 })];
        const series = buildChartSeries(rows);
        expect(series.x).toEqual([0, 100, 200]);
    });

    it("preserves the sign of elevation values", () => {
        const rows = [
            makeRow({ range: 0, elevation: -1.5 }),
            makeRow({ range: 100, elevation: 0 }),
            makeRow({ range: 200, elevation: -8.2 }),
        ];
        const series = buildChartSeries(rows);
        expect(series.elevation).toEqual([-1.5, 0, -8.2]);
    });

    it("handles an empty row list", () => {
        const series = buildChartSeries([]);
        expect(series.x).toEqual([]);
        expect(series.elevation).toEqual([]);
    });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- tests/chartRenderer.test.ts`
Expected: FAIL — cannot resolve `../src/chartRenderer`.

- [ ] **Step 3: Create chartRenderer.ts with the minimal implementation**

Create `src/chartRenderer.ts` with:

```ts
// chartRenderer.ts — builds the trajectory chart DOM via uPlot.

import type { TrajectoryRow } from "./ballistics";

export interface ChartSeries {
    x: number[];
    elevation: number[];
}

export function buildChartSeries(rows: TrajectoryRow[]): ChartSeries {
    return {
        x: rows.map((r) => r.range),
        elevation: rows.map((r) => r.elevation),
    };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- tests/chartRenderer.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/chartRenderer.ts tests/chartRenderer.test.ts
git commit -m "feat(chart): add buildChartSeries helper"
```

---

## Task 4: Add computeBoundMarkers helper (TDD)

**Files:**

- Modify: `tests/chartRenderer.test.ts`
- Modify: `src/chartRenderer.ts`

- [ ] **Step 1: Write the failing tests for computeBoundMarkers**

Append to `tests/chartRenderer.test.ts`:

```ts
import { computeBoundMarkers } from "../src/chartRenderer";

describe("computeBoundMarkers", () => {
    // Rows arranged with energy decreasing as range grows — a realistic trajectory.
    const rows = [
        makeRow({ range: 0, energy: 3000 }),
        makeRow({ range: 100, energy: 2400 }),
        makeRow({ range: 200, energy: 1900 }),
        makeRow({ range: 300, energy: 1500 }),
        makeRow({ range: 400, energy: 1100 }),
        makeRow({ range: 500, energy: 800 }),
    ];

    it("returns the range where maxEnergy is first crossed (energy <= max)", () => {
        const markers = computeBoundMarkers(rows, undefined, 2000);
        expect(markers.max).toBe(200);
        expect(markers.min).toBeUndefined();
    });

    it("returns the range where minEnergy is last satisfied (energy >= min)", () => {
        const markers = computeBoundMarkers(rows, 1000, undefined);
        expect(markers.min).toBe(400);
        expect(markers.max).toBeUndefined();
    });

    it("returns both markers when both bounds are set", () => {
        const markers = computeBoundMarkers(rows, 1000, 2000);
        expect(markers.max).toBe(200);
        expect(markers.min).toBe(400);
    });

    it("returns undefined for a bound that is set but never crossed (maxEnergy above muzzle)", () => {
        const markers = computeBoundMarkers(rows, undefined, 10000);
        expect(markers.max).toBeUndefined();
    });

    it("returns undefined for a bound that is set but never crossed (minEnergy below terminal)", () => {
        const markers = computeBoundMarkers(rows, 100, undefined);
        // Every row satisfies energy >= 100, so the marker is the last row's range.
        // This is a *valid* crossing (the entire trajectory is above the floor),
        // so we return the last range, not undefined.
        expect(markers.min).toBe(500);
    });

    it("returns undefined when neither bound is set", () => {
        const markers = computeBoundMarkers(rows, undefined, undefined);
        expect(markers.min).toBeUndefined();
        expect(markers.max).toBeUndefined();
    });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- tests/chartRenderer.test.ts`
Expected: FAIL — `computeBoundMarkers` not exported.

- [ ] **Step 3: Implement computeBoundMarkers**

Append to `src/chartRenderer.ts`:

```ts
export interface BoundMarkers {
    min?: number;
    max?: number;
}

export function computeBoundMarkers(
    rows: TrajectoryRow[],
    minEnergy: number | undefined,
    maxEnergy: number | undefined
): BoundMarkers {
    const markers: BoundMarkers = {};

    if (maxEnergy !== undefined) {
        const idx = rows.findIndex((r) => r.energy <= maxEnergy);
        if (idx !== -1) markers.max = rows[idx].range;
    }

    if (minEnergy !== undefined) {
        let idx = -1;
        for (let i = 0; i < rows.length; i++) {
            if (rows[i].energy >= minEnergy) idx = i;
        }
        if (idx !== -1) markers.min = rows[idx].range;
    }

    return markers;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- tests/chartRenderer.test.ts`
Expected: all tests pass (10 total in this file).

- [ ] **Step 5: Commit**

```bash
git add src/chartRenderer.ts tests/chartRenderer.test.ts
git commit -m "feat(chart): add computeBoundMarkers for energy-bound lines"
```

---

## Task 5: Implement renderTrajectoryChart with uPlot

**Files:**

- Modify: `src/chartRenderer.ts`
- Modify: `tests/chartRenderer.test.ts`
- Modify: `src/tableRenderer.ts` (re-export `renderError` is already exported — verify only)

### Notes for the implementer

uPlot's TypeScript types are shipped with the package (`uplot/dist/uPlot.d.ts`). The default import is the `uPlot` constructor; the type namespace is `import type uPlot from "uplot"`. uPlot's CSS lives at `uplot/dist/uPlot.min.css` — the plugin does NOT bundle this. The relevant uPlot DOM (a `<div class="uplot">`) is created inside our container and styled by our own rules plus inline color overrides we pass to uPlot.

Bound lines are drawn in uPlot's `hooks.draw[]` callback. The hook receives the `uPlot` instance; use `u.bbox` for the plot area and `u.valToPos(rangeValue, "x", true)` to translate a range value to a canvas X coordinate. Draw on `u.ctx` (the CanvasRenderingContext2D).

- [ ] **Step 1: Write the smoke test for renderTrajectoryChart**

Append to `tests/chartRenderer.test.ts`:

```ts
import { renderTrajectoryChart } from "../src/chartRenderer";

describe("renderTrajectoryChart", () => {
    it("appends a .ballistics-chart-block element to the container", () => {
        const container = document.createElement("div");
        document.body.appendChild(container);
        const rows = [
            makeRow({ range: 0, elevation: 0, energy: 3000 }),
            makeRow({ range: 100, elevation: -1.2, energy: 2400 }),
            makeRow({ range: 200, elevation: -5.8, energy: 1900 }),
        ];
        renderTrajectoryChart(container, rows, "imperial", { includeWindage: false });
        expect(container.querySelector(".ballistics-chart-block")).not.toBeNull();
    });

    it("does not throw when bound markers are present", () => {
        const container = document.createElement("div");
        document.body.appendChild(container);
        const rows = [
            makeRow({ range: 0, elevation: 0, energy: 3000 }),
            makeRow({ range: 100, elevation: -1.2, energy: 2400 }),
            makeRow({ range: 200, elevation: -5.8, energy: 1500 }),
            makeRow({ range: 300, elevation: -14.0, energy: 900 }),
        ];
        expect(() =>
            renderTrajectoryChart(container, rows, "imperial", {
                includeWindage: false,
                minEnergy: 1000,
                maxEnergy: 2000,
            })
        ).not.toThrow();
    });
});
```

Note: under happy-dom uPlot's canvas methods are no-ops or stubs. The test asserts structural output, not drawn pixels.

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- tests/chartRenderer.test.ts`
Expected: FAIL — `renderTrajectoryChart` not exported.

- [ ] **Step 3: Implement the renderer**

Replace the contents of `src/chartRenderer.ts` with:

```ts
// chartRenderer.ts — builds the trajectory chart DOM via uPlot.

import uPlot from "uplot";
import type { TrajectoryRow } from "./ballistics";
import { labels, type UnitSystem } from "./units";
import type { RenderOptions } from "./tableRenderer";

const DEFAULT_HEIGHT = 320;
const BOUND_COLOR_FALLBACK = "#d04a4a";
const SERIES_COLOR_FALLBACK = "#5a8fff";
const AXIS_COLOR_FALLBACK = "#888";
const GRID_COLOR_FALLBACK = "#ccc";

export interface ChartSeries {
    x: number[];
    elevation: number[];
}

export interface BoundMarkers {
    min?: number;
    max?: number;
}

export function buildChartSeries(rows: TrajectoryRow[]): ChartSeries {
    return {
        x: rows.map((r) => r.range),
        elevation: rows.map((r) => r.elevation),
    };
}

export function computeBoundMarkers(
    rows: TrajectoryRow[],
    minEnergy: number | undefined,
    maxEnergy: number | undefined
): BoundMarkers {
    const markers: BoundMarkers = {};

    if (maxEnergy !== undefined) {
        const idx = rows.findIndex((r) => r.energy <= maxEnergy);
        if (idx !== -1) markers.max = rows[idx].range;
    }

    if (minEnergy !== undefined) {
        let idx = -1;
        for (let i = 0; i < rows.length; i++) {
            if (rows[i].energy >= minEnergy) idx = i;
        }
        if (idx !== -1) markers.min = rows[idx].range;
    }

    return markers;
}

interface ThemeColors {
    series: string;
    axis: string;
    grid: string;
    bound: string;
}

function readThemeColors(probe: HTMLElement): ThemeColors {
    const style = probe.ownerDocument.defaultView?.getComputedStyle(probe);
    const cssVar = (name: string, fallback: string): string => {
        const v = style?.getPropertyValue(name).trim();
        return v && v.length > 0 ? v : fallback;
    };
    return {
        series: cssVar("--text-accent", SERIES_COLOR_FALLBACK),
        axis: cssVar("--text-muted", AXIS_COLOR_FALLBACK),
        grid: cssVar("--background-modifier-border", GRID_COLOR_FALLBACK),
        bound: cssVar("--color-red", BOUND_COLOR_FALLBACK),
    };
}

export function renderTrajectoryChart(
    container: HTMLElement,
    rows: TrajectoryRow[],
    system: UnitSystem,
    options: RenderOptions
): void {
    const doc = container.ownerDocument;
    const lbl = labels(system);

    const block = doc.createElement("div");
    block.classList.add("ballistics-chart-block");
    container.appendChild(block);

    const series = buildChartSeries(rows);
    const markers = computeBoundMarkers(rows, options.minEnergy, options.maxEnergy);
    const colors = readThemeColors(block);

    const width = block.clientWidth || 600;

    const opts: uPlot.Options = {
        width,
        height: DEFAULT_HEIGHT,
        scales: {
            x: { time: false },
            y: { auto: true },
        },
        axes: [
            {
                label: `Range (${lbl.range})`,
                stroke: colors.axis,
                grid: { stroke: colors.grid, width: 1 },
                ticks: { stroke: colors.axis, width: 1 },
            },
            {
                label: `Elevation (${lbl.linear})`,
                stroke: colors.axis,
                grid: { stroke: colors.grid, width: 1 },
                ticks: { stroke: colors.axis, width: 1 },
            },
        ],
        series: [
            { label: `Range (${lbl.range})` },
            {
                label: `Elevation (${lbl.linear})`,
                stroke: colors.series,
                width: 2,
                points: { show: false },
            },
        ],
        legend: { show: false },
        cursor: { show: false },
        hooks: {
            draw: [(u) => drawBoundMarkers(u, markers, colors.bound)],
        },
    };

    new uPlot(opts, [series.x, series.elevation], block);
}

function drawBoundMarkers(u: uPlot, markers: BoundMarkers, color: string): void {
    if (markers.min === undefined && markers.max === undefined) return;

    const ctx = u.ctx;
    const top = u.bbox.top;
    const bottom = u.bbox.top + u.bbox.height;
    const arrowY = top + 12;
    const arrowSize = 8;

    ctx.save();
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 4]);
    ctx.font = "bold 12px sans-serif";

    if (markers.max !== undefined) {
        const x = u.valToPos(markers.max, "x", true);
        ctx.beginPath();
        ctx.moveTo(x, top);
        ctx.lineTo(x, bottom);
        ctx.stroke();
        drawArrow(ctx, x + 4, arrowY, arrowSize, "right");
    }

    if (markers.min !== undefined) {
        const x = u.valToPos(markers.min, "x", true);
        ctx.beginPath();
        ctx.moveTo(x, top);
        ctx.lineTo(x, bottom);
        ctx.stroke();
        drawArrow(ctx, x - 4, arrowY, arrowSize, "left");
    }

    ctx.restore();
}

function drawArrow(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    size: number,
    direction: "left" | "right"
): void {
    const sign = direction === "right" ? 1 : -1;
    ctx.save();
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + sign * size, y - size / 2);
    ctx.lineTo(x + sign * size, y + size / 2);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
}
```

- [ ] **Step 4: Run the chart tests**

Run: `npm test -- tests/chartRenderer.test.ts`
Expected: all tests pass (12 total).

- [ ] **Step 5: Run the full test suite to make sure nothing else broke**

Run: `npm test`
Expected: all tests pass.

- [ ] **Step 6: Run the production build**

Run: `npm run build`
Expected: completes with no type errors. uPlot is bundled into `main.js`.

- [ ] **Step 7: Commit**

```bash
git add src/chartRenderer.ts tests/chartRenderer.test.ts
git commit -m "feat(chart): render trajectory chart with uPlot and energy bounds"
```

---

## Task 6: Add chart styles

**Files:**

- Modify: `styles.css`

- [ ] **Step 1: Append chart styles**

Append to `styles.css`:

```css
.ballistics-chart-block {
    margin: 0.5em 0;
    width: 100%;
    color: var(--text-normal);
}

.ballistics-chart-block .uplot,
.ballistics-chart-block .u-wrap {
    background: transparent;
}

.ballistics-chart-block .u-legend {
    display: none;
}
```

- [ ] **Step 2: Verify prettier is happy**

Run: `npx prettier --check styles.css`
Expected: passes.

- [ ] **Step 3: Commit**

```bash
git add styles.css
git commit -m "feat(chart): add styles for ballistics-chart container"
```

---

## Task 7: Wire up the ballistics-chart codefence in main.ts

**Files:**

- Modify: `src/main.ts`

- [ ] **Step 1: Add the chart renderer import**

In `src/main.ts`, locate:

```ts
import { renderTrajectoryTable, renderError } from "./tableRenderer";
```

Add directly below it:

```ts
import { renderTrajectoryChart } from "./chartRenderer";
```

- [ ] **Step 2: Register the chart processor**

In `src/main.ts`, locate the `onload` method:

```ts
this.registerMarkdownCodeBlockProcessor("ballistics-table", (source, el, ctx) => {
    this.processBlock(source, el, ctx);
});
```

Add directly below it (still inside `onload`):

```ts
this.registerMarkdownCodeBlockProcessor("ballistics-chart", (source, el, ctx) => {
    this.processChartBlock(source, el, ctx);
});
```

- [ ] **Step 3: Add the processChartBlock method**

In `src/main.ts`, directly below the existing `processBlock` method, add:

```ts
private processChartBlock(
    source: string,
    el: HTMLElement,
    ctx: MarkdownPostProcessorContext
): void {
    const parsed = parseBallisticsBlock(source, this.buildParseContext(ctx));
    if (!parsed.ok) {
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
```

Note: the chart processor does NOT call `attachOverlay`. The copy-menu overlay is a table-specific feature.

- [ ] **Step 4: Verify the build**

Run: `npm run build`
Expected: completes with no type errors.

- [ ] **Step 5: Verify tests still pass**

Run: `npm test`
Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/main.ts
git commit -m "feat(chart): register ballistics-chart codefence processor"
```

---

## Task 8: Manual smoke test in Obsidian

**Files:** none (manual)

- [ ] **Step 1: Build the plugin**

Run: `npm run build`
Expected: success.

- [ ] **Step 2: Open the dev vault that hosts this plugin**

The plugin path is `<vault>/.obsidian/plugins/obsidian-ballistics`. Open the vault in Obsidian (or reload it if already open). Enable the plugin if it isn't already.

- [ ] **Step 3: Add a test note with both codefences**

Create or open a scratch note and add:

````markdown
```ballistics-table
bc: 0.475
muzzle-velocity: 2700
mass: 168
diameter: 0.308
zero-range: 100
sight-height: 1.5
maxRange: 600
rangeStep: 50
minEnergy: 1000
maxEnergy: 2200
```

```ballistics-chart
bc: 0.475
muzzle-velocity: 2700
mass: 168
diameter: 0.308
zero-range: 100
sight-height: 1.5
maxRange: 600
rangeStep: 50
minEnergy: 1000
maxEnergy: 2200
```
````

Expected outcomes:

- The table renders as before (regression check).
- A chart renders below it with range on X, signed elevation on Y, a single colored line curving downward.
- Two red dashed vertical lines appear at the bound crossings, with a right-arrow on the max-energy line and a left-arrow on the min-energy line, both pointing into the band between them.
- Axes show the active unit labels (yd / in for imperial, m / cm for metric).
- Toggle the unit setting; reload the note; verify units update.

- [ ] **Step 4: Test edge cases**

Edit the chart codefence to remove `maxEnergy` and verify only the min line renders. Remove both and verify no bound lines. Set `maxEnergy` to a value larger than the muzzle energy and verify the line is silently omitted.

- [ ] **Step 5: Commit (if any docs or fixtures were added; otherwise skip)**

No commit if no files changed.

---

## Self-Review Notes

**Spec coverage check:**

- Codefence registration → Task 7 ✓
- uPlot dependency, bundled → Task 1 ✓
- File rename → Task 2 ✓
- `buildChartSeries` + tests → Task 3 ✓
- `computeBoundMarkers` + tests → Task 4 ✓
- `renderTrajectoryChart` + smoke test, uPlot integration, theming, bound markers with dashed red lines and arrows → Task 5 ✓
- Container styles → Task 6 ✓
- Manual verification in Obsidian → Task 8 ✓
- Out-of-scope items (legend, tooltips, additional series, sizing options, theme-change re-render) are not addressed by any task, per the spec. ✓

**Type consistency check:**

- `ChartSeries`, `BoundMarkers`, `RenderOptions` referenced consistently across tasks.
- `RenderOptions` is imported from `./tableRenderer` (Task 5) — verified the type is exported there (it is, as `export interface RenderOptions` in the original `renderer.ts`).
- `UnitSystem` and `labels` imported from `./units` consistently with the table renderer.
