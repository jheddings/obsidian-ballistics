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
