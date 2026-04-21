/**
 * Regression Tests: Modal Accessibility
 *
 * CRITICAL: Ensures accessible modal replaces native confirm() dialog.
 * Prevents regression back to inaccessible native browser dialogs.
 *
 * If this test fails, the delete confirmation may use native confirm()
 * which has poor screen reader support.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

describe("EnrollmentChecklist - Modal Accessibility", () => {
    const componentPath = join(
        process.cwd(),
        "app/[locale]/settings/general/components/EnrollmentChecklist.tsx",
    );
    const componentSource = readFileSync(componentPath, "utf-8");

    it("should NOT use native confirm() dialog", () => {
        // Regression: Must not use browser's native confirm()
        expect(componentSource).not.toMatch(/\bconfirm\(/);
        expect(componentSource).not.toMatch(/window\.confirm/);
    });

    it("should have delete confirmation modal with proper state management", () => {
        // Must have modal state management
        expect(componentSource).toContain("deleteModalOpened");
        expect(componentSource).toContain("openDeleteModal");
        expect(componentSource).toContain("closeDeleteModal");
        expect(componentSource).toContain("deletingQuestion");
    });

    it("should have accessible delete modal with title", () => {
        // Modal must have proper title
        expect(componentSource).toMatch(/title=\{t\(["']deleteModalTitle["']\)\}/);
    });

    it("should have separate delete confirmation handler", () => {
        // Must separate click from confirmation
        expect(componentSource).toContain("handleDeleteQuestion");
        expect(componentSource).toContain("handleConfirmDelete");
    });

    it("should show loading state during deletion", () => {
        // Must have deleting state
        expect(componentSource).toContain("const [deleting");
        expect(componentSource).toContain("setDeleting(true)");
        expect(componentSource).toContain("loading={deleting}");
    });
});

describe("SettingsDropdown - Link Accessibility", () => {
    const componentPath = join(process.cwd(), "components/SettingsDropdown/SettingsDropdown.tsx");
    const componentSource = readFileSync(componentPath, "utf-8");

    it("should have aria-label on settings button", () => {
        // The ActionIcon should have aria-label
        expect(componentSource).toMatch(/aria-label=\{t\(["']settings["']\)\}/);
    });

    it("should link to the settings page", () => {
        // Should be a simple link to /settings
        expect(componentSource).toContain('href="/settings"');
        expect(componentSource).toContain("component={Link}");
    });

    it("should have a tooltip for discoverability", () => {
        expect(componentSource).toContain("<Tooltip");
    });
});
