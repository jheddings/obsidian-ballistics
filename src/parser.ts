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
    altitude?: number;
    pressure?: number;
    temperature?: number;
    humidity?: number;
    minEnergy?: number;
    maxEnergy?: number;
}

export interface ParseError {
    message: string;
}

export type ParseResult = { ok: true; value: ParsedInputs } | { ok: false; error: ParseError };

// Inputs from a surrounding context (e.g. the note's frontmatter).
// Resolution: inline body > current-note frontmatter.
export interface ParseContext {
    frontmatter?: Record<string, unknown> | null;
}

const REQUIRED_KEYS = [
    "bc",
    "initialVelocity",
    "sightHeight",
    "zeroRange",
    "maxRange",
    "rangeStep",
    "bulletWeight",
] as const;

const OPTIONAL_KEYS = [
    "windSpeed",
    "windAngle",
    "altitude",
    "pressure",
    "temperature",
    "humidity",
    "minEnergy",
    "maxEnergy",
] as const;

const DEFAULTS: Record<string, number> = {
    windSpeed: 0,
    windAngle: 0,
};

const KEY_ALIASES: Record<string, string> = {
    coeff: "bc",
    coefficient: "bc",
    muzzleVelocity: "initialVelocity",
};

const ALL_KEYS: ReadonlySet<string> = new Set([
    ...REQUIRED_KEYS,
    ...OPTIONAL_KEYS,
    ...Object.keys(KEY_ALIASES),
]);

const FRONTMATTER_PREFIX = "ballistics-";

export function parseBallisticsBlock(source: string, ctx: ParseContext = {}): ParseResult {
    const body = parseBody(source);
    if (!body.ok) return body;

    const localFm = extractFrontmatterFields(ctx.frontmatter ?? null);
    if (!localFm.ok) return localFm;

    const fields: Record<string, number> = {
        ...localFm.value,
        ...body.value.fields,
    };

    for (const k of REQUIRED_KEYS) {
        if (!(k in fields)) {
            return err(
                `missing required field "${k}" — set it inline or in this note's frontmatter as "${FRONTMATTER_PREFIX}${toKebab(k)}"`
            );
        }
    }

    const value: ParsedInputs = {
        bc: fields.bc,
        initialVelocity: fields.initialVelocity,
        sightHeight: fields.sightHeight,
        zeroRange: fields.zeroRange,
        maxRange: fields.maxRange,
        rangeStep: fields.rangeStep,
        windSpeed: fields.windSpeed ?? DEFAULTS.windSpeed,
        windAngle: fields.windAngle ?? DEFAULTS.windAngle,
        bulletWeight: fields.bulletWeight,
        altitude: "altitude" in fields ? fields.altitude : undefined,
        pressure: "pressure" in fields ? fields.pressure : undefined,
        temperature: "temperature" in fields ? fields.temperature : undefined,
        humidity: "humidity" in fields ? fields.humidity : undefined,
        minEnergy: "minEnergy" in fields ? fields.minEnergy : undefined,
        maxEnergy: "maxEnergy" in fields ? fields.maxEnergy : undefined,
    };

    const v = validate(value);
    if (v) return err(v);

    return { ok: true, value };
}

interface BodyParse {
    fields: Record<string, number>;
}

function parseBody(
    source: string
): { ok: true; value: BodyParse } | { ok: false; error: ParseError } {
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

    return { ok: true, value: { fields } };
}

function extractFrontmatterFields(
    fm: Record<string, unknown> | null
): { ok: true; value: Record<string, number> } | { ok: false; error: ParseError } {
    const fields: Record<string, number> = {};
    if (!fm) return { ok: true, value: fields };

    for (const [rawKey, rawValue] of Object.entries(fm)) {
        if (!rawKey.startsWith(FRONTMATTER_PREFIX)) continue;
        const suffix = rawKey.slice(FRONTMATTER_PREFIX.length);
        if (suffix === "") continue;
        const camel = kebabToCamel(suffix);
        const key = KEY_ALIASES[camel] ?? camel;

        if (!ALL_KEYS.has(camel) && !ALL_KEYS.has(key)) {
            return err(`unknown frontmatter key "${rawKey}"`);
        }

        const num = typeof rawValue === "number" ? rawValue : Number(rawValue);
        if (!Number.isFinite(num)) {
            return err(`frontmatter "${rawKey}" must be a number (got "${String(rawValue)}")`);
        }
        fields[key] = num;
    }
    return { ok: true, value: fields };
}

function kebabToCamel(s: string): string {
    return s.replace(/-([a-z0-9])/gi, (_, c: string) => c.toUpperCase());
}

function toKebab(s: string): string {
    return s.replace(/[A-Z]/g, (c) => "-" + c.toLowerCase());
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
    if (i.pressure !== undefined && i.pressure <= 0)
        return `"pressure" must be positive (got ${i.pressure})`;
    if (i.humidity !== undefined && (i.humidity < 0 || i.humidity > 100))
        return `"humidity" must be between 0 and 100 (got ${i.humidity})`;
    if (i.minEnergy !== undefined && i.minEnergy < 0)
        return `"minEnergy" must be non-negative (got ${i.minEnergy})`;
    if (i.maxEnergy !== undefined && i.maxEnergy < 0)
        return `"maxEnergy" must be non-negative (got ${i.maxEnergy})`;
    if (i.minEnergy !== undefined && i.maxEnergy !== undefined && i.maxEnergy <= i.minEnergy)
        return `"maxEnergy" (${i.maxEnergy}) must be greater than "minEnergy" (${i.minEnergy})`;
    return null;
}

function err(message: string): { ok: false; error: ParseError } {
    return { ok: false, error: { message } };
}
