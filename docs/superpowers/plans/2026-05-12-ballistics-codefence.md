# Ballistics Codefence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement a `ballistics` markdown code-block processor that parses user-supplied load/scenario inputs, computes the trajectory via the [`js-ballistics`](https://www.npmjs.com/package/js-ballistics) library, and renders a theme-aware HTML trajectory table inline in Obsidian notes.

**Architecture:** New pure modules (`parser.ts`, `units.ts`, `ballistics.ts`, `renderer.ts`) wired into the existing plugin entry point via `registerMarkdownCodeBlockProcessor`. `ballistics.ts` is a thin adapter over `js-ballistics`: maps parsed inputs → library types, runs the RK4 engine, maps `TrajectoryData` → our `TrajectoryRow`. The renderer has no Obsidian imports; `main.ts` is the only file that touches the Obsidian API.

**Tech Stack:** TypeScript, esbuild, vitest (new), js-ballistics (new), obsidian API, obskit settings UI.

**Pre-verified:** A smoke test confirmed `js-ballistics` (RK4 engine, G1, ICAO atmo, 10 mph 3-o'clock wind, BC=0.475 / 168gr / .308) reproduces the user-supplied shooterscalculator reference within ~2% across all columns. Bullet diameter is hardcoded to 0.308 in inside the adapter for v1 — diameter affects sectional density / form factor in the library but has negligible effect on trajectory once BC is given, so this simplification is safe for the "reference for notes" use case. A configurable `bulletDiameter` field is a v2 addition.

**Spec:** `docs/superpowers/specs/2026-05-12-ballistics-codefence-design.md`

---

## File Map

Created in this plan:

- `src/parser.ts` — Codefence body → `ParsedInputs | ParseError`.
- `src/units.ts` — Display-side unit labels only (the library handles numeric conversion).
- `src/ballistics.ts` — Thin adapter over `js-ballistics`: maps `ParsedInputs` + `UnitSystem` → library inputs, runs the RK4 engine, maps `TrajectoryData[]` → `TrajectoryRow[]`. No DOM, no Obsidian.
- `src/renderer.ts` — DOM construction for the trajectory table and error box.
- `tests/parser.test.ts`, `tests/ballistics.test.ts`, `tests/renderer.test.ts` — vitest suites.
- `vitest.config.ts` — vitest configuration (with `server.deps.inline` for js-ballistics; see Task 1).

Modified in this plan:

- `src/config.ts` — Add `units: "imperial" | "metric"` to settings interface.
- `src/main.ts` — Add `units` to `DEFAULT_SETTINGS`; register the `ballistics` code-block processor.
- `src/settings.ts` — Add a `UnitsSetting` dropdown above the existing `LogLevelSetting`.
- `styles.css` — `.ballistics-table` and `.ballistics-error` styles using Obsidian CSS vars.
- `package.json` — Add `vitest`, `happy-dom`, and `js-ballistics`; add `test` script.
- `.justfile` — Add `test` recipe.
- `README.md` — Document the codefence with an example.

---

## Task 1: Add vitest test infrastructure

**Files:**

- Create: `vitest.config.ts`
- Create: `tests/smoke.test.ts`
- Modify: `package.json`
- Modify: `.justfile`

- [ ] **Step 1: Install vitest, happy-dom (for renderer DOM tests later), and js-ballistics**

Run:

```bash
npm install --save-dev vitest@^2.1.0 happy-dom@^15.0.0
npm install --save js-ballistics
```

Expected: all three added to `package.json` (vitest + happy-dom as dev, js-ballistics as runtime); `node_modules` updated.

- [ ] **Step 2: Add a `test` script to `package.json`**

In `package.json`, add to the `"scripts"` object:

```json
"test": "vitest run"
```

- [ ] **Step 3: Create `vitest.config.ts`**

Note the `server.deps.inline` entry — js-ballistics ships ESM with extensionless relative imports that Node's strict ESM resolver rejects; inlining routes them through Vite's resolver. The `resolve.extensions` list explicitly includes `.js` for the same reason.

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
    test: {
        include: ["tests/**/*.test.ts"],
        environment: "happy-dom",
        server: {
            deps: {
                inline: ["js-ballistics"],
            },
        },
    },
    resolve: {
        extensions: [".ts", ".js", ".mjs", ".json"],
    },
});
```

- [ ] **Step 4: Create a smoke test at `tests/smoke.test.ts`**

```ts
import { describe, it, expect } from "vitest";

