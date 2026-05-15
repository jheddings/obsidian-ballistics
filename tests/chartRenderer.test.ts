import { describe, it, expect } from "vitest";
import {
    buildChartSeries,
    computeBoundMarkers,
    niceTicks,
    renderTrajectoryChart,
} from "../src/chartRenderer";
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

describe("computeBoundMarkers", () => {
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

    it("returns undefined when minEnergy is below the terminal energy (no downward crossing)", () => {
        const markers = computeBoundMarkers(rows, 100, undefined);
        expect(markers.min).toBeUndefined();
    });

    it("returns undefined when neither bound is set", () => {
        const markers = computeBoundMarkers(rows, undefined, undefined);
        expect(markers.min).toBeUndefined();
        expect(markers.max).toBeUndefined();
    });
});

describe("niceTicks", () => {
    it("produces inclusive ticks for an integer range", () => {
        const ticks = niceTicks(0, 1000, 6);
        expect(ticks[0]).toBe(0);
        expect(ticks[ticks.length - 1]).toBeGreaterThanOrEqual(1000);
        expect(ticks.length).toBeGreaterThanOrEqual(4);
        expect(ticks.length).toBeLessThanOrEqual(10);
    });

    it("handles negative domains", () => {
        const ticks = niceTicks(-300, 0, 6);
        expect(ticks[0]).toBeLessThanOrEqual(-300);
        expect(ticks[ticks.length - 1]).toBeGreaterThanOrEqual(0);
    });

    it("returns a single tick when min equals max", () => {
        expect(niceTicks(42, 42, 6)).toEqual([42]);
    });
});

describe("renderTrajectoryChart", () => {
    const rows = [
        makeRow({ range: 0, elevation: 0, energy: 3000 }),
        makeRow({ range: 100, elevation: -1.2, energy: 2400 }),
        makeRow({ range: 200, elevation: -5.8, energy: 1900 }),
        makeRow({ range: 300, elevation: -14.0, energy: 1400 }),
    ];

    it("appends a .ballistics-chart-block element containing an SVG", () => {
        const container = document.createElement("div");
        renderTrajectoryChart(container, rows, "imperial", { includeWindage: false });
        const block = container.querySelector(".ballistics-chart-block");
        expect(block).not.toBeNull();
        expect(block?.querySelector("svg.ballistics-chart")).not.toBeNull();
    });

    it("renders the trajectory series as a single path", () => {
        const container = document.createElement("div");
        renderTrajectoryChart(container, rows, "imperial", { includeWindage: false });
        const path = container.querySelector("path.ballistics-chart-series");
        expect(path).not.toBeNull();
        expect(path?.getAttribute("d") ?? "").toMatch(/^M[\d.-]+,[\d.-]+( L[\d.-]+,[\d.-]+)+$/);
    });

    it("renders axis labels in the active unit system", () => {
        const container = document.createElement("div");
        renderTrajectoryChart(container, rows, "imperial", { includeWindage: false });
        const labels = Array.from(container.querySelectorAll("text.ballistics-chart-axis-label"));
        const labelText = labels.map((t) => t.textContent ?? "");
        expect(labelText).toContain("Range (yd)");
        expect(labelText).toContain("Elevation (in)");

        const container2 = document.createElement("div");
        renderTrajectoryChart(container2, rows, "metric", { includeWindage: false });
        const labels2 = Array.from(
            container2.querySelectorAll("text.ballistics-chart-axis-label")
        ).map((t) => t.textContent ?? "");
        expect(labels2).toContain("Range (m)");
        expect(labels2).toContain("Elevation (cm)");
    });

    it("draws bound-marker lines and arrows when bounds are crossed", () => {
        const container = document.createElement("div");
        renderTrajectoryChart(container, rows, "imperial", {
            includeWindage: false,
            minEnergy: 1500,
            maxEnergy: 2000,
        });
        const lines = container.querySelectorAll("line.ballistics-chart-bound-line");
        const arrows = container.querySelectorAll("path.ballistics-chart-bound-arrow");
        expect(lines.length).toBe(2);
        expect(arrows.length).toBe(2);
    });

    it("omits bound markers when bounds are not crossed", () => {
        const container = document.createElement("div");
        renderTrajectoryChart(container, rows, "imperial", {
            includeWindage: false,
            minEnergy: 100,
            maxEnergy: 10000,
        });
        expect(container.querySelectorAll("line.ballistics-chart-bound-line").length).toBe(0);
    });

    it("renders nothing inside the block for an empty trajectory", () => {
        const container = document.createElement("div");
        renderTrajectoryChart(container, [], "imperial", { includeWindage: false });
        const block = container.querySelector(".ballistics-chart-block");
        expect(block).not.toBeNull();
        expect(block?.querySelector("svg")).toBeNull();
    });
});
