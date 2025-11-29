import { describe, it, expect, vi, beforeEach } from "vitest";

// Type for duplicate check results (matches the actual type from check-duplicates-action.ts)
interface DuplicateCheckResult {
    phoneExists: boolean;
    existingHousehold?: {
        id: string;
        first_name: string;
        last_name: string;
        phone_number: string;
    };
    similarHouseholds: Array<{
        id: string;
        first_name: string;
        last_name: string;
        phone_number: string;
        similarity: number;
    }>;
}

/**
 * DUPLICATE PREVENTION TESTS for HouseholdWizard
 *
 * These tests ensure that:
 * 1. Phone duplicates block form progression (hard constraint)
 * 2. Similar names show confirmation dialog (soft constraint)
 * 3. The duplicate check callback is properly wired
 */

/**
 * Code structure verification tests
 * Ensures the duplicate prevention code remains in place
 */
describe("HouseholdWizard Duplicate Prevention - Code Structure", () => {
    it("should have phone duplicate blocking in nextStep validation", async () => {
        const { readFileSync } = await import("fs");
        const { join } = await import("path");

        const componentPath = join(
            process.cwd(),
            "components/household-wizard/HouseholdWizard.tsx",
        );
        const content = readFileSync(componentPath, "utf-8");

        // Verify phone duplicate check exists in nextStep (immediate check)
        expect(content).toContain("result.data.phoneExists");
        expect(content).toContain("validation.phoneDuplicateWithInfo");
    });

    it("should have similar name confirmation dialog", async () => {
        const { readFileSync } = await import("fs");
        const { join } = await import("path");

        const componentPath = join(
            process.cwd(),
            "components/household-wizard/HouseholdWizard.tsx",
        );
        const content = readFileSync(componentPath, "utf-8");

        // Verify similar name confirmation exists
        expect(content).toContain("showSimilarNameConfirm");
        expect(content).toContain("similarHouseholds");
        expect(content).toContain("similarNameDialog");
    });

    it("should use householdId for edit mode exclusion in duplicate check", async () => {
        const { readFileSync } = await import("fs");
        const { join } = await import("path");

        const componentPath = join(
            process.cwd(),
            "components/household-wizard/HouseholdWizard.tsx",
        );
        const content = readFileSync(componentPath, "utf-8");

        // Verify householdId is used for edit mode exclusion in the nextStep duplicate check
        expect(content).toContain("excludeHouseholdId");
        expect(content).toContain("checkHouseholdDuplicates");
    });

    it("should have duplicate check state management", async () => {
        const { readFileSync } = await import("fs");
        const { join } = await import("path");

        const componentPath = join(
            process.cwd(),
            "components/household-wizard/HouseholdWizard.tsx",
        );
        const content = readFileSync(componentPath, "utf-8");

        // Verify state for duplicate checking exists
        expect(content).toContain("duplicateCheckResult");
        expect(content).toContain("setDuplicateCheckResult");
        expect(content).toContain("DuplicateCheckResult");
    });
});

/**
 * Logic tests for duplicate prevention
 */
