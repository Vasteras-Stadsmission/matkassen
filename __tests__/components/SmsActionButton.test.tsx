import { describe, it, expect, vi, beforeEach } from "vitest";
import { render } from "@testing-library/react";
import { TestWrapper } from "../test-utils";
import React from "react";

// Mock Tabler icons - must be before component import
vi.mock("@tabler/icons-react", () => ({
    IconSend: () => React.createElement("span", { "data-testid": "icon-send" }, "📤"),
}));

// Mock @mantine/notifications - must be before component import
vi.mock("@mantine/notifications", () => ({
    notifications: {
        show: vi.fn(),
    },
}));

// Mock next-intl - must be before component import
vi.mock("next-intl", () => ({
    useTranslations: vi.fn(() => (key: string) => {
        const translations: Record<string, string> = {
            "admin.smsDashboard.actions.sendNow": "Send Now",
            "admin.smsDashboard.actions.tryAgain": "Try Again",
            "admin.smsDashboard.actions.sendAgain": "Send Again",
        };
        return translations[key] || key;
    }),
}));

// Mock the SMS action hook - must be before component import
vi.mock("@/app/hooks/useSmsAction", () => ({
    useSmsAction: vi.fn(() => ({
        sendSms: vi.fn().mockResolvedValue(undefined),
        isLoading: false,
        error: null,
    })),
}));

// Import component AFTER mocks are set up
import { SmsActionButton } from "@/components/SmsActionButton";

describe("SmsActionButton", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("should render with 'Send Now' label for queued status", () => {
        const { container } = render(
            <TestWrapper>
                <SmsActionButton parcelId="test-parcel-id" smsStatus="queued" />
            </TestWrapper>,
        );

        const button = container.querySelector("button");
        expect(button).toBeTruthy();
        expect(button?.textContent).toContain("Send Now");
    });

    it("should render with 'Try Again' label for failed status", () => {
        const { container } = render(
            <TestWrapper>
                <SmsActionButton parcelId="test-parcel-id" smsStatus="failed" />
            </TestWrapper>,
        );

        const button = container.querySelector("button");
        expect(button).toBeTruthy();
        expect(button?.textContent).toContain("Try Again");
    });

    it("should render with 'Send Again' label for sent status", () => {
        const { container } = render(
            <TestWrapper>
                <SmsActionButton parcelId="test-parcel-id" smsStatus="sent" />
            </TestWrapper>,
        );

        const button = container.querySelector("button");
        expect(button).toBeTruthy();
        expect(button?.textContent).toContain("Send Again");
    });

    it("should be disabled for cancelled status", () => {
        const { container } = render(
            <TestWrapper>
                <SmsActionButton parcelId="test-parcel-id" smsStatus="cancelled" />
            </TestWrapper>,
        );

        const button = container.querySelector("button");
        expect(button).toBeTruthy();
        expect(button?.hasAttribute("disabled")).toBe(true);
    });

    it("should render with default 'Send Now' label when no status provided", () => {
        const { container } = render(
            <TestWrapper>
                <SmsActionButton parcelId="test-parcel-id" />
            </TestWrapper>,
        );

        const button = container.querySelector("button");
        expect(button).toBeTruthy();
        expect(button?.textContent).toContain("Send Now");
    });
});
