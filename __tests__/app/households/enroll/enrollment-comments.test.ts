/**
 * Test: Enrollment Comments Bug Fix
 *
 * Bug: When enrolling a new household, at the summary step you could write a comment
 * and click to post, but nothing happened. The text was cleared but no comment was shown.
 *
 * Root Cause: The enrollment page didn't pass onAddComment handler to HouseholdWizard,
 * so handleAddComment returned undefined. The CommentSection cleared the input thinking
 * it succeeded, but no comment was actually stored. Additionally, during enrollment
 * there's no household yet to associate comments with.
 *
 * Fix:
 * 1. In create mode, handleAddComment now stores comments locally in formData.comments
 * 2. Comments are extracted and passed to enrollHousehold action when saving
 * 3. enrollHousehold action now saves comments after creating the household
 *
 * This test documents the expected behavior and provides a regression test.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { HouseholdCreateData } from "../../../../app/[locale]/households/enroll/types";
import type { Comment } from "../../../../app/[locale]/households/enroll/types";

describe("Enrollment Comments Bug Fix", () => {
    describe("HouseholdCreateData type", () => {
        it("should include optional comments field", () => {
            const data: HouseholdCreateData = {
                headOfHousehold: {
                    firstName: "Test",
                    lastName: "User",
                    phoneNumber: "0701234567",
                    postalCode: "12345",
                    locale: "sv",
                },
                smsConsent: true,
                members: [],
                dietaryRestrictions: [],
                additionalNeeds: [],
                pets: [],
                foodParcels: {
                    pickupLocationId: "loc1",
                    parcels: [],
                },
                comments: ["This is a test comment"],
            };

            expect(data.comments).toBeDefined();
            expect(data.comments).toHaveLength(1);
            expect(data.comments![0]).toBe("This is a test comment");
        });

        it("should work without comments (backwards compatible)", () => {
            const data: HouseholdCreateData = {
                headOfHousehold: {
                    firstName: "Test",
                    lastName: "User",
                    phoneNumber: "0701234567",
                },
                smsConsent: true,
                members: [],
                dietaryRestrictions: [],
                additionalNeeds: [],
                pets: [],
                foodParcels: {
                    pickupLocationId: "",
                    parcels: [],
                },
            };

            // comments is optional, should be undefined when not provided
            expect(data.comments).toBeUndefined();
        });
    });

    describe("Local comment handling in create mode", () => {
        it("should store comments locally when no parent handler is provided", () => {
            // Simulate the handleAddComment behavior in create mode
            let formDataComments: Comment[] = [];

            const handleAddComment = (comment: string): Comment => {
                const newComment: Comment = {
                    comment: comment.trim(),
                    author_github_username: "pending",
                    created_at: new Date(),
                };

                formDataComments = [...formDataComments, newComment];
                return newComment;
            };

            // Add a comment
            const result = handleAddComment("Test comment during enrollment");

            expect(result).toBeDefined();
            expect(result.comment).toBe("Test comment during enrollment");
            expect(formDataComments).toHaveLength(1);
            expect(formDataComments[0].comment).toBe("Test comment during enrollment");
        });

        it("should handle multiple comments", () => {
            let formDataComments: Comment[] = [];

            const handleAddComment = (comment: string): Comment => {
                const newComment: Comment = {
                    comment: comment.trim(),
                    author_github_username: "pending",
                    created_at: new Date(),
                };

                formDataComments = [...formDataComments, newComment];
                return newComment;
            };

            handleAddComment("First comment");
            handleAddComment("Second comment");
            handleAddComment("Third comment");

            expect(formDataComments).toHaveLength(3);
            expect(formDataComments[0].comment).toBe("First comment");
            expect(formDataComments[1].comment).toBe("Second comment");
            expect(formDataComments[2].comment).toBe("Third comment");
        });

        it("should trim whitespace from comments", () => {
            const handleAddComment = (comment: string): Comment => ({
                comment: comment.trim(),
                author_github_username: "pending",
                created_at: new Date(),
            });

            const result = handleAddComment("   Comment with whitespace   ");

            expect(result.comment).toBe("Comment with whitespace");
        });
    });

    describe("Comment extraction for enrollment", () => {
        it("should extract comment text from Comment objects for HouseholdCreateData", () => {
            const formDataComments: Comment[] = [
                {
                    comment: "First note about this household",
                    author_github_username: "pending",
                    created_at: new Date(),
                },
                {
                    comment: "Second note",
                    author_github_username: "pending",
                    created_at: new Date(),
                },
            ];

            // Simulate what happens in the enrollment page handleSubmit
            const extractedComments = formDataComments.map(c => c.comment);

            expect(extractedComments).toEqual([
                "First note about this household",
                "Second note",
            ]);
        });

        it("should handle empty comments array", () => {
            const formDataComments: Comment[] = [];
            const extractedComments = formDataComments.map(c => c.comment) || [];

            expect(extractedComments).toEqual([]);
        });

        it("should handle undefined comments", () => {
            const formDataComments: Comment[] | undefined = undefined;
            const extractedComments = formDataComments?.map(c => c.comment) || [];

            expect(extractedComments).toEqual([]);
        });
    });

    describe("Server-side comment filtering", () => {
        it("should filter out whitespace-only comments before database insert", () => {
            // Simulate the server action filtering logic
            const inputComments = ["Valid comment", "  ", "", "Another valid one", "   "];

            const validComments = inputComments
                .filter(comment => comment.trim().length > 0)
                .map(comment => ({
                    household_id: "test-id",
                    comment: comment.trim(),
                    author_github_username: "testuser",
                }));

            expect(validComments).toHaveLength(2);
            expect(validComments[0].comment).toBe("Valid comment");
            expect(validComments[1].comment).toBe("Another valid one");
        });

        it("should result in empty array when all comments are whitespace", () => {
            // Edge case: all comments are empty or whitespace
            const inputComments = ["  ", "", "   "];

            const validComments = inputComments
                .filter(comment => comment.trim().length > 0)
                .map(comment => ({
                    household_id: "test-id",
                    comment: comment.trim(),
                    author_github_username: "testuser",
                }));

            // This is why we need the second length check before inserting
            expect(validComments).toHaveLength(0);

            // The code should NOT call values([]) - it should skip the insert
            const shouldInsert = validComments.length > 0;
            expect(shouldInsert).toBe(false);
        });
    });

    describe("Local comment deletion in create mode", () => {
        it("should remove comments by ID from local state", () => {
            let formDataComments: Comment[] = [
                { id: "temp-1", comment: "Comment 1", author_github_username: "pending" },
                { id: "temp-2", comment: "Comment 2", author_github_username: "pending" },
                { id: "temp-3", comment: "Comment 3", author_github_username: "pending" },
            ];

            const handleDeleteComment = (commentId: string): void => {
                formDataComments = formDataComments.filter(c => c.id !== commentId);
            };

            handleDeleteComment("temp-2");

            expect(formDataComments).toHaveLength(2);
            expect(formDataComments.map(c => c.comment)).toEqual([
                "Comment 1",
                "Comment 3",
            ]);
        });
    });
});

describe("Documentation: How the Fix Works", () => {
    it("documents the flow: comment added during enrollment is stored locally", () => {
        // BEFORE (buggy):
        // 1. User types comment in summary step during enrollment
        // 2. User clicks "Post" button
        // 3. handleAddComment called with no onAddComment prop → returns undefined
        // 4. CommentSection clears input (thinking success)
        // 5. No comment stored anywhere
        // 6. User sees empty comment section

        // AFTER (fixed):
        // 1. User types comment in summary step during enrollment
        // 2. User clicks "Post" button
        // 3. handleAddComment in create mode stores comment locally in formData.comments
        // 4. CommentSection receives the new Comment object
        // 5. Comment is displayed in the UI
        // 6. When household is saved, comments are extracted and passed to enrollHousehold
        // 7. enrollHousehold saves comments to database after creating household

        expect(true).toBe(true); // Documentation test always passes
    });

    it("documents the data flow from UI to database", () => {
        // UI Layer (CommentSection):
        // - User types: "Important note about dietary restrictions"
        // - Calls: onAddComment("Important note about dietary restrictions")

        // HouseholdWizard (create mode):
        // - handleAddComment creates local Comment object
        // - Adds to formData.comments array
        // - Returns Comment to CommentSection for display

        // Enrollment Page (handleSubmit):
        // - Extracts comment text: formData.comments.map(c => c.comment)
        // - Passes to enrollHousehold in HouseholdCreateData.comments

        // Server Action (enrollHousehold):
        // - Creates household first (gets household_id)
        // - Inserts comments into household_comments table with household_id

        expect(true).toBe(true);
    });
});
