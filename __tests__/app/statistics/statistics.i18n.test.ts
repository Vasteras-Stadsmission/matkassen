import { describe, it, expect } from "vitest";
import enMessages from "@/messages/en.json";
import svMessages from "@/messages/sv.json";

describe("Statistics i18n messages", () => {
    it("should include statistics SMS intent translations for enrolment", () => {
        expect(enMessages.statistics?.sms?.intents?.enrolment).toBeTypeOf("string");
        expect(svMessages.statistics?.sms?.intents?.enrolment).toBeTypeOf("string");
    });
});
