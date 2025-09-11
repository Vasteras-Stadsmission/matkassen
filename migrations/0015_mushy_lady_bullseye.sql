ALTER TABLE "outgoing_sms" ADD COLUMN "subject" varchar(50);--> statement-breakpoint
ALTER TABLE "outgoing_sms" ADD COLUMN "callback_ref" varchar(100);