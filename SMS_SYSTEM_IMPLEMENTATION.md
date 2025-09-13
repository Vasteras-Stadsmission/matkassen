# SMS Notification System Implementation

This document outlines the SMS notification system that has bee6. **Queue Processing**: Background processing every 30 seconds 7. **Retry Logic**: Automatic retries with backoff (5s, 15s, 60s) 8. **Test Mode**: Safe testing without real SMS deliveryccessfully integrated into the matkassen.org project.

## 🚀 Current Status

**✅ COMPLETED - READY FOR PRODUCTION**

The SMS system is fully implemented and tested with real SMS delivery via HelloSMS API. All core functionality is working including:

- Real SMS delivery to phones
- Public parcel pages with mobile-first design
- SMS templates with localization
- Test mode for development
- **Balanced retry logic** - reliable without overengineering
- Smart failure handling with exponential backoff## 🎯 Quick Demo

Visit `/[locale]/admin/sms-demo` to test the SMS functionality with a comprehensive demo interface.

## 📁 File Structure (Implemented)

```
app/
├── api/
│   └── admin/sms/                     # SMS management API endpoints
│       ├── process-queue/route.ts    # Manual SMS queue processing
│       └── parcel/[parcelId]/route.ts # Send SMS for specific parcel
├── p/                                # Public parcel pages (mobile-first)
│   ├── [parcelId]/page.tsx          # Mobile-optimized pickup page
│   └── layout.tsx                   # Minimal layout for public pages
├── utils/
│   ├── locale-detection.ts          # Public page locale handling
│   ├── public-parcel-data.ts        # Data utilities for public pages
│   └── sms/                         # SMS service layer
│       ├── hello-sms.ts             # HelloSMS API integration
│       ├── sms-service.ts           # Database operations & queue management
│       ├── templates.ts             # Localized SMS message templates
│       ├── scheduler.ts             # Background SMS processing
│       └── server-startup.ts        # Server-side scheduler initialization
├── [locale]/admin/sms-demo/         # Demo interface for testing
│   ├── page.tsx                     # Demo page wrapper
│   └── components/
│       └── SmsManagementDemo.tsx    # Complete demo interface
├── components/
│   ├── QRCode.tsx                   # QR code generation
│   └── AuthProtection/              # Authentication wrappers
├── db/schema.ts                     # Database schema (outgoing_sms table)
├── middleware.ts                    # Route handling for public pages
├── instrumentation.ts               # Secrets loading
└── server.js                        # Custom Next.js server with SMS scheduler initialization
```

## 🔧 Configuration (Production Ready)

### Smart Defaults for Development

The SMS system now has intelligent defaults that work out of the box:

**`pnpm dev` (Direct Next.js):**

- ✅ **Safe by default**: `testMode` defaults to `true` in non-production environments
- ✅ **Works locally**: `NEXT_PUBLIC_BASE_URL` defaults to `http://localhost:3000`
- ✅ **No configuration needed**: All values have sensible fallbacks

**Docker Compose (Override defaults):**

- Environment-specific configuration via docker-compose environment variables
- Production settings automatically applied in production builds

### Environment Variables (Secrets only in .env)

```bash
# HelloSMS API Credentials (required)
HELLO_SMS_USERNAME=your_username_here
HELLO_SMS_PASSWORD=your_password_here
```

### Optional Configuration Overrides

**Production (`docker-compose.yml`):**

```yaml
environment:
    - NEXT_PUBLIC_BASE_URL=https://matkassen.org
    - HELLO_SMS_TEST_MODE=false # Override default
```

**Development (docker-compose overrides - optional):**

```yaml
environment:
    - NEXT_PUBLIC_BASE_URL=http://localhost:3000
    - HELLO_SMS_TEST_MODE=true # Explicit override
```

### Default Behavior

| Environment Variable   | Default Value                                                   | Logic              |
| ---------------------- | --------------------------------------------------------------- | ------------------ |
| `HELLO_SMS_API_URL`    | `https://api.hellosms.se/api/v1/sms/send`                       | Fixed API endpoint |
| `HELLO_SMS_FROM`       | `Matkassen`                                                     | Fixed sender name  |
| `HELLO_SMS_TEST_MODE`  | `true` if `NODE_ENV !== "production"`                           | Safe by default    |
| `NEXT_PUBLIC_BASE_URL` | `http://localhost:3000` (dev) or `https://matkassen.org` (prod) | Environment-aware  |

