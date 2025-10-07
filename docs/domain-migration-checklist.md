# Domain Migration: matkassen.org → matcentralen.com

## ✅ Completed (Code Changes)

The white-label configuration system has been implemented. All domain and brand references now pull from a centralized configuration (`app/config/branding.ts`).

### What Changed

- ✅ Created `app/config/branding.ts` - Single source of truth for domain/brand
- ✅ Updated `app/utils/public-parcel-data.ts` - Uses centralized config
- ✅ Updated `app/utils/sms/hello-sms.ts` - Uses centralized config
- ✅ Updated `.env.example` - Documented new white-label env vars
- ✅ Updated `docker-compose.yml` - Uses environment variables
- ✅ Updated `docker-compose.dev.yml` - Uses environment variables
- ✅ Updated `docker-compose.local.yml` - Uses environment variables
- ✅ Updated `next.config.ts` - Added new domains to CSP allowlist
- ✅ Updated `deploy.sh` - Supports new domain + writes env vars
- ✅ Updated `update.sh` - Supports new domain + writes env vars
- ✅ Updated `.github/workflows/init_deploy.yml` - New domain/brand
- ✅ Updated `.github/workflows/continuous_deployment.yml` - New domain/brand

---

## 🚨 REQUIRED: Steps You Must Complete

### 1. DNS Configuration

Point the new domains to your VPS servers:

```bash
# Production DNS Records
A     matcentralen.com            → [PRODUCTION_VPS_IP]
A     www.matcentralen.com        → [PRODUCTION_VPS_IP]

# Staging DNS Records  
A     staging.matcentralen.com    → [STAGING_VPS_IP]
```

**How to verify:**
```bash
# Wait for DNS propagation (can take up to 48h, usually 5-30 min)
dig matcentralen.com +short
dig www.matcentralen.com +short
dig staging.matcentralen.com +short

# Should return your VPS IP addresses
```

---

### 2. GitHub OAuth Application Updates

Update your GitHub OAuth App callback URLs to include the new domains:

**Location:** https://github.com/organizations/Vasteras-Stadsmission/settings/applications

**Action:** Add these callback URLs (KEEP old ones during transition):

```
https://matcentralen.com/api/auth/callback/github
https://www.matcentralen.com/api/auth/callback/github
https://staging.matcentralen.com/api/auth/callback/github
```

**Keep these for now (remove after migration complete):**
```
https://matkassen.org/api/auth/callback/github
https://www.matkassen.org/api/auth/callback/github
https://staging.matkassen.org/api/auth/callback/github
```

---

### 3. GitHub Secrets Configuration

**No changes needed!** The code already expects these exact secret names.

The deployment scripts will automatically use:
- `NEXT_PUBLIC_BRAND_NAME` is now set to "Matcentralen" in workflows ✅
- `NEXT_PUBLIC_BASE_URL` is now auto-generated from `DOMAIN_NAME` ✅
- Domain names updated in workflows ✅

**Verify these secrets exist:**
```bash
# Required for both staging and production:
AUTH_GITHUB_ID
AUTH_GITHUB_SECRET
AUTH_SECRET
AUTH_GITHUB_APP_ID
AUTH_GITHUB_APP_PRIVATE_KEY
AUTH_GITHUB_APP_INSTALLATION_ID
POSTGRES_USER
POSTGRES_PASSWORD
POSTGRES_DB
EMAIL
HELLO_SMS_USERNAME
HELLO_SMS_PASSWORD

# Production-only (for backups):
OS_APPLICATION_CREDENTIAL_ID
OS_APPLICATION_CREDENTIAL_SECRET
SWIFT_CONTAINER
SLACK_BOT_TOKEN
SLACK_CHANNEL_ID
```

**How to verify:**
```bash
# In GitHub web UI:
Settings → Secrets and variables → Actions → Repository secrets
# Check that all secrets above exist
```

---

### 4. Deployment

#### Step 4a: Deploy to Staging First

```bash
# Option 1: Via GitHub Actions (recommended)
# Go to: Actions → Initial deploy to Elastx → Run workflow
# Select: "staging" environment
# Click: "Run workflow"

# Option 2: Manual (if needed)
# SSH into staging VPS, run:
cd ~/matkassen
git pull origin main
chmod +x update.sh
./update.sh
```

**Wait for deployment to complete** (5-10 minutes)

#### Step 4b: Validate Staging

Visit https://staging.matcentralen.com and test:

- [ ] Site loads successfully
- [ ] SSL certificate is valid (check browser padlock)
- [ ] GitHub OAuth login works
- [ ] Create a test parcel
- [ ] Send test SMS (check sender name is "Matcentralen")
- [ ] Verify SMS contains staging.matcentralen.com URL
- [ ] Scan QR code from SMS
- [ ] Mark parcel as picked up
- [ ] Check logs for errors: `ssh user@staging-vps "sudo docker compose logs web --tail=100"`

