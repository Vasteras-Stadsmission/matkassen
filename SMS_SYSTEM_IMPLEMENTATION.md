# SMS Notification System Implementation

This document outlines the SMS notification system that has been successfully integrated into the matkassen.org project.

## 🚀 Quick Demo

Visit `/[locale]/admin/sms-demo` to test the SMS functionality with a demo interface.

## 📁 File Structure

```
app/
├── api/admin/sms/                     # SMS management API endpoints
│   ├── [smsId]/resend/route.ts       # Resend failed SMS
│   ├── callback/route.ts             # Delivery receipt webhook
│   └── parcel/[parcelId]/
│       ├── route.ts                  # Send SMS for parcel
│       └── history/route.ts          # Get SMS history
├── db/schema.ts                      # Database schema (outgoingSms table)
├── p/[parcelId]/page.tsx            # Public pickup page
├── utils/sms/                       # SMS service layer
│   ├── hello-sms.ts                 # HelloSMS API integration
│   ├── sms-service.ts               # Database operations
│   ├── templates.ts                 # SMS message templates
│   └── scheduler.ts                 # Background SMS processing
├── [locale]/schedule/components/    # Admin UI components
│   ├── SmsManagementPanel.tsx      # SMS control panel
│   └── PickupCardWithSms.tsx       # Enhanced parcel card
└── [locale]/schedule/hooks/
    └── useSmsManagement.ts          # React hook for SMS operations
```

## 🔧 Configuration

Add these environment variables:

```bash
# HelloSMS Configuration
HELLOSMS_API_KEY=your_api_key_here
HELLOSMS_FROM_NUMBER=+46123456789
HELLOSMS_TEST_MODE=true

# Base URL for public pages and admin URLs
NEXT_PUBLIC_BASE_URL=https://matkassen.org
```

## 📊 Database Schema

The system adds the following to your existing schema:

```sql
-- SMS status tracking
CREATE TYPE sms_intent AS ENUM ('pickup_reminder', 'consent_enrolment');
CREATE TYPE sms_status AS ENUM ('queued', 'sending', 'sent', 'delivered', 'not_delivered', 'retrying', 'failed');

-- Outgoing SMS records
CREATE TABLE outgoing_sms (
    id VARCHAR(50) PRIMARY KEY,
    intent sms_intent NOT NULL,
    parcel_id VARCHAR(50),
    household_id VARCHAR(50) NOT NULL,
    to_e164 VARCHAR(20) NOT NULL,
    locale VARCHAR(10) NOT NULL,
    text TEXT NOT NULL,
    status sms_status DEFAULT 'queued',
    hello_sms_id VARCHAR(255),
    sent_at TIMESTAMP WITH TIME ZONE,
    delivered_at TIMESTAMP WITH TIME ZONE,
    failed_at TIMESTAMP WITH TIME ZONE,
    failure_reason TEXT,
    retry_count INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Food parcel pickup tracking
ALTER TABLE food_parcels ADD COLUMN picked_up_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE food_parcels ADD COLUMN picked_up_by_user_id VARCHAR(255);
```

## 🔄 SMS Flow

1. **Initial Notification**: Sent when parcel is first scheduled
2. **48h Reminder**: Automatic reminder 48 hours before pickup
3. **Manual Messages**: Admin can send custom notifications

## 🛠 API Endpoints

### Send SMS

```http
POST /api/admin/sms/parcel/[parcelId]
Content-Type: application/json

{
  "intent": "pickup_reminder" | "consent_enrolment"
}
```

### Get SMS History

```http
GET /api/admin/sms/parcel/[parcelId]/history
```

### Resend Failed SMS

```http
POST /api/admin/sms/[smsId]/resend
```

### Delivery Callback (HelloSMS)

```http
POST /api/sms/callback
Content-Type: application/json

{
  "id": "sms_id",
  "status": "delivered",
  "timestamp": "2024-01-15T10:30:00Z"
}
```

## 🌐 Public Pages

Each food parcel gets a public pickup page at:

```
/p/[parcelId]
```

Features:

- Mobile-responsive design
- QR code for admin access
- Pickup status tracking
- Maps integration
- Multi-language support (sv, en, ar, so)

## 🔧 Component Usage

### SMS Management Panel

```tsx
import SmsManagementPanel from "@/app/[locale]/schedule/components/SmsManagementPanel";
import { useSmsManagement } from "@/app/[locale]/schedule/hooks/useSmsManagement";

function MyComponent() {
    const { sendSms, resendSms, fetchSmsHistory, isLoading } = useSmsManagement();

    return (
        <SmsManagementPanel
            parcel={parcel}
            smsHistory={smsHistory}
            onSendSms={sendSms}
            onResendSms={resendSms}
            isLoading={isLoading}
        />
    );
}
```

### Enhanced Pickup Card

```tsx
import PickupCardWithSms from "@/app/[locale]/schedule/components/PickupCardWithSms";

function SchedulePage() {
    return (
        <PickupCardWithSms
            foodParcel={parcel}
            showSmsPanel={true}
            onReschedule={handleReschedule}
        />
    );
}
```

## 🌍 Internationalization

SMS templates support multiple locales:

- Swedish (sv)
- English (en)
- Arabic (ar)
- Somali (so)

Message templates are in `app/utils/sms/templates.ts` and use the next-intl message system.

## 🛡 Security Features

- Rate limiting on public pages (configure in NGINX)
- Phone number validation and E.164 normalization
- Test mode for development (no real SMS sent)
- Proper authentication for admin endpoints
- CSRF protection via Next.js

## 📱 Mobile-First Design

The public pickup pages are optimized for mobile devices with:

- Responsive layout
- Large touch targets
- Clear typography
- Accessible color contrast
- QR code scanning friendly

## 🔍 Testing

1. Use the demo page: `/[locale]/admin/sms-demo`
2. Set `HELLOSMS_TEST_MODE=true` for safe testing
3. Monitor logs for SMS processing
4. Check delivery receipts via callback endpoint

## 🚀 Deployment Notes

1. Run database migrations: `pnpm run db:migrate`
2. Configure HelloSMS webhook URL: `https://yourdomain.com/api/sms/callback`
3. Set up NGINX rate limiting for `/p/*` routes
4. Enable SMS scheduler in production (currently commented out in `instrumentation.ts`)

## 📋 Next Steps

- [ ] Enable SMS scheduler in production
- [ ] Add SMS analytics dashboard
- [ ] Implement SMS templates editor
- [ ] Add bulk SMS operations
- [ ] Create SMS cost tracking
- [ ] Add SMS delivery statistics

## 🎯 Integration Points

The SMS system integrates with:

- Existing parcel scheduling system
- Household management
- i18n translation system
- Admin authentication
- Public page routing

Ready for production use with proper environment configuration! 🎉
