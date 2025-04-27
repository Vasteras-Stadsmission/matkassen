declare module "happy-dom" {
    export class Window {
        document: Document;
        navigator: Navigator;
        location: Location;
        history: History;
        localStorage: Storage;
        sessionStorage: Storage;
        fetch: typeof fetch;
        // Add any other properties you need

        constructor();
    }

    // Add any other exports from happy-dom that you might need
}
