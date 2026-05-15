# Trajectory Chart — Phase 1 Design

Tracks GitHub issue #5. Adds a `ballistics-chart` markdown codefence processor that renders a standard trajectory chart from the same inputs as `ballistics-table`.

## Goals

- A working chart for the most common use case: range vs. elevation drop.
- Identical input schema to `ballistics-table` so users can copy/paste between the two codefences.
- Reuse the existing parser and solver — no new data, just a new renderer.
- Establish a chart-library foundation that supports later phases (additional series, options, interactivity) without re-shopping.

## Non-Goals (Phase 1)

- Additional series (windage, velocity, energy)
- Codefence `options:` keys for chart configuration
- Legend, tooltips, hover interactivity
- Theme-change re-rendering while a note is open
- Zoom, pan, image export, custom drag models

These are deferred to Phases 2 and 3 as described in the issue.

## Pipeline Reuse

The chart is a new renderer over the existing pipeline:

- `parseBallisticsBlock` — unchanged
- `solveTrajectory` — unchanged, returns `TrajectoryRow[]`
- New `chartRenderer.ts` — consumes `TrajectoryRow[]` and renders into a container

## Dependency

Add **uPlot** to production dependencies. Rationale:

- Small (~45 KB minified), fast, established in the Obsidian plugin ecosystem.
- Canvas-based, which trades CSS styling for imperative color passing — acceptable for our needs.
- Minimal API gives us a clean foundation for Phase 2/3 additions.

uPlot is bundled (not externalized) so the plugin remains self-contained.

## File Structure

- Rename `src/renderer.ts` → `src/tableRenderer.ts`. Update imports in `main.ts`. The rename is a one-shot import sweep; the file's contents are unchanged.
- New `src/chartRenderer.ts` — exports `renderTrajectoryChart(container, rows, system, options)` mirroring the table renderer's signature.

The shared `renderError` helper currently lives in `renderer.ts`. After the rename it stays in `tableRenderer.ts` and is imported from there by both the table and chart processors. If a third consumer appears later it can move to its own module; not now.

## Codefence Registration

`main.ts` registers a second processor alongside `ballistics-table`:

```ts
this.registerMarkdownCodeBlockProcessor("ballistics-chart", (source, el) => {
    this.processChartBlock(source, el);
});
```

`processChartBlock` follows the same shape as the existing table processor: parse the block, run the solver, dispatch errors to `renderError`, dispatch success to `renderTrajectoryChart`.

## Chart Specification

### Layout

- **Container**: fills available width, fixed 320 px height.
- **X-axis**: range in the active unit system (yd or m).
- **Y-axis**: elevation in the active unit system (in or cm).

### Series

- Single line series: elevation as a function of range.
- Values plotted **signed**: negative below line of sight after the zero range. Y-axis label is `Elevation (<unit>)` so the sign is self-explanatory.
- Line color: Obsidian's `--text-accent` CSS variable, with a hardcoded fallback for environments where the variable is undefined.

### Axes and grid

- Axis tick labels, axis lines, and gridlines read from Obsidian CSS variables via `getComputedStyle` on a probe element at render time:
    - Tick labels: `--text-muted`
    - Axis lines, gridlines: `--background-modifier-border`
- Colors are captured once per render. Theme changes mid-session are not handled in Phase 1; the next note reload picks up the new theme.

### Energy bound markers

Mirror the table's bound-row highlighting on the chart's horizontal axis:

- The chart requires an actual crossing within the trajectory. `maxEnergy` produces a line only if `rows[0].energy > maxEnergy` AND a row satisfying `energy <= maxEnergy` exists; the line is drawn at the first such row's range. `minEnergy` produces a line only if `rows[rows.length - 1].energy < minEnergy` AND a row satisfying `energy >= minEnergy` exists; the line is drawn at the last such row's range.
- This is stricter than the table's `computeBoundMarks`, which marks row 0 even when the bound was never crossed. The chart's stricter behavior avoids visually misleading lines at chart edges for non-events.
- At each crossing, draw a **dashed, bold red vertical line** spanning the chart's plotting area.
- Add an inward-pointing arrow glyph near the top of each line:
    - Max-energy line: right-pointing arrow (→), pointing into the acceptable band.
    - Min-energy line: left-pointing arrow (←), pointing into the acceptable band.
- When a bound is set but its threshold is never crossed within the displayed trajectory, silently omit that line. This matches the table's behavior of not marking a row in the same situation.
- Red color: prefer `--color-red` if exposed by the theme, fall back to a hardcoded red. The bound markers stay visually consistent with the table's red bound-row styling.

Rendering uses uPlot's `hooks.draw` to draw the bound lines and arrows on the canvas after the data series.

## Module Surface

`src/chartRenderer.ts` exports:

```ts
export function renderTrajectoryChart(
    container: HTMLElement,
    rows: TrajectoryRow[],
    system: UnitSystem,
    options: RenderOptions
): void;
```

Internal pure helpers (exported for testing):

```ts
export function buildChartSeries(rows: TrajectoryRow[]): {
    x: number[]; // range values
    elevation: number[]; // signed elevation values
};

export function computeBoundMarkers(
    rows: TrajectoryRow[],
    minEnergy: number | undefined,
    maxEnergy: number | undefined
): {
    min?: number; // range value at which minEnergy is crossed
    max?: number; // range value at which maxEnergy is crossed
};
```

`computeBoundMarkers` returns range values (continuous chart axis) rather than row indices (discrete table rows), since the chart consumes a continuous coordinate.

`RenderOptions` is the existing interface from the table renderer; `includeWindage` is ignored in Phase 1 but kept for signature symmetry.

## Styling

- A small `styles.css` addition scopes any DOM-level styles (container, error box reuse) under `.ballistics-chart-block`.
- Canvas-level styling (line, axes, grid, bound markers) is applied imperatively via uPlot options based on values read from CSS variables.

## Testing

Vitest with happy-dom. Canvas drawing does not execute under happy-dom, so tests target the data-prep layer and the container structure.

### Unit tests

- `buildChartSeries`
    - Returns arrays of equal length, matching the input row count.
    - Range values are increasing.
    - Elevation values preserve sign.
- `computeBoundMarkers`
    - Returns the range at the correct crossing row for `min` and `max` independently.
    - Returns `undefined` for a bound that is set but never crossed.
    - Returns `undefined` for a bound that is not set.
    - Handles both bounds set simultaneously without interference.

### Smoke test

- `renderTrajectoryChart` invoked under happy-dom with a representative `rows` array completes without throwing and appends an element with the expected wrapper class to the container.

## Error Handling

- Parser and solver errors are dispatched to `renderError` exactly as in the table path. No new error categories.
- The chart renderer itself does not validate inputs; it assumes a non-empty `TrajectoryRow[]` from the solver.

## Out of Scope Recap

Deferred to Phase 2 per the issue:

- Optional series (windage, velocity, energy) with appropriate axis scaling.
- `options:` codefence key for series toggles, height, etc.
- Legend (only relevant once more than one series can render).

Deferred to Phase 3 per the issue:

- Hover tooltips with exact-value readout.
- Optional explicit gridline controls.
- Theme-change re-render via the Obsidian `css-change` workspace event.
- Other minor polish.
