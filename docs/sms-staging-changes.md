# SMS Configuration Changes: Staging vs Production

**Date:** October 8, 2025
**Change Type:** Security & Configuration Cleanup
**Status:** Implemented

## Summary

Removed SMS credentials from staging environment deployment while maintaining test mode functionality. This reduces secret sprawl and makes it explicit that staging doesn't send real SMS messages.

## Changes Made

### 1. Code Changes (`app/utils/sms/hello-sms.ts`)

**Before:**

- Credentials validated before checking test mode
- Would fail with error if credentials missing, even in test mode

**After:**

- Test mode check happens FIRST (line 147-150)
- Credentials only validated for real SMS sending (line 152-158)
- Test mode works WITHOUT credentials (returns fake success responses)

```typescript
// Handle test mode (works without credentials)
if (config.testMode) {
    return getTestModeResponse(request);
}

// Validate configuration (only required for real SMS sending)
if (!config.username || !config.password) {
    console.error("❌ HelloSMS credentials not configured (required for production SMS)");
    return { success: false, error: "HelloSMS credentials not configured" };
}
```

### 2. Workflow Changes

#### Staging Deployment (`.github/workflows/continuous_deployment.yml`)

**Removed:**

- `HELLO_SMS_USERNAME` (from GitHub Secrets)
- `HELLO_SMS_PASSWORD` (from GitHub Secrets)
- `SMS_SENDER` (hardcoded value)

**Kept:**

- `HELLO_SMS_TEST_MODE="true"` ✅ (prevents real SMS sends)

#### Production Deployment

**Changed:**

- `HELLO_SMS_TEST_MODE="false"` (was incorrectly set to "true")

**Kept:**

- All SMS credentials (required for real SMS sending)

#### Initial Deployment (`.github/workflows/init_deploy.yml`)

**Changed:**

- SMS credentials now set INSIDE the production conditional block
- Staging explicitly sets `HELLO_SMS_TEST_MODE="true"` without credentials

### 3. Deployment Script Changes

#### `deploy.sh` and `update.sh`

**Before:**

```bash
echo "HELLO_SMS_USERNAME=\"$HELLO_SMS_USERNAME\"" >> "$APP_DIR/.env"
echo "HELLO_SMS_PASSWORD=\"$HELLO_SMS_PASSWORD\"" >> "$APP_DIR/.env"
```

**After:**

```bash
# SMS configuration (conditional - only if credentials are provided)
if [ -n "${HELLO_SMS_USERNAME:-}" ]; then
  echo "HELLO_SMS_USERNAME=\"$HELLO_SMS_USERNAME\"" >> "$APP_DIR/.env"
fi
if [ -n "${HELLO_SMS_PASSWORD:-}" ]; then
  echo "HELLO_SMS_PASSWORD=\"$HELLO_SMS_PASSWORD\"" >> "$APP_DIR/.env"
fi
echo "HELLO_SMS_TEST_MODE=\"${HELLO_SMS_TEST_MODE:-true}\"" >> "$APP_DIR/.env"
```

- Scripts now handle missing credentials gracefully
- Safe default: `HELLO_SMS_TEST_MODE=true` if not set

### 4. Documentation Updates (`.env.example`)

Added clarification:

```bash
# SMS Configuration (HelloSMS)
# Note: Credentials are optional in staging/test environments when HELLO_SMS_TEST_MODE=true
# When test mode is enabled, SMS credentials are not required (returns fake success responses)
```

## Environment Variable Matrix

| Variable                 | Staging    | Production               | Notes                                   |
| ------------------------ | ---------- | ------------------------ | --------------------------------------- |
| `HELLO_SMS_TEST_MODE`    | `"true"`   | `"false"`                | **CRITICAL**: Controls real vs fake SMS |
| `HELLO_SMS_USERNAME`     | ❌ Not set | ✅ From secrets          | Only needed for real SMS                |
| `HELLO_SMS_PASSWORD`     | ❌ Not set | ✅ From secrets          | Only needed for real SMS                |
| `SMS_SENDER`             | ❌ Not set | ✅ `"Matcentral"`        | Optional, defaults to `BRAND_NAME`      |
| `NEXT_PUBLIC_SMS_SENDER` | ❌ Not set | ✅ Set from `SMS_SENDER` | Optional override                       |

## Benefits

✅ **Security**: Fewer secrets stored in GitHub
✅ **Clarity**: Explicit that staging doesn't send real SMS
✅ **Testing**: SMS workflows still testable via test mode
✅ **Safety**: Zero risk of accidentally sending real SMS from staging
✅ **Separation**: Clear production vs non-production configuration

## Behavior

### Staging Environment

- SMS features work normally in UI
- Clicking "Send SMS" succeeds immediately (fake response)
- No actual SMS messages sent
- No HelloSMS API calls made
- Console logs: `"🔧 SMS Test Mode explicitly set to: true"`

### Production Environment

- SMS features require valid credentials
- Clicking "Send SMS" calls HelloSMS API
- Real SMS messages sent to households
- Failures logged and retried
- Console logs: `"🔧 SMS Test Mode explicitly set to: false"`

### Development Environment

- Falls back to test mode if `HELLO_SMS_TEST_MODE` not set
- Works without credentials (like staging)
- Console logs: `"🔧 SMS Test Mode defaulted to: true (NODE_ENV=development)"`

## Migration Path

### First Staging Deployment

1. Workflow removes credentials from staging export
2. Staging `.env` file created without SMS credentials
3. Application boots successfully (test mode doesn't validate credentials)
4. SMS features work in test mode

### No Changes Required For

- ✅ Production deployment (credentials already in secrets)
- ✅ Local development (`.env.example` already documented)
- ✅ Database schema
- ✅ SMS service code (backward compatible)

## Testing Recommendations

After deployment to staging:

1. **Verify SMS test mode is active:**

    ```bash
    ssh staging
    cd ~/matkassen
    docker compose logs web | grep "SMS Test Mode"
    # Should show: "🔧 SMS Test Mode explicitly set to: true"
    ```

2. **Test SMS workflows:**

    - Navigate to schedule page
    - Select a parcel with phone number
    - Click "Send SMS Reminder"
    - Should succeed immediately with fake message ID

3. **Verify no credentials present:**
    ```bash
    ssh staging
    cd ~/matkassen
    grep "HELLO_SMS_USERNAME" .env
    # Should return nothing
    ```

## Rollback Plan

If issues arise, revert by:

1. Re-add to `.github/workflows/continuous_deployment.yml` (staging section):

    ```yaml
    export HELLO_SMS_USERNAME="${{ secrets.HELLO_SMS_USERNAME }}"
    export HELLO_SMS_PASSWORD="${{ secrets.HELLO_SMS_PASSWORD }}"
    ```

2. Revert code change in `app/utils/sms/hello-sms.ts`:

    - Move credential validation BEFORE test mode check

3. Redeploy to staging

## References

- **Code changes:** `app/utils/sms/hello-sms.ts` (line 147-158)
- **Workflow changes:** `.github/workflows/continuous_deployment.yml`, `.github/workflows/init_deploy.yml`
- **Deployment scripts:** `deploy.sh`, `update.sh`
- **Documentation:** `.env.example`
- **Architecture docs:** `AGENTS.md` (section: "Critical Security Patterns")
