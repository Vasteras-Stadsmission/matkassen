/**
 * HelloSMS gateway implementation
 *
 * This implements the SmsGateway interface using the HelloSMS API.
 * The actual API call logic is delegated to the sendSms function in hello-sms.ts.
 */

import type { SmsGateway, SendSmsRequest, SendSmsResponse, BalanceResult } from "./sms-gateway";
import { sendSms, checkBalance } from "./hello-sms";

export class HelloSmsGateway implements SmsGateway {
    async send(request: SendSmsRequest): Promise<SendSmsResponse> {
        return sendSms(request);
    }

    async checkBalance(): Promise<BalanceResult> {
        return checkBalance();
    }
}
