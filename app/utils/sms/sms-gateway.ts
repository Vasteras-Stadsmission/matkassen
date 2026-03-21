/**
 * SMS Gateway interface for dependency injection
 *
 * This interface allows the SMS sending logic to be swapped out for testing.
 * In production, HelloSmsGateway is used. In tests, MockSmsGateway can be
 * configured to simulate various failure scenarios.
 */

import { HelloSmsGateway } from "./hello-sms-gateway";

export interface BalanceResult {
    success: boolean;
    credits?: number;
    error?: string;
}

export type ConversationMessageStatus =
    | "received" // Incoming message received by the system
    | "delivered" // Successfully delivered to recipient
    | "failed" // Permanent failure (invalid/inactive number)
    | "not delivered" // Temporary failure (phone off/offline)
    | "waiting" // Queued, not yet delivered
    | "expired" // Delivery window exceeded, gave up
    | "out_of_credits"; // Not sent due to insufficient credits

export interface ConversationMessage {
    ts: number; // Unix timestamp
    subject: string;
    text: string;
    direction: "in" | "out";
    status: ConversationMessageStatus;
}

export interface ConversationResponse {
    success: boolean;
    messages: ConversationMessage[];
    error?: string;
}

export interface SmsGateway {
    send(request: SendSmsRequest): Promise<SendSmsResponse>;
    checkBalance(): Promise<BalanceResult>;
    fetchConversation(e164Number: string): Promise<ConversationResponse>;
}

export interface SendSmsRequest {
    to: string; // E.164 format phone number
    text: string;
    from?: string;
}

export interface SendSmsResponse {
    success: boolean;
    messageId?: string;
    error?: string;
    httpStatus?: number;
}

// Default gateway instance - lazily initialized to HelloSmsGateway
let currentGateway: SmsGateway | null = null;

/**
 * Get the current SMS gateway instance.
 * Lazily initializes to HelloSmsGateway if not set.
 */
export function getSmsGateway(): SmsGateway {
    if (currentGateway) {
        return currentGateway;
    }
    const gateway = new HelloSmsGateway();
    currentGateway = gateway;
    return gateway;
}

/**
 * Set the SMS gateway instance.
 * Use this in tests to inject a mock gateway.
 */
export function setSmsGateway(gateway: SmsGateway): void {
    currentGateway = gateway;
}

/**
 * Reset the SMS gateway to the default (HelloSmsGateway).
 * Use this in test cleanup.
 */
export function resetSmsGateway(): void {
    currentGateway = null;
}

/**
 * Send SMS via the current gateway.
 * This is the main entry point for sending SMS.
 */
export async function sendSmsViaGateway(request: SendSmsRequest): Promise<SendSmsResponse> {
    return getSmsGateway().send(request);
}

/**
 * Check SMS credit balance via the current gateway.
 */
export async function checkBalanceViaGateway(): Promise<BalanceResult> {
    return getSmsGateway().checkBalance();
}

/**
 * Fetch conversation history via the current gateway.
 */
export async function fetchConversationViaGateway(
    e164Number: string,
): Promise<ConversationResponse> {
    return getSmsGateway().fetchConversation(e164Number);
}
