# obsidian-ballistics

Embed ballistics trajectory tables and charts in Obsidian notes.

The plugin registers two code-fence processors, `ballistics-table` and `ballistics-chart`, that share the same inputs but render the trajectory differently. Inputs may live inline in the fence, in the note's frontmatter, or in a shared note referenced via `use:`.

## Trajectory table

````markdown
```ballistics-table
bc: 0.475
initialVelocity: 2700
sightHeight: 1.5
zeroRange: 100
bulletWeight: 168
windSpeed: 10
windAngle: 90
maxRange: 1000
rangeStep: 50
```
````

The table shows range, drop/elevation, velocity, and energy for each step. A windage column appears whenever `windSpeed > 0`. If `minEnergy` or `maxEnergy` is set, rows crossing those thresholds are marked.

## Trajectory chart

````markdown
```ballistics-chart
bc: 0.475
initialVelocity: 2700
sightHeight: 1.5
zeroRange: 100
bulletWeight: 168
maxRange: 1000
rangeStep: 50
minEnergy: 1000
```
````

The chart plots elevation vs. range as an inline SVG that scales to the note width. Energy thresholds (`minEnergy`, `maxEnergy`) are drawn as bound markers on the curve when the trajectory crosses them.

## Inputs

Inputs describe the load, rifle, and conditions being modeled.

### Required

| Key               | Description                        | Imperial | Metric |
| ----------------- | ---------------------------------- | -------- | ------ |
| `bc`              | G1 ballistic coefficient           | —        | —      |
| `initialVelocity` | Velocity at the muzzle             | ft/s     | m/s    |
| `sightHeight`     | Sight axis height above bore       | in       | cm     |
| `zeroRange`       | Range at which the rifle is zeroed | yd       | m      |
| `bulletWeight`    | Bullet weight                      | grains   | grams  |

### Optional — wind

| Key         | Description                                | Imperial | Metric | Default |
| ----------- | ------------------------------------------ | -------- | ------ | ------- |
| `windSpeed` | Wind speed                                 | mph      | m/s    | 0       |
| `windAngle` | Clock angle 0–360° (90° = full from right) | deg      | deg    | 0       |

### Optional — atmosphere

Omitted atmospheric inputs fall back to ICAO standard conditions.

| Key           | Description               | Imperial | Metric |
| ------------- | ------------------------- | -------- | ------ |
| `altitude`    | Altitude above sea level  | ft       | m      |
| `pressure`    | Barometric pressure       | inHg     | hPa    |
| `temperature` | Air temperature           | °F       | °C     |
| `humidity`    | Relative humidity (0–100) | %        | %      |

### Aliases

- `bc` may be written as `coeff` or `coefficient`.
- `initialVelocity` may be written as `muzzleVelocity`.

## View options

View options control how a single fence is rendered. They live **only** in the fence body — never in frontmatter, never inherited via `use:`. Both `ballistics-table` and `ballistics-chart` accept the same set:

| Key         | Description                                       | Default |
| ----------- | ------------------------------------------------- | ------- |
| `minRange`  | Smallest range to include                         | 0       |
| `maxRange`  | Largest range to include                          | 1000    |
| `rangeStep` | Distance between rows / sample points             | 100     |
| `minEnergy` | Threshold marked when energy drops below          | —       |
| `maxEnergy` | Threshold marked when energy first drops below it | —       |

`rangeStep` must not exceed `maxRange`; `minRange` must be less than `maxRange`; `maxEnergy` must be greater than `minEnergy`.

## Frontmatter inputs

Any input can be set in the note's frontmatter using the `ballistics-` prefix and kebab-case:

```yaml
---
ballistics-bc: 0.475
ballistics-initial-velocity: 2700
ballistics-sight-height: 1.5
ballistics-zero-range: 100
ballistics-bullet-weight: 168
---
```

A fence in that note can then omit those keys and only declare view options or per-fence overrides. View options (`maxRange`, `rangeStep`, etc.) are rejected in frontmatter.

## Sharing inputs across notes

A fence can pull inputs from another note using `use: [[note-name]]`:

````markdown
```ballistics-table
use: [[loads/308-168gr-match]]
maxRange: 800
rangeStep: 50
```
````

The referenced note's frontmatter (using the same `ballistics-` prefix) supplies the inputs. Only one `use:` reference is allowed per fence.

### Precedence

When the same input is set in multiple places, the highest-precedence value wins:

1. Inline in the fence body (highest)
2. The current note's frontmatter
3. The note referenced by `use:` (lowest)

## Settings

- **Unit system** — imperial or metric. Applied globally; all numeric inputs and rendered columns use this system.
- **Log level** — controls plugin log verbosity in the developer console.

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md) for development setup and tooling.