### HelloSMS Integration (Simplified)

The system now uses a simple approach - no complex callback tracking or analytics fields.

````

### Database Migration

The system uses the existing schema with these additions:

```sql
-- Already migrated and working
CREATE TYPE sms_intent AS ENUM ('pickup_reminder', 'consent_enrolment');
CREATE TYPE sms_status AS ENUM ('queued', 'sending', 'sent', 'delivered', 'not_delivered', 'retrying', 'failed');

CREATE TABLE outgoing_sms (
    id VARCHAR(50) PRIMARY KEY,
    intent sms_intent NOT NULL,
    parcel_id VARCHAR(50),
    household_id VARCHAR(50) NOT NULL,
    to_e164 VARCHAR(20) NOT NULL,
    locale VARCHAR(10) NOT NULL,
    text TEXT NOT NULL,
    status sms_status DEFAULT 'queued',
    attempt_count INTEGER DEFAULT 0,
    next_attempt_at TIMESTAMP WITH TIME ZONE,
    provider_message_id VARCHAR(255),
    last_error_code VARCHAR(50),
    last_error_message TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    sent_at TIMESTAMP WITH TIME ZONE,
    delivered_at TIMESTAMP WITH TIME ZONE,
    failed_at TIMESTAMP WITH TIME ZONE
);
````

## 🔄 SMS Flow (Implemented & Working)

### Current Implementation

1. **Manual SMS Sending**: Via demo interface at `/[locale]/admin/sms-demo`
2. **Real SMS Delivery**: Successfully tested with HelloSMS API
3. **Public Parcel Pages**: Mobile-first design at `/p/[parcelId]`
4. **QR Code Integration**: QR codes link to admin schedule page
5. **Queue Processing**: Background processing every 30 seconds
6. **Retry Logic**: Automatic retries with backoff (5s, 15s, 60s)
7. **Test Mode**: Safe testing without real SMS delivery
8. **Failure Injection**: Configurable failure rate for testing

### SMS Templates (Localized)

- **Initial Notification**: Sent when parcel is first created
- **Reminder Notification**: Different template for follow-up messages
- **Supports 20 Languages**: Swedish (sv), English (en), Arabic (ar), Persian (fa), Kurdish (ku), Spanish (es), French (fr), German (de), Greek (el), Swahili (sw), Somali (so), Southern Somali (so_so), Ukrainian (uk), Russian (ru), Georgian (ka), Finnish (fi), Italian (it), Thai (th), Vietnamese (vi), Polish (pl), Armenian (hy)

### Phone Number Handling

- Automatic E.164 normalization for Swedish numbers
- Handles formats: 0701234567, +46701234567, 46701234567

## 🛠 API Endpoints (Implemented)

### Send SMS for Parcel

```http
POST /api/admin/sms/parcel/[parcelId]
Content-Type: application/json

{
  "intent": "pickup_reminder" | "consent_enrolment",
  "isReminder": true | false  # Affects template selection
}
```

### Process SMS Queue (Manual Trigger)

```http
POST /api/admin/sms/process-queue
```

## 🌐 Public Pages (Mobile-First Implementation)

Each food parcel gets a public pickup page at:

```
/p/[parcelId]
```

### Features Implemented:

- ✅ **Mobile-responsive design** optimized for phones
- ✅ **Large QR code** (240px) for admin access
- ✅ **Pickup status tracking** (scheduled, ready, collected, expired)
- ✅ **Maps integration** (Google Maps & Apple Maps buttons)
- ✅ **Multi-language support** with automatic locale detection for all 20 supported languages
- ✅ **RTL layout support** for Arabic, Persian, and Kurdish
- ✅ **Clean, efficient layout** (removed redundant headers)
- ✅ **Proper middleware routing** (bypasses locale middleware)
- ✅ **Stockholm timezone handling** via TimeProvider
- ✅ **Balanced retry logic** - reliable without overengineering
- ✅ **Smart failure handling** - 3 attempts with 5min/30min backoff

### URL Structure:

- Public page: `https://matkassen.org/p/[parcelId]`
- QR code links to: `https://matkassen.org/sv/schedule?parcel=[parcelId]`

