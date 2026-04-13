import { describe, it, expect } from "vitest";
import { slugifyHeading } from "@/app/utils/slugify-heading";

describe("slugifyHeading", () => {
    it("lowercases and hyphenates ASCII headings", () => {
        expect(slugifyHeading("Hello World")).toBe("hello-world");
    });

    it("collapses Swedish å/ä/ö to ASCII a/o", () => {
        // Matches the anchors the search UI will produce when indexing
        // the real Swedish manuals (e.g. `## Felsökning` → #felsokning).
        expect(slugifyHeading("Felsökning")).toBe("felsokning");
        expect(slugifyHeading("Hushåll")).toBe("hushall");
        expect(slugifyHeading("Ändra bokning")).toBe("andra-bokning");
    });

    it("keeps digits and internal hyphens", () => {
        expect(slugifyHeading("Uppgift 1: Dela ut matkasse")).toBe("uppgift-1-dela-ut-matkasse");
        expect(slugifyHeading("QR-koder och incheckning")).toBe("qr-koder-och-incheckning");
    });

    it("strips emoji and other punctuation", () => {
        expect(slugifyHeading("⚙️ Inställningar")).toBe("installningar");
        expect(slugifyHeading("Hur SMS fungerar (översikt)")).toBe("hur-sms-fungerar-oversikt");
    });

    it("collapses runs of whitespace and hyphens", () => {
        expect(slugifyHeading("  spaced   out  ")).toBe("spaced-out");
        expect(slugifyHeading("dashes---everywhere")).toBe("dashes-everywhere");
    });

    it("returns empty string for input with no slug characters", () => {
        expect(slugifyHeading("")).toBe("");
        expect(slugifyHeading("   ")).toBe("");
        expect(slugifyHeading("!!!")).toBe("");
        expect(slugifyHeading("⚠️")).toBe("");
    });
});
