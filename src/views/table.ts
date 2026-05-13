// views/table.ts — view spec for the `ballistics-table` codefence.

import type { ViewSpec } from "../parser";

export const TABLE_VIEW: ViewSpec = {
    required: [],
    optional: ["minRange", "maxRange", "rangeStep", "minEnergy", "maxEnergy"],
    defaults: { maxRange: 1000, rangeStep: 100 },
    validators: {
        minRange: (n) => (n < 0 ? `"minRange" must be non-negative (got ${n})` : null),
        maxRange: (n) => (n <= 0 ? `"maxRange" must be positive (got ${n})` : null),
        rangeStep: (n) => (n <= 0 ? `"rangeStep" must be positive (got ${n})` : null),
        minEnergy: (n) => (n < 0 ? `"minEnergy" must be non-negative (got ${n})` : null),
        maxEnergy: (n) => (n < 0 ? `"maxEnergy" must be non-negative (got ${n})` : null),
    },
    crossValidate: (view) => {
        if (view.rangeStep > view.maxRange) {
            return `"rangeStep" (${view.rangeStep}) must not exceed "maxRange" (${view.maxRange})`;
        }
        if (view.minRange !== undefined && view.minRange >= view.maxRange) {
            return `"minRange" (${view.minRange}) must be less than "maxRange" (${view.maxRange})`;
        }
        if (
            view.minEnergy !== undefined &&
            view.maxEnergy !== undefined &&
            view.maxEnergy <= view.minEnergy
        ) {
            return `"maxEnergy" (${view.maxEnergy}) must be greater than "minEnergy" (${view.minEnergy})`;
        }
        return null;
    },
};
