import { describe, it, expect } from "vitest";
import { toMarkdown, toCsv } from "../src/copyMenu";

describe("toMarkdown", () => {
    it("emits a markdown table with header separator", () => {
        const out = toMarkdown(
            ["Range", "Drop"],
            [
                ["100", "0.0"],
                ["200", "-2.5"],
            ]
        );
        expect(out).toBe("| Range | Drop |\n| --- | --- |\n| 100 | 0.0 |\n| 200 | -2.5 |\n");
    });

    it("handles a single row", () => {
        const out = toMarkdown(["A"], [["1"]]);
        expect(out).toBe("| A |\n| --- |\n| 1 |\n");
    });
});

describe("toCsv", () => {
    it("emits comma-separated values", () => {
        const out = toCsv(["a", "b"], [["1", "2"]]);
        expect(out).toBe("a,b\n1,2\n");
    });

    it("quotes values containing commas", () => {
        const out = toCsv(["x"], [["a,b"]]);
        expect(out).toBe('x\n"a,b"\n');
    });

    it("escapes embedded double quotes", () => {
        const out = toCsv(["x"], [['he said "hi"']]);
        expect(out).toBe('x\n"he said ""hi"""\n');
    });

    it("quotes values containing newlines", () => {
        const out = toCsv(["x"], [["a\nb"]]);
        expect(out).toBe('x\n"a\nb"\n');
    });
});
