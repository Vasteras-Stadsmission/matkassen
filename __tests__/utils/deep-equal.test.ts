import { describe, it, expect } from "vitest";
import deepEqual from "fast-deep-equal";

// Using fast-deep-equal for robust deep comparison of objects
function objectsEqual<T>(a: T, b: T): boolean {
    return deepEqual(a, b);
}

describe("objectsEqual function", () => {
    it("should correctly identify equal scalar values", () => {
        expect(objectsEqual("test", "test")).toBe(true);
        expect(objectsEqual(123, 123)).toBe(true);
        expect(objectsEqual(null, null)).toBe(true);
        expect(objectsEqual(undefined, undefined)).toBe(true);
        expect(objectsEqual(true, true)).toBe(true);
    });

    it("should correctly identify different scalar values", () => {
        expect(objectsEqual("test", "different")).toBe(false);
        expect(objectsEqual(123, 456)).toBe(false);
        expect(objectsEqual(null, undefined)).toBe(false);
        expect(objectsEqual(true, false)).toBe(false);
    });

    it("should correctly compare flat objects", () => {
        const obj1 = { name: "John", age: 30 };
        const obj2 = { name: "John", age: 30 };
        const obj3 = { name: "Jane", age: 30 };

        expect(objectsEqual(obj1, obj2)).toBe(true);
        expect(objectsEqual(obj1, obj3)).toBe(false);
    });

    it("should correctly compare nested objects", () => {
        const obj1 = {
            name: "John",
            address: {
                street: "Main St",
                city: "Stockholm",
                postalCode: "12345",
            },
        };

        const obj2 = {
            name: "John",
            address: {
                street: "Main St",
                city: "Stockholm",
                postalCode: "12345",
            },
        };

        const obj3 = {
            name: "John",
            address: {
                street: "Main St",
                city: "Gothenburg", // Different city
                postalCode: "12345",
            },
        };

        expect(objectsEqual(obj1, obj2)).toBe(true);
        expect(objectsEqual(obj1, obj3)).toBe(false);
    });

    it("should correctly compare arrays and nested arrays", () => {
        const arr1 = [1, 2, { name: "Test" }];
        const arr2 = [1, 2, { name: "Test" }];
        const arr3 = [1, 2, { name: "Different" }];

        expect(objectsEqual(arr1, arr2)).toBe(true);
        expect(objectsEqual(arr1, arr3)).toBe(false);
    });
});
