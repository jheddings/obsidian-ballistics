// chartRenderer.ts — builds the trajectory chart DOM as hand-rolled SVG.

import type { TrajectoryRow } from "./ballistics";
import { labels, type UnitSystem } from "./units";
import type { RenderOptions } from "./tableRenderer";

const SVG_NS = "http://www.w3.org/2000/svg";

// All chart geometry is expressed in viewBox units. The SVG element
// itself scales to its container width; the browser scales the viewBox.
const VB_WIDTH = 1000;
const VB_HEIGHT = 400;
const MARGIN = { top: 20, right: 70, bottom: 50, left: 24 };
const PLOT_WIDTH = VB_WIDTH - MARGIN.left - MARGIN.right;
const PLOT_HEIGHT = VB_HEIGHT - MARGIN.top - MARGIN.bottom;

const TARGET_TICKS = 6;
const ARROW_SIZE = 10;

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

    if (rows.length === 0) return;

    const series = buildChartSeries(rows);
    const markers = computeBoundMarkers(rows, options.minEnergy, options.maxEnergy);

    const xMin = series.x[0];
    const xMax = series.x[series.x.length - 1];
    const yMin = Math.min(...series.elevation);
    const yMax = Math.max(...series.elevation);

    const xTicks = niceTicks(xMin, xMax, TARGET_TICKS);
    const yTicks = niceTicks(yMin, yMax, TARGET_TICKS);

    const xScale = makeScale(
        xTicks[0],
        xTicks[xTicks.length - 1],
        MARGIN.left,
        MARGIN.left + PLOT_WIDTH
    );
    const yScale = makeScale(
        yTicks[0],
        yTicks[yTicks.length - 1],
        MARGIN.top + PLOT_HEIGHT,
        MARGIN.top
    );

    const svg = doc.createElementNS(SVG_NS, "svg");
    svg.setAttribute("class", "ballistics-chart");
    svg.setAttribute("viewBox", `0 0 ${VB_WIDTH} ${VB_HEIGHT}`);
    svg.setAttribute("preserveAspectRatio", "xMidYMid meet");
    svg.setAttribute("role", "img");
    svg.setAttribute(
        "aria-label",
        `Trajectory chart: range vs elevation in ${lbl.range} and ${lbl.linear}`
    );
    block.appendChild(svg);

    appendGrid(svg, xTicks, yTicks, xScale, yScale);
    appendZeroLine(svg, yTicks, yScale);
    appendAxes(svg, xTicks, yTicks, xScale, yScale, lbl.range, lbl.linear);
    appendSeries(svg, series, xScale, yScale);
    appendBoundMarkers(svg, markers, xScale);
}

function appendGrid(
    svg: SVGSVGElement,
    xTicks: number[],
    yTicks: number[],
    xScale: (v: number) => number,
    yScale: (v: number) => number
): void {
    const g = svgGroup(svg, "ballistics-chart-grid");
    for (const t of xTicks) {
        const x = xScale(t);
        line(g, x, MARGIN.top, x, MARGIN.top + PLOT_HEIGHT);
    }
    for (const t of yTicks) {
        const y = yScale(t);
        line(g, MARGIN.left, y, MARGIN.left + PLOT_WIDTH, y);
    }
}

function appendZeroLine(svg: SVGSVGElement, yTicks: number[], yScale: (v: number) => number): void {
    const min = yTicks[0];
    const max = yTicks[yTicks.length - 1];
    if (min > 0 || max < 0) return;
    const g = svgGroup(svg, "ballistics-chart-zero");
    const y = yScale(0);
    line(g, MARGIN.left, y, MARGIN.left + PLOT_WIDTH, y);
}

function appendAxes(
    svg: SVGSVGElement,
    xTicks: number[],
    yTicks: number[],
    xScale: (v: number) => number,
    yScale: (v: number) => number,
    xUnit: string,
    yUnit: string
): void {
    const axisY = MARGIN.top + PLOT_HEIGHT;

    const xAxis = svgGroup(svg, "ballistics-chart-axis");
    // Baseline
    line(xAxis, MARGIN.left, axisY, MARGIN.left + PLOT_WIDTH, axisY);
    for (const t of xTicks) {
        const x = xScale(t);
        line(xAxis, x, axisY, x, axisY + 5);
        text(xAxis, x, axisY + 20, formatTick(t), {
            "text-anchor": "middle",
            class: "ballistics-chart-tick-label",
        });
    }
    text(xAxis, MARGIN.left + PLOT_WIDTH / 2, VB_HEIGHT - 8, `Range (${xUnit})`, {
        "text-anchor": "middle",
        class: "ballistics-chart-axis-label",
    });

    const yAxis = svgGroup(svg, "ballistics-chart-axis");
    const yAxisX = MARGIN.left + PLOT_WIDTH;
    line(yAxis, yAxisX, MARGIN.top, yAxisX, axisY);
    for (const t of yTicks) {
        const y = yScale(t);
        line(yAxis, yAxisX, y, yAxisX + 5, y);
        text(yAxis, yAxisX + 9, y + 4, formatTick(t), {
            "text-anchor": "start",
            class: "ballistics-chart-tick-label",
        });
    }
    // Rotated Y-axis label, sitting outboard of the tick labels.
    const yLabelX = VB_WIDTH - 8;
    const yLabelY = MARGIN.top + PLOT_HEIGHT / 2;
    text(yAxis, yLabelX, yLabelY, `Elevation (${yUnit})`, {
        "text-anchor": "middle",
        class: "ballistics-chart-axis-label",
        transform: `rotate(90 ${yLabelX} ${yLabelY})`,
    });
}

