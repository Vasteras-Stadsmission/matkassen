# HelloSMS Integration

SMS provider for Matkassen. API base: `https://api.hellosms.se/api/v1`

## Authentication

All API calls use HTTP Basic Auth (`HELLO_SMS_USERNAME` / `HELLO_SMS_PASSWORD`).

## Endpoints

### Send — `POST /sms/send`

Request body:

```json
{ "to": "+46700000000", "message": "...", "from": "Matkassen", "sendApiCallback": true }
```

Response:

```json
{
  "status": "success" | "failed",
  "statusText": "...",
  "messageIds": [{
    "apiMessageId": "12345",
    "to": "+46700000000",
    "status": 0,
    "message": "OK"
  }]
}
```

**Per-recipient status codes** (confirmed by HelloSMS support — these are the only two):

| Code | Meaning                                     |
| ---- | ------------------------------------------- |
| `0`  | Accepted for delivery                       |
| `-5` | Rejected (invalid/unsupported phone number) |

### Conversation — `GET /sms/conversation?number=46700000000`

Returns up to 200 messages for a phone number. Note: number is without `+` prefix.
We use this for reconciliation — cross-checking delivery status for messages where
the callback never arrived.

### Balance — `GET /account/balance`

Returns `{ "credits": 1234 }`. We check this before sending to detect low balance.

## Delivery Status Callbacks

HelloSMS calls our webhook when delivery status changes. The callback URL is
**configured at account level** by contacting HelloSMS support — it's not set
per-request.

Our endpoint: `/api/webhooks/sms-status/[SMS_CALLBACK_SECRET]`

Callback payload:

```json
{
    "apiMessageId": "12345",
    "status": "delivered",
    "timestamp": 1672531199,
    "callbackRef": "someReference"
}
```

**Known status values:**

| Status          | Meaning                                                      |
| --------------- | ------------------------------------------------------------ |
| `delivered`     | Successfully delivered to recipient                          |
| `failed`        | Permanent failure (invalid/inactive number)                  |
| `not delivered` | Temporary failure (phone off/unreachable) or message expired |
| `waiting`       | Queued at the provider, not yet delivered                    |
| `expired`       | Delivery window exceeded, provider gave up                   |

### Callback retry behavior (confirmed by HelloSMS support)

If our endpoint is unreachable or returns non-200, HelloSMS retries
**6 attempts total**. After the first attempt, retries happen at:
**1, 5, 15, 60, and 360 minutes**.

Note: Our handler currently returns 200 even on processing errors
(e.g., DB failure) to avoid retries on non-retriable parse errors.
The reconciliation job covers missed callbacks as a safety net.

### Callback timing (confirmed by HelloSMS support)

- Typically arrives **within seconds** after the cellular provider reports status.
- HelloSMS usually gets provider status within ~1 second of delivery.
- During large campaigns, providers may queue callbacks for **several minutes**.
- HelloSMS also rate-limits concurrent outbound callbacks.
- Timing is highly variable due to cellular network differences.

### Message expiry behavior (confirmed by HelloSMS support)

When a message expires unsent (past the "Final Send Time"), most providers
report it as **"not delivered"**, which normally triggers a callback. However,
this is provider-dependent — some may not send a callback at all.

## Configuration

| Env var                                     | Required   | Description                                                                                           |
| ------------------------------------------- | ---------- | ----------------------------------------------------------------------------------------------------- |
| `HELLO_SMS_USERNAME`                        | Production | API username                                                                                          |
| `HELLO_SMS_PASSWORD`                        | Production | API password                                                                                          |
| `HELLO_SMS_API_URL`                         | No         | Defaults to `https://api.hellosms.se/api/v1/sms/send`                                                 |
| `HELLO_SMS_TEST_MODE`                       | No         | `true` to return fake responses without calling API. Defaults to `true` in dev, `false` in production |
| `SMS_CALLBACK_SECRET`                       | Production | Min 32 chars. Part of the callback URL. Generate with `npx nanoid --size 32`                          |
| `HELLO_SMS_FROM` / `NEXT_PUBLIC_SMS_SENDER` | No         | Override sender name (max 11 chars)                                                                   |

### Test mode

When `HELLO_SMS_TEST_MODE=true` (or `NODE_ENV !== "production"`), all send
calls return fake success responses without hitting the API. Credentials are
not required. The conversation and balance APIs also return stubs.

### Sender name

HelloSMS enforces an **11-character limit** on the `from` field. If `BRAND_NAME`
exceeds this, it's truncated automatically with a console warning. Override
explicitly with `NEXT_PUBLIC_SMS_SENDER` or `HELLO_SMS_FROM`.
