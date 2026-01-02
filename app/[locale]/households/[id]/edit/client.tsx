"use client";

import { useState, useEffect } from "react";
import { HouseholdWizard } from "@/components/household-wizard/HouseholdWizard";
import { getHouseholdFormData, updateHousehold } from "./actions";
import { FormData, Comment } from "../../enroll/types";
import { addHouseholdComment, deleteHouseholdComment } from "../../actions";

export default function EditHouseholdClient({ id }: { id: string }) {
    const [initialData, setInitialData] = useState<FormData | undefined>(undefined);
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState<string | null>(null);

    // GitHub user data is now fetched server-side and included in the comment response

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

                // GitHub user data is already included in comments from server
                setInitialData(data);
            } catch {
                // Error loading household data
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
            const result = await addHouseholdComment(id, comment);

            if (!result.success || !result.data) return undefined;

            const response = result.data;
            const newComment: Comment = {
                author_github_username: response.author_github_username || "anonymous",
                comment: response.comment,
            };

            if (response.id) newComment.id = response.id;
            if (response.created_at) newComment.created_at = response.created_at;
            if (response.githubUserData) newComment.githubUserData = response.githubUserData;

            // GitHub data is already included from server action, no need to fetch
            // Update local state
            setInitialData(prev => {
                if (!prev) return prev;
                return {
                    ...prev,
                    comments: [...(prev.comments || []), newComment],
                };
            });

            return newComment;
        } catch {
            // Error adding comment
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
                // Delete failed
            }
        } catch {
            // Error deleting comment
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
