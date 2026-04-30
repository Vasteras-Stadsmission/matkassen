import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as databaseSsl from "@/app/db/database-ssl.cjs";

const { parseDatabaseSslMode, postgresJsSslOption, applyDatabaseSslToUrl } =
    databaseSsl as unknown as {
        parseDatabaseSslMode: () => "require" | "verify-full" | "disable" | null;
        postgresJsSslOption: () => "require" | "verify-full" | false | undefined;
        applyDatabaseSslToUrl: (url: string) => string;
    };

const BASE_URL = "postgres://u:p@host:5432/db";

describe("database-ssl", () => {
    let originalValue: string | undefined;

    beforeEach(() => {
        originalValue = process.env.DATABASE_SSL;
    });

    afterEach(() => {
        if (originalValue === undefined) delete process.env.DATABASE_SSL;
        else process.env.DATABASE_SSL = originalValue;
    });

    describe("parseDatabaseSslMode", () => {
        it("returns null when DATABASE_SSL is unset", () => {
            delete process.env.DATABASE_SSL;
            expect(parseDatabaseSslMode()).toBeNull();
        });

        it("returns null when DATABASE_SSL is empty", () => {
            process.env.DATABASE_SSL = "";
            expect(parseDatabaseSslMode()).toBeNull();
        });

        it.each(["disable", "require", "verify-full"] as const)("accepts %s", mode => {
            process.env.DATABASE_SSL = mode;
            expect(parseDatabaseSslMode()).toBe(mode);
        });

        it("is case-insensitive", () => {
            process.env.DATABASE_SSL = "REQUIRE";
            expect(parseDatabaseSslMode()).toBe("require");
            process.env.DATABASE_SSL = "Verify-Full";
            expect(parseDatabaseSslMode()).toBe("verify-full");
        });

        // Deploy pipelines and shell interpolations are easy ways to introduce
        // accidental surrounding whitespace. Trim so " require " works, rather
        // than crashing the server at startup over a leading space.
        it.each([" require", "require ", " require ", "\tverify-full\n"])(
            "tolerates surrounding whitespace in %j",
            value => {
                process.env.DATABASE_SSL = value;
                expect(parseDatabaseSslMode()).toBe(value.trim().toLowerCase());
            },
        );

        it("treats whitespace-only as unset", () => {
            process.env.DATABASE_SSL = "   ";
            expect(parseDatabaseSslMode()).toBeNull();
        });

        // The whole point of the knob: a typo must fail loudly, not silently
        // downgrade to an unauthenticated TLS mode or to plaintext.
        it.each(["required", "yes", "true", "1", "verify", "verify-ca", "allow", "prefer"])(
            "throws on unsupported value %s",
            value => {
                process.env.DATABASE_SSL = value;
                expect(() => parseDatabaseSslMode()).toThrow(/Unsupported DATABASE_SSL/);
            },
        );
    });

    describe("postgresJsSslOption", () => {
        it("returns undefined when unset (so URL sslmode wins)", () => {
            delete process.env.DATABASE_SSL;
            expect(postgresJsSslOption()).toBeUndefined();
        });

        it("returns false for disable (authoritatively off)", () => {
            process.env.DATABASE_SSL = "disable";
            expect(postgresJsSslOption()).toBe(false);
        });

        it("returns the mode string for require and verify-full", () => {
            process.env.DATABASE_SSL = "require";
            expect(postgresJsSslOption()).toBe("require");
            process.env.DATABASE_SSL = "verify-full";
            expect(postgresJsSslOption()).toBe("verify-full");
        });

        it("propagates the typo-guard throw", () => {
            process.env.DATABASE_SSL = "required";
            expect(() => postgresJsSslOption()).toThrow(/Unsupported DATABASE_SSL/);
        });
    });

    describe("applyDatabaseSslToUrl", () => {
        it("returns the URL unchanged when DATABASE_SSL is unset", () => {
            delete process.env.DATABASE_SSL;
            expect(applyDatabaseSslToUrl(BASE_URL)).toBe(BASE_URL);
        });

        it("maps require to sslmode=no-verify (libpq idiom for TLS-without-CA-check)", () => {
            process.env.DATABASE_SSL = "require";
            const out = new URL(applyDatabaseSslToUrl(BASE_URL));
            expect(out.searchParams.get("sslmode")).toBe("no-verify");
        });

        it("maps verify-full to sslmode=verify-full", () => {
            process.env.DATABASE_SSL = "verify-full";
            const out = new URL(applyDatabaseSslToUrl(BASE_URL));
            expect(out.searchParams.get("sslmode")).toBe("verify-full");
        });

        it("maps disable to sslmode=disable", () => {
            process.env.DATABASE_SSL = "disable";
            const out = new URL(applyDatabaseSslToUrl(BASE_URL));
            expect(out.searchParams.get("sslmode")).toBe("disable");
        });

        // The whole point of the URL-rewriting layer: DATABASE_SSL must
        // authoritatively override an existing sslmode in DATABASE_URL,
        // since pg re-parses connectionString after merging options.
        it("overrides a conflicting sslmode already in the URL", () => {
            process.env.DATABASE_SSL = "disable";
            const withSsl = `${BASE_URL}?sslmode=verify-full&application_name=foo`;
            const out = new URL(applyDatabaseSslToUrl(withSsl));
            expect(out.searchParams.get("sslmode")).toBe("disable");
            expect(out.searchParams.get("application_name")).toBe("foo");
        });

        it("propagates the typo-guard throw", () => {
            process.env.DATABASE_SSL = "required";
            expect(() => applyDatabaseSslToUrl(BASE_URL)).toThrow(/Unsupported DATABASE_SSL/);
        });

        // A malformed DATABASE_URL produces a naked `TypeError: Invalid URL`
        // from the WHATWG parser. Wrap it so the failure names the env var.
        it("throws a descriptive error when DATABASE_URL is malformed", () => {
            process.env.DATABASE_SSL = "require";
            expect(() => applyDatabaseSslToUrl("not a url")).toThrow(
                /DATABASE_URL is not a valid URL/,
            );
        });
    });
});
