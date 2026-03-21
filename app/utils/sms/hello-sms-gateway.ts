/**
 * HelloSMS gateway implementation
 *
 * This implements the SmsGateway interface using the HelloSMS API.
 * The actual API call logic is delegated to the sendSms function in hello-sms.ts.
 */

import type {
    SmsGateway,
    SendSmsRequest,
    SendSmsResponse,
    BalanceResult,
    ConversationResponse,
} from "./sms-gateway";
import { sendSms, checkBalance, fetchConversation } from "./hello-sms";

export class HelloSmsGateway implements SmsGateway {
    async send(request: SendSmsRequest): Promise<SendSmsResponse> {
        return sendSms(request);
    }

    async checkBalance(): Promise<BalanceResult> {
        return checkBalance();
    }

    async fetchConversation(e164Number: string): Promise<ConversationResponse> {
        return fetchConversation(e164Number);
    }
}
