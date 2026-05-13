// parser.ts — parses a `ballistics` codefence body into typed inputs.
//
// Two-tier model:
//   * Inputs describe the *thing* being modeled — the load, the rifle, the
//     atmospheric conditions. They are valid in both frontmatter and the
//     fence body, and `use: [[…]]` inherits them.
//   * View options describe how a given renderer should display the result
//     (range window, energy thresholds, future chart series, etc.). They
//     live only in the fence body — never in frontmatter, never inherited.
// Each processor declares which view keys it accepts via the `view` field of
// ParseContext.

export interface BallisticsInputs {
    bc: number;
    initialVelocity: number;
    sightHeight: number;
    zeroRange: number;
    bulletWeight: number;
    windSpeed: number;
    windAngle: number;
    altitude?: number;
    pressure?: number;
    temperature?: number;
    humidity?: number;
}

export interface ParseError {
    message: string;
}

export type ViewValues = Record<string, number>;

export interface ViewSpec {
    /** View keys (camelCase) required in the fence body (no default available). */
    required: readonly string[];
    /** View keys (camelCase) accepted but not required. */
    optional: readonly string[];
    /** Default values applied when an optional key is omitted. */
    defaults?: Record<string, number>;
    /** Per-key validators run after parsing; return error string or null. */
    validators?: Record<string, (n: number) => string | null>;
    /** Optional cross-key validator run after individual ones pass. */
    crossValidate?: (view: ViewValues) => string | null;
}

export interface ParseSuccess {
    inputs: BallisticsInputs;
    view: ViewValues;
}

export type ParseResult = { ok: true; value: ParseSuccess } | { ok: false; error: ParseError };

export interface ParseContext {
    frontmatter?: Record<string, unknown> | null;
    resolveUse?: (linkTarget: string) => Record<string, unknown> | null | undefined;
    view: ViewSpec;
}

const REQUIRED_INPUTS = [
    "bc",
    "initialVelocity",
    "sightHeight",
    "zeroRange",
    "bulletWeight",
] as const;

const OPTIONAL_INPUTS = [
    "windSpeed",
    "windAngle",
    "altitude",
    "pressure",
    "temperature",
    "humidity",
] as const;

const INPUT_DEFAULTS: Record<string, number> = {
    windSpeed: 0,
    windAngle: 0,
};

const KEY_ALIASES: Record<string, string> = {
    coeff: "bc",
    coefficient: "bc",
    muzzleVelocity: "initialVelocity",
};

const INPUT_KEYS: ReadonlySet<string> = new Set([...REQUIRED_INPUTS, ...OPTIONAL_INPUTS]);

const ALIAS_KEYS: ReadonlySet<string> = new Set(Object.keys(KEY_ALIASES));

const FRONTMATTER_PREFIX = "ballistics-";

const INPUT_VALIDATORS: Record<string, (n: number) => string | null> = {
    bc: (n) => (n <= 0 ? `"bc" must be positive (got ${n})` : null),
    initialVelocity: (n) => (n <= 0 ? `"initialVelocity" must be positive (got ${n})` : null),
    sightHeight: (n) => (n < 0 ? `"sightHeight" must be non-negative (got ${n})` : null),
    zeroRange: (n) => (n <= 0 ? `"zeroRange" must be positive (got ${n})` : null),
    bulletWeight: (n) => (n <= 0 ? `"bulletWeight" must be positive (got ${n})` : null),
    windSpeed: (n) => (n < 0 ? `"windSpeed" must be non-negative (got ${n})` : null),
    windAngle: (n) =>
        n < 0 || n > 360 ? `"windAngle" must be between 0 and 360 (got ${n})` : null,
    pressure: (n) => (n <= 0 ? `"pressure" must be positive (got ${n})` : null),
    humidity: (n) => (n < 0 || n > 100 ? `"humidity" must be between 0 and 100 (got ${n})` : null),
};