describe("smoke", () => {
    it("runs vitest", () => {
        expect(1 + 1).toBe(2);
    });
});
```

- [ ] **Step 5: Run the smoke test**

Run: `npm test`
Expected: 1 passing test.

- [ ] **Step 6: Add a `test` recipe to `.justfile`**

Insert after the existing `check` recipe:

```
# run unit tests
test: setup
	npm test
```

Also update the `preflight` recipe to include `test`:

```
# full preflight: build + check + test
preflight: build check test
```

- [ ] **Step 7: Verify preflight still passes**

Run: `just preflight`
Expected: build, prettier, eslint, and vitest all succeed.

- [ ] **Step 8: Commit**

```bash
git add package.json package-lock.json vitest.config.ts tests/smoke.test.ts .justfile
git commit -m "chore: add vitest + js-ballistics dependencies"
```

---

## Task 2: Implement `units.ts` (label helpers)

**Files:**

- Create: `src/units.ts`

Since `js-ballistics` handles all numeric unit conversion via its `UNew.*` constructors and `value.In(Unit.*)` getters, `units.ts` reduces to display-label strings and the `UnitSystem` type alias. No tests needed for this trivial mapping — the renderer tests in Task 6 exercise the labels indirectly.

- [ ] **Step 1: Implement `src/units.ts`**

```ts
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
```

- [ ] **Step 2: Verify build still succeeds**

Run: `npm run build`
Expected: type-check and esbuild succeed.

- [ ] **Step 3: Commit**

```bash
git add src/units.ts
git commit -m "feat(units): add unit-system labels"
```

---

## Task 3: Implement `parser.ts`

**Files:**

- Create: `src/parser.ts`
- Create: `tests/parser.test.ts`

The parser owns: lenient `key: value` line scanning, schema validation, numeric coercion, and structured errors. No YAML dependency. Comments (`#`) and blank lines are ignored. Unknown keys produce errors (typo-catching).

Schema (all fields required):

- `bc` — positive number
- `muzzleVelocity` — positive number
- `sightHeight` — non-negative number
- `zeroRange` — positive number
- `maxRange` — positive number, must be ≥ `zeroRange`
- `step` — positive number, must be ≤ `maxRange`
- `windSpeed` — non-negative number
- `windAngle` — number 0–360 inclusive (modulo enforced for >360 will not be auto-fixed; out of range is an error)
- `bulletWeight` — positive number (required — js-ballistics needs a non-zero weight, and energy is meaningful for v1)

The parser returns user-facing values in the configured unit system; the adapter passes them to js-ballistics with the appropriate `UNew.*` constructors.

- [ ] **Step 1: Write failing tests at `tests/parser.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { parseBallisticsBlock, type ParsedInputs } from "../src/parser";

describe("parseBallisticsBlock", () => {
    const valid = `
bc: 0.475
muzzleVelocity: 2700
sightHeight: 1.5
zeroRange: 100
maxRange: 1000
step: 50
windSpeed: 10
windAngle: 90
bulletWeight: 168
`;

    it("parses a valid block", () => {
        const result = parseBallisticsBlock(valid);
        expect(result.ok).toBe(true);
        if (!result.ok) return;
        const i: ParsedInputs = result.value;
        expect(i.bc).toBe(0.475);
        expect(i.muzzleVelocity).toBe(2700);
        expect(i.sightHeight).toBe(1.5);
        expect(i.zeroRange).toBe(100);
        expect(i.maxRange).toBe(1000);
        expect(i.step).toBe(50);
        expect(i.windSpeed).toBe(10);
        expect(i.windAngle).toBe(90);
        expect(i.bulletWeight).toBe(168);
    });

    it("errors when bulletWeight is missing", () => {
        const block = valid.replace(/bulletWeight:.*\n/, "");
        const result = parseBallisticsBlock(block);
        expect(result.ok).toBe(false);
        if (result.ok) return;
        expect(result.error.message).toMatch(/bulletWeight/);
    });

    it("ignores blank lines and # comments", () => {
        const block = `
# my favorite load
bc: 0.475

