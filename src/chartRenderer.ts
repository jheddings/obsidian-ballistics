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

    if (maxEnergy !== undefined && rows.length > 0) {
        if (rows[0].energy > maxEnergy) {
            const idx = rows.findIndex((r) => r.energy <= maxEnergy);
            if (idx !== -1) markers.max = rows[idx].range;
        }
    }

    if (minEnergy !== undefined && rows.length > 0) {
        if (rows[rows.length - 1].energy < minEnergy) {
            let idx = -1;
            for (let i = 0; i < rows.length; i++) {
                if (rows[i].energy >= minEnergy) idx = i;
            }
            if (idx !== -1) markers.min = rows[idx].range;
        }
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
