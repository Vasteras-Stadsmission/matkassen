import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright configuration for Matkassen UI testing
 * Handles GitHub OAuth authentication via storageState persistence
 *
 * @see https://playwright.dev/docs/test-configuration
 */
export default defineConfig({
    testDir: "./e2e",
    testMatch: "**/*.spec.ts",

    /* Run tests in files in parallel */
    fullyParallel: true,

    /* Fail the build on CI if you accidentally left test.only in the source code. */
    forbidOnly: !!process.env.CI,

    /* Retry on CI only */
    retries: process.env.CI ? 2 : 0,

    /* Reporter to use. See https://playwright.dev/docs/test-reporters */
    reporter: process.env.CI ? "github" : "html",

    /* Shared settings for all the projects below. See https://playwright.dev/docs/api/class-testoptions. */
    use: {
        /* Base URL to use in actions like `await page.goto('/')`. */
        baseURL: process.env.PLAYWRIGHT_BASE_URL || "http://localhost:3000",

        /* Collect trace when retrying the failed test. See https://playwright.dev/docs/trace-viewer */
        trace: "on-first-retry",

        /* Screenshot on failure */
        screenshot: "only-on-failure",

        /* Video on failure */
        video: "retain-on-failure",

        /* Default locale */
        locale: "sv-SE",
    },

    /* Global timeout for each test - 5 minutes for auth setup */
    timeout: 300000,

    /* Configure projects for major browsers */
    projects: [
        // Setup project to authenticate once and reuse state
        {
            name: "setup",
            testMatch: /.*\.setup\.ts/,
            use: {
                ...devices["Desktop Chromium"],
            },
        },

        {
            name: "chromium",
            use: {
                ...devices["Desktop Chrome"],
                // Use prepared auth state
                storageState: ".auth/user.json",
            },
            dependencies: ["setup"],
        },

        // Uncomment if you need other browsers
        // {
        //     name: "firefox",
        //     use: {
        //         ...devices["Desktop Firefox"],
        //         storageState: ".auth/user.json",
        //     },
        //     dependencies: ["setup"],
        // },
    ],

    /* Run your local dev server before starting the tests */
    webServer: process.env.CI
        ? undefined
        : {
              command: "pnpm run dev",
              url: "http://localhost:3000",
              reuseExistingServer: true,
              timeout: 120 * 1000,
              stdout: "ignore",
              stderr: "pipe",
          },
});
