# Ballistics Codefence — v1 Design

## Goal

Embed computed ballistics trajectory tables in Obsidian notes via a fenced
code block. The note is the source of truth: inputs live in the codefence,
the plugin computes and renders the trajectory inline.

This is a reference tool for notes, not a replacement for a full ballistics
calculator. Keep the schema small and the output static.

## User-facing surface

A markdown code block with the language tag `ballistics`:

````
```ballistics
bc: 0.485
muzzleVelocity: 2700
sightHeight: 1.5
zeroRange: 100
maxRange: 1000
step: 50
windSpeed: 10
windAngle: 90
```
````

The block renders as an HTML table beneath the codefence in both reading
mode and live preview. The codefence text itself remains the source.

### Inputs (v1)

All fields required unless noted. Units follow the plugin's `units` setting
(imperial or metric).

| Key              | Meaning                                                          | Imperial | Metric |
| ---------------- | ---------------------------------------------------------------- | -------- | ------ |
| `bc`             | G1 ballistic coefficient (unitless)                              | —        | —      |
| `muzzleVelocity` | Velocity at the muzzle                                           | ft/s     | m/s    |
| `sightHeight`    | Sight axis above bore                                            | in       | cm     |
| `zeroRange`      | Range at which the rifle is zeroed                               | yd       | m      |
| `maxRange`       | Furthest range in the table                                      | yd       | m      |
| `step`           | Row interval                                                     | yd       | m      |
| `windSpeed`      | Wind speed                                                       | mph      | m/s    |
| `windAngle`      | Wind clock angle, 0–360°, 90 = 3 o'clock (full value from right) | deg      | deg    |

Atmospherics are fixed at ICAO standard sea-level conditions for v1
(59°F / 15°C, 29.92 inHg / 1013.25 hPa, 0% humidity, no altitude). Drag
model is G1 only.

### Output table

Columns (always rendered, in this order):

1. Range — yd or m
2. Elevation — in or cm
3. Elevation — MOA
4. Elevation — MIL
5. Windage — in or cm
6. Windage — MOA
7. Windage — MIL
8. Time — s
9. Energy — ft·lbf or J (requires bullet weight; see note below)
10. Velocity — ft/s or m/s

**Energy note:** Energy requires bullet mass. v1 will compute energy if a
`bulletWeight` input is provided (grains imperial / grams metric). If
omitted, the Energy column shows `—`. This keeps the minimal input set
truly minimal while not losing the column.

Final input set including this addition:

```
bc, muzzleVelocity, sightHeight, zeroRange, maxRange, step,
windSpeed, windAngle, bulletWeight (optional)
```

### Errors

Parse errors (unknown keys, missing required fields, non-numeric values)
and calculation errors (e.g., zero range unreachable with given inputs)
render as an inline error box inside the rendered region — same place the
table would have gone. No toasts. The error names the offending field
where possible.

## Plugin settings

Added to `BallisticsPluginSettings`:

- `units: "imperial" | "metric"` — default `"imperial"`. Controls input
  interpretation and output column labels.

Existing `logLevel` is unchanged.

## Architecture

New single-responsibility modules under `src/`:

- **`parser.ts`** — Parses codefence body into a typed `BallisticsInput`
  object. Lenient YAML-style `key: value` parsing (no full YAML
  dependency; we own the schema and it's all scalars). Returns either
  parsed inputs or a structured `ParseError`. Validates required fields
  and numeric ranges.
- **`ballistics.ts`** — Pure physics. Exports:
    - `g1Drag(mach: number): number` — standard G1 drag function table
      interpolation.
    - `solveTrajectory(inputs, opts): TrajectoryRow[]` — point-mass solver
      that:
        1. Iterates to find the launch angle producing the requested zero.
        2. Integrates trajectory with RK4 at a fixed small `dt`.
        3. Samples the trajectory at each `step` interval through `maxRange`.
        4. Computes wind drift via crosswind component and lag time
           (`drift = crosswind * (t - x/v0)` — standard point-mass approx).
           No I/O, no DOM, no Obsidian imports. Fully unit-testable.
- **`units.ts`** — Conversion helpers and label strings keyed by the
  `units` setting. Internally the solver works in a single consistent
  set (SI); `units.ts` converts inputs in and outputs out.
- **`renderer.ts`** — Takes `TrajectoryRow[]` plus a `units` mode and
  builds the HTML table element. Uses CSS classes (`.ballistics-table`,
  `.ballistics-error`) — no inline styles, no hardcoded colors.
- **`main.ts`** — Registers the markdown code block processor for
  `ballistics`. Wires parser → solver → renderer; on any error, renders
  the error box instead.
- **`styles.css`** — Table and error-box styling using Obsidian CSS
  variables (`--background-primary`, `--background-modifier-border`,
  `--text-normal`, `--text-error`).

Module dependency graph (all one-way):

```
main.ts
  ├── parser.ts
  ├── ballistics.ts ── units.ts
  ├── renderer.ts ── units.ts
  └── settings.ts ── config.ts
```

`ballistics.ts` has no dependencies on `obsidian` or DOM. `renderer.ts`
depends on DOM only (no Obsidian APIs needed — code-block processors
get a plain `HTMLElement` to populate).

## Physics specifics

- **Drag model:** G1, using the standard Mach-vs-Cd table interpolated
  linearly. Reference: Pejsa / McCoy / public G1 table (used by JBM,
  Hornady, shooterscalculator).
- **Speed of sound:** ICAO standard 1116.45 ft/s at 59°F.
- **Air density:** ICAO standard sea level, 1.225 kg/m³.
- **Integrator:** RK4 with `dt = 0.0005 s` (tunable constant in module).
  Numerical accuracy goal: within ~0.1 MOA of shooterscalculator at
  1000 yd for representative .308/6.5CM-class inputs.
- **Zero-finding:** Bisection on launch angle to drive bullet height
  through 0 at `zeroRange`. Bracketed by `[-5°, +5°]` which covers any
  realistic rifle zero.
- **Sight height effect:** Bullet launches `sightHeight` below the line
  of sight; trajectory is reported relative to line of sight.
- **Wind drift:** Crosswind component `windSpeed * sin(windAngle)`;
  drift = `crosswind * (t - x / muzzleVelocity)`.

## Testing

The math is the part most likely to be wrong silently. Adding `vitest`
with a small suite is worth the ceremony:

- Parser: valid input → expected object; each error type → expected
  `ParseError`.
- Solver: a handful of reference scenarios (e.g., the user-supplied
  shooterscalculator example) checked to ±0.1 MOA tolerance.
- Units: round-trip conversion equality.

No DOM/Obsidian mocks needed — the solver and parser are pure.

A new `npm test` script and a `just test` recipe will be added.

## Out of scope (v1, additive later)

- Trajectory chart / sparkline
- Multiple loads compared in one block
- Interactive sliders or live tweaking from the rendered view
- Configurable atmospherics (temp, pressure, humidity, altitude)
- Drag models beyond G1 (G7, custom drag curves)
- Shot angle (uphill/downhill)
- Column picker / column highlighting based on preferred angular unit
- A title/load-name field (use a markdown header above the block)

## Open assumptions

- Parsing is a thin custom `key: value` reader rather than a YAML lib.
  This avoids a dependency and keeps the schema explicit. If we later
  add nested structure, revisit.
- Energy column shows `—` when `bulletWeight` is absent rather than
  hiding the column. Keeps column count stable.
