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

**Energy note:** Energy requires bullet mass, so `bulletWeight` is part
of the required input set (grains imperial / grams metric). The js-ballistics
library also requires a non-zero weight to construct its drag model.

Final required input set:

```
bc, muzzleVelocity, sightHeight, zeroRange, maxRange, step,
windSpeed, windAngle, bulletWeight
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

The trajectory math is delegated to [`js-ballistics`](https://www.npmjs.com/package/js-ballistics)
(o-murphy's port of py-ballisticscalc). v1 uses its RK4 engine, G1 drag
table, and ICAO standard atmosphere. Owning the math ourselves was the
plan's biggest risk surface; delegating removes a large class of subtle
integration/scaling bugs and gives us a path to G7 / atmospherics / shot
angle / Coriolis later by enabling features rather than implementing them.

New single-responsibility modules under `src/`:

- **`parser.ts`** — Parses codefence body into typed `ParsedInputs`.
  Lenient `key: value` parsing (no YAML dependency; flat scalar schema).
  Returns either parsed inputs or a structured `ParseError`. Validates
  required fields and numeric ranges.
- **`ballistics.ts`** — Thin adapter over `js-ballistics`. Maps
  `ParsedInputs + UnitSystem` to the library's `Weapon` / `Ammo` /
  `DragModel` / `Shot` / `Wind` / `Atmo` types using the correct `UNew.*`
  constructors per unit system; runs the RK4 engine; extracts each
  `TrajectoryData` into a flat `TrajectoryRow` in display units (range,
  elevation, elevationMoa, elevationMil, windage, windageMoa, windageMil,
  time, energy, velocity). No DOM, no Obsidian.
- **`units.ts`** — `UnitSystem` type alias and column-label strings.
  All numeric unit conversion is handled by the library.
- **`renderer.ts`** — Takes `TrajectoryRow[]` plus a `UnitSystem` and
  builds the HTML table element. Uses CSS classes (`.ballistics-table`,
  `.ballistics-error`) — no inline styles, no hardcoded colors.
- **`main.ts`** — Registers the markdown code block processor for
  `ballistics`. Wires parser → adapter → renderer; on any error, renders
  the error box instead.
- **`styles.css`** — Table and error-box styling using Obsidian CSS
  variables.

Module dependency graph (all one-way):

```
main.ts
  ├── parser.ts
  ├── ballistics.ts ── (js-ballistics)
  ├── renderer.ts ── units.ts
  └── settings.ts ── config.ts ── units.ts
```

`ballistics.ts` has no dependencies on `obsidian` or the DOM.
`renderer.ts` depends on DOM only.

## Physics specifics

- **Drag model:** G1 (built-in to js-ballistics).
- **Atmosphere:** ICAO standard sea level (`Atmo.icao()`).
- **Integrator:** js-ballistics' RK4 engine (`RK4IntegrationEngine`).
- **Zero-finding:** `calc.setWeaponZero(shot, zeroDistance)` (library).
- **Bullet diameter:** Hardcoded to 0.308 in inside the adapter. Diameter
  affects sectional density / form factor in the library, but its effect
  on trajectory is negligible once BC is given. Smoke-test verified
  against the user-supplied shooterscalculator example to within ~2%.
  A configurable `bulletDiameter` is a v2 addition.
- **Wind drift:** Provided by the library's multi-wind model (we pass a
  single `Wind` entry with `velocity` and `directionFrom`).

## Testing

vitest with a small suite focused on the layers we own:

- Parser: valid input → expected object; each error type → expected
  `ParseError`.
- Adapter: the user-supplied shooterscalculator example checked with
  generous tolerances (±10 in or ±5% on drop at 1000 yd, ±5 in or ±10%
  on wind, ±50 fps on velocity) to absorb atmospheric-model differences
  between the two implementations.
- Renderer: column order, headers, classes, basic formatting under
  happy-dom.

A new `npm test` script and `just test` recipe will be added.

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
- Bullet diameter is hardcoded to 0.308 in v1; promote to an optional
  input in v2 if anyone hits a noticeable discrepancy on small-bore or
  large-bore loads.
- `load:` is reserved for a future linked-load-profile feature
  (`load: [[loads/308-hornady]]`). The parser will reject it for now;
  this prevents collisions with the future schema.
