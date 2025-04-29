declare module "bun:test" {
    export function describe(name: string, fn: () => void): void;
    export function it(name: string, fn: () => void | Promise<void>): void;
    export function beforeEach(fn: () => void | Promise<void>): void;
    export function afterEach(fn: () => void | Promise<void>): void;
    export function mock<T extends object>(path: string, factory?: () => T): void;
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
