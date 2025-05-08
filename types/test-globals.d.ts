declare namespace NodeJS {
    interface Global {
        document: Document;
        window: Window;
        navigator: Navigator;
        getComputedStyle: (element: Element) => CSSStyleDeclaration;
        IntersectionObserver: any;
        TextDecoder: any;
    }
}

declare module "bun:test" {
    export const test: TestFunction;
    export const it: TestFunction;
    export const describe: (name: string, handler: () => void) => void;
    export const beforeEach: (handler: () => void) => void;
    export const afterEach: (handler: () => void) => void;
    export const beforeAll: (handler: () => void) => void;
    export const afterAll: (handler: () => void) => void;
    export const expect: ExpectFunction;

    export const mock: {
        <T>(implementation?: (...args: any[]) => any): T;
        module: (path: string, factory: () => any) => void;
    };

    type TestFunction = {
        (name: string, handler: () => void | Promise<void>): void;
        skip: (name: string, handler: () => void | Promise<void>) => void;
        only: (name: string, handler: () => void | Promise<void>) => void;
    };

    interface Matchers<R> {
        toBe(expected: any): R;
        toEqual(expected: any): R;
        toBeGreaterThan(expected: number): R;
        toBeLessThan(expected: number): R;
        toBeTruthy(): R;
        toBeFalsy(): R;
        toContain(expected: any): R;
        toHaveProperty(property: string, value?: any): R;
        toBeInstanceOf(expected: any): R;
        toBeNull(): R;
        toBeUndefined(): R;
        toBeDisabled(): R;
        toBeInTheDocument(): R;
        toHaveBeenCalled(): R;
        toHaveBeenCalledWith(...args: any[]): R;
    }

    interface AsymmetricMatchers {
        any(sample: any): any;
        anything(): any;
    }

    interface ExpectFunction {
        <T = any>(
            actual: T,
        ): Matchers<void> & {
            not: Matchers<void>;
        };
        extend(matchers: Record<string, any>): void;
        assertions(count: number): void;
    }
}

// Add global test functions for usage without import
declare const describe: (name: string, handler: () => void) => void;
declare const it: (name: string, handler: () => void | Promise<void>) => void;
declare const test: (name: string, handler: () => void | Promise<void>) => void;
declare const expect: any;
declare const jest: any;
declare const beforeEach: (handler: () => void) => void;
declare const afterEach: (handler: () => void) => void;
declare const beforeAll: (handler: () => void) => void;
declare const afterAll: (handler: () => void) => void;

// Extend the type definitions for test environment
interface Window {
    document: Document;
    navigator: Navigator;
    getComputedStyle: (element: Element) => CSSStyleDeclaration;
}

// Make TypeScript less strict about DOM types in tests
declare interface Document {
    // This allows window.document to be assigned to global.document without errors
    [key: string]: any;
}

declare interface Navigator {
    // This allows window.navigator to be assigned to global.navigator without errors
    [key: string]: any;
}

declare class IntersectionObserver {
    root: Element | null;
    rootMargin: string;
    thresholds: ReadonlyArray<number>;
    constructor(callback: IntersectionObserverCallback, options?: IntersectionObserverInit);
    disconnect(): void;
    observe(target: Element): void;
    takeRecords(): IntersectionObserverEntry[];
    unobserve(target: Element): void;
}

// Ensure mocked objects can be called with any properties
interface MockFunction extends Function {
    mockClear(): this;
    mockReset(): this;
    mockImplementation(implementation: (...args: any[]) => any): this;
    mockReturnValue(value: any): this;
    mockResolvedValue(value: any): this;
}

// Support for all mock patterns used in the codebase
declare interface Function {
    mockClear?: () => void;
    mockImplementation?: (implementation: (...args: any[]) => any) => this;
    mockReturnValue?: any;
    mockResolvedValue?: (value: any) => void;
}
