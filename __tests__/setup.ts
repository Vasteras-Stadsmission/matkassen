/**
 * Vitest setup file to configure DOM environment for component tests
 * This file is automatically loaded by Vitest via setupFiles config
 */

import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";
import { resetSmsGateway } from "@/app/utils/sms/sms-gateway";

// Cleanup after each test run
// This ensures no test state leaks between tests
afterEach(() => {
    // Reset SMS gateway to production default (prevents test pollution)
    resetSmsGateway();
    cleanup();
});
