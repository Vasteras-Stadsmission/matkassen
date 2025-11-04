"use client";

import { useState, useEffect, useCallback } from "react";
import {
    Container,
    Title,
    Text,
    Button,
    Stack,
    Card,
    Group,
    ActionIcon,
    Modal,
    TextInput,
    Textarea,
    Switch,
    LoadingOverlay,
    Badge,
    Alert,
    Divider,
} from "@mantine/core";
import {
    IconPlus,
    IconEdit,
    IconTrash,
    IconGripVertical,
    IconInfoCircle,
} from "@tabler/icons-react";
import { useDisclosure } from "@mantine/hooks";
import { notifications } from "@mantine/notifications";
import { useTranslations } from "next-intl";
import {
    DndContext,
    closestCenter,
    PointerSensor,
    useSensor,
    useSensors,
    DragEndEvent,
} from "@dnd-kit/core";
import { arrayMove, SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
    listVerificationQuestions,
    createVerificationQuestion,
    updateVerificationQuestion,
    deleteVerificationQuestion,
    reorderVerificationQuestions,
    type VerificationQuestion,
} from "../actions";

interface SortableQuestionItemProps {
    question: VerificationQuestion;
    onEdit: (question: VerificationQuestion) => void;
    onDelete: (questionId: string) => void;
}

function SortableQuestionItem({ question, onEdit, onDelete }: SortableQuestionItemProps) {
    const t = useTranslations("settings.enrollmentChecklist");
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
        id: question.id,
    });

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.5 : 1,
    };

    return (
        <Card ref={setNodeRef} style={style} shadow="sm" padding="md" withBorder>
            <Group justify="space-between" wrap="nowrap">
                <Group gap="md" style={{ flex: 1 }}>
                    <ActionIcon
                        variant="subtle"
                        color="gray"
                        size="sm"
                        style={{ cursor: "grab" }}
                        {...attributes}
                        {...listeners}
                        title={t("reorderHint")}
                    >
                        <IconGripVertical size={16} />
                    </ActionIcon>

                    <div style={{ flex: 1 }}>
                        <Group gap="xs" mb="xs">
                            <Text fw={500}>{question.question_text_sv}</Text>
                            {question.is_required && (
                                <Badge size="sm" color="red" variant="light">
                                    {t("badges.required")}
                                </Badge>
                            )}
                        </Group>
                        <Text size="sm" c="dimmed">
                            {question.question_text_en}
                        </Text>
                        {(question.help_text_sv || question.help_text_en) && (
                            <Group gap="xs" mt="xs">
                                <IconInfoCircle size={14} />
                                <Text size="xs" c="dimmed">
                                    {t("badges.helpAvailable")}
                                </Text>
                            </Group>
                        )}
                    </div>
                </Group>

                <Group gap="xs">
                    <ActionIcon variant="subtle" color="blue" onClick={() => onEdit(question)}>
                        <IconEdit size={16} />
                    </ActionIcon>
                    <ActionIcon variant="subtle" color="red" onClick={() => onDelete(question.id)}>
                        <IconTrash size={16} />
                    </ActionIcon>
                </Group>
            </Group>
        </Card>
    );
}

interface QuestionFormData {
    question_text_sv: string;
    question_text_en: string;
    help_text_sv: string;
    help_text_en: string;
    is_required: boolean;
}

const ERROR_TRANSLATIONS = {
    FETCH_FAILED: "notifications.errors.FETCH_FAILED",
    VALIDATION_ERROR: "notifications.errors.VALIDATION_ERROR",
    VALIDATION_ERROR_SV_EMPTY: "notifications.errors.VALIDATION_ERROR_SV_EMPTY",
    VALIDATION_ERROR_EN_EMPTY: "notifications.errors.VALIDATION_ERROR_EN_EMPTY",
    CREATE_FAILED: "notifications.errors.CREATE_FAILED",
    UPDATE_FAILED: "notifications.errors.UPDATE_FAILED",
    NOT_FOUND: "notifications.errors.NOT_FOUND",
    DELETE_FAILED: "notifications.errors.DELETE_FAILED",
    REORDER_FAILED: "notifications.errors.REORDER_FAILED",
} as const;

