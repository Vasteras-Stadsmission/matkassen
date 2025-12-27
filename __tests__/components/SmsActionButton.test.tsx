import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, fireEvent, waitFor } from "@testing-library/react";
import { TestWrapper } from "../test-utils";
import React from "react";

// Mock Tabler icons - must be before component import
vi.mock("@tabler/icons-react", () => ({
    IconSend: () => React.createElement("span", { "data-testid": "icon-send" }, "📤"),
    IconClock: () => React.createElement("span", { "data-testid": "icon-clock" }, "⏰"),
}));

// Mock @mantine/notifications - must be before component import
vi.mock("@mantine/notifications", () => ({
    notifications: {
        show: vi.fn(),
    },
}));

// Mock next-intl - must be before component import
vi.mock("next-intl", () => ({
    useTranslations: vi.fn(() => (key: string, params?: Record<string, string>) => {
        const translations: Record<string, string> = {
            "admin.smsDashboard.actions.sendNow": "Send Now",
            "admin.smsDashboard.actions.tryAgain": "Try Again",
            "admin.smsDashboard.actions.sendAgain": "Send Again",
            "admin.smsDashboard.status.retryScheduled": "Retry scheduled",
            "admin.smsDashboard.status.retryScheduledAt": `Retry at ${params?.time || ""}`,
        };
        return translations[key] || key;
    }),
}));

// Create a mock function we can inspect
const mockSendSms = vi.fn().mockResolvedValue(undefined);

// Mock the SMS action hook - must be before component import
vi.mock("@/app/hooks/useSmsAction", () => ({
    useSmsAction: vi.fn(() => ({
        sendSms: mockSendSms,
        isLoading: false,
        error: null,
    })),
}));

// Import component AFTER mocks are set up
import { SmsActionButton } from "@/components/SmsActionButton";

describe("SmsActionButton", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockSendSms.mockClear();
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

    describe("Action parameter based on SMS status", () => {
        it("should use 'resend' action when clicking on failed SMS", async () => {
            const { container } = render(
                <TestWrapper>
                    <SmsActionButton parcelId="test-parcel-id" smsStatus="failed" />
                </TestWrapper>,
            );

            const button = container.querySelector("button");
            fireEvent.click(button!);

            await waitFor(() => {
                expect(mockSendSms).toHaveBeenCalledWith("test-parcel-id", "resend");
            });
        });

        it("should use 'resend' action when clicking on sent SMS", async () => {
            const { container } = render(
                <TestWrapper>
                    <SmsActionButton parcelId="test-parcel-id" smsStatus="sent" />
                </TestWrapper>,
            );

            const button = container.querySelector("button");
            fireEvent.click(button!);

            await waitFor(() => {
                expect(mockSendSms).toHaveBeenCalledWith("test-parcel-id", "resend");
            });
        });

        it("should use 'send' action when clicking on queued SMS", async () => {
            const { container } = render(
                <TestWrapper>
                    <SmsActionButton parcelId="test-parcel-id" smsStatus="queued" />
                </TestWrapper>,
            );

            const button = container.querySelector("button");
            fireEvent.click(button!);

            await waitFor(() => {
                expect(mockSendSms).toHaveBeenCalledWith("test-parcel-id", "send");
            });
        });

        it("should use 'send' action when no status provided", async () => {
            const { container } = render(
                <TestWrapper>
                    <SmsActionButton parcelId="test-parcel-id" />
                </TestWrapper>,
            );

            const button = container.querySelector("button");
            fireEvent.click(button!);

            await waitFor(() => {
                expect(mockSendSms).toHaveBeenCalledWith("test-parcel-id", "send");
            });
        });

        it("should NOT call sendSms for retrying SMS (shows text instead)", async () => {
            // Retrying SMS should show text, not a button, since the system handles retries
            // This prevents user confusion when clicking a button that does nothing
            const { container } = render(
                <TestWrapper>
                    <SmsActionButton parcelId="test-parcel-id" smsStatus="retrying" />
                </TestWrapper>,
            );

            // Should not have a button - shows text instead
            const button = container.querySelector("button");
            expect(button).toBeNull();

            // Should not have called sendSms
            expect(mockSendSms).not.toHaveBeenCalled();
        });
    });

    describe("Retrying status display", () => {
        it("should show 'Retry scheduled' text for retrying status", () => {
            const { container } = render(
                <TestWrapper>
                    <SmsActionButton parcelId="test-parcel-id" smsStatus="retrying" />
                </TestWrapper>,
            );

            // Should show text content, not a button
            expect(container.textContent).toContain("Retry scheduled");
        });

        it("should show clock icon for retrying status", () => {
            const { getByTestId } = render(
                <TestWrapper>
                    <SmsActionButton parcelId="test-parcel-id" smsStatus="retrying" />
                </TestWrapper>,
            );

            expect(getByTestId("icon-clock")).toBeTruthy();
        });

        it("should show retry time when nextRetryAt is provided", () => {
            const retryTime = new Date("2025-01-15T14:30:00");
            const { container } = render(
                <TestWrapper>
                    <SmsActionButton
                        parcelId="test-parcel-id"
                        smsStatus="retrying"
                        nextRetryAt={retryTime}
                    />
                </TestWrapper>,
            );

            // Should show "Retry at" text with time
            expect(container.textContent).toContain("Retry at");
        });
    });
});
