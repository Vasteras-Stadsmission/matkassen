import { renderHook, act } from "@testing-library/react";
import { vi, describe, it, expect, beforeEach } from "vitest";
import { notifications } from "@mantine/notifications";
import { useActionWithNotification } from "@/app/hooks/useActionWithNotification";

// Mock dependencies
vi.mock("@mantine/notifications", () => ({
    notifications: {
        show: vi.fn(),
    },
}));

const mockPush = vi.fn();
vi.mock("@/app/i18n/navigation", () => ({
    useRouter: () => ({
        push: mockPush,
    }),
}));

// Mock window.location and URL
Object.defineProperty(window, "location", {
    value: {
        origin: "http://localhost:3000",
        href: "http://localhost:3000/current-page",
        search: "",
    },
    writable: true,
});

// Mock window.history
Object.defineProperty(window, "history", {
    value: {
        replaceState: vi.fn(),
    },
    writable: true,
});

// Mock URL constructor
(global as any).URL = vi.fn().mockImplementation((url: string) => {
    const params = new Map<string, string>();
    let searchValue = "";

    const updateSearch = () => {
        const searchStr = Array.from(params.entries())
            .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
            .join("&");
        searchValue = searchStr ? `?${searchStr}` : "";
    };

    return {
        pathname: url.split("?")[0],
        get search() {
            return searchValue;
        },
        searchParams: {
            set: (key: string, value: string) => {
                params.set(key, value);
                updateSearch();
            },
            delete: (key: string) => {
                params.delete(key);
                updateSearch();
            },
            get: (key: string) => params.get(key) || null,
        },
    };
});

describe("useActionWithNotification", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe("handleActionWithRedirect", () => {
        it("should navigate with success parameters when action succeeds", async () => {
            const { result } = renderHook(() => useActionWithNotification());

            const mockAction = vi.fn().mockResolvedValue({ success: true });
            const options = {
                successMessage: "Operation completed successfully",
                successTitle: "Success",
                errorTitle: "Error",
            };

            await act(async () => {
                await result.current.handleActionWithRedirect(mockAction, "/success-page", options);
            });

            expect(mockAction).toHaveBeenCalled();
            expect(mockPush).toHaveBeenCalledWith(
                expect.stringContaining("/success-page?success=true"),
            );
            expect(mockPush).toHaveBeenCalledWith(
                expect.stringContaining("message=Operation%20completed%20successfully"),
            );
            expect(mockPush).toHaveBeenCalledWith(expect.stringContaining("title=Success"));
        });

        it("should show error notification when action fails", async () => {
            const { result } = renderHook(() => useActionWithNotification());

            const mockAction = vi.fn().mockResolvedValue({
                success: false,
                error: "Something went wrong",
            });
            const options = {
                successMessage: "Success",
                errorTitle: "Error occurred",
                errorMessage: "Failed to complete operation",
            };

            await act(async () => {
                await result.current.handleActionWithRedirect(mockAction, "/success-page", options);
            });

            expect(mockAction).toHaveBeenCalled();
            expect(notifications.show).toHaveBeenCalledWith({
                title: "Error occurred",
                message: "Failed to complete operation",
                color: "red",
                icon: expect.anything(),
            });
            expect(mockPush).not.toHaveBeenCalled();
        });

        it("should show error notification when action throws exception", async () => {
            const { result } = renderHook(() => useActionWithNotification());

            const mockAction = vi.fn().mockRejectedValue(new Error("Network error"));
            const options = {
                successMessage: "Success",
                errorTitle: "Error occurred",
                errorMessage: "Failed to complete operation",
            };

            await act(async () => {
                await result.current.handleActionWithRedirect(mockAction, "/success-page", options);
            });

            expect(mockAction).toHaveBeenCalled();
            expect(notifications.show).toHaveBeenCalledWith({
                title: "Error occurred",
                message: "Failed to complete operation",
                color: "red",
                icon: expect.anything(),
            });
            expect(mockPush).not.toHaveBeenCalled();
        });

        it("should use default error messages when not provided", async () => {
            const { result } = renderHook(() => useActionWithNotification());

            const mockAction = vi.fn().mockResolvedValue({
                success: false,
                error: "Custom error",
            });
            const options = {
                successMessage: "Success",
            };

            await act(async () => {
                await result.current.handleActionWithRedirect(mockAction, "/success-page", options);
            });

            expect(notifications.show).toHaveBeenCalledWith({
                title: "Error",
                message: "Custom error",
                color: "red",
                icon: expect.anything(),
            });
        });
    });

    describe("showSuccessFromParams", () => {
        it("should show success notification when success params are present", () => {
            const { result } = renderHook(() => useActionWithNotification());

            const mockSearchParams = {
                get: vi
                    .fn()
                    .mockReturnValueOnce("true") // success
                    .mockReturnValueOnce("Operation completed") // message
                    .mockReturnValueOnce("Success"), // title
            } as any;

            act(() => {
                result.current.showSuccessFromParams(mockSearchParams);
            });

            expect(notifications.show).toHaveBeenCalledWith({
                title: "Success",
                message: "Operation completed",
                color: "green",
                icon: expect.anything(),
            });
        });

        it("should use default title when not provided", () => {
            const { result } = renderHook(() => useActionWithNotification());

            const mockSearchParams = {
                get: vi
                    .fn()
                    .mockReturnValueOnce("true") // success
                    .mockReturnValueOnce("Operation completed") // message
                    .mockReturnValueOnce(null), // title
            } as any;

            act(() => {
                result.current.showSuccessFromParams(mockSearchParams);
            });

            expect(notifications.show).toHaveBeenCalledWith({
                title: "Success",
                message: "Operation completed",
                color: "green",
                icon: expect.anything(),
            });
        });

        it("should not show notification when success is not true", () => {
            const { result } = renderHook(() => useActionWithNotification());

            const mockSearchParams = {
                get: vi
                    .fn()
                    .mockReturnValueOnce("false") // success
                    .mockReturnValueOnce("Operation completed") // message
                    .mockReturnValueOnce("Success"), // title
            } as any;

            act(() => {
                result.current.showSuccessFromParams(mockSearchParams);
            });

            expect(notifications.show).not.toHaveBeenCalled();
        });

        it("should not show notification when message is missing", () => {
            const { result } = renderHook(() => useActionWithNotification());

            const mockSearchParams = {
                get: vi
                    .fn()
                    .mockReturnValueOnce("true") // success
                    .mockReturnValueOnce(null) // message
                    .mockReturnValueOnce("Success"), // title
            } as any;

            act(() => {
                result.current.showSuccessFromParams(mockSearchParams);
            });

            expect(notifications.show).not.toHaveBeenCalled();
        });

        it("should decode URL-encoded message", () => {
            const { result } = renderHook(() => useActionWithNotification());

            const mockSearchParams = {
                get: vi
                    .fn()
                    .mockReturnValueOnce("true") // success
                    .mockReturnValueOnce("Operation%20completed%20successfully") // message
                    .mockReturnValueOnce("Success"), // title
            } as any;

            act(() => {
                result.current.showSuccessFromParams(mockSearchParams);
            });

            expect(notifications.show).toHaveBeenCalledWith({
                title: "Success",
                message: "Operation completed successfully",
                color: "green",
                icon: expect.anything(),
            });
        });
    });
});