function appendSeries(
    svg: SVGSVGElement,
    series: ChartSeries,
    xScale: (v: number) => number,
    yScale: (v: number) => number
): void {
    const d = series.x
        .map(
            (x, i) =>
                `${i === 0 ? "M" : "L"}${xScale(x).toFixed(2)},${yScale(series.elevation[i]).toFixed(2)}`
        )
        .join(" ");
    const path = svg.ownerDocument.createElementNS(SVG_NS, "path");
    path.setAttribute("d", d);
    path.setAttribute("class", "ballistics-chart-series");
    path.setAttribute("fill", "none");
    svg.appendChild(path);
}

function appendBoundMarkers(
    svg: SVGSVGElement,
    markers: BoundMarkers,
    xScale: (v: number) => number
): void {
    if (markers.min === undefined && markers.max === undefined) return;

    const g = svgGroup(svg, "ballistics-chart-bounds");
    const top = MARGIN.top;
    const bottom = MARGIN.top + PLOT_HEIGHT;
    const arrowY = top + ARROW_SIZE;

    if (markers.max !== undefined) {
        const x = xScale(markers.max);
        boundLine(g, x, top, bottom);
        arrow(g, x + 4, arrowY, "right");
    }
    if (markers.min !== undefined) {
        const x = xScale(markers.min);
        boundLine(g, x, top, bottom);
        arrow(g, x - 4, arrowY, "left");
    }
}

function boundLine(parent: SVGElement, x: number, y1: number, y2: number): void {
    const l = parent.ownerDocument.createElementNS(SVG_NS, "line");
    l.setAttribute("x1", String(x));
    l.setAttribute("y1", String(y1));
    l.setAttribute("x2", String(x));
    l.setAttribute("y2", String(y2));
    l.setAttribute("class", "ballistics-chart-bound-line");
    parent.appendChild(l);
}

function arrow(parent: SVGElement, x: number, y: number, direction: "left" | "right"): void {
    const sign = direction === "right" ? 1 : -1;
    const path = parent.ownerDocument.createElementNS(SVG_NS, "path");
    const half = ARROW_SIZE / 2;
    path.setAttribute(
        "d",
        `M${x},${y} L${x + sign * ARROW_SIZE},${y - half} L${x + sign * ARROW_SIZE},${y + half} Z`
    );
    path.setAttribute("class", "ballistics-chart-bound-arrow");
    parent.appendChild(path);
}

function svgGroup(svg: SVGSVGElement, cls: string): SVGGElement {
    const g = svg.ownerDocument.createElementNS(SVG_NS, "g");
    g.setAttribute("class", cls);
    svg.appendChild(g);
    return g;
}

function line(parent: SVGElement, x1: number, y1: number, x2: number, y2: number): void {
    const l = parent.ownerDocument.createElementNS(SVG_NS, "line");
    l.setAttribute("x1", String(x1));
    l.setAttribute("y1", String(y1));
    l.setAttribute("x2", String(x2));
    l.setAttribute("y2", String(y2));
    parent.appendChild(l);
}

function text(
    parent: SVGElement,
    x: number,
    y: number,
    content: string,
    attrs: Record<string, string> = {}
): void {
    const t = parent.ownerDocument.createElementNS(SVG_NS, "text");
    t.setAttribute("x", String(x));
    t.setAttribute("y", String(y));
    for (const [k, v] of Object.entries(attrs)) t.setAttribute(k, v);
    t.textContent = content;
    parent.appendChild(t);
}

function makeScale(
    domainMin: number,
    domainMax: number,
    rangeMin: number,
    rangeMax: number
): (v: number) => number {
    const span = domainMax - domainMin || 1;
    const slope = (rangeMax - rangeMin) / span;
    return (v) => rangeMin + (v - domainMin) * slope;
}

/**
 * Produce 4–8 round-number ticks spanning [min, max] inclusive. Steps are
 * chosen from the 1-2-5 sequence times a power of 10.
 */
export function niceTicks(min: number, max: number, target: number): number[] {
    if (!isFinite(min) || !isFinite(max) || min === max) {
        return [min];
    }
    const range = max - min;
    const roughStep = range / Math.max(1, target - 1);
    const magnitude = Math.pow(10, Math.floor(Math.log10(roughStep)));
    const normalized = roughStep / magnitude;
    let step: number;
    if (normalized < 1.5) step = 1 * magnitude;
    else if (normalized < 3) step = 2 * magnitude;
    else if (normalized < 7) step = 5 * magnitude;
    else step = 10 * magnitude;

    const start = Math.floor(min / step) * step;
    const end = Math.ceil(max / step) * step;
    const ticks: number[] = [];
    // Guard against floating-point drift producing extra ticks.
    for (let v = start; v <= end + step / 2; v += step) {
        ticks.push(roundToStep(v, step));
    }
    return ticks;
}

function roundToStep(v: number, step: number): number {
    const decimals = Math.max(0, -Math.floor(Math.log10(step)));
    const factor = Math.pow(10, decimals);
    return Math.round(v * factor) / factor;
}

function formatTick(v: number): string {
    if (Number.isInteger(v)) return String(v);
    return v.toFixed(1);
}
