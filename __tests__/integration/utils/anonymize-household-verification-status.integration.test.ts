import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { getTestDb } from "../../db/test-db";
import {
    createTestHousehold,
    createTestLocationWithSchedule,
    createTestParcel,
    createTestVerificationQuestion,
    resetHouseholdCounter,
    resetLocationCounter,
} from "../../factories";
import { daysFromTestNow } from "../../test-time";
import { householdVerificationStatus, households } from "@/app/db/schema";
import { removeHousehold } from "@/app/utils/anonymization/anonymize-household";

describe("anonymize household verification status - integration", () => {
    beforeEach(() => {
        resetHouseholdCounter();
        resetLocationCounter();
    });

    it("hard-deletes verification_status rows so free-text notes don't survive anonymization", async () => {
        // The notes column on household_verification_status is staff-authored
        // free text and may contain identifying information. Anonymization
        // must remove these rows entirely (placeholder values can't obscure
        // free text). This is the regression test for that GDPR requirement.
        const db = await getTestDb();
        const household = await createTestHousehold();
        const { location } = await createTestLocationWithSchedule();

        // Anonymization (vs hard delete) only happens when a household has
        // parcel history, so create a past parcel to push removeHousehold
        // down the anonymization path.
        await createTestParcel({
            household_id: household.id,
            pickup_location_id: location.id,
            pickup_date_time_earliest: daysFromTestNow(-3),
            pickup_date_time_latest: new Date(daysFromTestNow(-3).getTime() + 30 * 60 * 1000),
        });

        // Attach two verification rows to the household — one with notes
        // (the PII case) and one without (to prove the deletion is
        // unconditional, not just notes-aware).
        const question1 = await createTestVerificationQuestion();
        const question2 = await createTestVerificationQuestion();

        await db.insert(householdVerificationStatus).values([
            {
                household_id: household.id,
                question_id: question1.id,
                is_verified: true,
                verified_by_user: "test-admin",
                verified_at: new Date(),
                notes: "Mentioned by name in case worker meeting",
            },
            {
                household_id: household.id,
                question_id: question2.id,
                is_verified: false,
                notes: null,
            },
        ]);

        // Sanity: rows exist before anonymization
        const beforeRows = await db
            .select()
            .from(householdVerificationStatus)
            .where(eq(householdVerificationStatus.household_id, household.id));
        expect(beforeRows).toHaveLength(2);

        const result = await removeHousehold(household.id, "test-admin");
        expect(result.method).toBe("anonymized");

        // The household row itself should still exist (with anonymized
        // name/phone) — this is the preserved-statistics invariant.
        const [anonymizedHousehold] = await db
            .select()
            .from(households)
            .where(eq(households.id, household.id));
        expect(anonymizedHousehold).toBeDefined();
        expect(anonymizedHousehold?.anonymized_at).toBeInstanceOf(Date);
        expect(anonymizedHousehold?.first_name).toBe("Anonymized");

        // But ALL verification status rows must be gone — both the one
        // with notes and the one without.
        const afterRows = await db
            .select()
            .from(householdVerificationStatus)
            .where(eq(householdVerificationStatus.household_id, household.id));
        expect(afterRows).toHaveLength(0);
    });
});
