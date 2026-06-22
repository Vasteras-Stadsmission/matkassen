"use client";

import { Stack, Title, Text, Paper, Checkbox, Alert } from "@mantine/core";
import { IconAlertCircle, IconCheck } from "@tabler/icons-react";
import { useTranslations } from "next-intl";

export interface VerificationQuestion {
    id: string;
    question_text: string;
    help_text: string | null;
    is_required: boolean;
    is_active: boolean;
    display_order: number;
}

interface VerificationFormProps {
    questions: VerificationQuestion[];
    checkedQuestions: Set<string>;
    onUpdateChecked: (questionId: string, checked: boolean) => void;
}

export default function VerificationForm({
    questions,
    checkedQuestions,
    onUpdateChecked,
}: VerificationFormProps) {
    const t = useTranslations("wizard.verification");
    const tChecklist = useTranslations("settings.enrollmentChecklist");
    // Defensive filtering: the API should only return active questions, but the
    // checklist renderer should never display inactive questions if that regresses.
    const activeQuestions = questions.filter(q => q.is_active);

    // Calculate progress
    const requiredQuestions = activeQuestions.filter(q => q.is_required);
    const checkedRequiredCount = requiredQuestions.filter(q => checkedQuestions.has(q.id)).length;
    const allRequiredChecked = requiredQuestions.length === checkedRequiredCount;

    // No questions configured - show friendly message
    if (activeQuestions.length === 0) {
        return (
            <Alert icon={<IconCheck size="1rem" />} title={t("title")} color="blue">
                {t("noQuestions")}
            </Alert>
        );
    }

    // Get question text
    const getQuestionText = (q: VerificationQuestion) => {
        return q.question_text;
    };

    const getHelpText = (q: VerificationQuestion) => {
        return q.help_text;
    };

    return (
        <Stack gap="md">
            <div>
                <Title order={3} mb="xs">
                    {t("title")}
                </Title>
                <Text size="sm" c="dimmed">
                    {t("description")}
                </Text>
            </div>

            {/* Progress indicator */}
            {requiredQuestions.length > 0 && (
                <Alert
                    icon={
                        allRequiredChecked ? (
                            <IconCheck size="1rem" />
                        ) : (
                            <IconAlertCircle size="1rem" />
                        )
                    }
                    color={allRequiredChecked ? "green" : "yellow"}
                    variant="light"
                >
                    {allRequiredChecked
                        ? t("allComplete")
                        : t("progress", {
                              completed: String(checkedRequiredCount),
                              total: String(requiredQuestions.length),
                          })}
                </Alert>
            )}

            {/* Staff checklist instruction */}
            <Alert icon={<IconCheck size="1rem" />} color="blue" variant="light">
                <Text fw={500} mb="xs">
                    {tChecklist("instructionText")}
                </Text>
            </Alert>

            <Paper withBorder p="md">
                <Stack gap="md">
                    {activeQuestions.map(question => {
                        const questionText = getQuestionText(question);
                        const helpText = getHelpText(question);

                        return (
                            <Checkbox
                                key={question.id}
                                label={
                                    <span>
                                        {questionText}
                                        {question.is_required && (
                                            <Text component="span" c="red" size="sm" ml={4}>
                                                *
                                            </Text>
                                        )}
                                    </span>
                                }
                                description={helpText || undefined}
                                checked={checkedQuestions.has(question.id)}
                                onChange={e =>
                                    onUpdateChecked(question.id, e.currentTarget.checked)
                                }
                                styles={{
                                    body: { alignItems: "flex-start" },
                                    label: { paddingTop: 2 },
                                }}
                            />
                        );
                    })}
                </Stack>
            </Paper>
        </Stack>
    );
}
