/**
 * Format a user's display name with consistent fallback logic:
 * 1. first_name + last_name if both exist
 * 2. display_name (from GitHub) as fallback
 * 3. Optional final fallback (e.g. github_username)
 */
export function formatUserDisplayName(
    user: {
        first_name?: string | null;
        last_name?: string | null;
        display_name?: string | null;
    },
    fallback?: string | null,
): string | null {
    if (user.first_name && user.last_name) {
        return `${user.first_name} ${user.last_name}`;
    }
    return user.display_name || fallback || null;
}
