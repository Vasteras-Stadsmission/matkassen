// @vitest-environment node
import { describe, it, expect } from "vitest";
import { DrizzleQueryError } from "drizzle-orm";
import { serializeError } from "@/app/utils/logger";

const query = "select id from households where phone_number = $1 and first_name = $2";
const params = ["+46701234567", "Anna"];

describe("serializeError", () => {
    it("keeps the failed query's text but not its values", () => {
        const error = new DrizzleQueryError(query, params, new Error("connection refused"));

        const logged = JSON.stringify(serializeError(error));

        expect(logged).not.toContain("+46701234567");
        expect(logged).not.toContain("Anna");
        expect(logged).toContain(query);
        expect(logged).toContain("connection refused");
    });

    it("removes the values when the query error is the cause of another error", () => {
        const cause = new DrizzleQueryError(query, params, new Error("connection refused"));
        const error = new Error("Failed to save household", { cause });

        const logged = JSON.stringify(serializeError(error));

        expect(logged).not.toContain("+46701234567");
        expect(logged).not.toContain("Anna");
        expect(logged).toContain("Failed to save household");
    });
});
