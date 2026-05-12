// units.ts — display-side unit labels and the UnitSystem type.

export type UnitSystem = "imperial" | "metric";

export interface UnitLabels {
    range: string;
    linear: string;
    velocity: string;
    energy: string;
}

export function labels(system: UnitSystem): UnitLabels {
    return system === "imperial"
        ? { range: "yd", linear: "in", velocity: "ft/s", energy: "ft·lbf" }
        : { range: "m", linear: "cm", velocity: "m/s", energy: "J" };
}
