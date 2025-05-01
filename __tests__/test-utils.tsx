import { Window } from "happy-dom";
import React from "react";
import { MantineProvider } from "@mantine/core";

// Create a window environment for the tests
const window = new Window();
global.document = window.document;
global.window = window as any;

// Set up some basic browser globals that might be needed
global.navigator = window.navigator;
global.localStorage = window.localStorage;
global.sessionStorage = window.sessionStorage;

// Define test wrapper for Mantine components
export function TestWrapper({ children }: { children: React.ReactNode }) {
    return (
        <MantineProvider forceColorScheme="light" defaultColorScheme="light">
            {children}
        </MantineProvider>
    );
}