muzzleVelocity: 2700
sightHeight: 1.5
zeroRange: 100
maxRange: 1000
step: 50
windSpeed: 10
windAngle: 90
bulletWeight: 168
`;
        const result = parseBallisticsBlock(block);
        expect(result.ok).toBe(true);
    });

    it("errors on a missing required field", () => {
        const block = valid.replace(/muzzleVelocity:.*\n/, "");
        const result = parseBallisticsBlock(block);
        expect(result.ok).toBe(false);
        if (result.ok) return;
        expect(result.error.message).toMatch(/muzzleVelocity/);
    });

    it("errors on a non-numeric value", () => {
        const block = valid.replace("bc: 0.475", "bc: fast");
        const result = parseBallisticsBlock(block);
        expect(result.ok).toBe(false);
        if (result.ok) return;
        expect(result.error.message).toMatch(/bc/);
        expect(result.error.message).toMatch(/fast/);
    });

    it("errors on an unknown key", () => {
        const block = valid + "drag: G7\n";
        const result = parseBallisticsBlock(block);
        expect(result.ok).toBe(false);
        if (result.ok) return;
        expect(result.error.message).toMatch(/drag/);
    });

    it("errors when bc is not positive", () => {
        const block = valid.replace("bc: 0.475", "bc: 0");
        const result = parseBallisticsBlock(block);
        expect(result.ok).toBe(false);
        if (result.ok) return;
        expect(result.error.message).toMatch(/bc/);
    });

    it("errors when step exceeds maxRange", () => {
        const block = valid.replace("step: 50", "step: 1500");
        const result = parseBallisticsBlock(block);
        expect(result.ok).toBe(false);
        if (result.ok) return;
        expect(result.error.message).toMatch(/step/);
    });

    it("errors when maxRange is less than zeroRange", () => {
        const block = valid.replace("maxRange: 1000", "maxRange: 50");
        const result = parseBallisticsBlock(block);
        expect(result.ok).toBe(false);
        if (result.ok) return;
        expect(result.error.message).toMatch(/maxRange/);
    });

    it("errors when windAngle is out of range", () => {
        const block = valid.replace("windAngle: 90", "windAngle: 500");
        const result = parseBallisticsBlock(block);
        expect(result.ok).toBe(false);
        if (result.ok) return;
        expect(result.error.message).toMatch(/windAngle/);
    });

    it("errors on a malformed line", () => {
        const block = valid + "this is not a key value line\n";
        const result = parseBallisticsBlock(block);
        expect(result.ok).toBe(false);
    });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test`
Expected: failures from missing `../src/parser`.

- [ ] **Step 3: Implement `src/parser.ts`**

```ts
// parser.ts — parses a `ballistics` codefence body into typed inputs.

export interface ParsedInputs {
    bc: number;
    muzzleVelocity: number;
    sightHeight: number;
    zeroRange: number;
    maxRange: number;
    step: number;
    windSpeed: number;
    windAngle: number;
    bulletWeight: number;
}

export interface ParseError {
    message: string;
}

export type ParseResult = { ok: true; value: ParsedInputs } | { ok: false; error: ParseError };

const REQUIRED_KEYS = [
    "bc",
    "muzzleVelocity",
    "sightHeight",
    "zeroRange",
    "maxRange",
    "step",
    "windSpeed",
    "windAngle",
    "bulletWeight",
] as const;

const ALL_KEYS: ReadonlySet<string> = new Set(REQUIRED_KEYS);

export function parseBallisticsBlock(source: string): ParseResult {
    const fields: Record<string, number> = {};

    const lines = source.split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
        const raw = lines[i];
        const line = raw.replace(/#.*$/, "").trim();
        if (line === "") continue;

        const m = line.match(/^([A-Za-z][A-Za-z0-9_]*)\s*:\s*(.+)$/);
        if (!m) {
            return err(`line ${i + 1}: malformed input "${raw.trim()}" — expected "key: value"`);
        }
        const key = m[1];
        const valueText = m[2].trim();

        if (!ALL_KEYS.has(key)) {
            return err(`unknown key "${key}" on line ${i + 1}`);
        }

        const num = Number(valueText);
        if (!Number.isFinite(num)) {
            return err(`"${key}" must be a number (got "${valueText}")`);
        }
        fields[key] = num;
    }

    for (const k of REQUIRED_KEYS) {
        if (!(k in fields)) return err(`missing required field "${k}"`);
    }

    const value: ParsedInputs = {
        bc: fields.bc,
        muzzleVelocity: fields.muzzleVelocity,
        sightHeight: fields.sightHeight,
        zeroRange: fields.zeroRange,
        maxRange: fields.maxRange,
        step: fields.step,
        windSpeed: fields.windSpeed,
        windAngle: fields.windAngle,
        bulletWeight: fields.bulletWeight,
    };

    const v = validate(value);
    if (v) return err(v);

    return { ok: true, value };
}

function validate(i: ParsedInputs): string | null {
    if (i.bc <= 0) return `"bc" must be positive (got ${i.bc})`;
    if (i.muzzleVelocity <= 0) return `"muzzleVelocity" must be positive (got ${i.muzzleVelocity})`;
    if (i.sightHeight < 0) return `"sightHeight" must be non-negative (got ${i.sightHeight})`;
    if (i.zeroRange <= 0) return `"zeroRange" must be positive (got ${i.zeroRange})`;
    if (i.maxRange <= 0) return `"maxRange" must be positive (got ${i.maxRange})`;
    if (i.maxRange < i.zeroRange)
        return `"maxRange" (${i.maxRange}) must be at least "zeroRange" (${i.zeroRange})`;
    if (i.step <= 0) return `"step" must be positive (got ${i.step})`;
    if (i.step > i.maxRange) return `"step" (${i.step}) must not exceed "maxRange" (${i.maxRange})`;
    if (i.windSpeed < 0) return `"windSpeed" must be non-negative (got ${i.windSpeed})`;
    if (i.windAngle < 0 || i.windAngle > 360)
        return `"windAngle" must be between 0 and 360 (got ${i.windAngle})`;
    if (i.bulletWeight <= 0) return `"bulletWeight" must be positive (got ${i.bulletWeight})`;
    return null;
}

function err(message: string): ParseResult {
    return { ok: false, error: { message } };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: all parser tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/parser.ts tests/parser.test.ts
git commit -m "feat(parser): parse ballistics codefence inputs"
```