export function parseBallisticsBlock(source: string, ctx: ParseContext): ParseResult {
    const viewKeys = new Set<string>([...ctx.view.required, ...ctx.view.optional]);

    const body = parseBody(source, viewKeys);
    if (!body.ok) return body;

    const localFm = extractFrontmatterFields(ctx.frontmatter ?? null);
    if (!localFm.ok) return localFm;

    let useFm: Record<string, number> = {};
    if (body.value.useRef !== undefined) {
        if (!ctx.resolveUse) {
            return err(`"use" references are not supported in this context`);
        }
        const target = ctx.resolveUse(body.value.useRef);
        if (target === undefined || target === null) {
            return err(
                `could not resolve "use: [[${body.value.useRef}]]" — no such note in the vault`
            );
        }
        const r = extractFrontmatterFields(target);
        if (!r.ok) return r;
        useFm = r.value;
    }

    const inputFields: Record<string, number> = {
        ...localFm.value,
        ...useFm,
        ...body.value.inputs,
    };

    for (const k of REQUIRED_INPUTS) {
        if (!(k in inputFields)) {
            return err(
                `missing required input "${k}" — set it inline, in this note's frontmatter as "${FRONTMATTER_PREFIX}${toKebab(k)}", or via "use:"`
            );
        }
    }

    const inputs: BallisticsInputs = {
        bc: inputFields.bc,
        initialVelocity: inputFields.initialVelocity,
        sightHeight: inputFields.sightHeight,
        zeroRange: inputFields.zeroRange,
        bulletWeight: inputFields.bulletWeight,
        windSpeed: inputFields.windSpeed ?? INPUT_DEFAULTS.windSpeed,
        windAngle: inputFields.windAngle ?? INPUT_DEFAULTS.windAngle,
        altitude: "altitude" in inputFields ? inputFields.altitude : undefined,
        pressure: "pressure" in inputFields ? inputFields.pressure : undefined,
        temperature: "temperature" in inputFields ? inputFields.temperature : undefined,
        humidity: "humidity" in inputFields ? inputFields.humidity : undefined,
    };

    const inputErr = validateInputs(inputs);
    if (inputErr) return err(inputErr);

    for (const k of ctx.view.required) {
        if (!(k in body.value.view)) {
            return err(`missing required view option "${k}" — set it inline in the fence`);
        }
    }

    const view: ViewValues = { ...(ctx.view.defaults ?? {}), ...body.value.view };
    if (ctx.view.validators) {
        for (const [k, v] of Object.entries(view)) {
            const fn = ctx.view.validators[k];
            if (fn) {
                const msg = fn(v);
                if (msg) return err(msg);
            }
        }
    }
    if (ctx.view.crossValidate) {
        const msg = ctx.view.crossValidate(view);
        if (msg) return err(msg);
    }

    return { ok: true, value: { inputs, view } };
}

interface BodyParse {
    inputs: Record<string, number>;
    view: Record<string, number>;
    useRef?: string;
}

function parseBody(
    source: string,
    viewKeys: ReadonlySet<string>
): { ok: true; value: BodyParse } | { ok: false; error: ParseError } {
    const inputs: Record<string, number> = {};
    const view: Record<string, number> = {};
    let useRef: string | undefined;

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

        if (rawKey === "use") {
            if (useRef !== undefined) {
                return err(`line ${i + 1}: "use" specified more than once`);
            }
            const link = parseWikilink(valueText);
            if (link === null) {
                return err(
                    `line ${i + 1}: "use" value must be a wikilink like [[note-name]] (got "${valueText}")`
                );
            }
            useRef = link;
            continue;
        }

        const isInput = INPUT_KEYS.has(rawKey) || ALIAS_KEYS.has(rawKey);
        const isView = viewKeys.has(rawKey);

        if (!isInput && !isView) {
            return err(`unknown key "${rawKey}" on line ${i + 1}`);
        }

        const num = Number(valueText);
        if (!Number.isFinite(num)) {
            return err(`"${rawKey}" must be a number (got "${valueText}")`);
        }

        if (isInput) {
            const key = KEY_ALIASES[rawKey] ?? rawKey;
            inputs[key] = num;
        } else {
            view[rawKey] = num;
        }
    }

    return { ok: true, value: { inputs, view, useRef } };
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

        if (!INPUT_KEYS.has(key)) {
            return err(
                `frontmatter key "${rawKey}" is not a ballistics input — view options like maxRange, rangeStep, minEnergy, maxEnergy belong in the codefence, not in frontmatter`
            );
        }

        const num = typeof rawValue === "number" ? rawValue : Number(rawValue);
        if (!Number.isFinite(num)) {
            const display =
                typeof rawValue === "string" || typeof rawValue === "number"
                    ? String(rawValue)
                    : JSON.stringify(rawValue);
            return err(`frontmatter "${rawKey}" must be a number (got "${display}")`);
        }
        fields[key] = num;
    }
    return { ok: true, value: fields };
}

function parseWikilink(text: string): string | null {
    const m = text.match(/^\[\[([^|\]]+?)(?:\|[^\]]*)?\]\]$/);
    if (!m) return null;
    const target = m[1].trim();
    return target === "" ? null : target;
}

function kebabToCamel(s: string): string {
    return s.replace(/-([a-z0-9])/gi, (_, c: string) => c.toUpperCase());
}

function toKebab(s: string): string {
    return s.replace(/[A-Z]/g, (c) => "-" + c.toLowerCase());
}

function validateInputs(i: BallisticsInputs): string | null {
    for (const [k, fn] of Object.entries(INPUT_VALIDATORS)) {
        const v = (i as unknown as Record<string, number | undefined>)[k];
        if (v === undefined) continue;
        const msg = fn(v);
        if (msg) return msg;
    }
    return null;
}

function err(message: string): { ok: false; error: ParseError } {
    return { ok: false, error: { message } };
}
