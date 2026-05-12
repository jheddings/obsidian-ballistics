import { describe, it, expect } from "vitest";
import { solveTrajectory, type TrajectoryRow } from "../src/ballistics";
import type { ParsedInputs } from "../src/parser";

const referenceInputs: ParsedInputs = {
    bc: 0.475,
    initialVelocity: 2700,
    sightHeight: 1.5,
    zeroRange: 100,
    maxRange: 1000,
    rangeStep: 50,
    windSpeed: 10,
    windAngle: 90,
    bulletWeight: 168,
};

function rowAt(rows: TrajectoryRow[], range: number): TrajectoryRow {
    const r = rows.find((x) => Math.abs(x.range - range) < 0.5);
    if (!r)
        throw new Error(`no row at range ${range} (have ${rows.map((x) => x.range).join(",")})`);
    return r;
}

describe("solveTrajectory — imperial reference scenario", () => {
    const rows = solveTrajectory(referenceInputs, "imperial");

    it("produces 21 rows from 0 to 1000 yd", () => {
        expect(rows.length).toBe(21);
        expect(rows[0].range).toBeCloseTo(0, 0);
        expect(rows[rows.length - 1].range).toBeCloseTo(1000, 0);
    });

    it("starts 1.5 in below line of sight at the muzzle", () => {
        const r = rowAt(rows, 0);
        expect(r.elevation).toBeCloseTo(-1.5, 1);
    });

    it("zeros at 100 yd", () => {
        const r = rowAt(rows, 100);
        expect(Math.abs(r.elevation)).toBeLessThan(0.5);
    });

    it("drops within ±5 in or ±5% at 500 yd", () => {
        const r = rowAt(rows, 500);
        const expected = -58.93;
        const tol = Math.max(5, Math.abs(expected) * 0.05);
        expect(Math.abs(r.elevation - expected)).toBeLessThanOrEqual(tol);
    });

    it("drops within ±10 in or ±5% at 1000 yd", () => {
        const r = rowAt(rows, 1000);
        const expected = -389.74;
        const tol = Math.max(10, Math.abs(expected) * 0.05);
        expect(Math.abs(r.elevation - expected)).toBeLessThanOrEqual(tol);
    });

    it("drifts within ±5 in or ±10% at 1000 yd", () => {
        const r = rowAt(rows, 1000);
        const expected = 101.45;
        const tol = Math.max(5, expected * 0.1);
        expect(Math.abs(r.windage - expected)).toBeLessThanOrEqual(tol);
    });

    it("retains velocity within ±50 ft/s at 1000 yd", () => {
        const r = rowAt(rows, 1000);
        expect(Math.abs(r.velocity - 1214)).toBeLessThanOrEqual(50);
    });

    it("reports MOA and MIL for elevation and windage", () => {
        const r = rowAt(rows, 500);
        expect(r.elevationMoa).toBeLessThan(0);
        expect(r.elevationMil).toBeLessThan(0);
        expect(Math.abs(r.elevationMoa - -11.3)).toBeLessThan(2);
        expect(Math.abs(r.elevationMil - -3.3)).toBeLessThan(1);
    });

    it("reports time of flight monotonically increasing", () => {
        for (let i = 1; i < rows.length; i++) {
            expect(rows[i].time).toBeGreaterThan(rows[i - 1].time);
        }
    });

    it("reports energy at the muzzle within 1% of 0.5 m v²", () => {
        const r = rowAt(rows, 0);
        expect(r.energy).toBeGreaterThan(2680);
        expect(r.energy).toBeLessThan(2760);
    });
});

describe("solveTrajectory — metric inputs", () => {
    it("accepts metric inputs and returns metric outputs", () => {
        const metric: ParsedInputs = {
            bc: 0.475,
            initialVelocity: 823,
            sightHeight: 3.8,
            zeroRange: 91,
            maxRange: 914,
            rangeStep: 91,
            windSpeed: 4.5,
            windAngle: 90,
            bulletWeight: 10.9,
        };
        const rows = solveTrajectory(metric, "metric");
        expect(rows.length).toBeGreaterThan(5);
        const zero = rows.find((r) => Math.abs(r.range - 91) < 1);
        expect(zero).toBeDefined();
        expect(Math.abs(zero!.elevation)).toBeLessThan(2);
    });
});
