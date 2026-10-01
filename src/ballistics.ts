// ballistics.ts — adapter over js-ballistics. Converts ParsedInputs into the
// library's typed inputs, runs the RK4 solver, and projects each TrajectoryData
// row down to the simple numeric TrajectoryRow consumed by the renderer.
//
// The solver is a WASM module; Calculator initializes it on first use, which
// is why solving is async.

import {
    Calculator,
    IntegrationMethod,
    DragModel,
    Ammo,
    Weapon,
    Shot,
    Atmo,
    Wind,
    UNew,
    Unit,
} from "js-ballistics";
import type { BallisticsInputs } from "./parser";
import type { UnitSystem } from "./units";

// Hardcoded for v1; configurable bulletDiameter is a v2 addition.
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

export interface RangeWindow {
    /** Maximum range to compute, in display units (yd or m). */
    maxRange: number;
    /** Step between rows, in display units (yd or m). */
    rangeStep: number;
    /** Optional minimum range; rows below this are dropped. */
    minRange?: number;
}

export async function solveTrajectory(
    inputs: BallisticsInputs,
    system: UnitSystem,
    window: RangeWindow
): Promise<TrajectoryRow[]> {
    const dm = new DragModel({
        bc: inputs.bc,
        dragTable: "G1",
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
                ? UNew.FPS(inputs.initialVelocity)
                : UNew.MPS(inputs.initialVelocity),
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
        atmo: buildAtmo(inputs, system),
        winds,
    });

    const calc = new Calculator({ method: IntegrationMethod.RK4 });
    const zeroDistance =
        system === "imperial" ? UNew.Yard(inputs.zeroRange) : UNew.Meter(inputs.zeroRange);
    await calc.setWeaponZero(shot, zeroDistance);

    if (inputs.zeroOffset !== 0) {
        const linearUnit = system === "imperial" ? Unit.Inch : Unit.Centimeter;
        const offsetLinear = inputs.zeroOffset;
        const zeroLinear = zeroDistance.In(linearUnit);
        const deltaRad = Math.atan(offsetLinear / zeroLinear);
        const currentRad = weapon.zeroElevation.In(Unit.Radian);
        weapon.zeroElevation = UNew.Radian(currentRad + deltaRad);
    }

    const trajectoryRange =
        system === "imperial" ? UNew.Yard(window.maxRange) : UNew.Meter(window.maxRange);
    const trajectoryStep =
        system === "imperial" ? UNew.Yard(window.rangeStep) : UNew.Meter(window.rangeStep);

    const result = await calc.fire({
        shot,
        trajectoryRange,
        trajectoryStep,
    });

    const distanceUnit = system === "imperial" ? Unit.Yard : Unit.Meter;
    const linearUnit = system === "imperial" ? Unit.Inch : Unit.Centimeter;
    const velocityUnit = system === "imperial" ? Unit.FPS : Unit.MPS;
    const energyUnit = system === "imperial" ? Unit.FootPound : Unit.Joule;

    const rows: TrajectoryRow[] = result.trajectory.map((td) => ({
        range: td.distance.In(distanceUnit),
        elevation: td.slantHeight.In(linearUnit),
        elevationMoa: td.dropAngle.In(Unit.MOA),
        elevationMil: td.dropAngle.In(Unit.MIL),
        windage: td.windage.In(linearUnit),
        windageMoa: td.windageAngle.In(Unit.MOA),
        windageMil: td.windageAngle.In(Unit.MIL),
        time: td.time,
        energy: td.energy.In(energyUnit),
        velocity: td.velocity.In(velocityUnit),
    }));

    if (window.minRange !== undefined && window.minRange > 0) {
        const min = window.minRange;
        return rows.filter((r) => r.range >= min - 0.5);
    }
    return rows;
}

function buildAtmo(inputs: BallisticsInputs, system: UnitSystem): Atmo {
    const hasAny =
        inputs.altitude !== undefined ||
        inputs.pressure !== undefined ||
        inputs.temperature !== undefined ||
        inputs.humidity !== undefined;
    if (!hasAny) return Atmo.icao();

    const altitude =
        inputs.altitude !== undefined
            ? system === "imperial"
                ? UNew.Foot(inputs.altitude)
                : UNew.Meter(inputs.altitude)
            : undefined;
    const pressure =
        inputs.pressure !== undefined
            ? system === "imperial"
                ? UNew.InHg(inputs.pressure)
                : UNew.hPa(inputs.pressure)
            : undefined;
    const temperature =
        inputs.temperature !== undefined
            ? system === "imperial"
                ? UNew.Fahrenheit(inputs.temperature)
                : UNew.Celsius(inputs.temperature)
            : undefined;
    const humidity = inputs.humidity !== undefined ? inputs.humidity / 100 : 0;

    return new Atmo({ altitude, pressure, temperature, humidity });
}