### Technical Details:

- Uses `MantineProvider` for styling consistency
- Exempted from auth requirements via `AuthProtection`
- Responsive design with proper mobile viewport
- Status badges with appropriate colors

## 🔧 Testing & Demo (Fully Functional)

### Demo Interface: `/[locale]/admin/sms-demo`

**Complete testing interface includes:**

- ✅ Real SMS sending to actual phone numbers
- ✅ Test mode toggle (safe development testing)
- ✅ Live SMS queue monitoring
- ✅ Manual queue processing triggers
- ✅ SMS history and status tracking
- ✅ Template preview for all locales
- ✅ Phone number validation testing

### Environment Modes:

**Production Mode** (`HELLO_SMS_TEST_MODE=false`):

- Sends real SMS via HelloSMS API
- Actually delivers to recipient phones
- Uses real API credentials

**Test Mode** (`HELLO_SMS_TEST_MODE=true`):

- Simulates SMS sending without real delivery
- Generates fake message IDs
- Safe for development and testing

### Validated Features:

- ✅ Real SMS delivery to Swedish phone numbers
- ✅ E.164 phone number normalization
- ✅ **Complete 20-language template system** (sv, en, ar, fa, ku, es, fr, de, el, sw, so, so_so, uk, ru, ka, fi, it, th, vi, pl, hy)
- ✅ **Public page localization for all 20 languages**
- ✅ **RTL support** for Arabic, Persian, and Kurdish
- ✅ Retry logic with exponential backoff
- ✅ Queue processing and background scheduling
- ✅ Mobile-optimized public pages

## 🌍 Internationalization (Implemented)

### Supported Locales:

**Complete 20-language support:**

- ✅ **Swedish (sv)** - Primary language
- ✅ **English (en)** - Secondary language
- ✅ **Arabic (ar)** - RTL support included
- ✅ **Persian (fa)** - RTL support included
- ✅ **Kurdish (ku)** - RTL support included
- ✅ **Spanish (es)** - Community language
- ✅ **French (fr)** - Community language
- ✅ **German (de)** - Community language
- ✅ **Greek (el)** - Community language
- ✅ **Swahili (sw)** - Community language
- ✅ **Somali (so)** - Community language
- ✅ **Southern Somali (so_so)** - Regional variant
- ✅ **Ukrainian (uk)** - Community language
- ✅ **Russian (ru)** - Community language
- ✅ **Georgian (ka)** - Community language
- ✅ **Finnish (fi)** - Community language
- ✅ **Italian (it)** - Community language
- ✅ **Thai (th)** - Community language
- ✅ **Vietnamese (vi)** - Community language
- ✅ **Polish (pl)** - Community language
- ✅ **Armenian (hy)** - Community language

### Message Templates:

Located in `app/utils/sms/templates.ts` with full i18n integration for all 20 languages:

```typescript
// All SMS functions support complete switch cases for all languages
formatPickupReminderSms(locale, parcelData, isReminder) {
  switch (locale) {
    case 'sv': return "Ditt matpaket är redo för upphämtning...";
    case 'en': return "Your food parcel is ready for pickup...";
    case 'ar': return "طرد الطعام الخاص بك جاهز للاستلام...";
    case 'fa': return "بسته غذایی شما آماده تحویل است...";
    case 'ku': return "پاکێتی خۆراکت ئامادەیە بۆ وەرگرتن...";
    // ... all 20 languages supported
    default: return "Your food parcel is ready for pickup..."; // English fallback
  }
}
```

### Public Page Localization:

- Complete message files created for all 20 languages (`messages/public-*.json`)
- Automatic locale detection from browser/URL
- Fallback to English if locale unavailable
- Proper RTL layout for Arabic, Persian, and Kurdish
- Localized date/time formatting for all languages

## 🛡 Security & Production Features

### Implemented Security:

- ✅ **Authentication required** for all admin endpoints
- ✅ **Public page access** properly secured (no sensitive data exposed)
- ✅ **Phone number validation** and E.164 normalization
- ✅ **Test mode isolation** (prevents accidental real SMS in dev)
- ✅ **Rate limiting ready** (middleware configured for `/p/*` routes)
- ✅ **CSRF protection** via Next.js built-in features

### Production Readiness:

