"use client";

import { useState } from "react";
import { Textarea, Button, Title, Text, Stack, Group, Divider, Box } from "@mantine/core";
import { IconMessage, IconSend } from "@tabler/icons-react";
import CommentHtml from "@/app/[locale]/households/components/CommentHtml";
import { Comment } from "@/app/[locale]/households/enroll/types";
import { useTranslations } from "next-intl";

interface CommentSectionProps {
    comments: Comment[];
    onAddComment?: (comment: string) => Promise<Comment | null | undefined>;
    onDeleteComment?: (commentId: string) => Promise<void>;
    showTitle?: boolean;
    entityType?: "household" | "parcel";
    placeholder?: string;
    isSubmitting?: boolean;
}

export default function CommentSection({
    comments = [],
    onAddComment,
    onDeleteComment,
    showTitle = true,
    entityType = "household",
    placeholder,
    isSubmitting: externalIsSubmitting = false,
}: CommentSectionProps) {
    const t = useTranslations("comments");
    const [newComment, setNewComment] = useState("");
    const [internalIsSubmitting, setInternalIsSubmitting] = useState(false);

    // Use external submitting state if provided, otherwise use internal state
    const isSubmitting = externalIsSubmitting || internalIsSubmitting;

    const handleSubmit = async () => {
        if (!newComment.trim() || !onAddComment) return;

        try {
            setInternalIsSubmitting(true);
            await onAddComment(newComment);
            setNewComment(""); // Clear input after successful submission
        } catch (error) {
            console.error("Error adding comment:", error);
        } finally {
            setInternalIsSubmitting(false);
        }
    };

    const handleDeleteComment = async (commentId: string) => {
        try {
            if (onDeleteComment) {
                await onDeleteComment(commentId);
            } else {
                // Import the delete function dynamically to avoid circular imports
                const { deleteHouseholdComment } =
                    await import("@/app/[locale]/households/actions");
                const success = await deleteHouseholdComment(commentId);

                if (success) {
                    // If no callback is provided, fall back to page reload
                    window.location.reload();
                } else {
                    console.error(t("errors.deleteFailed"));
                }
            }
        } catch (error) {
            console.error(t("errors.deleteError") + ":", error);
        }
    };

    // Default placeholder based on entity type
    const defaultPlaceholder =
        entityType === "parcel"
            ? "Add a comment about this parcel... (HTML is supported, e.g. links)"
            : placeholder || t("placeholder");

    return (
        <Box mb="md">
            {showTitle && (
                <Title order={5} mb="md">
                    {t("title", { count: String(comments.length) })}
                </Title>
            )}

            {comments.length > 0 ? (
                <Stack gap="md" mb="md">
                    {comments.map((comment, index) => (
                        <CommentHtml
                            key={comment.id || index}
                            comment={comment}
                            onDelete={comment.id ? handleDeleteComment : undefined}
                        />
                    ))}
                </Stack>
            ) : (
                <Text c="dimmed" size="sm" mb="md">
                    {t("noComments")}
                </Text>
            )}

            {onAddComment && (
                <>
                    <Divider my="md" />
                    <Textarea
                        placeholder={defaultPlaceholder}
                        value={newComment}
                        onChange={e => setNewComment(e.currentTarget.value)}
                        minRows={3}
                        mb="sm"
                        leftSection={<IconMessage size={16} />}
                        disabled={isSubmitting}
                    />
                    <Group justify="flex-end">
                        <Button
                            variant="filled"
                            color="blue"
                            onClick={handleSubmit}
                            disabled={!newComment.trim() || isSubmitting}
                            loading={isSubmitting}
                            leftSection={<IconSend size={16} />}
                        >
                            {t("add")}
                        </Button>
                    </Group>
                </>
            )}
        </Box>
    );
}