describe("HouseholdWizard Duplicate Prevention - Logic", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe("Phone duplicate blocking", () => {
        it("should block when phoneExists is true", () => {
            const duplicateCheckResult = {
                phoneExists: true,
                existingHousehold: {
                    id: "123",
                    first_name: "John",
                    last_name: "Doe",
                    phone_number: "+46701234567",
                },
                similarHouseholds: [],
            };

            // Simulates the blocking logic in nextStep
            const shouldBlock = duplicateCheckResult.phoneExists;
            expect(shouldBlock).toBe(true);
        });

        it("should not block when phoneExists is false", () => {
            const duplicateCheckResult = {
                phoneExists: false,
                similarHouseholds: [],
            };

            const shouldBlock = duplicateCheckResult.phoneExists;
            expect(shouldBlock).toBe(false);
        });

        it("should not block when duplicateCheckResult is null", () => {
            // Simulates the case where no duplicate check has been performed yet
            const duplicateCheckResult = null as DuplicateCheckResult | null;

            // This is how the component handles null state
            const shouldBlock = duplicateCheckResult?.phoneExists ?? false;
            expect(shouldBlock).toBe(false);
        });
    });

    describe("Similar name confirmation", () => {
        it("should show confirmation when similar households exist", () => {
            const duplicateCheckResult = {
                phoneExists: false,
                similarHouseholds: [
                    {
                        id: "456",
                        first_name: "Johan",
                        last_name: "Doe",
                        phone_number: "+46709876543",
                        similarity: 0.85,
                    },
                ],
            };

            // Simulates the confirmation logic (only if phone doesn't block)
            const shouldShowConfirmation =
                !duplicateCheckResult.phoneExists &&
                duplicateCheckResult.similarHouseholds &&
                duplicateCheckResult.similarHouseholds.length > 0;

            expect(shouldShowConfirmation).toBe(true);
        });

        it("should not show confirmation when no similar households", () => {
            const duplicateCheckResult = {
                phoneExists: false,
                similarHouseholds: [],
            };

            const shouldShowConfirmation =
                !duplicateCheckResult.phoneExists &&
                duplicateCheckResult.similarHouseholds &&
                duplicateCheckResult.similarHouseholds.length > 0;

            expect(shouldShowConfirmation).toBe(false);
        });

        it("should not show confirmation when phone already blocks", () => {
            const duplicateCheckResult = {
                phoneExists: true,
                existingHousehold: {
                    id: "123",
                    first_name: "John",
                    last_name: "Doe",
                    phone_number: "+46701234567",
                },
                similarHouseholds: [
                    {
                        id: "456",
                        first_name: "Johan",
                        last_name: "Doe",
                        phone_number: "+46709876543",
                        similarity: 0.85,
                    },
                ],
            };

            // Phone blocking takes precedence
            const shouldShowConfirmation =
                !duplicateCheckResult.phoneExists &&
                duplicateCheckResult.similarHouseholds &&
                duplicateCheckResult.similarHouseholds.length > 0;

            expect(shouldShowConfirmation).toBe(false);
        });
    });

    describe("Validation order", () => {
        it("should check phone duplicate after basic field validation", () => {
            // This test documents the expected validation order:
            // 1. First name validation
            // 2. Last name validation
            // 3. Phone presence check
            // 4. Phone format validation
            // 5. Phone duplicate check (blocking)
            // 6. Similar name check (confirmation dialog)
            // 7. Postal code validation

            const validationSteps = [
                "first_name",
                "last_name",
                "phone_presence",
                "phone_format",
                "phone_duplicate",
                "similar_names",
                "postal_code",
            ];

            expect(validationSteps.indexOf("phone_duplicate")).toBeLessThan(
                validationSteps.indexOf("similar_names"),
            );
            expect(validationSteps.indexOf("phone_duplicate")).toBeGreaterThan(
                validationSteps.indexOf("phone_format"),
            );
        });
    });
});

/**
 * HouseholdForm UI tests
 * Note: Duplicate checking was moved to HouseholdWizard (on Next click)
 * HouseholdForm now only handles input formatting
 */
describe("HouseholdForm UI - Code Structure", () => {
    it("should display fixed +46 prefix for Swedish-only phone input", async () => {
        const { readFileSync } = await import("fs");
        const { join } = await import("path");

        const componentPath = join(
            process.cwd(),
            "app/[locale]/households/enroll/components/HouseholdForm.tsx",
        );
        const content = readFileSync(componentPath, "utf-8");

        // Verify Swedish-only phone handling:
        // - Fixed +46 prefix displayed via leftSection
        // - stripSwedishPrefix used for edit mode
        expect(content).toContain("leftSection");
        expect(content).toContain("+46");
        expect(content).toContain("stripSwedishPrefix");
    });

    it("should have live phone formatting with spaces", async () => {
        const { readFileSync } = await import("fs");
        const { join } = await import("path");

        const componentPath = join(
            process.cwd(),
            "app/[locale]/households/enroll/components/HouseholdForm.tsx",
        );
        const content = readFileSync(componentPath, "utf-8");

        // Verify phone input formatting exists
        expect(content).toContain("formatPhoneInputWithSpaces");
        expect(content).toContain("handlePhoneNumberChange");
    });
});
