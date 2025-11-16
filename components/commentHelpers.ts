import { Comment } from "@/app/[locale]/households/enroll/types";

// Helper function to convert ParcelDetails comments to Comment format
export function convertParcelCommentsToComments(
    parcelComments: Array<{
        id: string;
        author: string;
        comment: string;
        createdAt: string;
        githubUserData: {
            name: string | null;
            avatar_url: string | null;
        } | null;
    }>,
): Comment[] {
    return parcelComments.map(comment => ({
        id: comment.id,
        created_at: new Date(comment.createdAt),
        author_github_username: comment.author,
        comment: comment.comment,
        // GitHub user data now included from database
        githubUserData: comment.githubUserData || undefined,
    }));
}
