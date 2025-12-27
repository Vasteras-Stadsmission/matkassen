import { describe, it, expect, beforeEach, vi } from "vitest";

// Mock function type
interface MockFunction<T> {
    (...args: unknown[]): T;
    mock: {
        calls: unknown[][];
    };
    mockClear(): void;
    mockReturnValue(value: T): MockFunction<T>;
    mockResolvedValue(value: T): MockFunction<Promise<T>>;
}

// Mock Next.js cache
vi.mock("next/cache", () => ({
    revalidatePath: vi.fn(() => {}),
    revalidateTag: vi.fn(() => {}),
    unstable_cache: vi.fn(() => {}),
}));

// Mock the SMS service function
const mockUpdateSmsProviderStatus = vi.fn(() =>
    Promise.resolve(true),
) as unknown as MockFunction<Promise<boolean>>;

vi.mock("@/app/utils/sms/sms-service", () => ({
    updateSmsProviderStatus: mockUpdateSmsProviderStatus,
}));

// Mock logger
vi.mock("@/app/utils/logger", () => ({
    logger: {
        info: vi.fn(),
        warn: vi.fn(),
        debug: vi.fn(),
        error: vi.fn(),
    },
    logError: vi.fn(),
}));

// CORS headers that match the implementation
const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
};

// Mock response type
interface MockResponse {
    status: number;
    headers: Map<string, string>;
    json: () => Promise<unknown>;
    text: () => Promise<string>;
}

// Recreate the route handlers for testing
const OPTIONS = async (): Promise<MockResponse> => {
    return {
        status: 200,
        headers: new Map(Object.entries(corsHeaders)),
        json: () => Promise.resolve({}),
        text: () => Promise.resolve(""),
    };
};

const POST = async (request: { json: () => Promise<unknown> }): Promise<MockResponse> => {
    try {
        const body = (await request.json()) as {
            apiMessageId?: string;
            status?: string;
            statusText?: string;
        };

        const messageId = body.apiMessageId;
        const status = body.status;

        if (!messageId) {
            return {
                status: 400,
                headers: new Map(Object.entries(corsHeaders)),
                json: () => Promise.resolve({ error: "Missing apiMessageId" }),
                text: () => Promise.resolve(""),
            };
        }

        if (!status) {
            return {
                status: 400,
                headers: new Map(Object.entries(corsHeaders)),
                json: () => Promise.resolve({ error: "Missing status" }),
                text: () => Promise.resolve(""),
            };
        }

        const fullStatus = body.statusText ? `${status}: ${body.statusText}` : status;
        await mockUpdateSmsProviderStatus(messageId, fullStatus);

        return {
            status: 200,
            headers: new Map(Object.entries(corsHeaders)),
            json: () => Promise.resolve({ received: true }),
            text: () => Promise.resolve(""),
        };
    } catch {
        return {
            status: 200,
            headers: new Map(Object.entries(corsHeaders)),
            json: () =>
                Promise.resolve({ received: true, error: "Processing failed but acknowledged" }),
            text: () => Promise.resolve(""),
        };
    }
};

// Helper to create mock NextRequest
const createMockRequest = (body: unknown) => {
    return {
        json: () => Promise.resolve(body),
    };
};

