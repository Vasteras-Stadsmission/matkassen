import type { MetadataRoute } from "next";

/**
 * Generate robots.txt to prevent all search engine indexing.
 * This is an internal administration tool that should not be discoverable.
 */
export default function robots(): MetadataRoute.Robots {
    return {
        rules: {
            userAgent: "*",
            disallow: "/",
        },
    };
}
