/**
 * Unit Tests: VerificationForm Client-Side Defensive Filtering
 *
 * Critical Security Test: Verify that inactive questions are filtered out
 * even if the API mistakenly returns them (defense-in-depth)
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { MantineProvider } from "@mantine/core";
import VerificationForm from "@/app/[locale]/households/enroll/components/VerificationForm";
import enMessages from "@/messages/en.json";

describe("VerificationForm - Client-Side Defensive Filtering", () => {
    const mockOnUpdateChecked = vi.fn();

    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("should filter out inactive questions passed to the renderer (defense-in-depth)", () => {
        render(
            <MantineProvider>
                <NextIntlClientProvider locale="en" messages={enMessages}>
                    <VerificationForm
                        questions={[
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
                                is_active: false,
                                display_order: 2,
                            },
                        ]}
                        checkedQuestions={new Set()}
                        onUpdateChecked={mockOnUpdateChecked}
                    />
                </NextIntlClientProvider>
            </MantineProvider>,
        );

        expect(screen.getByText("Active Question")).toBeDefined();
        expect(screen.queryByText("Inactive Question")).toBeNull();

        const checkboxes = screen.getAllByRole("checkbox");
        expect(checkboxes).toHaveLength(1);
    });

    it("should handle only inactive questions (edge case)", () => {
        render(
            <MantineProvider>
                <NextIntlClientProvider locale="en" messages={enMessages}>
                    <VerificationForm
                        questions={[
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
                        ]}
                        checkedQuestions={new Set()}
                        onUpdateChecked={mockOnUpdateChecked}
                    />
                </NextIntlClientProvider>
            </MantineProvider>,
        );

        expect(screen.getByText("No verification checklist configured")).toBeDefined();

        const checkboxes = screen.queryAllByRole("checkbox");
        expect(checkboxes).toHaveLength(0);
    });

    it("should display all active questions", () => {
        render(
            <MantineProvider>
                <NextIntlClientProvider locale="en" messages={enMessages}>
                    <VerificationForm
                        questions={[
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
                        ]}
                        checkedQuestions={new Set()}
                        onUpdateChecked={mockOnUpdateChecked}
                    />
                </NextIntlClientProvider>
            </MantineProvider>,
        );

        expect(screen.getByText("Question 1")).toBeDefined();
        expect(screen.getByText("Question 2")).toBeDefined();

        const checkboxes = screen.getAllByRole("checkbox");
        expect(checkboxes).toHaveLength(2);
    });
});
