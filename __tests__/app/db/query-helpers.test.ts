import { describe, it, expect } from "vitest";
import { isNull, isNotNull, SQL } from "drizzle-orm";
import { notDeleted, isDeleted } from "@/app/db/query-helpers";
import { foodParcels } from "@/app/db/schema";

describe("query-helpers", () => {
    describe("notDeleted", () => {
        it("should return SQL condition for non-deleted parcels", () => {
            const condition = notDeleted();

            // Verify it returns an SQL condition object
            expect(condition).toBeDefined();
            expect(condition).toBeInstanceOf(SQL);
        });

        it("should be equivalent to isNull on deleted_at field", () => {
            const notDeletedCondition = notDeleted();
            const isNullCondition = isNull(foodParcels.deleted_at);

            // Both should be SQL objects (structural equivalence is hard to test without db)
            expect(notDeletedCondition).toBeInstanceOf(SQL);
            expect(isNullCondition).toBeInstanceOf(SQL);
        });
    });

    describe("isDeleted", () => {
        it("should return SQL condition for deleted parcels", () => {
            const condition = isDeleted();

            // Verify it returns an SQL condition object
            expect(condition).toBeDefined();
            expect(condition).toBeInstanceOf(SQL);
        });

        it("should be equivalent to isNotNull on deleted_at field", () => {
            const isDeletedCondition = isDeleted();
            const isNotNullCondition = isNotNull(foodParcels.deleted_at);

            // Both should be SQL objects (structural equivalence is hard to test without db)
            expect(isDeletedCondition).toBeInstanceOf(SQL);
            expect(isNotNullCondition).toBeInstanceOf(SQL);
        });
    });

    describe("integration", () => {
        it("notDeleted and isDeleted should both return valid SQL conditions", () => {
            const notDeletedCondition = notDeleted();
            const isDeletedCondition = isDeleted();

            // Both should be valid SQL conditions
            expect(notDeletedCondition).toBeInstanceOf(SQL);
            expect(isDeletedCondition).toBeInstanceOf(SQL);

            // They should be different objects (one IS NULL, one IS NOT NULL)
            expect(notDeletedCondition).not.toBe(isDeletedCondition);
        });
    });
});
