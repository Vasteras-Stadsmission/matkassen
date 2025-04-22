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
import DOMPurify from "isomorphic-dompurify";
import classes from "./CommentHtml.module.css";
import { useDisclosure } from "@mantine/hooks";
import { Comment } from "../enroll/types";

// GitHub user data interface - kept internal to avoid circular dependency
interface GithubUserData {
    avatar_url: string;
    name: string | null;
}

// Used when creating a new comment before sending to server
export interface NewCommentData {
    comment: string;
}

interface CommentHtmlProps {
    comment: Comment;
    onDelete?: (commentId: string) => Promise<void>;
}

export default function CommentHtml({ comment, onDelete }: CommentHtmlProps) {
    // Use pre-fetched GitHub user data if available, otherwise fetch it on the fly
    const [githubUser, setGithubUser] = useState<GithubUserData | null>(
        comment.githubUserData || null,
    );
    const [isDeleting, setIsDeleting] = useState(false);
    const [opened, { open, close }] = useDisclosure(false);

    // Fetch GitHub user info for avatar if we have a username and don't already have the data
    useEffect(() => {
        const fetchGithubUser = async () => {
            if (!comment.author_github_username || comment.githubUserData) return;

            try {
                const response = await fetch(
                    `https://api.github.com/users/${comment.author_github_username}`,
                );
                if (response.ok) {
                    const userData = await response.json();
                    setGithubUser(userData);
                } else {
                    console.error(`Failed to fetch GitHub user: ${comment.author_github_username}`);
                }
            } catch (error) {
                console.error(
                    `Error fetching GitHub user: ${comment.author_github_username}`,
                    error,
                );
            }
        };

        if (comment.author_github_username && !comment.githubUserData) {
            fetchGithubUser();
        }
    }, [comment.author_github_username, comment.githubUserData]);

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

    // Safely sanitize HTML content
    const createMarkup = (html: string) => {
        return { __html: DOMPurify.sanitize(html) };
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

    const avatarUrl = githubUser?.avatar_url;

    // Display "Namn Okänt" if no full name is available
    const displayName = githubUser?.name || "Namn Okänt";

    const processedComment = processCommentText(comment.comment);

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
                        dangerouslySetInnerHTML={createMarkup(processedComment)}
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
