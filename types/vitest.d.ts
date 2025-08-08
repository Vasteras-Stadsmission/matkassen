/// <reference types="vitest" />
/// <reference types="vitest/globals" />

import type {
    describe,
    it,
    test,
    expect,
    beforeEach,
    afterEach,
    beforeAll,
    afterAll,
    vi,
} from "vitest";

declare global {
    var describe: typeof import("vitest").describe;
    var it: typeof import("vitest").it;
    var test: typeof import("vitest").test;
    var expect: typeof import("vitest").expect;
    var beforeEach: typeof import("vitest").beforeEach;
    var afterEach: typeof import("vitest").afterEach;
    var beforeAll: typeof import("vitest").beforeAll;
    var afterAll: typeof import("vitest").afterAll;
    var vi: typeof import("vitest").vi;
}

export {};