---

## Task 4: Implement the js-ballistics adapter

**Files:**

- Create: `src/ballistics.ts`
- Create: `tests/ballistics.test.ts`

`src/ballistics.ts` is a thin adapter. It exposes:

- `TrajectoryRow` — the output shape consumed by the renderer (range, elevation, windage, time, velocity, energy — all numeric, in display units of the active `UnitSystem`).
- `solveTrajectory(inputs: ParsedInputs, system: UnitSystem): TrajectoryRow[]` — maps inputs to js-ballistics types using the correct `UNew.*` constructors per unit system, runs the RK4 engine with ICAO standard atmosphere, then extracts each row's values in display units.

Conventions:

- Imperial mapping: yards, inches, fps, mph, grains, MOA/MIL, ft·lbf.
- Metric mapping: meters, centimeters, m/s, m/s (wind), grams, MOA/MIL, joules.
- Bullet diameter is hardcoded to `UNew.Inch(0.308)` — see the architecture note at the top of this plan for why this is safe for v1.
- Wind direction maps directly: a `windAngle` of 90° means wind from 3 o'clock (right-to-left across the shot), matching js-ballistics' `directionFrom`.

The single test verifies the adapter against the user's shooterscalculator example. Tolerances are generous because js-ballistics uses an internal atmospheric model that may differ slightly from shooterscalculator (which we already confirmed via the pre-verification smoke test).

- [ ] **Step 1: Write failing tests at `tests/ballistics.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { solveTrajectory, type TrajectoryRow } from "../src/ballistics";
import type { ParsedInputs } from "../src/parser";

const referenceInputs: ParsedInputs = {
    bc: 0.475,
    muzzleVelocity: 2700,
    sightHeight: 1.5,
    zeroRange: 100,
    maxRange: 1000,
    step: 50,
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
        // Drop ≈ -59 in at 500 yd → MOA ≈ -11.3, MIL ≈ -3.3.
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
        // 168 gr × 2700 fps → ~2720 ft·lbf
        expect(r.energy).toBeGreaterThan(2680);
        expect(r.energy).toBeLessThan(2760);
    });
});

describe("solveTrajectory — metric inputs", () => {
    it("accepts metric inputs and returns metric outputs", () => {
        const metric: ParsedInputs = {
            bc: 0.475,
            muzzleVelocity: 823, // m/s, ≈ 2700 fps
            sightHeight: 3.8, // cm, ≈ 1.5 in
            zeroRange: 91, // m, ≈ 100 yd
            maxRange: 914, // m, ≈ 1000 yd
            step: 91, // m, ≈ 100 yd
            windSpeed: 4.5, // m/s, ≈ 10 mph
            windAngle: 90,
            bulletWeight: 10.9, // g, ≈ 168 gr
        };
        const rows = solveTrajectory(metric, "metric");
        expect(rows.length).toBeGreaterThan(5);
        // Elevation in cm; expect ~0 at zero range.
        const zero = rows.find((r) => Math.abs(r.range - 91) < 1);
        expect(zero).toBeDefined();
        expect(Math.abs(zero!.elevation)).toBeLessThan(2); // cm
    });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test`
