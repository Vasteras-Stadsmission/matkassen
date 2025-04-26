"use client";

import { useState } from "react";
import { Textarea, Button, Title, Text, Stack, Group, Divider, Box } from "@mantine/core";
import { IconMessage, IconSend } from "@tabler/icons-react";
import CommentHtml from "./CommentHtml";
import { deleteHouseholdComment } from "../actions";
import { Comment } from "../enroll/types";

interface HouseholdCommentsProps {
    comments: Comment[];
    onAddComment?: (comment: string) => Promise<Comment | null | undefined>;
    onDeleteComment?: (commentId: string) => Promise<void>;
    showTitle?: boolean;
}

export default function HouseholdComments({
    comments = [],
    onAddComment,
    onDeleteComment,
    showTitle = true,
}: HouseholdCommentsProps) {
    const [newComment, setNewComment] = useState("");
    const [isSubmitting, setIsSubmitting] = useState(false);

    const handleSubmit = async () => {
        if (!newComment.trim() || !onAddComment) return;

        try {
            setIsSubmitting(true);
            await onAddComment(newComment);
            setNewComment(""); // Clear input after successful submission
        } catch (error) {
            console.error("Error adding comment:", error);
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleDeleteComment = async (commentId: string) => {
        try {
            // If parent provided onDeleteComment function, use it
            if (onDeleteComment) {
                await onDeleteComment(commentId);
            } else {
                // Otherwise use the default implementation with page reload
                const success = await deleteHouseholdComment(commentId);

                if (success) {
                    // If no callback is provided, fall back to page reload
                    window.location.reload();
                } else {
                    console.error("Failed to delete comment");
                }
            }
        } catch (error) {
            console.error("Error deleting comment:", error);
        }
    };

    return (
        <Box mb="md">
            {showTitle && (
                <Title order={5} mb="md">
                    Kommentarer ({comments.length})
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
                    Inga kommentarer tillagda
                </Text>
            )}

            <Divider my="md" />
            <Textarea
                placeholder="Lägg till en kommentar om hushållet... (HTML stöds, t.ex. länkar)"
                value={newComment}
                onChange={e => setNewComment(e.currentTarget.value)}
                minRows={3}
                mb="sm"
                leftSection={<IconMessage size={16} />}
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
                    Lägg till
                </Button>
            </Group>
        </Box>
    );
}
