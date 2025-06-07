import { Window } from "happy-dom";
import React from "react";
import { MantineProvider } from "@mantine/core";

// Set up happy-dom
const window = new Window();
global.document = window.document as unknown as Document;
// Use a more general type assertion to satisfy TypeScript's strict typing
global.window = window as unknown as any;
global.navigator = window.navigator as unknown as Navigator;

// Create a window environment for the tests
global.localStorage = window.localStorage;
global.sessionStorage = window.sessionStorage;

// Define test wrapper for Mantine components
export function TestWrapper({ children }: { children: React.ReactNode }) {
    return <MantineProvider defaultColorScheme="light">{children}</MantineProvider>;
}
