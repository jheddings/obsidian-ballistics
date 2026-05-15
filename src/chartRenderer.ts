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
