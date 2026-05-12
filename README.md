# obsidian-ballistics

Embed ballistics data in Obsidian notes.

## Development

```bash
npm install    # install dependencies
npm run dev    # watch mode
npm run build  # production build
```

Or, using `just`:

```bash
just           # setup + preflight
just tidy      # auto-format and lint-fix
just check     # format + lint checks
just preflight # build + check
```

## Usage

Embed a ballistics table in any note with a `ballistics-table` code block:

```ballistics-table
bc: 0.475
initialVelocity: 2700
sightHeight: 1.5
zeroRange: 100
maxRange: 1000
rangeStep: 50
windSpeed: 10
windAngle: 90
bulletWeight: 168
```

### Inputs

| Key               | Description                                | Imperial | Metric |
| ----------------- | ------------------------------------------ | -------- | ------ |
| `bc`              | G1 ballistic coefficient                   | —        | —      |
| `initialVelocity` | Velocity at the muzzle                     | ft/s     | m/s    |
| `sightHeight`     | Sight axis height above bore               | in       | cm     |
| `zeroRange`       | Range at which the rifle is zeroed         | yd       | m      |
| `maxRange`        | Furthest range in the table                | yd       | m      |
| `rangeStep`       | Row interval                               | yd       | m      |
| `windSpeed`       | Wind speed                                 | mph      | m/s    |
| `windAngle`       | Clock angle 0–360° (90° = full from right) | deg      | deg    |
| `bulletWeight`    | Bullet weight                              | grains   | grams  |

`bc` may also be written as `coeff` or `coefficient`. `initialVelocity` may also be written as `muzzleVelocity`. Unit system is set globally in the plugin settings.
