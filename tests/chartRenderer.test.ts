import { describe, it, expect } from "vitest";
import { buildChartSeries, computeBoundMarkers, renderTrajectoryChart } from "../src/chartRenderer";
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
