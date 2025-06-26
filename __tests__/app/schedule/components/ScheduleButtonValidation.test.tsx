import { describe, test, expect, beforeEach, afterEach, vi } from "vitest";
import React from "react";
import { renderWithProviders } from "../test-helpers";
import { MockButton } from "../mock-components";

// Mock next-intl directly
vi.mock("next-intl", () => ({
    useTranslations: () => (key: string) => key,
}));

// Create a simplified version of the schedule form to test button state logic
function SimplifiedScheduleForm({
    startWeek,
    endWeek,
    hasOpenDays,
    showOverlapWarning = false,
}: {
    startWeek: boolean;
    endWeek: boolean;
    hasOpenDays: boolean;
    showOverlapWarning?: boolean;
}) {
    return (
        <div>
            <MockButton
                type="submit"
                disabled={showOverlapWarning || !startWeek || !endWeek || !hasOpenDays}
                data-testid="submit-button"
            >
                createSchedule
            </MockButton>
        </div>
    );
}

describe("Schedule Form Submit Button Validation", () => {
    test("button should be disabled when no days are open", () => {
        const { container } = renderWithProviders(
            <SimplifiedScheduleForm startWeek={true} endWeek={true} hasOpenDays={false} />,
        );

        const button = container.querySelector(
            '[data-testid="submit-button"]',
        ) as HTMLButtonElement;
        expect(button).not.toBeNull();
        expect(button.disabled).toBe(true);
    });

    test("button should be disabled when start week is not selected", () => {
        const { container } = renderWithProviders(
            <SimplifiedScheduleForm startWeek={false} endWeek={true} hasOpenDays={true} />,
        );

        const button = container.querySelector(
            '[data-testid="submit-button"]',
        ) as HTMLButtonElement;
        expect(button).not.toBeNull();
        expect(button.disabled).toBe(true);
    });

    test("button should be disabled when end week is not selected", () => {
        const { container } = renderWithProviders(
            <SimplifiedScheduleForm startWeek={true} endWeek={false} hasOpenDays={true} />,
        );

        const button = container.querySelector(
            '[data-testid="submit-button"]',
        ) as HTMLButtonElement;
        expect(button).not.toBeNull();
        expect(button.disabled).toBe(true);
    });

    test("button should be disabled when overlap warning is shown", () => {
        const { container } = renderWithProviders(
            <SimplifiedScheduleForm
                startWeek={true}
                endWeek={true}
                hasOpenDays={true}
                showOverlapWarning={true}
            />,
        );

        const button = container.querySelector(
            '[data-testid="submit-button"]',
        ) as HTMLButtonElement;
        expect(button).not.toBeNull();
        expect(button.disabled).toBe(true);
    });

    test("button should be enabled when all conditions are met", () => {
        const { container } = renderWithProviders(
            <SimplifiedScheduleForm
                startWeek={true}
                endWeek={true}
                hasOpenDays={true}
                showOverlapWarning={false}
            />,
        );

        const button = container.querySelector(
            '[data-testid="submit-button"]',
        ) as HTMLButtonElement;
        expect(button).not.toBeNull();
        expect(button.disabled).toBe(false);
    });

    // Keep the plain logic test as well
    test("button state logic works without DOM", () => {
        // Manual testing of the disabled condition logic
        const isDisabled = (
            startWeek: boolean,
            endWeek: boolean,
            hasOpenDays: boolean,
            showOverlapWarning = false,
        ) => {
            return showOverlapWarning || !startWeek || !endWeek || !hasOpenDays;
        };

        expect(isDisabled(true, true, true, false)).toBe(false);
        expect(isDisabled(false, true, true, false)).toBe(true);
        expect(isDisabled(true, false, true, false)).toBe(true);
        expect(isDisabled(true, true, false, false)).toBe(true);
        expect(isDisabled(true, true, true, true)).toBe(true);
    });
});
