# Ballistics Codefence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement a `ballistics` markdown code-block processor that parses user-supplied load/scenario inputs, runs a G1 point-mass ballistics solver, and renders a theme-aware HTML trajectory table inline in Obsidian notes.

**Architecture:** New pure modules (`parser.ts`, `units.ts`, `ballistics.ts`, `renderer.ts`) wired into the existing plugin entry point via `registerMarkdownCodeBlockProcessor`. The solver is pure SI math with no DOM or Obsidian imports; the renderer is pure DOM with no Obsidian imports; `main.ts` is the only file that touches the Obsidian API. Units conversion happens at the in/out boundaries.

**Tech Stack:** TypeScript, esbuild, vitest (new), obsidian API, obskit settings UI.

**Spec:** `docs/superpowers/specs/2026-05-12-ballistics-codefence-design.md`

---

## File Map

Created in this plan:

- `src/parser.ts` — Codefence body → `ParsedInputs | ParseError`.
- `src/units.ts` — Imperial/metric conversion helpers and column-label strings.
- `src/ballistics.ts` — G1 drag table, RK4 trajectory solver, zero-angle finding, wind drift. Pure SI math.
- `src/renderer.ts` — DOM construction for the trajectory table and error box.
- `tests/parser.test.ts`, `tests/units.test.ts`, `tests/ballistics.test.ts`, `tests/renderer.test.ts` — vitest suites.
- `vitest.config.ts` — vitest configuration.

Modified in this plan:

- `src/config.ts` — Add `units: "imperial" | "metric"` to settings interface.
- `src/main.ts` — Add `units` to `DEFAULT_SETTINGS`; register the `ballistics` code-block processor.
- `src/settings.ts` — Add a `UnitsSetting` dropdown above the existing `LogLevelSetting`.
- `styles.css` — `.ballistics-table` and `.ballistics-error` styles using Obsidian CSS vars.
- `package.json` — Add `vitest` devDep and `test` script.
- `.justfile` — Add `test` recipe.
- `README.md` — Document the codefence with an example.

---

## Task 1: Add vitest test infrastructure

**Files:**

- Create: `vitest.config.ts`
- Create: `tests/smoke.test.ts`
- Modify: `package.json`
- Modify: `.justfile`

- [ ] **Step 1: Install vitest as a devDependency**

Run:

```bash
npm install --save-dev vitest@^2.1.0
```

Expected: vitest added to `package.json` devDependencies; `node_modules` updated.

- [ ] **Step 2: Add a `test` script to `package.json`**

In `package.json`, add to the `"scripts"` object:

```json
"test": "vitest run"
```