type KnownErrorCode = keyof typeof ERROR_TRANSLATIONS;

const isKnownErrorCode = (code: string): code is KnownErrorCode =>
    code in ERROR_TRANSLATIONS;

export function EnrollmentChecklist() {
    const t = useTranslations("settings.enrollmentChecklist");

    // Map error codes to translated messages
    // Maintains a list of known error codes for type safety
    const getErrorMessage = useCallback(
        (error: { code: string; message: string }): string => {
            if (isKnownErrorCode(error.code)) {
                return t(ERROR_TRANSLATIONS[error.code]);
            }

            // Fallback to generic error for unknown codes
            return t("notifications.errors.UNKNOWN");
        },
        [t],
    );

    const [questions, setQuestions] = useState<VerificationQuestion[]>([]);
    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [deleting, setDeleting] = useState(false);
    const [modalOpened, { open: openModal, close: closeModal }] = useDisclosure(false);
    const [deleteModalOpened, { open: openDeleteModal, close: closeDeleteModal }] =
        useDisclosure(false);
    const [editingQuestion, setEditingQuestion] = useState<VerificationQuestion | null>(null);
    const [deletingQuestion, setDeletingQuestion] = useState<VerificationQuestion | null>(null);
    const [formData, setFormData] = useState<QuestionFormData>({
        question_text_sv: "",
        question_text_en: "",
        help_text_sv: "",
        help_text_en: "",
        is_required: true,
    });

    const sensors = useSensors(
        useSensor(PointerSensor, {
            activationConstraint: {
                distance: 8,
            },
        }),
    );

    const loadQuestions = useCallback(async () => {
        setLoading(true);
        try {
            const result = await listVerificationQuestions();
            if (result.success) {
                setQuestions(result.data);
            } else {
                notifications.show({
                    title: t("notifications.error"),
                    message: getErrorMessage(result.error),
                    color: "red",
                });
            }
        } catch {
            notifications.show({
                title: t("notifications.error"),
                message: t("notifications.loadError"),
                color: "red",
            });
        } finally {
            setLoading(false);
        }
    }, [t, getErrorMessage]);

    useEffect(() => {
        loadQuestions();
    }, [loadQuestions]);

    const handleAddQuestion = () => {
        setEditingQuestion(null);
        setFormData({
            question_text_sv: "",
            question_text_en: "",
            help_text_sv: "",
            help_text_en: "",
            is_required: true,
        });
        openModal();
    };

    const handleEditQuestion = (question: VerificationQuestion) => {
        setEditingQuestion(question);
        setFormData({
            question_text_sv: question.question_text_sv,
            question_text_en: question.question_text_en,
            help_text_sv: question.help_text_sv || "",
            help_text_en: question.help_text_en || "",
            is_required: question.is_required,
        });
        openModal();
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setSubmitting(true);

        try {
            const data = {
                question_text_sv: formData.question_text_sv,
                question_text_en: formData.question_text_en,
                // Send empty strings explicitly so server can clear help text
                help_text_sv: formData.help_text_sv,
                help_text_en: formData.help_text_en,
                is_required: formData.is_required,
            };

            let result;
            if (editingQuestion) {
                result = await updateVerificationQuestion(editingQuestion.id, data);
            } else {
                result = await createVerificationQuestion(data);
            }

            if (result.success) {
                notifications.show({
                    title: t("notifications.success"),
                    message: editingQuestion
                        ? t("notifications.updated")
                        : t("notifications.created"),
                    color: "green",
                });
                closeModal();
                loadQuestions();
            } else {
                notifications.show({
                    title: t("notifications.error"),
                    message: getErrorMessage(result.error),
                    color: "red",
                });
            }
        } catch {
            notifications.show({
                title: t("notifications.error"),
                message: t("notifications.saveError"),
                color: "red",
            });
        } finally {
            setSubmitting(false);
        }
    };

    const handleDeleteQuestion = async (questionId: string) => {
        const question = questions.find(q => q.id === questionId);
        if (question) {
            setDeletingQuestion(question);
            openDeleteModal();
        }
    };

    const handleConfirmDelete = async () => {
        if (!deletingQuestion) return;

        setDeleting(true);
        try {
            const result = await deleteVerificationQuestion(deletingQuestion.id);
            if (result.success) {
                notifications.show({
                    title: t("notifications.success"),
                    message: t("notifications.deleted"),
                    color: "green",
                });
                closeDeleteModal();
                setDeletingQuestion(null);
                loadQuestions();
            } else {
                notifications.show({
                    title: t("notifications.error"),
                    message: getErrorMessage(result.error),
                    color: "red",
                });
            }
        } catch {
            notifications.show({
                title: t("notifications.error"),
                message: t("notifications.deleteError"),
                color: "red",
            });
        } finally {
            setDeleting(false);
        }
    };

    const handleDragEnd = async (event: DragEndEvent) => {
        const { active, over } = event;

        if (active.id !== over?.id && over?.id) {
            const oldIndex = questions.findIndex(q => q.id === active.id);
            const newIndex = questions.findIndex(q => q.id === over.id);

            const newOrder = arrayMove(questions, oldIndex, newIndex);
            setQuestions(newOrder);

            try {
                const result = await reorderVerificationQuestions(newOrder.map(q => q.id));
                if (result.success) {
                    notifications.show({
                        title: t("notifications.success"),
                        message: t("notifications.reordered"),
                        color: "green",
                    });
                } else {
                    // Revert on error
                    setQuestions(questions);
                    notifications.show({
                        title: t("notifications.error"),
                        message: getErrorMessage(result.error),
                        color: "red",
                    });
                }
            } catch {
                // Revert on error
                setQuestions(questions);
                notifications.show({
                    title: t("notifications.error"),
                    message: t("notifications.reorderError"),
                    color: "red",
                });
            }
        }
    };

    return (
        <Container size="md" py="md">
            <Stack gap="lg">
                <Group justify="space-between">
                    <div>
                        <Title order={2}>{t("title")}</Title>
                        <Text c="dimmed" mt="xs">
                            {t("description")}
                        </Text>
                    </div>
                    <Button leftSection={<IconPlus size={16} />} onClick={handleAddQuestion}>
                        {t("addChecklistItem")}
                    </Button>
                </Group>

                {questions.length > 0 && (
                    <Alert icon={<IconInfoCircle size={16} />} color="blue" variant="light">
                        <Text fw={500} mb="xs">
                            {t("instructionText")}
                        </Text>
                        <Stack gap="xs">
                            {questions.map(question => (
                                <Text key={question.id} size="sm">
                                    • {question.question_text_sv}
                                </Text>
                            ))}
                        </Stack>
                    </Alert>
                )}

                <div style={{ position: "relative" }}>
                    <LoadingOverlay visible={loading} />

                    {questions.length === 0 && !loading ? (
                        <Stack gap="md">
                            <Alert icon={<IconInfoCircle size={16} />} color="blue">
                                {t("emptyState")}
                            </Alert>
                            <Alert color="gray" variant="light">
                                <Text fw={500} mb="xs">
                                    {t("examples.title")}
                                </Text>
                                <Stack gap="xs">
                                    <Text size="sm" c="dimmed">
                                        • {t("examples.item1")}
                                    </Text>
                                    <Text size="sm" c="dimmed">
                                        • {t("examples.item2")}
                                    </Text>
                                    <Text size="sm" c="dimmed">
                                        • {t("examples.item3")}
                                    </Text>
                                    <Text size="sm" c="dimmed">
                                        • {t("examples.item4")}
                                    </Text>
                                </Stack>
                            </Alert>
                        </Stack>
                    ) : (
                        <DndContext
                            sensors={sensors}
                            collisionDetection={closestCenter}
                            onDragEnd={handleDragEnd}
                        >
                            <SortableContext
                                items={questions.map(q => q.id)}
                                strategy={verticalListSortingStrategy}
                            >
                                <Stack gap="md">
                                    {questions.map(question => (
                                        <SortableQuestionItem
                                            key={question.id}
                                            question={question}
                                            onEdit={handleEditQuestion}
                                            onDelete={handleDeleteQuestion}
                                        />
                                    ))}
                                </Stack>
                            </SortableContext>
                        </DndContext>
                    )}
                </div>
            </Stack>

            {/* Add/Edit Checklist Item Modal */}
            <Modal
                opened={modalOpened}
                onClose={closeModal}
                title={editingQuestion ? t("editChecklistItem") : t("addChecklistItem")}
                size="lg"
            >
                <form onSubmit={handleSubmit}>
                    <Stack gap="md">
                        <TextInput
                            label={t("form.checklistTextSv")}
                            placeholder={t("form.placeholder")}
                            required
                            value={formData.question_text_sv}
                            onChange={e =>
                                setFormData(prev => ({ ...prev, question_text_sv: e.target.value }))
                            }
                        />

                        <TextInput
                            label={t("form.checklistTextEn")}
                            placeholder={t("form.placeholder")}
                            required
                            value={formData.question_text_en}
                            onChange={e =>
                                setFormData(prev => ({ ...prev, question_text_en: e.target.value }))
                            }
                        />

                        <Divider />

                        <Textarea
                            label={t("form.helpTextSv")}
                            placeholder={t("form.helpTextPlaceholderSv")}
                            value={formData.help_text_sv}
                            onChange={e =>
                                setFormData(prev => ({ ...prev, help_text_sv: e.target.value }))
                            }
                        />

                        <Textarea
                            label={t("form.helpTextEn")}
                            placeholder={t("form.helpTextPlaceholderEn")}
                            value={formData.help_text_en}
                            onChange={e =>
                                setFormData(prev => ({ ...prev, help_text_en: e.target.value }))
                            }
                        />

                        <Switch
                            label={t("form.isRequired")}
                            description={t("form.requiredHint")}
                            checked={formData.is_required}
                            onChange={e =>
                                setFormData(prev => ({
                                    ...prev,
                                    is_required: e.currentTarget.checked,
                                }))
                            }
                        />

                        <Group justify="flex-end" gap="sm">
                            <Button variant="subtle" onClick={closeModal}>
                                {t("buttons.cancel")}
                            </Button>
                            <Button type="submit" loading={submitting}>
                                {t("buttons.save")}
                            </Button>
                        </Group>
                    </Stack>
                </form>
            </Modal>

            {/* Delete Confirmation Modal */}
            <Modal
                opened={deleteModalOpened}
                onClose={closeDeleteModal}
                title={t("deleteModalTitle")}
                size="md"
            >
                <Stack gap="md">
                    <Text>{t("deleteConfirm")}</Text>
                    {deletingQuestion && (
                        <Card withBorder padding="sm" bg="gray.0">
                            <Text fw={500} size="sm">
                                {deletingQuestion.question_text_sv}
                            </Text>
                            <Text size="xs" c="dimmed" mt={4}>
                                {deletingQuestion.question_text_en}
                            </Text>
                        </Card>
                    )}
                    <Group justify="flex-end" gap="sm">
                        <Button variant="subtle" onClick={closeDeleteModal} disabled={deleting}>
                            {t("buttons.cancel")}
                        </Button>
                        <Button color="red" onClick={handleConfirmDelete} loading={deleting}>
                            {t("buttons.delete")}
                        </Button>
                    </Group>
                </Stack>
            </Modal>
        </Container>
    );
}
