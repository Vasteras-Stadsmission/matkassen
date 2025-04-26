"use client";

import { useState, useEffect } from "react";
import {
    Avatar,
    Group,
    Paper,
    Text,
    TypographyStylesProvider,
    ActionIcon,
    Tooltip,
    Modal,
    Button,
    Stack,
} from "@mantine/core";
import { IconTrash } from "@tabler/icons-react";
import { useDisclosure } from "@mantine/hooks";
import { Comment } from "../enroll/types";
import classes from "./CommentHtml.module.css";

// Used when creating a new comment before sending to server
export interface NewCommentData {
    comment: string;
}

interface CommentHtmlProps {
    comment: Comment;
    onDelete?: (commentId: string) => Promise<void>;
}

export default function CommentHtml({ comment, onDelete }: CommentHtmlProps) {
    const [isDeleting, setIsDeleting] = useState(false);
    const [opened, { open, close }] = useDisclosure(false);
    // State to store sanitized HTML
    const [sanitizedHtml, setSanitizedHtml] = useState("");

    // Load DOMPurify only on client-side
    useEffect(() => {
        // Dynamic import of DOMPurify only on client side
        import("isomorphic-dompurify").then(DOMPurifyModule => {
            const DOMPurify = DOMPurifyModule.default;
            // Process and sanitize the comment text
            const processedComment = processCommentText(comment.comment);
            setSanitizedHtml(DOMPurify.sanitize(processedComment));
        });
    }, [comment.comment]);

    // Format date for display using ISO format
    const formatDate = (date: Date | string | undefined) => {
        if (!date) return "";
        const dateObj = typeof date === "string" ? new Date(date) : date;

        // Format the date to show both date and time in ISO format
        return new Intl.DateTimeFormat("sv-SE", {
            year: "numeric",
            month: "numeric",
            day: "numeric",
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
        }).format(dateObj);
    };

    // Replace common patterns with HTML
    const processCommentText = (text: string) => {
        // Convert URLs to clickable links
        const urlRegex = /(https?:\/\/[^\s]+)/g;
        let processedText = text.replace(
            urlRegex,
            url => `<a href="${url}" rel="noopener noreferrer" target="_blank">${url}</a>`,
        );

        // Convert email addresses to clickable mailto links
        const emailRegex = /([a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z0-9._-]+)/g;
        processedText = processedText.replace(
            emailRegex,
            email => `<a href="mailto:${email}">${email}</a>`,
        );

        return processedText;
    };

    const handleDelete = async () => {
        if (!onDelete || !comment.id) return;

        try {
            setIsDeleting(true);
            await onDelete(comment.id);
            close();
        } catch (error) {
            console.error("Error deleting comment:", error);
        } finally {
            setIsDeleting(false);
        }
    };

    const githubUser = comment.githubUserData;
    const avatarUrl = githubUser?.avatar_url;

    // Display "Namn Okänt" if no full name is available
    const displayName = githubUser?.name || "Namn Okänt";

    return (
        <>
            <Paper withBorder radius="md" className={classes.comment}>
                <Group justify="space-between" align="flex-start">
                    <Group>
                        <Avatar src={avatarUrl} alt={displayName} radius="xl" />
                        <div>
                            <Text fz="sm">
                                {displayName}
                                {comment.author_github_username && (
                                    <Text span c="dimmed" ml={5}>
                                        @{comment.author_github_username}
                                    </Text>
                                )}
                            </Text>
                            {comment.created_at && (
                                <Text fz="xs" c="dimmed">
                                    {formatDate(comment.created_at)}
                                </Text>
                            )}
                        </div>
                    </Group>

                    {comment.id && onDelete && (
                        <Tooltip label="Ta bort kommentar">
                            <ActionIcon
                                color="red"
                                variant="light"
                                onClick={open}
                                aria-label="Ta bort kommentar"
                            >
                                <IconTrash size={18} />
                            </ActionIcon>
                        </Tooltip>
                    )}
                </Group>
                <TypographyStylesProvider className={classes.body}>
                    <div
                        className={classes.content}
                        dangerouslySetInnerHTML={{ __html: sanitizedHtml }}
                    />
                </TypographyStylesProvider>
            </Paper>

            {/* Confirmation Modal */}
            <Modal opened={opened} onClose={close} title="Ta bort kommentar" centered>
                <Text>Är du säker på att du vill ta bort denna kommentar?</Text>
                <Stack mt="md">
                    <Button
                        color="red"
                        onClick={handleDelete}
                        loading={isDeleting}
                        leftSection={<IconTrash size={16} />}
                    >
                        Ta bort
                    </Button>
                    <Button variant="outline" onClick={close} disabled={isDeleting}>
                        Avbryt
                    </Button>
                </Stack>
            </Modal>
        </>
    );
}
