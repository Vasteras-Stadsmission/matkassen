"use client";

import { useState, useEffect } from "react";
import HouseholdWizard from "@/components/household-wizard/HouseholdWizard";
import { getHouseholdFormData, updateHousehold } from "./actions";
import { FormData, Comment, GithubUserData } from "../../enroll/types";
import { addHouseholdComment, deleteHouseholdComment } from "../../actions";

export default function EditHouseholdClient({ id }: { id: string }) {
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
            console.error(`Error fetching GitHub user data for ${username}:`, error);
        }
        return null;
    };

    // Load household data when the component mounts
    useEffect(() => {
        async function loadHouseholdData() {
            try {
                setLoading(true);
                const data = await getHouseholdFormData(id);

                if (data) {
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
                } else {
                    setLoadError("Kunde inte hitta hushållet. Kontrollera att ID är korrekt.");
                }
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
            console.log("Update result:", result); // Add logging to help debug
            return {
                success: result.success,
                error: result.error,
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

            const newComment = await addHouseholdComment(id, comment);

            if (newComment) {
                // If the comment has a GitHub username, fetch user data
                const commentWithUserData = { ...newComment };
                if (newComment.author_github_username) {
                    const githubUserData = await fetchGithubUserData(
                        newComment.author_github_username,
                    );
                    if (githubUserData) {
                        commentWithUserData.githubUserData = githubUserData;
                    }
                }

                // Update the initialData with the new comment
                setInitialData(prev => {
                    if (!prev) return prev;
                    return {
                        ...prev,
                        comments: [...(prev.comments || []), commentWithUserData],
                    };
                });
                return commentWithUserData;
            }
            return undefined;
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
                console.error("Failed to delete comment");
            }
        } catch (error) {
            console.error("Error deleting comment during edit:", error);
        }
    };

    // Build the title based on the loaded data
    const title = initialData
        ? `Redigera hushåll: ${initialData.household.first_name} ${initialData.household.last_name}`
        : "Redigera hushåll";

    return (
        <HouseholdWizard
            mode="edit"
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