**If staging validation passes, proceed to production.**

#### Step 4c: Deploy to Production

```bash
# Option 1: Via GitHub Actions (recommended)
# Go to: Actions → Initial deploy to Elastx → Run workflow
# Select: "production" environment
# Click: "Run workflow"

# Option 2: Manual (if needed)
# SSH into production VPS, run:
cd ~/matkassen
git pull origin main
chmod +x update.sh
./update.sh
```

**Wait for deployment to complete** (5-10 minutes)

#### Step 4d: Validate Production

Visit https://matcentralen.com and test:

- [ ] Site loads successfully
- [ ] SSL certificate is valid (check browser padlock)
- [ ] GitHub OAuth login works
- [ ] Create a test parcel (or verify existing parcels load)
- [ ] Send test SMS
- [ ] Verify SMS contains matcentralen.com URL
- [ ] Check public parcel page: https://matcentralen.com/p/[parcel-id]
- [ ] Check logs: `ssh user@prod-vps "sudo docker compose logs web --tail=100"`

---

### 5. SSL Certificate Verification

The deployment scripts automatically request SSL certificates via Certbot. Verify they were issued:

```bash
# SSH into production VPS
ssh user@your-production-vps

# Check certificate status
sudo certbot certificates

# Expected output:
# Certificate Name: matcentralen.com
#   Domains: matcentralen.com www.matcentralen.com
#   Expiry Date: ... (3 months from now)
#   Certificate Path: /etc/letsencrypt/live/matcentralen.com/fullchain.pem
#   Private Key Path: /etc/letsencrypt/live/matcentralen.com/privkey.pem

# Verify auto-renewal is configured
sudo systemctl status certbot.timer

# Test renewal process (dry run - doesn't actually renew)
sudo certbot renew --dry-run
```

**If certificate generation failed:**
1. Check DNS is pointing to the VPS: `dig matcentralen.com +short`
2. Check port 80 is open: `sudo netstat -tlnp | grep :80`
3. Re-run deployment: `cd ~/matkassen && sudo ./deploy.sh`

---

### 6. Run E2E Tests (Optional but Recommended)

```bash
# On your local machine
cd /Users/niklasmagnusson/git/matkassen

# Test against staging
PLAYWRIGHT_BASE_URL=https://staging.matcentralen.com pnpm run test:e2e

# Test against production (after validation)
PLAYWRIGHT_BASE_URL=https://matcentralen.com pnpm run test:e2e
```

---

## 📊 Post-Migration Monitoring (First 48 Hours)

### Monitor Application Health

```bash
# Check application logs
ssh user@prod-vps "sudo docker compose logs web --tail=100 -f"

# Watch for:
# - OAuth callback errors
# - SMS sending failures
# - Domain-related errors
# - CSP violations
```

### Monitor Nginx Access Logs

```bash
# Check which domains are receiving traffic
ssh user@prod-vps "sudo tail -f /var/log/nginx/access.log | grep -E 'matkassen|matcentralen'"

# You should see:
# - New traffic on matcentralen.com
# - Old links still work (if you kept old domain DNS)
```

### Monitor SMS Delivery

Check the SMS dashboard in the app:
- https://matcentralen.com/sv/sms-dashboard

Verify:
- [ ] SMS are being sent successfully
- [ ] New sender name "Matcentralen" is displayed
- [ ] URLs in SMS contain matcentralen.com
- [ ] Delivery rate is stable (compare to historical data)

---

## 🔄 Old Domain Handling (Recommended)

### Option A: Keep Old Domain with Redirects (RECOMMENDED)

This ensures old QR codes and links continue working.

**Already configured in code:**
- `next.config.ts` allows both old and new domains in CSP
- Nginx config supports multiple domains

**Keep doing:**
- Leave old DNS records pointing to VPS
- Old domain will continue to work
- Eventually add Nginx redirect (see below)

**Add Nginx redirect later (after confirming new domain works):**

```bash
# SSH into VPS
ssh user@prod-vps

# Edit Nginx config to add redirect server block
sudo nano /etc/nginx/sites-available/matkassen

# Add at the top of file:
server {
    listen 443 ssl http2;
    server_name matkassen.org www.matkassen.org;
    
    ssl_certificate /etc/letsencrypt/live/matkassen.org/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/matkassen.org/privkey.pem;
    
    return 301 https://matcentralen.com$request_uri;
}

# Test and reload
sudo nginx -t
sudo systemctl reload nginx
```

### Option B: Completely Remove Old Domain (NOT RECOMMENDED)

This will **break** all old QR codes and bookmarked links!

Only do this if:
- You've reprinted all materials with new QR codes
- You've notified all users
- You've updated all external links

