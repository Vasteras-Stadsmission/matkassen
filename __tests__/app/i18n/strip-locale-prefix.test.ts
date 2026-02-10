import { describe, it, expect } from "vitest";
import { stripLocalePrefix } from "@/app/i18n/routing";

describe("stripLocalePrefix", () => {
    it("strips /sv prefix", () => {
        expect(stripLocalePrefix("/sv/households")).toBe("/households");
    });

    it("strips /en prefix", () => {
        expect(stripLocalePrefix("/en/households")).toBe("/households");
    });

    it("handles locale-only path /sv → /", () => {
        expect(stripLocalePrefix("/sv")).toBe("/");
    });

    it("handles locale-only path /en → /", () => {
        expect(stripLocalePrefix("/en")).toBe("/");
    });

    it("preserves deeper paths after stripping", () => {
        expect(stripLocalePrefix("/sv/households/abc/edit")).toBe("/households/abc/edit");
    });

    it("passes through paths without locale prefix", () => {
        expect(stripLocalePrefix("/households")).toBe("/households");
    });

    it("passes through root path", () => {
        expect(stripLocalePrefix("/")).toBe("/");
    });

    it("does not strip unknown locale prefixes", () => {
        expect(stripLocalePrefix("/fr/households")).toBe("/fr/households");
    });

    it("does not strip partial locale matches", () => {
        expect(stripLocalePrefix("/svg/icon")).toBe("/svg/icon");
    });

    it("handles path with query-like segments", () => {
        expect(stripLocalePrefix("/sv/agreement?callbackUrl=/households")).toBe(
            "/agreement?callbackUrl=/households",
        );
    });
});