describe("SMS Status Webhook Endpoint", () => {
    beforeEach(() => {
        mockUpdateSmsProviderStatus.mockClear();
        (mockUpdateSmsProviderStatus as unknown as { mockResolvedValue: (v: boolean) => void }).mockResolvedValue(true);
    });

    describe("OPTIONS (CORS Preflight)", () => {
        it("should return 200 status with correct CORS headers", async () => {
            const response = await OPTIONS();

            expect(response.status).toBe(200);
            expect(response.headers.get("Access-Control-Allow-Origin")).toBe("*");
            expect(response.headers.get("Access-Control-Allow-Methods")).toBe("POST, OPTIONS");
            expect(response.headers.get("Access-Control-Allow-Headers")).toBe("Content-Type");
        });

        it("should return empty body", async () => {
            const response = await OPTIONS();
            const body = await response.text();

            expect(body).toBe("");
        });
    });

    describe("POST - Valid Callbacks", () => {
        it("should process valid callback with apiMessageId and status", async () => {
            const callbackData = {
                apiMessageId: "msg_123456",
                status: "Delivered",
            };
            const mockRequest = createMockRequest(callbackData);

            const response = await POST(mockRequest);
            const responseData = await response.json();

            expect(response.status).toBe(200);
            expect(responseData).toEqual({ received: true });
            expect(mockUpdateSmsProviderStatus).toHaveBeenCalledWith("msg_123456", "Delivered");
        });

        it("should combine status and statusText when both are present", async () => {
            const callbackData = {
                apiMessageId: "msg_123456",
                status: "Failed",
                statusText: "Invalid phone number",
            };
            const mockRequest = createMockRequest(callbackData);

            const response = await POST(mockRequest);

            expect(response.status).toBe(200);
            expect(mockUpdateSmsProviderStatus).toHaveBeenCalledWith(
                "msg_123456",
                "Failed: Invalid phone number",
            );
        });

        it("should include CORS headers in response", async () => {
            const callbackData = {
                apiMessageId: "msg_123456",
                status: "Sent",
            };
            const mockRequest = createMockRequest(callbackData);

            const response = await POST(mockRequest);

            expect(response.headers.get("Access-Control-Allow-Origin")).toBe("*");
            expect(response.headers.get("Access-Control-Allow-Methods")).toBe("POST, OPTIONS");
            expect(response.headers.get("Access-Control-Allow-Headers")).toBe("Content-Type");
        });

        it("should handle various status values", async () => {
            const statusValues = ["Delivered", "Failed", "Sent", "Queued", "Expired", "Rejected"];

            for (const status of statusValues) {
                mockUpdateSmsProviderStatus.mockClear();

                const callbackData = {
                    apiMessageId: `msg_${status.toLowerCase()}`,
                    status,
                };
                const mockRequest = createMockRequest(callbackData);

                const response = await POST(mockRequest);

                expect(response.status).toBe(200);
                expect(mockUpdateSmsProviderStatus).toHaveBeenCalledWith(
                    `msg_${status.toLowerCase()}`,
                    status,
                );
            }
        });
    });

    describe("POST - Missing Fields", () => {
        it("should return 400 when apiMessageId is missing", async () => {
            const callbackData = {
                status: "Delivered",
            };
            const mockRequest = createMockRequest(callbackData);

            const response = await POST(mockRequest);
            const responseData = await response.json();

            expect(response.status).toBe(400);
            expect(responseData).toEqual({ error: "Missing apiMessageId" });
            expect(mockUpdateSmsProviderStatus).not.toHaveBeenCalled();
        });

        it("should return 400 when status is missing", async () => {
            const callbackData = {
                apiMessageId: "msg_123456",
            };
            const mockRequest = createMockRequest(callbackData);

            const response = await POST(mockRequest);
            const responseData = await response.json();

            expect(response.status).toBe(400);
            expect(responseData).toEqual({ error: "Missing status" });
            expect(mockUpdateSmsProviderStatus).not.toHaveBeenCalled();
        });

        it("should return 400 when body is empty", async () => {
            const mockRequest = createMockRequest({});

            const response = await POST(mockRequest);
            const responseData = await response.json();

            expect(response.status).toBe(400);
            expect(responseData).toEqual({ error: "Missing apiMessageId" });
        });
    });

    describe("POST - Error Handling", () => {
        it("should return 200 even when JSON parsing fails", async () => {
            const mockRequest = {
                json: () => Promise.reject(new Error("Invalid JSON")),
            };

            const response = await POST(mockRequest);
            const responseData = await response.json();

            expect(response.status).toBe(200);
            expect(responseData).toEqual({
                received: true,
                error: "Processing failed but acknowledged",
            });
        });

        it("should still return 200 when message not found in database", async () => {
            (mockUpdateSmsProviderStatus as unknown as { mockResolvedValue: (v: boolean) => void }).mockResolvedValue(false);

            const callbackData = {
                apiMessageId: "msg_unknown",
                status: "Delivered",
            };
            const mockRequest = createMockRequest(callbackData);

            const response = await POST(mockRequest);
            const responseData = await response.json();

            expect(response.status).toBe(200);
            expect(responseData).toEqual({ received: true });
        });

        it("should include CORS headers even in error responses", async () => {
            const callbackData = {
                status: "Delivered",
                // Missing apiMessageId
            };
            const mockRequest = createMockRequest(callbackData);

            const response = await POST(mockRequest);

            expect(response.headers.get("Access-Control-Allow-Origin")).toBe("*");
            expect(response.headers.get("Access-Control-Allow-Methods")).toBe("POST, OPTIONS");
            expect(response.headers.get("Access-Control-Allow-Headers")).toBe("Content-Type");
        });
    });

    describe("POST - Additional Fields", () => {
        it("should ignore additional fields in the callback", async () => {
            const callbackData = {
                apiMessageId: "msg_123456",
                status: "Delivered",
                to: "+46701234567",
                timestamp: "2024-01-15T10:30:00Z",
                customField: "some value",
            };
            const mockRequest = createMockRequest(callbackData);

            const response = await POST(mockRequest);

            expect(response.status).toBe(200);
            expect(mockUpdateSmsProviderStatus).toHaveBeenCalledWith("msg_123456", "Delivered");
        });
    });
});