- ✅ **Error handling** with retry logic and backoff
- ✅ **Database transactions** for SMS record management
- ✅ **Logging** for debugging and monitoring
- ✅ **Queue processing** with proper state management
- ✅ **TimeProvider integration** for consistent timezone handling
- ✅ **Environment configuration** separated from code

### Mobile Optimization:

- ✅ **Mobile-first responsive design**
- ✅ **Touch-friendly interface elements**
- ✅ **Optimized for QR code scanning**
- ✅ **Fast loading** with minimal dependencies
- ✅ **Accessible color contrast** and typography

## � Deployment Status

### ✅ Ready for Production

**Current Implementation Status:**

- ✅ SMS system fully functional with real delivery
- ✅ Public pages mobile-optimized and tested
- ✅ Database schema migrated and working
- ✅ All environment variables documented
- ✅ Test mode for development
- ✅ Background processing implemented
- ✅ Phone number validation and E.164 normalization
- ✅ Multi-language template system

**Deployment Checklist:**

1. ✅ Configure HelloSMS credentials in production `.env` file (only secrets needed)
2. ✅ Set `HELLO_SMS_TEST_MODE=false` in production docker-compose (optional - smart defaults work)
3. ✅ Set production domain in docker-compose (optional - smart defaults work)
4. ✅ **SMS scheduler enabled** - Automatically starts with custom Next.js server on application startup
5. ⚠️ Configure NGINX rate limiting for `/p/*` routes (optional)

### Missing Admin Features (Separate PR):

- ❌ **Admin parcel management page** for QR code destination
- ❌ **Volunteer pickup workflow** when scanning QR codes
- ❌ **Mark as picked up functionality** in admin UI

**Note:** The QR codes currently point to `/sv/schedule?parcel=[parcelId]` but the schedule page doesn't handle the parcel parameter yet. This admin functionality should be implemented in a separate PR.

## 🎯 What We Accomplished

### Core SMS Functionality:

1. **HelloSMS Integration** - Real SMS delivery working
2. **Queue System** - Background processing with retry logic
3. **Template System** - Multi-language SMS templates
4. **Public Pages** - Mobile-first recipient experience
5. **Demo Interface** - Complete testing and monitoring tools
6. **Database Schema** - SMS tracking and management
7. **TimeProvider Integration** - Consistent timezone handling

### Technical Achievements:

- Real SMS delivery tested and confirmed working
- Mobile-optimized public pages with QR codes
- Proper E.164 phone number handling
- **Comprehensive 20-language support** (sv, en, ar, fa, ku, es, fr, de, el, sw, so, so_so, uk, ru, ka, fi, it, th, vi, pl, hy)
- **RTL language support** for Arabic, Persian, and Kurdish
- **Complete public page localization** with dedicated message files for all languages
- Test mode for safe development
- Background queue processing every 30 seconds
- Retry logic with exponential backoff (5s, 15s, 60s)

## 📋 Next Phase (Separate PR)

**Admin Parcel Management:**

- Create `/[locale]/admin/parcel/[parcelId]` page
- Handle QR code scanning workflow for volunteers
- Implement "Mark as Picked Up" functionality
- Connect parcel parameter in schedule page
- Add parcel-specific admin actions

**Critical SMS System Improvements (COMPLETED):**

- ✅ **Opening Hours Validation**: Added checks to prevent SMS for parcels scheduled outside pickup location opening hours
  - Integrates with existing `pickupLocationSchedules` and `pickupLocationScheduleDays` infrastructure
  - Uses robust `isParcelOutsideOpeningHours()` validation function
  - Includes fail-safe behavior (includes parcels when schedules unavailable or validation errors occur)
  - Provides logging for filtering statistics and admin visibility
  - **Test Coverage**: 6 focused tests covering normal filtering, fail-safe scenarios, error handling, and edge cases
- ✅ **Template Variable Type Safety**: Improved TypeScript types to reflect NOT NULL database constraints
  - Removed unnecessary runtime validation for guaranteed NOT NULL fields (first_name, last_name, location names, pickup dates)
  - Added clear documentation explaining database schema guarantees
  - Fixed base URL construction to properly include protocol in production

This separation keeps the current PR focused on the SMS system core functionality while leaving the admin workflow and critical business logic improvements for a targeted follow-up implementation.
