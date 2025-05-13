/**
 * Test setup file to configure DOM environment for component tests
 */

// Import happy-dom to provide a DOM implementation
import { Window } from "happy-dom";
import { TextEncoder, TextDecoder } from "util";

// Create a window object that will be used as the global context for tests
const window = new Window({
    url: "https://localhost:3000",
    width: 1024,
    height: 768,
});
const document = window.document;

// Set up globals that DOM-based libraries expect
global.window = window as any;
global.document = document as any;
global.navigator = window.navigator as any;
global.self = window as any;
global.HTMLElement = window.HTMLElement as any;
global.Element = window.Element as any;
global.Node = window.Node as any;
global.NodeList = window.NodeList as any;

// Set up additional DOM API globals that might be needed
global.CustomEvent = window.CustomEvent as any;
global.Event = window.Event as any;
global.MouseEvent = window.MouseEvent as any;
global.KeyboardEvent = window.KeyboardEvent as any;
global.TextEncoder = TextEncoder;
global.TextDecoder = TextDecoder;

// Configure additional globals needed for testing libraries
global.MutationObserver = window.MutationObserver as any;
global.ResizeObserver = class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
};
global.getComputedStyle = window.getComputedStyle as any;

// Set up element properties and methods that tests might use
if (!global.Element.prototype.scrollIntoView) {
    global.Element.prototype.scrollIntoView = () => {};
}

// Mock requestAnimationFrame and cancelAnimationFrame
global.requestAnimationFrame = callback => setTimeout(callback, 0);
global.cancelAnimationFrame = id => clearTimeout(id);

// Set up timing functions
global.setTimeout = setTimeout;
global.clearTimeout = clearTimeout;
global.setInterval = setInterval;
global.clearInterval = clearInterval;

// Setup fetch API
global.fetch = fetch;
global.Headers = Headers;
global.Request = Request;
global.Response = Response;

// Mock IntersectionObserver with properties required by TypeScript type definition
global.IntersectionObserver = class IntersectionObserver {
    root: Element | null = null;
    rootMargin: string = "0px";
    thresholds: ReadonlyArray<number> = [0];

    constructor(callback: IntersectionObserverCallback, options?: IntersectionObserverInit) {
        if (options) {
            // Cast options.root to Element | null to avoid type error
            this.root = (options.root as Element) || null;
            this.rootMargin = options.rootMargin || "0px";
            this.thresholds = options.threshold
                ? Array.isArray(options.threshold)
                    ? options.threshold
                    : [options.threshold]
                : [0];
        }
    }

    observe() {}
    unobserve() {}
    disconnect() {}
    takeRecords(): IntersectionObserverEntry[] {
        return [];
    }
};

// Create a testing container in the document body
document.body.innerHTML = '<div id="test-container"></div>';

// This helps with React Testing Library
window.Element.prototype.scrollIntoView = () => {};
window.HTMLElement.prototype.scrollIntoView = () => {};
window.scrollTo = () => {};
window.scrollBy = () => {};