**To remove old domain support:**
1. Remove old domains from `next.config.ts` CSP allowlist
2. Update GitHub OAuth to remove old callbacks
3. Let old DNS expire or point elsewhere
4. Remove matkassen.org SSL certificates

---

## 🎉 Success Criteria

You'll know the migration is complete when:

- [ ] New domain loads successfully (https://matcentralen.com)
- [ ] SSL certificate is valid and trusted
- [ ] GitHub OAuth login works on new domain
- [ ] SMS are sent with "Matcentralen" sender name
- [ ] SMS links contain matcentralen.com URLs
- [ ] QR codes generate with new domain
- [ ] Public parcel pages work on new domain
- [ ] No domain-related errors in logs
- [ ] Staging and production both deployed successfully
- [ ] E2E tests pass against new domain

---

## 🆘 Troubleshooting

### Issue: SSL Certificate Not Generated

**Symptoms:** Browser shows "Your connection is not private" error

**Solution:**
```bash
# SSH into VPS
ssh user@vps

# Check DNS is correct
dig matcentralen.com +short  # Should return VPS IP

# Check port 80 is accessible
sudo netstat -tlnp | grep :80

# Manually request certificate
sudo certbot certonly --nginx -d matcentralen.com -d www.matcentralen.com

# Restart Nginx
sudo systemctl restart nginx
```

### Issue: OAuth Login Fails

**Symptoms:** After clicking "Sign in with GitHub", error page or redirect fails

**Solution:**
1. Verify GitHub OAuth app callback URLs include new domain
2. Check environment variables: `ssh user@vps "cat ~/matkassen/.env | grep AUTH"`
3. Check logs: `ssh user@vps "sudo docker compose logs web | grep -i auth"`

### Issue: SMS Contains Old Domain

**Symptoms:** SMS still shows matkassen.org instead of matcentralen.com

**Solution:**
```bash
# Check environment variables on VPS
ssh user@vps "cat ~/matkassen/.env | grep BRAND"

# Should show:
# NEXT_PUBLIC_BRAND_NAME="Matcentralen"
# NEXT_PUBLIC_BASE_URL="https://matcentralen.com"

# If not, redeploy
cd ~/matkassen
./update.sh
```

### Issue: Site Not Accessible

**Symptoms:** Site doesn't load or times out

**Solution:**
```bash
# Check DNS propagation
dig matcentralen.com +short

# Check Nginx is running
ssh user@vps "sudo systemctl status nginx"

# Check Docker containers
ssh user@vps "sudo docker compose ps"

# Check Nginx config
ssh user@vps "sudo nginx -t"

# Check firewall
ssh user@vps "sudo ufw status"
# Ports 80, 443 should be open
```

### Issue: Application Crashes on Startup

**Symptoms:** Docker container restarts repeatedly

**Solution:**
```bash
# Check logs
ssh user@vps "sudo docker compose logs web --tail=200"

# Look for error about missing NEXT_PUBLIC_BRAND_NAME or NEXT_PUBLIC_BASE_URL
# This means environment variables weren't set properly

# Verify .env file
ssh user@vps "cat ~/matkassen/.env | grep -E 'BRAND|BASE_URL'"

# Recreate .env by redeploying
cd ~/matkassen
./update.sh
```

---

## 📝 Future: Removing Old Domain Support (After 6+ Months)

Once you're confident all users are using the new domain:

1. **Update `next.config.ts`:**
   ```typescript
   // Remove old domains from allowedOrigins
   allowedOrigins: [
       "http://localhost:8080",
       "https://staging.matcentralen.com",
       "https://matcentralen.com",
       "https://www.matcentralen.com",
       // OLD DOMAINS REMOVED
   ],
   ```

2. **Update GitHub OAuth:**
   - Remove old callback URLs from GitHub OAuth app

3. **DNS:**
   - Let old domain expire, or
   - Keep it pointing to VPS with redirect (cheap insurance)

4. **Commit changes:**
   ```bash
   git add next.config.ts
   git commit -m "Remove old domain (matkassen.org) from CSP allowlist"
   git push origin main
   ```

---

## 🎓 Understanding the White-Label System

The migration is now much simpler because all domain/brand configuration is centralized:

**Single Source of Truth:** `app/config/branding.ts`
- Reads from environment variables
- Provides defaults for development
- **Fails fast** if required config is missing in production

**Environment Variables** (set in GitHub Secrets + deployment scripts):
- `NEXT_PUBLIC_BRAND_NAME` → App name (Matcentralen)
- `NEXT_PUBLIC_BASE_URL` → Full domain URL (https://matcentralen.com)
- `HELLO_SMS_FROM` → SMS sender name (defaults to BRAND_NAME)

**To rebrand in the future:**
Just update the environment variables in `.github/workflows/` and redeploy. That's it!

No need to hunt through 22 files ever again. 🎉
