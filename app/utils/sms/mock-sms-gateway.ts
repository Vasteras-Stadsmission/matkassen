/**
 * Mock SMS gateway for testing
 *
 * This implements the SmsGateway interface with configurable behavior
 * for testing various success and failure scenarios.
 */

import type {
    SmsGateway,
    SendSmsRequest,
    SendSmsResponse,
    BalanceResult,
    ConversationResponse,
    ConversationMessage,
} from "./sms-gateway";

export interface MockSmsCall {
    request: SendSmsRequest;
    response: SendSmsResponse;
    timestamp: Date;
}

export type MockBehavior =
    | { type: "success" }
    | { type: "fail"; error: string; httpStatus?: number }
    | { type: "fail_then_succeed"; failCount: number; error: string; httpStatus?: number };

export class MockSmsGateway implements SmsGateway {
    private behavior: MockBehavior = { type: "success" };
    private callCount = 0;
    private calls: MockSmsCall[] = [];
    private messageIdCounter = 0;
    private balanceCredits: number = 999;
    private balanceError: string | null = null;
    private conversationsByPhone: Map<string, ConversationMessage[]> = new Map();
    private defaultConversationMessages: ConversationMessage[] = [];
    private conversationError: string | null = null;

    /**
     * Configure the balance check to return a specific credit count
     */
    mockBalance(credits: number): this {
        this.balanceCredits = credits;
        this.balanceError = null;
        return this;
    }

    /**
     * Configure the balance check to return an error
     */
    mockBalanceError(error: string): this {
        this.balanceError = error;
        return this;
    }

    /**
     * Configure fetchConversation to return specific messages.
     * If phone is provided, only returns these messages for that number.
     * Without phone, sets the default response for all numbers.
     */
    mockConversation(messages: ConversationMessage[], phone?: string): this {
        if (phone) {
            this.conversationsByPhone.set(phone, messages);
        } else {
            this.defaultConversationMessages = messages;
        }
        this.conversationError = null;
        return this;
    }

    /**
     * Configure fetchConversation to return an error
     */
    mockConversationError(error: string): this {
        this.conversationError = error;
        return this;
    }

    /**
     * Check balance (mock implementation)
     */
    async checkBalance(): Promise<BalanceResult> {
        if (this.balanceError) {
            return { success: false, error: this.balanceError };
        }
        return { success: true, credits: this.balanceCredits };
    }

    /**
     * Fetch conversation (mock implementation)
     */
    async fetchConversation(e164Number: string): Promise<ConversationResponse> {
        if (this.conversationError) {
            return { success: false, messages: [], error: this.conversationError };
        }
        const messages =
            this.conversationsByPhone.get(e164Number) ?? this.defaultConversationMessages;
        return { success: true, messages };
    }

    /**
     * Configure the gateway to always succeed
     */
    alwaysSucceed(): this {
        this.behavior = { type: "success" };
        return this;
    }

    /**
     * Configure the gateway to always fail with a specific error
     */
    alwaysFail(error: string, httpStatus?: number): this {
        this.behavior = { type: "fail", error, httpStatus };
        return this;
    }

    /**
     * Configure the gateway to fail N times, then succeed
     * Useful for testing retry logic
     */
    failThenSucceed(failCount: number, error: string, httpStatus?: number): this {
        this.behavior = { type: "fail_then_succeed", failCount, error, httpStatus };
        return this;
    }

    /**
     * Reset the gateway state (call count, recorded calls, behavior)
     */
    reset(): this {
        this.callCount = 0;
        this.calls = [];
        this.behavior = { type: "success" };
        this.messageIdCounter = 0;
        this.balanceCredits = 999;
        this.balanceError = null;
        this.conversationsByPhone = new Map();
        this.defaultConversationMessages = [];
        this.conversationError = null;
        return this;
    }

    /**
     * Get all recorded calls
     */
    getCalls(): MockSmsCall[] {
        return [...this.calls];
    }

    /**
     * Get the number of times send() was called
     */
    getCallCount(): number {
        return this.callCount;
    }

    /**
     * Get the last call made, or undefined if no calls
     */
    getLastCall(): MockSmsCall | undefined {
        return this.calls[this.calls.length - 1];
    }

    async send(request: SendSmsRequest): Promise<SendSmsResponse> {
        this.callCount++;
        const currentCall = this.callCount;

        let response: SendSmsResponse;

        switch (this.behavior.type) {
            case "success":
                response = {
                    success: true,
                    messageId: `mock_${++this.messageIdCounter}`,
                };
                break;

            case "fail":
                response = {
                    success: false,
                    error: this.behavior.error,
                    httpStatus: this.behavior.httpStatus,
                };
                break;

            case "fail_then_succeed":
                if (currentCall <= this.behavior.failCount) {
                    response = {
                        success: false,
                        error: this.behavior.error,
                        httpStatus: this.behavior.httpStatus,
                    };
                } else {
                    response = {
                        success: true,
                        messageId: `mock_${++this.messageIdCounter}`,
                    };
                }
                break;

            default:
                response = {
                    success: true,
                    messageId: `mock_${++this.messageIdCounter}`,
                };
        }

        this.calls.push({
            request,
            response,
            timestamp: new Date(),
        });

        return response;
    }
}
