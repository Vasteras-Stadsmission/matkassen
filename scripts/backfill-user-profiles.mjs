#!/usr/bin/env node
/**
 * Backfill user profile data (display_name, avatar_url) from GitHub API
 *
 * This script populates the users table with display names and avatar URLs
 * for users who haven't logged in since the creator tracking v2 feature was deployed.
 *
 * Background:
 * - Previously, user data was fetched from GitHub API on-demand when displaying comments/creators
 * - Now, user data is stored in the database and populated during sign-in (auth.ts)
 * - Users who haven't re-signed in will have NULL display_name/avatar_url
 * - This causes UI regression where historical comments/creator info shows blank
 *
 * Usage:
 *   node scripts/backfill-user-profiles.mjs [--dry-run]
 *
 * Options:
 *   --dry-run    Show what would be updated without making changes
 */

import { drizzle } from "drizzle-orm/node-postgres";
import { eq, isNull, or } from "drizzle-orm";
import pg from "pg";
import { users } from "../app/db/schema.ts";

const { Pool } = pg;

// GitHub API configuration
const GITHUB_API_BASE = "https://api.github.com";
const GITHUB_TOKEN = process.env.GITHUB_TOKEN || process.env.AUTH_GITHUB_ID;

// Parse command line arguments
const args = process.argv.slice(2);
const isDryRun = args.includes("--dry-run");

/**
 * Fetch user profile data from GitHub API
 */
async function fetchGitHubUserProfile(username) {
    const url = `${GITHUB_API_BASE}/users/${username}`;

    const headers = {
        "Accept": "application/vnd.github.v3+json",
        "User-Agent": "Matkassen-Backfill-Script",
    };

    if (GITHUB_TOKEN) {
        headers["Authorization"] = `token ${GITHUB_TOKEN}`;
    }

    const response = await fetch(url, { headers });

    if (!response.ok) {
        if (response.status === 404) {
            console.warn(`  ⚠️  User ${username} not found on GitHub`);
            return null;
        }
        throw new Error(`GitHub API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    return {
        name: data.name || null,
        avatar_url: data.avatar_url || null,
    };
}

/**
 * Main backfill function
 */
async function backfillUserProfiles() {
    console.log("🔄 Starting user profile backfill...\n");

    if (isDryRun) {
        console.log("🧪 DRY RUN MODE - No changes will be made\n");
    }

    if (!GITHUB_TOKEN) {
        console.warn("⚠️  WARNING: No GITHUB_TOKEN found in environment. API rate limits will be low (60/hour).");
        console.warn("   Set GITHUB_TOKEN or AUTH_GITHUB_ID to increase rate limit to 5000/hour.\n");
    }

    // Connect to database
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
        throw new Error("DATABASE_URL environment variable is required");
    }

    const pool = new Pool({ connectionString });
    const db = drizzle(pool);

    try {
        // Find users with missing profile data
        const usersToUpdate = await db
            .select({
                id: users.id,
                github_username: users.github_username,
                display_name: users.display_name,
                avatar_url: users.avatar_url,
            })
            .from(users)
            .where(
                or(
                    isNull(users.display_name),
                    isNull(users.avatar_url)
                )
            );

        console.log(`📊 Found ${usersToUpdate.length} users with missing profile data\n`);

        if (usersToUpdate.length === 0) {
            console.log("✅ All users have complete profile data. Nothing to do!");
            return;
        }

        let successCount = 0;
        let errorCount = 0;
        let skippedCount = 0;

        // Process each user
        for (const user of usersToUpdate) {
            try {
                console.log(`Processing ${user.github_username}...`);

                const profile = await fetchGitHubUserProfile(user.github_username);

                if (!profile) {
                    skippedCount++;
                    continue;
                }

                console.log(`  ℹ️  Name: ${profile.name || "(none)"}`);
                console.log(`  ℹ️  Avatar: ${profile.avatar_url ? "✓" : "✗"}`);

                if (!isDryRun) {
                    await db
                        .update(users)
                        .set({
                            display_name: profile.name,
                            avatar_url: profile.avatar_url,
                        })
                        .where(eq(users.id, user.id));

                    console.log(`  ✅ Updated\n`);
                } else {
                    console.log(`  🧪 Would update (dry run)\n`);
                }

                successCount++;

                // Rate limiting: GitHub API allows 5000 requests/hour with token, 60/hour without
                // Add a small delay to be respectful
                await new Promise(resolve => setTimeout(resolve, 100));

            } catch (error) {
                console.error(`  ❌ Error: ${error.message}\n`);
                errorCount++;
            }
        }

        // Summary
        console.log("═".repeat(60));
        console.log("📈 Summary:");
        console.log(`   Total users processed: ${usersToUpdate.length}`);
        console.log(`   ✅ Successfully ${isDryRun ? "would update" : "updated"}: ${successCount}`);
        console.log(`   ⚠️  Skipped (not found): ${skippedCount}`);
        console.log(`   ❌ Errors: ${errorCount}`);
        console.log("═".repeat(60));

        if (isDryRun) {
            console.log("\n💡 Run without --dry-run to apply changes");
        }

    } finally {
        await pool.end();
    }
}

// Run the backfill
backfillUserProfiles()
    .then(() => {
        console.log("\n✅ Backfill complete!");
        process.exit(0);
    })
    .catch((error) => {
        console.error("\n❌ Backfill failed:", error);
        process.exit(1);
    });
