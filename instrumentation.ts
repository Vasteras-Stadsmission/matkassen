declare global {
    var secrets: {
        apiKey?: string;
    };
}

export async function register() {
    // Initialize global secrets object
    (globalThis as any).secrets = {};

    const org = process.env.HCP_ORG;
    const project = process.env.HCP_PROJECT;
    const secretName = "Demo";

    if (!org) {
        (globalThis as any).secrets.apiKey = "Demo: You have not loaded your secrets";
    } else {
        try {
            const res = await fetch(
                `https://api.cloud.hashicorp.com/secrets/2023-06-13/organizations/${org}/projects/${project}/apps/${secretName}/open`,
                {
                    headers: {
                        Authorization: `Bearer ${process.env.HCP_API_KEY}`,
                    },
                },
            );

            const { secrets } = await res.json();
            (globalThis as any).secrets.apiKey = secrets[0].version.value;

            console.log("Secrets loaded!");
        } catch (error) {
            console.error("Failed to load secrets:", error);
            (globalThis as any).secrets.apiKey = "Failed to load secrets";
        }
    }

    // Start SMS scheduler in production/staging environments (server-side only)
    /*
    if ((process.env.NODE_ENV === "production" || process.env.NODE_ENV === "development") &&
        typeof window === "undefined") {
        try {
            const { startSmsScheduler } = await import("@/app/utils/sms/scheduler");
            startSmsScheduler();
            console.log("SMS scheduler started");
        } catch (error) {
            console.error("Failed to start SMS scheduler:", error);
        }
    }
    */
}