Expected: failures from missing `../src/ballistics`.

- [ ] **Step 3: Implement `src/ballistics.ts`**

```ts
// ballistics.ts — adapter over js-ballistics. Converts ParsedInputs into the
// library's typed inputs, runs the RK4 engine, and projects each TrajectoryData
// row down to the simple numeric TrajectoryRow consumed by the renderer.

import {
    Calculator,
    RK4IntegrationEngine,
    DragModel,
    Table,
    Ammo,
    Weapon,
    Shot,
    Atmo,
    Wind,
    UNew,
    Unit,
} from "js-ballistics";
import type { ParsedInputs } from "./parser";
import type { UnitSystem } from "./units";

// Hardcoded for v1; see plan header.
const DEFAULT_DIAMETER_INCH = 0.308;

export interface TrajectoryRow {
    /** Range in display units (yd or m). */
    range: number;
    /** Elevation offset from line of sight, in display units (in or cm). */
    elevation: number;
    elevationMoa: number;
    elevationMil: number;
    /** Wind drift in display units (in or cm). */
    windage: number;
    windageMoa: number;
    windageMil: number;
    /** Time of flight in seconds. */
    time: number;
    /** Remaining kinetic energy in display units (ft·lbf or J). */
    energy: number;
    /** Velocity in display units (ft/s or m/s). */
    velocity: number;
}

export function solveTrajectory(inputs: ParsedInputs, system: UnitSystem): TrajectoryRow[] {
    const dm = new DragModel({
        bc: inputs.bc,
        dragTable: Table.G1,
        weight:
            system === "imperial"
                ? UNew.Grain(inputs.bulletWeight)
                : UNew.Gram(inputs.bulletWeight),
        diameter: UNew.Inch(DEFAULT_DIAMETER_INCH),
    });

    const ammo = new Ammo({
        dm,
        mv:
            system === "imperial"
                ? UNew.FPS(inputs.muzzleVelocity)
                : UNew.MPS(inputs.muzzleVelocity),
    });

    const weapon = new Weapon({
        sightHeight:
            system === "imperial"
                ? UNew.Inch(inputs.sightHeight)
                : UNew.Centimeter(inputs.sightHeight),
    });

    const winds = [
        new Wind({
            velocity:
                system === "imperial" ? UNew.MPH(inputs.windSpeed) : UNew.MPS(inputs.windSpeed),
            directionFrom: UNew.Degree(inputs.windAngle),
        }),
    ];

    const shot = new Shot({
        weapon,
        ammo,
        atmo: Atmo.icao(),
        winds,
    });

    const calc = new Calculator({ engine: RK4IntegrationEngine });
    const zeroDistance =
        system === "imperial" ? UNew.Yard(inputs.zeroRange) : UNew.Meter(inputs.zeroRange);
    calc.setWeaponZero(shot, zeroDistance);

    const trajectoryRange =
        system === "imperial" ? UNew.Yard(inputs.maxRange) : UNew.Meter(inputs.maxRange);
    const trajectoryStep = system === "imperial" ? UNew.Yard(inputs.step) : UNew.Meter(inputs.step);

    const result = calc.fire({
        shot,
        trajectoryRange,
        trajectoryStep,
    });

    const distanceUnit = system === "imperial" ? Unit.Yard : Unit.Meter;
    const linearUnit = system === "imperial" ? Unit.Inch : Unit.Centimeter;
    const velocityUnit = system === "imperial" ? Unit.FPS : Unit.MPS;
    const energyUnit = system === "imperial" ? Unit.FootPound : Unit.Joule;

    return result.trajectory.map((td) => ({
        range: td.distance.In(distanceUnit),
        elevation: td.targetDrop.In(linearUnit),
        elevationMoa: td.dropAdjustment.In(Unit.MOA),
        elevationMil: td.dropAdjustment.In(Unit.MIL),
        windage: td.windage.In(linearUnit),
        windageMoa: td.windageAdjustment.In(Unit.MOA),
        windageMil: td.windageAdjustment.In(Unit.MIL),
        time: td.time,
        energy: td.energy.In(energyUnit),
        velocity: td.velocity.In(velocityUnit),
    }));
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: all ballistics tests pass within tolerances. If a tolerance test fails marginally, do not loosen the tolerances — they are already generous to account for atmospheric-model differences between js-ballistics and shooterscalculator. Investigate first.

- [ ] **Step 5: Commit**

```bash
git add src/ballistics.ts tests/ballistics.test.ts
git commit -m "feat(ballistics): add js-ballistics trajectory adapter"
```

---

## Task 5: Add `units` setting

**Files:**

- Modify: `src/config.ts`
- Modify: `src/main.ts`
- Modify: `src/settings.ts`

- [ ] **Step 1: Extend the settings interface in `src/config.ts`**

Replace the file contents with:

`UnitSystem` already lives in `units.ts` (Task 2). Import it here.

```ts
// config.ts - config models for the obsidian-ballistics plugin

