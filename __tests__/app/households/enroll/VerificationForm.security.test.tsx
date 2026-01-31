/**
 * Unit Tests: VerificationForm Client-Side Defensive Filtering
 *
 * Critical Security Test: Verify that inactive questions are filtered out
 * even if the API mistakenly returns them (defense-in-depth)
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { MantineProvider } from "@mantine/core";
import VerificationForm from "@/app/[locale]/households/enroll/components/VerificationForm";
import enMessages from "@/messages/en.json";

// Mock fetch
global.fetch = vi.fn();

describe("VerificationForm - Client-Side Defensive Filtering", () => {
    const mockOnUpdateChecked = vi.fn();

    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("should filter out inactive questions returned by API (defense-in-depth)", async () => {
        // Mock API returning both active and inactive questions
        vi.mocked(global.fetch).mockResolvedValueOnce({
            ok: true,
            json: async () => [
                {
                    id: "q1",
                    question_text: "Active Question",
                    help_text: null,
                    is_required: true,
                    is_active: true,
                    display_order: 1,
                },
                {
                    id: "q2",
                    question_text: "Inactive Question",
                    help_text: null,
                    is_required: true,
                    is_active: false, // Should be filtered out
                    display_order: 2,
                },
            ],
        } as Response);

        render(
            <MantineProvider>
                <NextIntlClientProvider locale="en" messages={enMessages}>
                    <VerificationForm
                        checkedQuestions={new Set()}
                        onUpdateChecked={mockOnUpdateChecked}
                    />
                </NextIntlClientProvider>
            </MantineProvider>,
        );

        // Wait for questions to load
        await waitFor(() => {
            expect(screen.getByText("Active Question")).toBeDefined();
        });

        // Verify inactive question is NOT displayed
        expect(screen.queryByText("Inactive Question")).toBeNull();

        // Verify only 1 checkbox exists (active question only)
        const checkboxes = screen.getAllByRole("checkbox");
        expect(checkboxes).toHaveLength(1);
    });

    it("should handle API returning only inactive questions (edge case)", async () => {
        // Mock API returning only inactive questions
        vi.mocked(global.fetch).mockResolvedValueOnce({
            ok: true,
            json: async () => [
                {
                    id: "q1",
                    question_text: "Inactive Question 1",
                    help_text: null,
                    is_required: true,
                    is_active: false,
                    display_order: 1,
                },
                {
                    id: "q2",
                    question_text: "Inactive Question 2",
                    help_text: null,
                    is_required: false,
                    is_active: false,
                    display_order: 2,
                },
            ],
        } as Response);

        render(
            <MantineProvider>
                <NextIntlClientProvider locale="en" messages={enMessages}>
                    <VerificationForm
                        checkedQuestions={new Set()}
                        onUpdateChecked={mockOnUpdateChecked}
                    />
                </NextIntlClientProvider>
            </MantineProvider>,
        );

        // Wait for empty state to appear
        await waitFor(() => {
            expect(screen.getByText("No verification checklist configured")).toBeDefined();
        });

        // Verify no checkboxes exist
        const checkboxes = screen.queryAllByRole("checkbox");
        expect(checkboxes).toHaveLength(0);
    });

    it("should display all active questions when API returns correctly filtered data", async () => {
        // Mock API returning only active questions (correct behavior)
        vi.mocked(global.fetch).mockResolvedValueOnce({
            ok: true,
            json: async () => [
                {
                    id: "q1",
                    question_text: "Question 1",
                    help_text: null,
                    is_required: true,
                    is_active: true,
                    display_order: 1,
                },
                {
                    id: "q2",
                    question_text: "Question 2",
                    help_text: null,
                    is_required: false,
                    is_active: true,
                    display_order: 2,
                },
            ],
        } as Response);

        render(
            <MantineProvider>
                <NextIntlClientProvider locale="en" messages={enMessages}>
                    <VerificationForm
                        checkedQuestions={new Set()}
                        onUpdateChecked={mockOnUpdateChecked}
                    />
                </NextIntlClientProvider>
            </MantineProvider>,
        );

        // Wait for questions to load
        await waitFor(() => {
            expect(screen.getByText("Question 1")).toBeDefined();
        });

        expect(screen.getByText("Question 2")).toBeDefined();

        // Verify 2 checkboxes exist
        const checkboxes = screen.getAllByRole("checkbox");
        expect(checkboxes).toHaveLength(2);
    });
});
