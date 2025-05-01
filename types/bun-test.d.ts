declare module "bun:test" {
    export function describe(name: string, fn: () => void): void;
    export function it(name: string, fn: () => void | Promise<void>): void;
    export function beforeEach(fn: () => void | Promise<void>): void;
    export function afterEach(fn: () => void | Promise<void>): void;

    export interface MockFunction<T extends (...args: any[]) => any> {
        (...args: Parameters<T>): ReturnType<T>;
        mock: {
            calls: Array<Parameters<T>>;
            results: Array<{ type: "return" | "throw"; value: any }>;
            instances: Array<any>;
            contexts: Array<any>;
            lastCall: Parameters<T>;
        };
        mockImplementation(fn: T): this;
        mockReturnValue(val: ReturnType<T>): this;
        mockResolvedValue(val: Awaited<ReturnType<T>>): this;
        mockRejectedValue(error: any): this;
        mockReset(): void;
        mockClear(): void;
        mockRestore(): void;
    }

    export function mock<T extends (...args: any[]) => any>(implementation?: T): MockFunction<T>;

    export namespace mock {
        export function module(moduleName: string, factory: () => any): void;
        export function clearAllMocks(): void;
        export function resetAllMocks(): void;
        export function restoreAllMocks(): void;
    }

    export const expect: {
        <T>(actual: T): {
            toBe(expected: any): void;
            toEqual(expected: any): void;
            toBeGreaterThan(expected: number): void;
            toBeLessThan(expected: number): void;
            toBeTruthy(): void;
            toBeFalsy(): void;
            toBeNull(): void;
            toBeUndefined(): void;
            toContain(expected: any): void;
            toHaveProperty(property: string, value?: any): void;
            toThrow(expected?: string | RegExp | Error): void;
            toBeInstanceOf(expected: any): void;
            not: {
                toBe(expected: any): void;
                toEqual(expected: any): void;
                toBeGreaterThan(expected: number): void;
                toBeLessThan(expected: number): void;
                toBeTruthy(): void;
                toBeFalsy(): void;
                toBeNull(): void;
                toBeUndefined(): void;
                toContain(expected: any): void;
                toHaveProperty(property: string, value?: any): void;
                toThrow(expected?: string | RegExp | Error): void;
                toBeInstanceOf(expected: any): void;
            };
        };
    };
}
