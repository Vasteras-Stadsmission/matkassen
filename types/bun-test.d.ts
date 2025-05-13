declare module "bun:test" {
    export const test: TestFunction;
    export const it: TestFunction;
    export const describe: (name: string, handler: () => void) => void;
    export const beforeEach: (handler: () => void) => void;
    export const afterEach: (handler: () => void) => void;
    export const beforeAll: (handler: () => void) => void;
    export const afterAll: (handler: () => void) => void;
    export const expect: ExpectFunction;
    export function mock<T>(implementation?: (...args: any[]) => any): T;
    export const vi: {
        fn: () => jest.Mock;
        mock: typeof jest.mock;
        spyOn: typeof jest.spyOn;
        clearAllMocks: () => void;
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

// Make jest global to fix jest.mock references
declare global {
    const jest: {
        mock: (path: string, factory?: () => any) => void;
        fn: () => jest.Mock;
        spyOn: (object: any, method: string) => jest.SpyInstance;
        clearAllMocks: () => void;
    };

    namespace jest {
        interface Mock {
            mockReturnValue: (value: any) => Mock;
            mockResolvedValue: (value: any) => Mock;
            mockImplementation: (fn: (...args: any[]) => any) => Mock;
            mockClear: () => void;
        }

        interface SpyInstance {
            mockReturnValue: (value: any) => SpyInstance;
            mockResolvedValue: (value: any) => SpyInstance;
            mockImplementation: (fn: (...args: any[]) => any) => SpyInstance;
            mockClear: () => void;
        }
    }
}

export {};
