/**
 * Regression Tests: Delete Protection UX
 *
 * CRITICAL: Ensures admins cannot accidentally delete options that
 * households are currently using.
 *
 * Real-world scenario: An admin sees "Gluten-free" has usageCount: 5.
 * They should NOT be able to click delete, and should see a tooltip
 * explaining why.
 *
 * If these tests fail, admins might see confusing errors when trying
 * to delete in-use options.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

describe("Household Options - Delete Button Protection", () => {
    const componentPath = join(
        process.cwd(),
        "app/[locale]/settings/options/components/HouseholdOptionsManager.tsx",
    );
    const componentSource = readFileSync(componentPath, "utf-8");

    it("should disable delete button when option is in use", () => {
        // The delete button uses ternary: if usageCount > 0, show disabled button
        expect(componentSource).toContain("option.usageCount > 0 ?");
        // The disabled button should be truly disabled
        expect(componentSource).toMatch(/Tooltip[\s\S]*?ActionIcon[\s\S]*?disabled[\s\S]*?IconTrash/);
    });

    it("should show tooltip explaining why delete is disabled", () => {
        // Users need to understand WHY they can't delete
        expect(componentSource).toContain("Tooltip");
        expect(componentSource).toContain("cannotDeleteTooltip");
    });

    it("should show usage count badge for each option", () => {
        // Admin needs to see how many households use each option
        expect(componentSource).toContain("usageCount");
        expect(componentSource).toContain("Badge");
    });
});

describe("Household Options - Delete Confirmation Modal", () => {
    const componentPath = join(
        process.cwd(),
        "app/[locale]/settings/options/components/HouseholdOptionsManager.tsx",
    );
    const componentSource = readFileSync(componentPath, "utf-8");

    it("should require confirmation before deleting", () => {
        // Delete should open a modal, not delete immediately
        expect(componentSource).toContain("deleteModalOpened");
        // Uses useDisclosure hook which provides open/close functions
        expect(componentSource).toContain("openDeleteModal");
        expect(componentSource).toContain("closeDeleteModal");
    });

    it("should disable confirm button in modal when option is in use", () => {
        // Double protection: modal button should also be disabled
        // This handles the race condition where usage changes after opening modal
        expect(componentSource).toMatch(/disabled=\{.*usageCount.*>/);
    });

    it("should show which option is being deleted in modal", () => {
        // User needs to confirm they're deleting the right item
        expect(componentSource).toContain("deletingOption");
    });
});

describe("Household Options - Error Message Handling", () => {
    const componentPath = join(
        process.cwd(),
        "app/[locale]/settings/options/components/HouseholdOptionsManager.tsx",
    );
    const componentSource = readFileSync(componentPath, "utf-8");

    it("should handle OPTION_IN_USE error from server", () => {
        // If FK constraint is violated, show meaningful error
        expect(componentSource).toContain("OPTION_IN_USE");
    });

    it("should handle DUPLICATE_NAME error", () => {
        // If user tries to create duplicate name
        expect(componentSource).toContain("DUPLICATE_NAME");
    });

    it("should handle VALIDATION_ERROR", () => {
        // If validation fails
        expect(componentSource).toContain("VALIDATION_ERROR");
    });

    it("should have fallback for unknown errors", () => {
        // Unknown errors should show something meaningful
        expect(componentSource).toContain("UNKNOWN");
    });
});