- [ ] **Step 3: Create `vitest.config.ts`**

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
    test: {
        include: ["tests/**/*.test.ts"],
        environment: "node",
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
git commit -m "chore: add vitest test infrastructure"
```

---

## Task 2: Implement `units.ts`

**Files:**

- Create: `src/units.ts`
- Create: `tests/units.test.ts`

Internally the solver works in SI (meters, m/s, kg, radians). `units.ts` converts inputs in and outputs out, and provides display-label strings keyed by the user's setting.

- [ ] **Step 1: Write the failing tests at `tests/units.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import {
    yardsToMeters,
    metersToYards,
    inchesToMeters,
    metersToInches,
    fpsToMps,
    mpsToFps,
    mphToMps,
    grainsToKg,
    gramsToKg,
    joulesToFtLbf,
    centimetersToMeters,
    metersToCentimeters,
} from "../src/units";

describe("unit conversions", () => {
    it("converts yards to meters", () => {
        expect(yardsToMeters(100)).toBeCloseTo(91.44, 5);
    });

    it("converts meters to yards", () => {
        expect(metersToYards(91.44)).toBeCloseTo(100, 5);
    });

    it("converts inches to meters", () => {
        expect(inchesToMeters(1)).toBeCloseTo(0.0254, 6);
    });

    it("converts meters to inches", () => {
        expect(metersToInches(0.0254)).toBeCloseTo(1, 6);
    });

    it("converts feet-per-second to meters-per-second", () => {
        expect(fpsToMps(2700)).toBeCloseTo(822.96, 2);
    });

    it("converts meters-per-second to feet-per-second", () => {
        expect(mpsToFps(822.96)).toBeCloseTo(2700, 1);
    });

    it("converts miles-per-hour to meters-per-second", () => {
        expect(mphToMps(10)).toBeCloseTo(4.4704, 4);
    });

    it("converts grains to kilograms", () => {
        expect(grainsToKg(168)).toBeCloseTo(0.01088621, 7);
    });

    it("converts grams to kilograms", () => {
        expect(gramsToKg(10)).toBeCloseTo(0.01, 6);
    });

    it("converts joules to foot-pounds-force", () => {
        expect(joulesToFtLbf(1)).toBeCloseTo(0.7375621, 6);
    });

    it("converts centimeters to meters and back", () => {
        expect(centimetersToMeters(100)).toBeCloseTo(1, 6);
        expect(metersToCentimeters(1)).toBeCloseTo(100, 6);
    });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test`
Expected: failures with "Cannot find module '../src/units'".

- [ ] **Step 3: Implement `src/units.ts`**

```ts
// units.ts — conversions between imperial input/output units and internal SI.

export type UnitSystem = "imperial" | "metric";

const YARD_M = 0.9144;
const INCH_M = 0.0254;
const FOOT_M = 0.3048;
const MILE_M = 1609.344;
const GRAIN_KG = 6.479891e-5;
const FT_LBF_J = 1.355817948;

export const yardsToMeters = (y: number): number => y * YARD_M;
export const metersToYards = (m: number): number => m / YARD_M;

export const inchesToMeters = (i: number): number => i * INCH_M;
export const metersToInches = (m: number): number => m / INCH_M;

export const centimetersToMeters = (c: number): number => c / 100;
export const metersToCentimeters = (m: number): number => m * 100;

export const fpsToMps = (f: number): number => f * FOOT_M;
export const mpsToFps = (m: number): number => m / FOOT_M;

export const mphToMps = (mph: number): number => (mph * MILE_M) / 3600;

export const grainsToKg = (g: number): number => g * GRAIN_KG;
export const gramsToKg = (g: number): number => g / 1000;

export const joulesToFtLbf = (j: number): number => j / FT_LBF_J;

/** Column label suffixes for the rendered table, keyed by unit system. */
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

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: all 11 unit tests pass plus the smoke test.

- [ ] **Step 5: Commit**

```bash
git add src/units.ts tests/units.test.ts
git commit -m "feat(units): add imperial/metric conversion helpers"
```

---

## Task 3: Implement `parser.ts`

**Files:**

- Create: `src/parser.ts`
- Create: `tests/parser.test.ts`

The parser owns: lenient `key: value` line scanning, schema validation, numeric coercion, and structured errors. No YAML dependency. Comments (`#`) and blank lines are ignored. Unknown keys produce errors (typo-catching).

Schema (all fields except `bulletWeight` required):

- `bc` — positive number
- `muzzleVelocity` — positive number
- `sightHeight` — non-negative number
- `zeroRange` — positive number
- `maxRange` — positive number, must be ≥ `zeroRange`
- `step` — positive number, must be ≤ `maxRange`
- `windSpeed` — non-negative number
- `windAngle` — number 0–360 inclusive (modulo enforced for >360 will not be auto-fixed; out of range is an error)
- `bulletWeight` — positive number (optional)

The parser returns user-facing values in the configured unit system; the solver caller converts them to SI.

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

    it("treats bulletWeight as optional", () => {
        const block = valid.replace(/bulletWeight:.*\n/, "");
        const result = parseBallisticsBlock(block);
        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.value.bulletWeight).toBeUndefined();
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
    bulletWeight?: number;
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
] as const;

const OPTIONAL_KEYS = ["bulletWeight"] as const;

const ALL_KEYS: ReadonlySet<string> = new Set([...REQUIRED_KEYS, ...OPTIONAL_KEYS]);

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
    if (i.bulletWeight !== undefined && i.bulletWeight <= 0)
        return `"bulletWeight" must be positive (got ${i.bulletWeight})`;
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

## Task 4: Implement G1 drag table and lookup

**Files:**

- Create: `src/ballistics.ts` (initial slice — just drag function)
- Create: `tests/ballistics.test.ts` (initial slice — just drag function)

Standard G1 drag function table (Mach vs Cd), as published by McCoy / JBM and used by virtually every G1 ballistics calculator. Linear interpolation between tabulated Mach numbers; clamp to endpoints.

- [ ] **Step 1: Write failing tests at `tests/ballistics.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { cdG1 } from "../src/ballistics";

describe("cdG1", () => {
    it("returns the tabulated value at Mach 1.00", () => {
        expect(cdG1(1.0)).toBeCloseTo(0.4805, 4);
    });

    it("returns the tabulated value at Mach 0.50", () => {
        expect(cdG1(0.5)).toBeCloseTo(0.2032, 4);
    });

    it("returns the tabulated value at Mach 2.00", () => {
        expect(cdG1(2.0)).toBeCloseTo(0.5934, 4);
    });

    it("interpolates between tabulated points", () => {
        // Midpoint between Mach 1.00 (0.4805) and Mach 1.025 (0.5136)
        expect(cdG1(1.0125)).toBeCloseTo((0.4805 + 0.5136) / 2, 4);
    });

    it("clamps to the low end below the table", () => {
        expect(cdG1(-1)).toBeCloseTo(0.2629, 4);
        expect(cdG1(0)).toBeCloseTo(0.2629, 4);
    });

    it("clamps to the high end above the table", () => {
        expect(cdG1(10)).toBeCloseTo(0.4988, 4);
    });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test`
Expected: failures from missing `../src/ballistics`.

- [ ] **Step 3: Create `src/ballistics.ts` with the G1 table and lookup**

```ts
// ballistics.ts — pure G1 point-mass solver. SI units throughout.

// Standard G1 drag function: Mach vs drag coefficient.
// Source: McCoy, "Modern Exterior Ballistics"; matches the table used by
// JBM Ballistics and other public G1 calculators.
const G1_TABLE: ReadonlyArray<readonly [number, number]> = [
    [0.0, 0.2629],
    [0.05, 0.2558],
    [0.1, 0.2487],
    [0.15, 0.2413],
    [0.2, 0.2344],
    [0.25, 0.2278],
    [0.3, 0.2214],
    [0.35, 0.2155],
    [0.4, 0.2104],
    [0.45, 0.2061],
    [0.5, 0.2032],
    [0.55, 0.202],
    [0.6, 0.2034],
    [0.7, 0.2165],
    [0.725, 0.223],
    [0.75, 0.2313],
    [0.775, 0.2417],
    [0.8, 0.2546],
    [0.825, 0.2706],
    [0.85, 0.2901],
    [0.875, 0.3136],
    [0.9, 0.3415],
    [0.925, 0.3734],
    [0.95, 0.4084],
    [0.975, 0.4448],
    [1.0, 0.4805],
    [1.025, 0.5136],
    [1.05, 0.5427],
    [1.075, 0.5677],
    [1.1, 0.5883],
    [1.125, 0.6053],
    [1.15, 0.6191],
    [1.2, 0.6393],
    [1.25, 0.6518],
    [1.3, 0.6589],
    [1.35, 0.6621],
    [1.4, 0.6625],
    [1.45, 0.6607],
    [1.5, 0.6573],
    [1.55, 0.6528],
    [1.6, 0.6474],
    [1.65, 0.6413],
    [1.7, 0.6347],
    [1.75, 0.628],
    [1.8, 0.621],
    [1.85, 0.6141],
    [1.9, 0.6072],
    [1.95, 0.6003],
    [2.0, 0.5934],
    [2.05, 0.5867],
    [2.1, 0.5804],
    [2.15, 0.5743],
    [2.2, 0.5685],
    [2.25, 0.563],
    [2.3, 0.5577],
    [2.35, 0.5527],
    [2.4, 0.5481],
    [2.45, 0.5438],
    [2.5, 0.5397],
    [2.6, 0.5325],
    [2.7, 0.5264],
    [2.8, 0.5211],
    [2.9, 0.5168],
    [3.0, 0.5133],
    [3.1, 0.5105],
    [3.2, 0.5084],
    [3.3, 0.5067],
    [3.4, 0.5054],
    [3.5, 0.504],
    [3.6, 0.503],
    [3.7, 0.5022],
    [3.8, 0.5016],
    [3.9, 0.501],
    [4.0, 0.5006],
    [4.2, 0.4998],
    [4.4, 0.4995],
    [4.6, 0.4992],
    [4.8, 0.499],
    [5.0, 0.4988],
];

export function cdG1(mach: number): number {
    if (mach <= G1_TABLE[0][0]) return G1_TABLE[0][1];
    const last = G1_TABLE[G1_TABLE.length - 1];
    if (mach >= last[0]) return last[1];

    // Binary search for the bracketing pair.
    let lo = 0;
    let hi = G1_TABLE.length - 1;
    while (hi - lo > 1) {
        const mid = (lo + hi) >> 1;
        if (G1_TABLE[mid][0] <= mach) lo = mid;
        else hi = mid;
    }
    const [m0, c0] = G1_TABLE[lo];
    const [m1, c1] = G1_TABLE[hi];
    const t = (mach - m0) / (m1 - m0);
    return c0 + t * (c1 - c0);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: all `cdG1` tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/ballistics.ts tests/ballistics.test.ts
git commit -m "feat(ballistics): add G1 drag function table"
```

---

## Task 5: Implement the point-mass trajectory solver

**Files:**

- Modify: `src/ballistics.ts`
- Modify: `tests/ballistics.test.ts`

Solver responsibilities:

1. Convert SI inputs into an internal scalar form.
2. Find the launch angle that produces a sight-line crossing at `zeroRange` (bisection).
3. Integrate the 2D trajectory with RK4 at a fixed `dt`.
4. Sample the trajectory at each multiple of `step` up to `maxRange`.
5. Compute wind drift using the standard lag-time approximation.

**Physics, all SI:**

Air density `rho = 1.225 kg/m³`. Speed of sound `c_s = 340.294 m/s`.

For a bullet with G1 BC, the form-factor algebra cancels mass and diameter:

```
a_drag(v, M) = -(rho * π * Cd_G1(M) * v²) / (8 * BC_si)
```

where `BC_si = BC_imperial * 703.069 kg/m²` (1 lb/in² = 703.069 kg/m²). The
solver takes `bcSi` already-converted.

Vertical acceleration adds gravity: `a_y -= g` with `g = 9.80665 m/s²`. The
drag vector points opposite the velocity vector.

**Wind drift (lag-time approximation):**

```
crosswind = windSpeedMps * sin(windAngleRad)
drift(x) = crosswind * (t(x) - x / muzzleVelocityMps)
```

This is the standard point-mass approximation (McCoy) — good enough for the
"reference for notes" accuracy goal and avoids a 3D solver.

**Reference test scenario** (matches the user-supplied shooterscalculator
example): BC=0.475 G1, MV=2700 fps, sightHeight=1.5 in, zeroRange=100 yd,
maxRange=1000 yd, step=50 yd, wind=10 mph @ 90°, bulletWeight=168 gr.
Expected output cross-checked against shooterscalculator (representative
rows):

| Range (yd) | Elev (in) | Wind (in) | Velocity (ft/s) |
| ---------- | --------- | --------- | --------------- |
| 0          | -1.50     | 0.03      | 2700            |
| 100        | 0.00      | 0.75      | 2513            |
| 500        | -58.93    | 20.80     | 1841            |
| 1000       | -389.74   | 101.45    | 1214            |

Tolerances in tests: drop within ±2 in or ±3% (whichever is larger), wind
within ±1.5 in or ±5%, velocity within ±25 ft/s. These accommodate small
differences in dt, atmospheric model, and BC.

- [ ] **Step 1: Append solver tests to `tests/ballistics.test.ts`**

```ts
import { solveTrajectory, type SolverInputs, type TrajectoryRow } from "../src/ballistics";
import {
    yardsToMeters,
    metersToYards,
    inchesToMeters,
    metersToInches,
    fpsToMps,
    mpsToFps,
    mphToMps,
    grainsToKg,
} from "../src/units";

// 1 lb/in² in kg/m².
const BC_SI_PER_LBIN2 = 703.069;

function makeReferenceInputs(): SolverInputs {
    return {
        bcSi: 0.475 * BC_SI_PER_LBIN2,
        muzzleVelocityMps: fpsToMps(2700),
        sightHeightM: inchesToMeters(1.5),
        zeroRangeM: yardsToMeters(100),
        maxRangeM: yardsToMeters(1000),
        stepM: yardsToMeters(50),
        windSpeedMps: mphToMps(10),
        windAngleRad: (90 * Math.PI) / 180,
        bulletMassKg: grainsToKg(168),
    };
}

function rowAt(rows: TrajectoryRow[], rangeYd: number): TrajectoryRow {
    const target = yardsToMeters(rangeYd);
    const r = rows.find((x) => Math.abs(metersToYards(x.rangeM) - rangeYd) < 0.5);
    if (!r) throw new Error(`no row at ${rangeYd} yd (closest range ${target})`);
    return r;
}

describe("solveTrajectory — reference scenario", () => {
    const rows = solveTrajectory(makeReferenceInputs());

    it("produces rows from 0 to maxRange at the requested step", () => {
        const yds = rows.map((r) => Math.round(metersToYards(r.rangeM)));
        expect(yds[0]).toBe(0);
        expect(yds[yds.length - 1]).toBe(1000);
        expect(rows.length).toBe(21);
    });

    it("starts with bullet 1.5 in below the line of sight at range 0", () => {
        const r = rowAt(rows, 0);
        expect(metersToInches(r.elevationM)).toBeCloseTo(-1.5, 1);
    });

    it("zeros at 100 yd", () => {
        const r = rowAt(rows, 100);
        expect(metersToInches(r.elevationM)).toBeCloseTo(0, 0);
    });

    it("drops within ±2 in or ±3% at 500 yd", () => {
        const r = rowAt(rows, 500);
        const drop = metersToInches(r.elevationM);
        const expected = -58.93;
        const tol = Math.max(2, Math.abs(expected) * 0.03);
        expect(Math.abs(drop - expected)).toBeLessThanOrEqual(tol);
    });

    it("drops within ±2 in or ±3% at 1000 yd", () => {
        const r = rowAt(rows, 1000);
        const drop = metersToInches(r.elevationM);
        const expected = -389.74;
        const tol = Math.max(2, Math.abs(expected) * 0.03);
        expect(Math.abs(drop - expected)).toBeLessThanOrEqual(tol);
    });

    it("drifts within ±1.5 in or ±5% at 1000 yd", () => {
        const r = rowAt(rows, 1000);
        const drift = metersToInches(r.windageM);
        const expected = 101.45;
        const tol = Math.max(1.5, expected * 0.05);
        expect(Math.abs(drift - expected)).toBeLessThanOrEqual(tol);
    });

    it("retains velocity within ±25 ft/s at 1000 yd", () => {
        const r = rowAt(rows, 1000);
        const vFps = mpsToFps(r.velocityMps);
        expect(Math.abs(vFps - 1214)).toBeLessThanOrEqual(25);
    });

    it("computes time of flight monotonically", () => {
        for (let i = 1; i < rows.length; i++) {
            expect(rows[i].timeS).toBeGreaterThan(rows[i - 1].timeS);
        }
    });

    it("computes kinetic energy from bullet mass", () => {
        const r = rowAt(rows, 0);
        // KE = 0.5 m v² at the muzzle.
        const ke = 0.5 * grainsToKg(168) * fpsToMps(2700) ** 2;
        expect(r.energyJ).toBeCloseTo(ke, 1);
    });
});

describe("solveTrajectory — without bulletMass", () => {
    it("returns rows with energyJ undefined", () => {
        const inputs = { ...makeReferenceInputs(), bulletMassKg: undefined };
        const rows = solveTrajectory(inputs);
        for (const r of rows) {
            expect(r.energyJ).toBeUndefined();
        }
    });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test`
Expected: failures from missing `solveTrajectory`, `SolverInputs`, `TrajectoryRow`.

- [ ] **Step 3: Implement the solver — append to `src/ballistics.ts`**

```ts
const RHO = 1.225; // kg/m³, ICAO standard sea level
const C_SOUND = 340.294; // m/s, dry air at 15°C
const G = 9.80665; // m/s²
const DT = 5e-4; // 0.5 ms integration step

export interface SolverInputs {
    /** Ballistic coefficient in SI (kg/m²). Convert from lb/in² via × 703.069. */
    bcSi: number;
    muzzleVelocityMps: number;
    sightHeightM: number;
    zeroRangeM: number;
    maxRangeM: number;
    stepM: number;
    windSpeedMps: number;
    /** Wind clock angle in radians. 0 = head-on, π/2 = full value from right. */
    windAngleRad: number;
    /** Optional. If omitted, `energyJ` is undefined on every row. */
    bulletMassKg?: number;
}

export interface TrajectoryRow {
    rangeM: number;
    elevationM: number;
    windageM: number;
    timeS: number;
    velocityMps: number;
    energyJ?: number;
}

interface State {
    x: number;
    y: number;
    vx: number;
    vy: number;
    t: number;
}

function dragAccel(vx: number, vy: number, bcSi: number): { ax: number; ay: number } {
    const speed = Math.hypot(vx, vy);
    if (speed === 0) return { ax: 0, ay: 0 };
    const mach = speed / C_SOUND;
    const cd = cdG1(mach);
    // a_drag magnitude = rho * π * Cd * v² / (8 * BC).
    const aMag = (RHO * Math.PI * cd * speed * speed) / (8 * bcSi);
    // Drag opposes velocity unit vector.
    return { ax: -aMag * (vx / speed), ay: -aMag * (vy / speed) };
}

function rk4Step(s: State, bcSi: number, dt: number): State {
    const f = (vx: number, vy: number) => {
        const d = dragAccel(vx, vy, bcSi);
        return { ax: d.ax, ay: d.ay - G };
    };
    const k1 = f(s.vx, s.vy);
    const k2 = f(s.vx + (k1.ax * dt) / 2, s.vy + (k1.ay * dt) / 2);
    const k3 = f(s.vx + (k2.ax * dt) / 2, s.vy + (k2.ay * dt) / 2);
    const k4 = f(s.vx + k3.ax * dt, s.vy + k3.ay * dt);

    const ax = (k1.ax + 2 * k2.ax + 2 * k3.ax + k4.ax) / 6;
    const ay = (k1.ay + 2 * k2.ay + 2 * k3.ay + k4.ay) / 6;

    return {
        x: s.x + s.vx * dt + 0.5 * ax * dt * dt,
        y: s.y + s.vy * dt + 0.5 * ay * dt * dt,
        vx: s.vx + ax * dt,
        vy: s.vy + ay * dt,
        t: s.t + dt,
    };
}

/** Integrate trajectory until x >= xLimit. Returns the full path samples. */
function integrate(launchAngleRad: number, inputs: SolverInputs, xLimit: number): State[] {
    const v0 = inputs.muzzleVelocityMps;
    let s: State = {
        x: 0,
        y: -inputs.sightHeightM,
        vx: v0 * Math.cos(launchAngleRad),
        vy: v0 * Math.sin(launchAngleRad),
        t: 0,
    };
    const path: State[] = [s];
    // Safety bound: avoid infinite loops for nonsense inputs.
    const maxSteps =
        Math.ceil(xLimit / Math.max(v0 * Math.cos(launchAngleRad), 1) / DT) * 10 + 1000;
    let steps = 0;
    while (s.x < xLimit && steps < maxSteps) {
        s = rk4Step(s, inputs.bcSi, DT);
        path.push(s);
        steps++;
    }
    return path;
}

/** Return bullet height at horizontal range x, linearly interpolating between samples. */
function heightAtX(path: State[], x: number): number {
    for (let i = 1; i < path.length; i++) {
        if (path[i].x >= x) {
            const a = path[i - 1];
            const b = path[i];
            const t = (x - a.x) / (b.x - a.x || 1);
            return a.y + t * (b.y - a.y);
        }
    }
    return path[path.length - 1].y;
}

/** Bisection on launch angle to drive bullet height to 0 at zeroRangeM. */
function findZeroAngle(inputs: SolverInputs): number {
    let lo = (-5 * Math.PI) / 180;
    let hi = (5 * Math.PI) / 180;
    // f(angle) = height at zeroRange. We want f(angle) = 0.
    for (let i = 0; i < 60; i++) {
        const mid = (lo + hi) / 2;
        const path = integrate(mid, inputs, inputs.zeroRangeM + 1);
        const h = heightAtX(path, inputs.zeroRangeM);
        if (Math.abs(h) < 1e-5) return mid;
        if (h < 0) lo = mid;
        else hi = mid;
    }
    return (lo + hi) / 2;
}

interface PathSample {
    state: State;
    crosswind: number;
}

export function solveTrajectory(inputs: SolverInputs): TrajectoryRow[] {
    const angle = findZeroAngle(inputs);
    const path = integrate(angle, inputs, inputs.maxRangeM + inputs.stepM);

    const crosswind = inputs.windSpeedMps * Math.sin(inputs.windAngleRad);
    const v0 = inputs.muzzleVelocityMps;

    const rows: TrajectoryRow[] = [];
    let pathIdx = 0;
    for (let r = 0; r <= inputs.maxRangeM + 1e-6; r += inputs.stepM) {
        while (pathIdx + 1 < path.length && path[pathIdx + 1].x < r) pathIdx++;
        const a = path[pathIdx];
        const b = path[Math.min(pathIdx + 1, path.length - 1)];
        const tFrac = b.x === a.x ? 0 : (r - a.x) / (b.x - a.x);
        const y = a.y + tFrac * (b.y - a.y);
        const vx = a.vx + tFrac * (b.vx - a.vx);
        const vy = a.vy + tFrac * (b.vy - a.vy);
        const t = a.t + tFrac * (b.t - a.t);

        const speed = Math.hypot(vx, vy);
        const drift = crosswind * (t - r / v0);

        const row: TrajectoryRow = {
            rangeM: r,
            elevationM: y,
            windageM: drift,
            timeS: t,
            velocityMps: speed,
        };
        if (inputs.bulletMassKg !== undefined) {
            row.energyJ = 0.5 * inputs.bulletMassKg * speed * speed;
        }
        rows.push(row);
    }
    return rows;
}

/** Convenience export: the conversion factor for BC from lb/in² to kg/m². */
export const BC_SI_PER_LBIN2 = 703.069;
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: all ballistics tests pass within tolerances. If a tolerance test fails marginally (within ~10% of the bound), reduce `DT` to `2.5e-4` and re-run; if it fails by more, recheck `BC_SI_PER_LBIN2` and the drag equation derivation. Do not loosen the tolerances — they are deliberately generous already.

- [ ] **Step 5: Commit**

```bash
git add src/ballistics.ts tests/ballistics.test.ts
git commit -m "feat(ballistics): add G1 point-mass trajectory solver"
```

---

## Task 6: Add `units` setting

**Files:**

- Modify: `src/config.ts`
- Modify: `src/main.ts`
- Modify: `src/settings.ts`

- [ ] **Step 1: Extend the settings interface in `src/config.ts`**

Replace the file contents with:

```ts
// config.ts - config models for the obsidian-ballistics plugin

import { LogLevel } from "obskit";

export type UnitSystem = "imperial" | "metric";

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
import { UnitSystem } from "./config";

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

## Task 7: Implement `renderer.ts`

**Files:**

- Create: `src/renderer.ts`
- Create: `tests/renderer.test.ts`

The renderer is given the user's unit system, the parsed (display-unit) inputs context if needed, and the solver's SI trajectory rows. It converts to display units and builds the table DOM.

Tests use jsdom-style assertions; since vitest defaults to node, we'll set `environment: "happy-dom"` for renderer tests via a per-file pragma, or use `happy-dom` from a small helper. Simplest path: install `happy-dom` and switch the vitest environment globally — DOM tests are small here.

- [ ] **Step 1: Install happy-dom**

Run: `npm install --save-dev happy-dom@^15.0.0`

- [ ] **Step 2: Switch vitest to happy-dom in `vitest.config.ts`**

Replace `vitest.config.ts` contents with:

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
    test: {
        include: ["tests/**/*.test.ts"],
        environment: "happy-dom",
    },
});
```

Run: `npm test`
Expected: all previously-passing tests still pass under happy-dom.

- [ ] **Step 3: Write failing tests at `tests/renderer.test.ts`**

```ts
import { describe, it, expect, beforeEach } from "vitest";
import { renderTrajectoryTable, renderError } from "../src/renderer";
import type { TrajectoryRow } from "../src/ballistics";

function makeRow(over: Partial<TrajectoryRow> = {}): TrajectoryRow {
    return {
        rangeM: 0,
        elevationM: 0,
        windageM: 0,
        timeS: 0,
        velocityMps: 100,
        ...over,
    };
}

describe("renderTrajectoryTable", () => {
    let container: HTMLElement;
    beforeEach(() => {
        container = document.createElement("div");
    });

    it("renders a table with imperial column headers", () => {
        const rows: TrajectoryRow[] = [makeRow()];
        renderTrajectoryTable(container, rows, "imperial");
        const headerCells = container.querySelectorAll("thead td");
        const headerText = Array.from(headerCells).map((c) => c.textContent);
        expect(headerText).toContain("Range");
        expect(headerText.some((t) => t?.includes("yd"))).toBe(true);
        expect(headerText.some((t) => t?.includes("in"))).toBe(true);
        expect(headerText.some((t) => t?.includes("MOA"))).toBe(true);
        expect(headerText.some((t) => t?.includes("MIL"))).toBe(true);
        expect(headerText.some((t) => t?.includes("ft/s"))).toBe(true);
    });

    it("renders a table with metric column headers", () => {
        const rows: TrajectoryRow[] = [makeRow()];
        renderTrajectoryTable(container, rows, "metric");
        const headerText = Array.from(container.querySelectorAll("thead td")).map(
            (c) => c.textContent ?? ""
        );
        expect(headerText.some((t) => t.includes("m"))).toBe(true);
        expect(headerText.some((t) => t.includes("cm"))).toBe(true);
        expect(headerText.some((t) => t.includes("m/s"))).toBe(true);
    });

    it("renders one tbody row per trajectory row", () => {
        const rows: TrajectoryRow[] = [makeRow(), makeRow({ rangeM: 91.44 })];
        renderTrajectoryTable(container, rows, "imperial");
        expect(container.querySelectorAll("tbody tr").length).toBe(2);
    });

    it("renders MOA and MIL columns for elevation and windage", () => {
        // Elevation of -1 in at 100 yd → -1 MOA approx, -0.291 MIL approx.
        const rows: TrajectoryRow[] = [
            makeRow({
                rangeM: 91.44,
                elevationM: -0.0254, // 1 in below LOS
                windageM: 0.0254, // 1 in right
            }),
        ];
        renderTrajectoryTable(container, rows, "imperial");
        const cells = Array.from(container.querySelectorAll("tbody tr td")).map(
            (c) => c.textContent ?? ""
        );
        // Order: range, elev(in), elev(MOA), elev(MIL), wind(in), wind(MOA), wind(MIL), time, energy, vel
        expect(parseFloat(cells[2])).toBeCloseTo(-0.95, 1); // -1 in / (100 yd × 1.047) × 100 ≈ -0.955 MOA
        expect(parseFloat(cells[3])).toBeCloseTo(-0.28, 1); // -1 in / (100 yd × 0.036) ≈ -0.278 MIL
    });

    it("displays an em-dash for energy when energyJ is undefined", () => {
        const rows: TrajectoryRow[] = [makeRow()];
        renderTrajectoryTable(container, rows, "imperial");
        const cells = Array.from(container.querySelectorAll("tbody tr td")).map(
            (c) => c.textContent ?? ""
        );
        // Energy is at index 8 (0-indexed).
        expect(cells[8]).toBe("—");
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

Note on MOA/MIL conventions used in the test:

- 1 MOA at 100 yd ≈ 1.047 in. Conversion: MOA = inches × 100 / (range_yd × 1.047).
- 1 MIL at 100 yd ≈ 3.6 in. Conversion: MIL = inches / (range_yd × 0.036).
- For metric: 1 MOA ≈ 2.908 cm at 100 m; 1 MIL = 10 cm at 100 m.

The renderer implements these using `range > 0` guards (returns `0` for the row at range 0).

- [ ] **Step 4: Run tests to verify they fail**

Run: `npm test`
Expected: failures from missing `../src/renderer`.

- [ ] **Step 5: Implement `src/renderer.ts`**

```ts
// renderer.ts — builds the trajectory table and error-box DOM.

import type { TrajectoryRow } from "./ballistics";
import type { UnitSystem } from "./config";
import {
    labels,
    metersToYards,
    metersToInches,
    metersToCentimeters,
    mpsToFps,
    joulesToFtLbf,
} from "./units";

const ENERGY_EMPTY = "—";

export function renderTrajectoryTable(
    container: HTMLElement,
    rows: TrajectoryRow[],
    system: UnitSystem
): void {
    const lbl = labels(system);

    const table = container.ownerDocument.createElement("table");
    table.classList.add("ballistics-table");

    const thead = container.ownerDocument.createElement("thead");
    const headTopText = [
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
    ];
    const headUnitText = [
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
    ];
    appendHeaderRow(thead, headTopText);
    appendHeaderRow(thead, headUnitText);
    table.appendChild(thead);

    const tbody = container.ownerDocument.createElement("tbody");
    for (const row of rows) {
        tbody.appendChild(formatRow(container.ownerDocument, row, system));
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

function formatRow(doc: Document, row: TrajectoryRow, system: UnitSystem): HTMLTableRowElement {
    const tr = doc.createElement("tr");

    const rangeDisplay = system === "imperial" ? metersToYards(row.rangeM) : row.rangeM;
    const elevLinear =
        system === "imperial"
            ? metersToInches(row.elevationM)
            : metersToCentimeters(row.elevationM);
    const windLinear =
        system === "imperial" ? metersToInches(row.windageM) : metersToCentimeters(row.windageM);
    const velDisplay = system === "imperial" ? mpsToFps(row.velocityMps) : row.velocityMps;
    const energyDisplay =
        row.energyJ === undefined
            ? undefined
            : system === "imperial"
              ? joulesToFtLbf(row.energyJ)
              : row.energyJ;

    const elevMoa = angularMoa(elevLinear, rangeDisplay, system);
    const elevMil = angularMil(elevLinear, rangeDisplay, system);
    const windMoa = angularMoa(windLinear, rangeDisplay, system);
    const windMil = angularMil(windLinear, rangeDisplay, system);

    const cells = [
        fmt(rangeDisplay, 0),
        fmt(elevLinear, 2),
        fmt(elevMoa, 2),
        fmt(elevMil, 2),
        fmt(windLinear, 2),
        fmt(windMoa, 2),
        fmt(windMil, 2),
        fmt(row.timeS, 3),
        energyDisplay === undefined ? ENERGY_EMPTY : fmt(energyDisplay, 0),
        fmt(velDisplay, 0),
    ];

    for (const text of cells) {
        const td = doc.createElement("td");
        td.textContent = text;
        tr.appendChild(td);
    }
    return tr;
}

function fmt(n: number, digits: number): string {
    return n.toFixed(digits);
}

/**
 * Convert a linear offset to MOA given a range, in either unit system.
 * 1 MOA = 1.047 in @ 100 yd (imperial) or 2.908 cm @ 100 m (metric).
 * Returns 0 at range 0.
 */
function angularMoa(linear: number, range: number, system: UnitSystem): number {
    if (range <= 0) return 0;
    if (system === "imperial") {
        return (linear * 100) / (range * 1.047);
    }
    return (linear * 100) / (range * 2.908);
}

/**
 * Convert a linear offset to MIL. 1 MIL = range / 1000 (so 100 m at 1 MIL = 10 cm).
 * Returns 0 at range 0.
 */
function angularMil(linear: number, range: number, system: UnitSystem): number {
    if (range <= 0) return 0;
    if (system === "imperial") {
        // 1 MIL at 100 yd = 3.6 in.
        return linear / (range * 0.036);
    }
    // metric: 1 MIL at 100 m = 10 cm.
    return linear / (range * 0.1);
}
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npm test`
Expected: all renderer tests pass.

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json vitest.config.ts src/renderer.ts tests/renderer.test.ts
git commit -m "feat(renderer): render trajectory table and error box"
```

---

## Task 8: Wire the code-block processor in `main.ts`

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
import { solveTrajectory, BC_SI_PER_LBIN2, type SolverInputs } from "./ballistics";
import { renderTrajectoryTable, renderError } from "./renderer";
import {
    yardsToMeters,
    inchesToMeters,
    centimetersToMeters,
    fpsToMps,
    mphToMps,
    grainsToKg,
    gramsToKg,
} from "./units";

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
        const inputs = parsed.value;
        const system = this.settings.units;

        const solverInputs: SolverInputs = {
            bcSi: inputs.bc * BC_SI_PER_LBIN2,
            muzzleVelocityMps:
                system === "imperial" ? fpsToMps(inputs.muzzleVelocity) : inputs.muzzleVelocity,
            sightHeightM:
                system === "imperial"
                    ? inchesToMeters(inputs.sightHeight)
                    : centimetersToMeters(inputs.sightHeight),
            zeroRangeM: system === "imperial" ? yardsToMeters(inputs.zeroRange) : inputs.zeroRange,
            maxRangeM: system === "imperial" ? yardsToMeters(inputs.maxRange) : inputs.maxRange,
            stepM: system === "imperial" ? yardsToMeters(inputs.step) : inputs.step,
            windSpeedMps: system === "imperial" ? mphToMps(inputs.windSpeed) : inputs.windSpeed,
            windAngleRad: (inputs.windAngle * Math.PI) / 180,
            bulletMassKg:
                inputs.bulletWeight === undefined
                    ? undefined
                    : system === "imperial"
                      ? grainsToKg(inputs.bulletWeight)
                      : gramsToKg(inputs.bulletWeight),
        };

        try {
            const rows = solveTrajectory(solverInputs);
            renderTrajectoryTable(el, rows, system);
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

## Task 9: Theme-aware styles

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

## Task 10: Documentation and manual verification

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
| `bulletWeight`   | Optional — required for energy column      | grains   | grams  |

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

After Task 10, the v1 ballistics codefence is complete: pure-math solver with numerical tests against a reference scenario, parser with error coverage, theme-aware renderer, plugin setting for units, end-to-end wiring, and user-facing docs.