import { LogLevel } from "obskit";
import { UnitSystem } from "./units";

export interface BallisticsPluginSettings {
    logLevel: LogLevel;
    units: UnitSystem;
}
```

- [ ] **Step 2: Update defaults in `src/main.ts`**

In `src/main.ts`, change the `DEFAULT_SETTINGS` constant to:

```ts
const DEFAULT_SETTINGS: BallisticsPluginSettings = {
    logLevel: LogLevel.ERROR,
    units: "imperial",
};
```

- [ ] **Step 3: Add a units dropdown in `src/settings.ts`**

In `src/settings.ts`, add a new setting class above `BallisticsSettingsTab`:

```ts
import { UnitSystem } from "./units";

class UnitSystemSetting extends DropdownSetting<UnitSystem> {
    constructor(private plugin: BallisticsPlugin) {
        super({
            name: "Units",
            description: "Unit system for ballistics inputs and table output.",
        });
    }

    get value(): UnitSystem {
        return this.plugin.settings.units ?? this.default;
    }

    set value(val: UnitSystem) {
        this.plugin.settings.units = val;
        void this.plugin.saveSettings();
    }

    get default(): UnitSystem {
        return "imperial";
    }

    get options(): { key: string; label: string; value: UnitSystem }[] {
        return [
            { key: "imperial", label: "Imperial (yd, in, ft/s)", value: "imperial" },
            { key: "metric", label: "Metric (m, cm, m/s)", value: "metric" },
        ];
    }
}
```

Then update the `display()` method to render the new setting above the existing log-level setting:

```ts
display(): void {
    const { containerEl } = this;
    containerEl.empty();

    new UnitSystemSetting(this.plugin).display(containerEl);
    new LogLevelSetting(this.plugin).display(containerEl);
}
```

- [ ] **Step 4: Verify the project still builds**

Run: `npm run build`
Expected: type-check and esbuild succeed.

- [ ] **Step 5: Commit**

```bash
git add src/config.ts src/main.ts src/settings.ts
git commit -m "feat(settings): add imperial/metric units setting"
```

---

## Task 6: Implement `renderer.ts`

**Files:**

- Create: `src/renderer.ts`
- Create: `tests/renderer.test.ts`

The renderer takes the already-display-unit `TrajectoryRow[]` from the adapter and builds the table DOM. No unit conversion happens here — js-ballistics already produced display-unit values and MOA/MIL columns. The renderer only formats numbers and stamps in column-header labels.

happy-dom is already installed and configured globally as the vitest environment (Task 1), so DOM APIs are available in tests.

- [ ] **Step 1: Write failing tests at `tests/renderer.test.ts`**

```ts
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
        const headerText = Array.from(container.querySelectorAll("thead td")).map(
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
        const headerText = Array.from(container.querySelectorAll("thead td")).map(
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test`
Expected: failures from missing `../src/renderer`.

- [ ] **Step 3: Implement `src/renderer.ts`**

```ts
// renderer.ts — builds the trajectory table and error-box DOM.

import type { TrajectoryRow } from "./ballistics";
import { labels, type UnitSystem } from "./units";

export function renderTrajectoryTable(
    container: HTMLElement,
    rows: TrajectoryRow[],
    system: UnitSystem
): void {
    const lbl = labels(system);
    const doc = container.ownerDocument;

    const table = doc.createElement("table");
    table.classList.add("ballistics-table");

    const thead = doc.createElement("thead");
    appendHeaderRow(thead, [
        "Range",
        "Elevation",
        "Elevation",
        "Elevation",
        "Windage",
        "Windage",
        "Windage",
        "Time",
        "Energy",
        "Velocity",
    ]);
    appendHeaderRow(thead, [
        `(${lbl.range})`,
        `(${lbl.linear})`,
        "(MOA)",
        "(MIL)",
        `(${lbl.linear})`,
        "(MOA)",
        "(MIL)",
        "(s)",
        `(${lbl.energy})`,
        `(${lbl.velocity})`,
    ]);
    table.appendChild(thead);

    const tbody = doc.createElement("tbody");
    for (const row of rows) {
        tbody.appendChild(formatRow(doc, row));
    }
    table.appendChild(tbody);

    container.appendChild(table);
}

export function renderError(container: HTMLElement, message: string): void {
    const el = container.ownerDocument.createElement("div");
    el.classList.add("ballistics-error");
    el.textContent = `Ballistics: ${message}`;
    container.appendChild(el);
}

function appendHeaderRow(thead: HTMLTableSectionElement, cells: string[]): void {
    const tr = thead.ownerDocument.createElement("tr");
    for (const text of cells) {
        const td = thead.ownerDocument.createElement("td");
        td.textContent = text;
        tr.appendChild(td);
    }
    thead.appendChild(tr);
}

function formatRow(doc: Document, row: TrajectoryRow): HTMLTableRowElement {
    const tr = doc.createElement("tr");
    const cells = [
        row.range.toFixed(0),
        row.elevation.toFixed(2),
        row.elevationMoa.toFixed(2),
        row.elevationMil.toFixed(2),
        row.windage.toFixed(2),
        row.windageMoa.toFixed(2),
        row.windageMil.toFixed(2),
        row.time.toFixed(3),
        row.energy.toFixed(0),
        row.velocity.toFixed(0),
    ];
    for (const text of cells) {
        const td = doc.createElement("td");
        td.textContent = text;
        tr.appendChild(td);
    }
    return tr;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: all renderer tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/renderer.ts tests/renderer.test.ts
git commit -m "feat(renderer): render trajectory table and error box"
```

---

## Task 7: Wire the code-block processor in `main.ts`

**Files:**

- Modify: `src/main.ts`

- [ ] **Step 1: Update imports and add processor registration in `src/main.ts`**

Replace the file contents with:

```ts
// main.ts - main entry point for obsidian-ballistics plugin

import { Plugin } from "obsidian";
import { Logger, LogLevel } from "obskit";
import { BallisticsPluginSettings } from "./config";
import { BallisticsSettingsTab } from "./settings";
import { parseBallisticsBlock } from "./parser";
import { solveTrajectory } from "./ballistics";
import { renderTrajectoryTable, renderError } from "./renderer";

const DEFAULT_SETTINGS: BallisticsPluginSettings = {
    logLevel: LogLevel.ERROR,
    units: "imperial",
};

export default class BallisticsPlugin extends Plugin {
    settings!: BallisticsPluginSettings;

    private logger: Logger = Logger.getLogger("main");

    async onload() {
        await this.loadSettings();

        this.addSettingTab(new BallisticsSettingsTab(this.app, this));

        this.registerMarkdownCodeBlockProcessor("ballistics", (source, el) => {
            this.processBlock(source, el);
        });

        this.logger.info("Plugin loaded");
    }

    onunload() {
        this.logger.info("Plugin unloaded");
    }

    async loadSettings() {
        const data = (await this.loadData()) as Partial<BallisticsPluginSettings> | null;
        this.settings = Object.assign({}, DEFAULT_SETTINGS, data);

        this.applySettings();
    }

    async saveSettings() {
        await this.saveData(this.settings);

        this.applySettings();
    }

    private applySettings() {
        Logger.setGlobalLogLevel(this.settings.logLevel);
    }

    private processBlock(source: string, el: HTMLElement): void {
        const parsed = parseBallisticsBlock(source);
        if (!parsed.ok) {
            renderError(el, parsed.error.message);
            return;
        }
        try {
            const rows = solveTrajectory(parsed.value, this.settings.units);
            renderTrajectoryTable(el, rows, this.settings.units);
        } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            this.logger.error("Trajectory solver failed", e);
            renderError(el, `solver failure: ${msg}`);
        }
    }
}
```

- [ ] **Step 2: Verify the project builds**

Run: `npm run build`
Expected: type-check and esbuild both succeed.

- [ ] **Step 3: Run the full preflight**

Run: `just preflight`
Expected: build, format check, lint, and vitest all succeed.

- [ ] **Step 4: Commit**

```bash
git add src/main.ts
git commit -m "feat(main): register ballistics code-block processor"
```

---

## Task 8: Theme-aware styles

**Files:**

- Modify: `styles.css`

- [ ] **Step 1: Replace `styles.css` with theme-aware styles**

```css
.ballistics-table {
    border-collapse: collapse;
    margin: 0.5em 0;
    font-size: var(--font-text-size, 14px);
    color: var(--text-normal);
}

.ballistics-table thead td {
    font-weight: 600;
    text-align: center;
    padding: 0.25em 0.6em;
    border-bottom: 1px solid var(--background-modifier-border);
    background: var(--background-secondary);
}

.ballistics-table tbody td {
    text-align: right;
    padding: 0.2em 0.6em;
    border-bottom: 1px solid var(--background-modifier-border);
    font-variant-numeric: tabular-nums;
}

.ballistics-table tbody tr:nth-child(even) td {
    background: var(--background-secondary);
}

.ballistics-error {
    color: var(--text-error);
    background: var(--background-modifier-error);
    border: 1px solid var(--background-modifier-error);
    border-radius: 4px;
    padding: 0.5em 0.75em;
    font-family: var(--font-monospace);
    white-space: pre-wrap;
}
```

- [ ] **Step 2: Verify preflight**

Run: `just preflight`
Expected: all checks pass.

- [ ] **Step 3: Commit**

```bash
git add styles.css
git commit -m "style: theme-aware ballistics table and error styles"
```

---

## Task 9: Documentation and manual verification

**Files:**

- Modify: `README.md`

- [ ] **Step 1: Append a usage section to `README.md`**

Insert this section after the "Development" section in `README.md`:

````markdown
## Usage

Embed a ballistics table in any note with a `ballistics` code block:

```ballistics
bc: 0.475
muzzleVelocity: 2700
sightHeight: 1.5
zeroRange: 100
maxRange: 1000
step: 50
windSpeed: 10
windAngle: 90
bulletWeight: 168
```

### Inputs

| Key              | Description                                | Imperial | Metric |
| ---------------- | ------------------------------------------ | -------- | ------ |
| `bc`             | G1 ballistic coefficient                   | —        | —      |
| `muzzleVelocity` | Velocity at the muzzle                     | ft/s     | m/s    |
| `sightHeight`    | Sight axis height above bore               | in       | cm     |
| `zeroRange`      | Range at which the rifle is zeroed         | yd       | m      |
| `maxRange`       | Furthest range in the table                | yd       | m      |
| `step`           | Row interval                               | yd       | m      |
| `windSpeed`      | Wind speed                                 | mph      | m/s    |
| `windAngle`      | Clock angle 0–360° (90° = full from right) | deg      | deg    |
| `bulletWeight`   | Bullet weight                              | grains   | grams  |

Unit system is set globally in the plugin settings.
````

- [ ] **Step 2: Build and verify in the development vault**

Run: `npm run build`

Then open Obsidian, enable the plugin, and create a test note containing the example code block from the README. Verify:

- Table renders with 21 rows (range 0 to 1000 yd in 50 yd steps).
- All 10 columns are present with the imperial header units.
- The 100 yd row shows ~0.00 in elevation.
- The 1000 yd row shows approximately -390 in elevation, ~101 in windage, ~1214 ft/s.
- Switch the plugin setting to "Metric" and reload the note — column headers change to m / cm / m/s, but the inputs are now interpreted as metric (the table will not match the imperial expectations — that is correct behavior).
- Introduce a parse error (e.g., delete `bc`) and confirm the inline error box appears with a message naming the missing field.

If any of the above fails, file the issue rather than weakening the test tolerances.

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "docs: document ballistics codefence usage"
```

---

## Done

After Task 9, the v1 ballistics codefence is complete: js-ballistics adapter validated against the user-supplied shooterscalculator reference, parser with full error coverage, theme-aware renderer, plugin setting for units, end-to-end wiring, and user-facing docs.
