import { describe, it, expect } from "vitest";
import { parseBallisticsBlock, type BallisticsInputs, type ViewSpec } from "../src/parser";

const TABLE_VIEW: ViewSpec = {
    required: [],
    optional: ["maxRange", "rangeStep", "minEnergy", "maxEnergy"],
    defaults: { maxRange: 1000, rangeStep: 100 },
    validators: {
        maxRange: (n) => (n <= 0 ? `"maxRange" must be positive (got ${n})` : null),
        rangeStep: (n) => (n <= 0 ? `"rangeStep" must be positive (got ${n})` : null),
    },
    crossValidate: (view) => {
        if (view.rangeStep > view.maxRange) {
            return `"rangeStep" (${view.rangeStep}) must not exceed "maxRange" (${view.maxRange})`;
        }
        return null;
    },
};

describe("parseBallisticsBlock", () => {
    const valid = `
bc: 0.475
initialVelocity: 2700
sightHeight: 1.5
zeroRange: 100
maxRange: 1000
rangeStep: 50
windSpeed: 10
windAngle: 90
bulletWeight: 168
`;

    it("parses a valid block", () => {
        const result = parseBallisticsBlock(valid, { view: TABLE_VIEW });
        expect(result.ok).toBe(true);
        if (!result.ok) return;
        const i: BallisticsInputs = result.value.inputs;
        expect(i.bc).toBe(0.475);
        expect(i.initialVelocity).toBe(2700);
        expect(i.sightHeight).toBe(1.5);
        expect(i.zeroRange).toBe(100);
        expect(i.windSpeed).toBe(10);
        expect(i.windAngle).toBe(90);
        expect(i.bulletWeight).toBe(168);
        expect(result.value.view.maxRange).toBe(1000);
        expect(result.value.view.rangeStep).toBe(50);
    });

    it("accepts `coeff` as an alias for `bc`", () => {
        const block = valid.replace("bc: 0.475", "coeff: 0.475");
        const result = parseBallisticsBlock(block, { view: TABLE_VIEW });
        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.value.inputs.bc).toBe(0.475);
    });

    it("accepts `coefficient` as an alias for `bc`", () => {
        const block = valid.replace("bc: 0.475", "coefficient: 0.475");
        const result = parseBallisticsBlock(block, { view: TABLE_VIEW });
        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.value.inputs.bc).toBe(0.475);
    });

    it("accepts `muzzleVelocity` as an alias for `initialVelocity`", () => {
        const block = valid.replace("initialVelocity: 2700", "muzzleVelocity: 2700");
        const result = parseBallisticsBlock(block, { view: TABLE_VIEW });
        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.value.inputs.initialVelocity).toBe(2700);
    });

    it("errors when bulletWeight is missing", () => {
        const block = valid.replace(/bulletWeight:.*\n/, "");
        const result = parseBallisticsBlock(block, { view: TABLE_VIEW });
        expect(result.ok).toBe(false);
        if (result.ok) return;
        expect(result.error.message).toMatch(/bulletWeight/);
    });

    it("ignores blank lines and # comments", () => {
        const block = `
# my favorite load
bc: 0.475

initialVelocity: 2700
sightHeight: 1.5
zeroRange: 100
maxRange: 1000
rangeStep: 50
windSpeed: 10
windAngle: 90
bulletWeight: 168
`;
        const result = parseBallisticsBlock(block, { view: TABLE_VIEW });
        expect(result.ok).toBe(true);
    });

    it("errors on a missing required input", () => {
        const block = valid.replace(/initialVelocity:.*\n/, "");
        const result = parseBallisticsBlock(block, { view: TABLE_VIEW });
        expect(result.ok).toBe(false);
        if (result.ok) return;
        expect(result.error.message).toMatch(/initialVelocity/);
    });

    it("errors on a non-numeric value", () => {
        const block = valid.replace("bc: 0.475", "bc: fast");
        const result = parseBallisticsBlock(block, { view: TABLE_VIEW });
        expect(result.ok).toBe(false);
        if (result.ok) return;
        expect(result.error.message).toMatch(/bc/);
        expect(result.error.message).toMatch(/fast/);
    });

    it("errors on an unknown key", () => {
        const block = valid + "drag: G7\n";
        const result = parseBallisticsBlock(block, { view: TABLE_VIEW });
        expect(result.ok).toBe(false);
        if (result.ok) return;
        expect(result.error.message).toMatch(/drag/);
    });

    it("errors when bc is not positive", () => {
        const block = valid.replace("bc: 0.475", "bc: 0");
        const result = parseBallisticsBlock(block, { view: TABLE_VIEW });
        expect(result.ok).toBe(false);
        if (result.ok) return;
        expect(result.error.message).toMatch(/bc/);
    });

    it("errors when rangeStep exceeds maxRange", () => {
        const block = valid.replace("rangeStep: 50", "rangeStep: 1500");
        const result = parseBallisticsBlock(block, { view: TABLE_VIEW });
        expect(result.ok).toBe(false);
        if (result.ok) return;
        expect(result.error.message).toMatch(/rangeStep/);
    });

    it("errors when windAngle is out of range", () => {
        const block = valid.replace("windAngle: 90", "windAngle: 500");
        const result = parseBallisticsBlock(block, { view: TABLE_VIEW });
        expect(result.ok).toBe(false);
        if (result.ok) return;
        expect(result.error.message).toMatch(/windAngle/);
    });

    it("errors on a malformed line", () => {
        const block = valid + "this is not a key value line\n";
        const result = parseBallisticsBlock(block, { view: TABLE_VIEW });
        expect(result.ok).toBe(false);
    });

    it("applies maxRange and rangeStep defaults when omitted", () => {
        const minimal = `
bc: 0.475
initialVelocity: 2700
sightHeight: 1.5
zeroRange: 100
bulletWeight: 168
`;
        const result = parseBallisticsBlock(minimal, { view: TABLE_VIEW });
        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.value.view.maxRange).toBe(1000);
        expect(result.value.view.rangeStep).toBe(100);
    });

    describe("frontmatter inputs", () => {
        const fullFrontmatter = {
            "ballistics-bc": 0.475,
            "ballistics-initial-velocity": 2700,
            "ballistics-sight-height": 1.5,
            "ballistics-zero-range": 100,
            "ballistics-bullet-weight": 168,
        };

        it("parses an empty body using only frontmatter (view defaults apply)", () => {
            const result = parseBallisticsBlock("", {
                frontmatter: fullFrontmatter,
                view: TABLE_VIEW,
            });
            expect(result.ok).toBe(true);
            if (!result.ok) return;
            expect(result.value.inputs.bc).toBe(0.475);
            expect(result.value.inputs.bulletWeight).toBe(168);
            expect(result.value.view.maxRange).toBe(1000);
            expect(result.value.view.rangeStep).toBe(100);
        });

        it("lets inline body override frontmatter inputs", () => {
            const fm = { ...fullFrontmatter, "ballistics-bc": 0.1 };
            const result = parseBallisticsBlock("bc: 0.5\n", {
                frontmatter: fm,
                view: TABLE_VIEW,
            });
            expect(result.ok).toBe(true);
            if (!result.ok) return;
            expect(result.value.inputs.bc).toBe(0.5);
        });

        it("accepts numeric strings in frontmatter", () => {
            const fm = { ...fullFrontmatter, "ballistics-bc": "0.5" };
            const result = parseBallisticsBlock("", { frontmatter: fm, view: TABLE_VIEW });
            expect(result.ok).toBe(true);
            if (!result.ok) return;
            expect(result.value.inputs.bc).toBe(0.5);
        });

        it("errors on a non-numeric frontmatter value", () => {
            const fm = { ...fullFrontmatter, "ballistics-bc": "fast" };
            const result = parseBallisticsBlock("", { frontmatter: fm, view: TABLE_VIEW });
            expect(result.ok).toBe(false);
            if (result.ok) return;
            expect(result.error.message).toMatch(/ballistics-bc/);
        });

        it("rejects a view-option key in frontmatter", () => {
            const fm = { ...fullFrontmatter, "ballistics-range-step": 50 };
            const result = parseBallisticsBlock("", { frontmatter: fm, view: TABLE_VIEW });
            expect(result.ok).toBe(false);
            if (result.ok) return;
            expect(result.error.message).toMatch(/ballistics-range-step/);
            expect(result.error.message).toMatch(/view option/);
        });

        it("ignores non-ballistics frontmatter keys", () => {
            const fm = { ...fullFrontmatter, tags: ["rifle"], aliases: ["test"] };
            const result = parseBallisticsBlock("", { frontmatter: fm, view: TABLE_VIEW });
            expect(result.ok).toBe(true);
        });

        it("reports a missing input with a frontmatter hint", () => {
            const fm = { ...fullFrontmatter };
            delete (fm as Record<string, unknown>)["ballistics-bullet-weight"];
            const result = parseBallisticsBlock("", { frontmatter: fm, view: TABLE_VIEW });
            expect(result.ok).toBe(false);
            if (result.ok) return;
            expect(result.error.message).toMatch(/bulletWeight/);
            expect(result.error.message).toMatch(/ballistics-bullet-weight/);
        });
    });

    describe("use: cross-note reference", () => {
        const targetFm = {
            "ballistics-bc": 0.475,
            "ballistics-initial-velocity": 2700,
            "ballistics-sight-height": 1.5,
            "ballistics-zero-range": 100,
            "ballistics-bullet-weight": 168,
        };

        it("pulls inputs from the referenced note's frontmatter", () => {
            const result = parseBallisticsBlock("use: [[loads/308]]\n", {
                view: TABLE_VIEW,
                resolveUse: (link) => (link === "loads/308" ? targetFm : null),
            });
            expect(result.ok).toBe(true);
            if (!result.ok) return;
            expect(result.value.inputs.bc).toBe(0.475);
            expect(result.value.inputs.bulletWeight).toBe(168);
        });

        it("lets inline body override use-target frontmatter", () => {
            const result = parseBallisticsBlock("use: [[loads/308]]\nbc: 0.5\n", {
                view: TABLE_VIEW,
                resolveUse: () => targetFm,
            });
            expect(result.ok).toBe(true);
            if (!result.ok) return;
            expect(result.value.inputs.bc).toBe(0.5);
        });

        it("lets use-target override current-note frontmatter", () => {
            const local = { "ballistics-bc": 0.1 };
            const result = parseBallisticsBlock("use: [[loads/308]]\n", {
                frontmatter: local,
                view: TABLE_VIEW,
                resolveUse: () => targetFm,
            });
            expect(result.ok).toBe(true);
            if (!result.ok) return;
            expect(result.value.inputs.bc).toBe(0.475);
        });

        it("accepts wikilinks with aliases", () => {
            const result = parseBallisticsBlock("use: [[loads/308|.308 Match]]\n", {
                view: TABLE_VIEW,
                resolveUse: (link) => (link === "loads/308" ? targetFm : null),
            });
            expect(result.ok).toBe(true);
        });

        it("rejects a non-wikilink use value", () => {
            const result = parseBallisticsBlock("use: loads/308\n", {
                view: TABLE_VIEW,
                resolveUse: () => targetFm,
            });
            expect(result.ok).toBe(false);
            if (result.ok) return;
            expect(result.error.message).toMatch(/wikilink/);
        });

        it("errors when the referenced note cannot be resolved", () => {
            const result = parseBallisticsBlock("use: [[loads/missing]]\n", {
                view: TABLE_VIEW,
                resolveUse: () => null,
            });
            expect(result.ok).toBe(false);
            if (result.ok) return;
            expect(result.error.message).toMatch(/loads\/missing/);
        });

        it("errors when use is specified twice", () => {
            const result = parseBallisticsBlock("use: [[a]]\nuse: [[b]]\n", {
                view: TABLE_VIEW,
                resolveUse: () => targetFm,
            });
            expect(result.ok).toBe(false);
            if (result.ok) return;
            expect(result.error.message).toMatch(/more than once/);
        });
    });
});
