"use client";

import { useState, useEffect } from "react";
import { useTranslations } from "next-intl";
import { HouseholdWizard } from "@/components/household-wizard/HouseholdWizard";
import { getHouseholdFormData, updateHousehold } from "./actions";
import { FormData, Comment, GithubUserData } from "../../enroll/types";
import { addHouseholdComment, deleteHouseholdComment } from "../../actions";

export default function EditHouseholdClient({ id }: { id: string }) {
    const t = useTranslations("comments");
    const [initialData, setInitialData] = useState<FormData | undefined>(undefined);
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState<string | null>(null);

    // Fetch GitHub user data for a comment
    const fetchGithubUserData = async (username: string): Promise<GithubUserData | null> => {
        try {
            const response = await fetch(`https://api.github.com/users/${username}`);
            if (response.ok) {
                const userData = await response.json();
                return {
                    avatar_url: userData.avatar_url,
                    name: userData.name,
                };
            }
        } catch (error) {
            console.error("Error fetching GitHub user data for %s:", username, error);
        }
        return null;
    };

    // Load household data when the component mounts
    useEffect(() => {
        async function loadHouseholdData() {
            try {
                setLoading(true);
                const result = await getHouseholdFormData(id);

                if (!result.success) {
                    setLoadError(result.error.message);
                    return;
                }

                const data = result.data;

                // If there are comments with GitHub usernames, fetch their data
                if (data.comments && data.comments.length > 0) {
                    const updatedComments = await Promise.all(
                        data.comments.map(async comment => {
                            if (comment.author_github_username) {
                                const githubUserData = await fetchGithubUserData(
                                    comment.author_github_username,
                                );
                                if (githubUserData) {
                                    return { ...comment, githubUserData };
                                }
                            }
                            return comment;
                        }),
                    );
                    data.comments = updatedComments;
                }

                setInitialData(data);
            } catch (error) {
                console.error("Error loading household data:", error);
                setLoadError("Ett fel uppstod när hushållsdata skulle laddas. Försök igen senare.");
            } finally {
                setLoading(false);
            }
        }

        loadHouseholdData();
    }, [id]);

    const handleSubmit = async (formData: FormData) => {
        try {
            const result = await updateHousehold(id, formData);
            if (!result.success) {
                return {
                    success: false,
                    error: result.error.message,
                };
            }
            return {
                success: true,
            };
        } catch (error) {
            console.error("Error in handleSubmit:", error);
            return {
                success: false,
                error: error instanceof Error ? error.message : "Unknown error occurred",
            };
        }
    };

    // Handle adding a direct comment in the edit process
    const handleAddComment = async (comment: string): Promise<Comment | undefined> => {
        try {
            if (!comment.trim()) return;

            // Add comment and get response
            const response = await addHouseholdComment(id, comment);

            if (!response) return undefined;

            const newComment: Comment = {
                author_github_username: response.author_github_username || "anonymous",
                comment: response.comment,
            };

            if (response.id) newComment.id = response.id;
            if (response.created_at) newComment.created_at = response.created_at;
            if (response.githubUserData) newComment.githubUserData = response.githubUserData;

            // If we need to fetch GitHub data
            if (
                !newComment.githubUserData &&
                newComment.author_github_username &&
                newComment.author_github_username !== "anonymous"
            ) {
                const userData = await fetchGithubUserData(newComment.author_github_username);
                if (userData) newComment.githubUserData = userData;
            }

            // Update local state
            setInitialData(prev => {
                if (!prev) return prev;
                return {
                    ...prev,
                    comments: [...(prev.comments || []), newComment],
                };
            });

            return newComment;
        } catch (error) {
            console.error("Error adding comment during edit:", error);
            return undefined;
        }
    };

    // Handle deleting a comment in the edit process
    const handleDeleteComment = async (commentId: string): Promise<void> => {
        try {
            const success = await deleteHouseholdComment(commentId);

            if (success) {
                // Update the initialData by removing the deleted comment
                setInitialData(prev => {
                    if (!prev) return prev;
                    return {
                        ...prev,
                        comments: (prev.comments || []).filter(comment => comment.id !== commentId),
                    };
                });
            } else {
                console.error(t("errors.deleteFailed"));
            }
        } catch (error) {
            console.error(t("errors.deleteError") + " during edit:", error);
        }
    };

    // Build the title based on the loaded data
    const title = initialData
        ? `Redigera hushåll: ${initialData.household.first_name} ${initialData.household.last_name}`
        : "Redigera hushåll";

    return (
        <HouseholdWizard
            mode="edit"
            householdId={id}
            title={title}
            initialData={initialData}
            onSubmit={handleSubmit}
            onAddComment={handleAddComment}
            onDeleteComment={handleDeleteComment}
            isLoading={loading}
            loadError={loadError}
            submitButtonColor="yellow"
            submitButtonText="Uppdatera hushåll"
        />
    );
}
