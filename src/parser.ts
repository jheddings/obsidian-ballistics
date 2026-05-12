// parser.ts — parses a `ballistics` codefence body into typed inputs.

export interface ParsedInputs {
    bc: number;
    initialVelocity: number;
    sightHeight: number;
    zeroRange: number;
    maxRange: number;
    rangeStep: number;
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
    "initialVelocity",
    "sightHeight",
    "zeroRange",
    "maxRange",
    "rangeStep",
    "windSpeed",
    "windAngle",
    "bulletWeight",
] as const;

const KEY_ALIASES: Record<string, string> = {
    coeff: "bc",
    coefficient: "bc",
    muzzleVelocity: "initialVelocity",
};

const ALL_KEYS: ReadonlySet<string> = new Set([...REQUIRED_KEYS, ...Object.keys(KEY_ALIASES)]);

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
        const rawKey = m[1];
        const valueText = m[2].trim();

        if (!ALL_KEYS.has(rawKey)) {
            return err(`unknown key "${rawKey}" on line ${i + 1}`);
        }

        const key = KEY_ALIASES[rawKey] ?? rawKey;

        const num = Number(valueText);
        if (!Number.isFinite(num)) {
            return err(`"${rawKey}" must be a number (got "${valueText}")`);
        }
        fields[key] = num;
    }

    for (const k of REQUIRED_KEYS) {
        if (!(k in fields)) return err(`missing required field "${k}"`);
    }

    const value: ParsedInputs = {
        bc: fields.bc,
        initialVelocity: fields.initialVelocity,
        sightHeight: fields.sightHeight,
        zeroRange: fields.zeroRange,
        maxRange: fields.maxRange,
        rangeStep: fields.rangeStep,
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
    if (i.initialVelocity <= 0)
        return `"initialVelocity" must be positive (got ${i.initialVelocity})`;
    if (i.sightHeight < 0) return `"sightHeight" must be non-negative (got ${i.sightHeight})`;
    if (i.zeroRange <= 0) return `"zeroRange" must be positive (got ${i.zeroRange})`;
    if (i.maxRange <= 0) return `"maxRange" must be positive (got ${i.maxRange})`;
    if (i.maxRange < i.zeroRange)
        return `"maxRange" (${i.maxRange}) must be at least "zeroRange" (${i.zeroRange})`;
    if (i.rangeStep <= 0) return `"rangeStep" must be positive (got ${i.rangeStep})`;
    if (i.rangeStep > i.maxRange)
        return `"rangeStep" (${i.rangeStep}) must not exceed "maxRange" (${i.maxRange})`;
    if (i.windSpeed < 0) return `"windSpeed" must be non-negative (got ${i.windSpeed})`;
    if (i.windAngle < 0 || i.windAngle > 360)
        return `"windAngle" must be between 0 and 360 (got ${i.windAngle})`;
    if (i.bulletWeight <= 0) return `"bulletWeight" must be positive (got ${i.bulletWeight})`;
    return null;
}

function err(message: string): ParseResult {
    return { ok: false, error: { message } };
}
