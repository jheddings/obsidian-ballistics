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

    if (maxEnergy !== undefined && rows.length > 0) {
        // Only set max if the muzzle energy is above the threshold and we cross it
        if (rows[0].energy > maxEnergy) {
            const idx = rows.findIndex((r) => r.energy <= maxEnergy);
            if (idx !== -1) markers.max = rows[idx].range;
        }
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
