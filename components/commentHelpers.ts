import { Comment } from "@/app/[locale]/households/enroll/types";

// Helper function to convert ParcelDetails comments to Comment format
export function convertParcelCommentsToComments(
    parcelComments: Array<{
        id: string;
        author: string;
        comment: string;
        createdAt: string;
    }>,
): Comment[] {
    return parcelComments.map(comment => ({
        id: comment.id,
        created_at: new Date(comment.createdAt),
        author_github_username: comment.author,
        comment: comment.comment,
        // We don't have GitHub user data in the parcel comments response
        // but the CommentHtml component can handle missing githubUserData
        githubUserData: undefined,
    }));
}
