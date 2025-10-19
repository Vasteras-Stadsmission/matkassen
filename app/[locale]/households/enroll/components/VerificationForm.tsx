"use client";

import { useState, useEffect, useRef } from "react";
import { Stack, Title, Text, Paper, Checkbox, Alert, Loader, Center } from "@mantine/core";
import { IconAlertCircle, IconCheck } from "@tabler/icons-react";
import { useLocale, useTranslations } from "next-intl";

interface VerificationQuestion {
    id: string;
    question_text_sv: string;
    question_text_en: string;
    help_text_sv: string | null;
    help_text_en: string | null;
    is_required: boolean;
    display_order: number;
}

interface VerificationFormProps {
    pickupLocationId: string;
    checkedQuestions: Set<string>;
    onUpdateChecked: (questionId: string, checked: boolean) => void;
}

export default function VerificationForm({
    pickupLocationId,
    checkedQuestions,
    onUpdateChecked,
}: VerificationFormProps) {
    const locale = useLocale() as "en" | "sv";
    const t = useTranslations("wizard.verification");

    const [questions, setQuestions] = useState<VerificationQuestion[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // AbortController to prevent race conditions when switching locations
    const abortControllerRef = useRef<AbortController | null>(null);

    useEffect(() => {
        if (!pickupLocationId) {
            setQuestions([]);
            setIsLoading(false);
            return;
        }

        // Cancel any in-flight request to prevent race conditions
        if (abortControllerRef.current) {
            abortControllerRef.current.abort();
        }
        abortControllerRef.current = new AbortController();

        // Fetch verification questions for this pickup location
        const fetchQuestions = async () => {
            setIsLoading(true);
            setError(null);

            try {
                const response = await fetch(
                    `/api/admin/pickup-locations/${pickupLocationId}/verification-questions`,
                    {
                        signal: abortControllerRef.current!.signal,
                    },
                );

                if (!response.ok) {
                    throw new Error(t("errorLoading"));
                }

                const data = await response.json();
                setQuestions(data);
            } catch (err) {
                // Ignore aborted requests - they're intentional cancellations
                if (err instanceof Error && err.name === "AbortError") {
                    return;
                }
                console.error("Error fetching verification questions:", err);
                setError(err instanceof Error ? err.message : t("errorUnknown"));
            } finally {
                setIsLoading(false);
            }
        };

        fetchQuestions();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [pickupLocationId]);
    // Note: 't' function from useTranslations is stable and doesn't need to be in deps

    // Cleanup: abort any pending requests on unmount
    useEffect(() => {
        return () => {
            if (abortControllerRef.current) {
                abortControllerRef.current.abort();
            }
        };
    }, []);

    // Calculate progress
    const requiredQuestions = questions.filter(q => q.is_required);
    const checkedRequiredCount = requiredQuestions.filter(q => checkedQuestions.has(q.id)).length;
    const allRequiredChecked = requiredQuestions.length === checkedRequiredCount;

    if (isLoading) {
        return (
            <Center py="xl">
                <Loader size="lg" />
            </Center>
        );
    }

    if (error) {
        return (
            <Alert
                icon={<IconAlertCircle size="1rem" />}
                title={t("title")}
                color="red"
                variant="filled"
            >
                {error}
            </Alert>
        );
    }

    // No questions configured - show friendly message
    if (questions.length === 0) {
        return (
            <Alert icon={<IconCheck size="1rem" />} title={t("title")} color="blue">
                {t("noQuestions")}
            </Alert>
        );
    }

    // Get question text based on current locale
    const getQuestionText = (q: VerificationQuestion) => {
        return locale === "sv" ? q.question_text_sv : q.question_text_en;
    };

    const getHelpText = (q: VerificationQuestion) => {
        return locale === "sv" ? q.help_text_sv : q.help_text_en;
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

            <Paper withBorder p="md">
                <Stack gap="md">
                    {questions.map(question => {
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
