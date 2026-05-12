import { describe, it, expect, beforeEach } from "vitest";
import { renderTrajectoryTable, renderError } from "../src/renderer";
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

describe("renderTrajectoryTable", () => {
    let container: HTMLElement;
    beforeEach(() => {
        container = document.createElement("div");
    });

    it("renders imperial column headers", () => {
        renderTrajectoryTable(container, [makeRow()], "imperial");
        const headerText = Array.from(container.querySelectorAll("thead th")).map(
            (c) => c.textContent ?? ""
        );
        expect(headerText).toContain("Range");
        expect(headerText.some((t) => t.includes("yd"))).toBe(true);
        expect(headerText.some((t) => t.includes("in"))).toBe(true);
        expect(headerText.some((t) => t.includes("MOA"))).toBe(true);
        expect(headerText.some((t) => t.includes("MIL"))).toBe(true);
        expect(headerText.some((t) => t.includes("ft/s"))).toBe(true);
    });

    it("renders metric column headers", () => {
        renderTrajectoryTable(container, [makeRow()], "metric");
        const headerText = Array.from(container.querySelectorAll("thead th")).map(
            (c) => c.textContent ?? ""
        );
        expect(headerText.some((t) => t.includes("(m)"))).toBe(true);
        expect(headerText.some((t) => t.includes("cm"))).toBe(true);
        expect(headerText.some((t) => t.includes("m/s"))).toBe(true);
    });

    it("renders one tbody row per trajectory row", () => {
        renderTrajectoryTable(container, [makeRow(), makeRow({ range: 100 })], "imperial");
        expect(container.querySelectorAll("tbody tr").length).toBe(2);
    });

    it("renders cells in the expected column order", () => {
        renderTrajectoryTable(
            container,
            [
                makeRow({
                    range: 100,
                    elevation: -1,
                    elevationMoa: -0.95,
                    elevationMil: -0.28,
                    windage: 0.75,
                    windageMoa: 0.71,
                    windageMil: 0.21,
                    time: 0.12,
                    energy: 2356,
                    velocity: 2513,
                }),
            ],
            "imperial"
        );
        const cells = Array.from(container.querySelectorAll("tbody tr td")).map(
            (c) => c.textContent ?? ""
        );
        // Order: range, elev, elev(MOA), elev(MIL), wind, wind(MOA), wind(MIL), time, energy, vel
        expect(parseFloat(cells[0])).toBeCloseTo(100, 0);
        expect(parseFloat(cells[1])).toBeCloseTo(-1, 1);
        expect(parseFloat(cells[2])).toBeCloseTo(-0.95, 1);
        expect(parseFloat(cells[3])).toBeCloseTo(-0.28, 1);
        expect(parseFloat(cells[4])).toBeCloseTo(0.75, 1);
        expect(parseFloat(cells[5])).toBeCloseTo(0.71, 1);
        expect(parseFloat(cells[6])).toBeCloseTo(0.21, 1);
        expect(parseFloat(cells[7])).toBeCloseTo(0.12, 2);
        expect(parseFloat(cells[8])).toBeCloseTo(2356, 0);
        expect(parseFloat(cells[9])).toBeCloseTo(2513, 0);
    });

    it("includes the .ballistics-table class on the rendered table", () => {
        renderTrajectoryTable(container, [makeRow()], "imperial");
        expect(container.querySelector("table")?.classList.contains("ballistics-table")).toBe(true);
    });
});

describe("renderError", () => {
    it("renders the error message in an element with .ballistics-error", () => {
        const container = document.createElement("div");
        renderError(container, 'missing required field "bc"');
        const el = container.querySelector(".ballistics-error");
        expect(el).not.toBeNull();
        expect(el?.textContent).toContain("missing required field");
    });
});
