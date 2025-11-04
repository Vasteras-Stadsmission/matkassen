# Deployment Guide

## Overview

Docker Compose deployment to VPS with:

- Nginx reverse proxy
- Certbot SSL certificates
- PostgreSQL database
- Automated encrypted backups (GPG)
- GitHub Actions CI/CD

## Prerequisites

### Server Requirements

- **Operating System**: Ubuntu 24.04 LTS (or compatible)
- **Encryption Tools**: gnupg (GPG) - pre-installed on most Linux systems
- **Container Runtime**: Docker & Docker Compose v2.13+
- **Web Server**: Nginx
- **SSL**: Certbot (Let's Encrypt)

### Verifying GPG Installation

GPG is typically pre-installed on Ubuntu. Verify:

```bash
# Verify installation
gpg --version
# Should output: gpg (GnuPG) 2.x.x

# If not installed (rare)
sudo apt-get update
sudo apt-get install gnupg --yes
```

**Note**: The deployment scripts automatically verify GPG is available. Container images include GPG via Alpine packages (`apk add gnupg`).

## Environment Variable Management

**CRITICAL**: Adding new env vars requires updates in **5 places**:

1. `.env.example` - Documentation with clear descriptions
2. GitHub Secrets (if sensitive)
3. `.github/workflows/init_deploy.yml` - Export in env section
4. `.github/workflows/continuous_deployment.yml` - Export in env section
5. Both `deploy.sh` and `update.sh` - Add to .env file creation

**Never hardcode in `docker-compose.yml`** - use .env file pattern.

### Example: Adding a New Environment Variable

```bash
# 1. Add to .env.example with description
NEW_FEATURE_API_KEY=your-api-key-here  # API key for new feature

# 2. Add to GitHub Secrets (if sensitive)
# Go to Settings → Secrets → Actions → New repository secret

# 3. Add to init_deploy.yml
env:
  NEW_FEATURE_API_KEY: ${{ secrets.NEW_FEATURE_API_KEY }}

# 4. Add to continuous_deployment.yml
env:
  NEW_FEATURE_API_KEY: ${{ secrets.NEW_FEATURE_API_KEY }}

# 5. Add to deploy.sh and update.sh
cat > .env << EOF
NEW_FEATURE_API_KEY=${NEW_FEATURE_API_KEY}
EOF
```

## Deployment Flow

### First-Time Setup

1. Manually trigger `.github/workflows/init_deploy.yml`
2. SSH into VPS
3. Creates directory structure
4. Copies deployment files
5. Generates SSL certificates
6. Starts all services

### Continuous Deployment

- **Staging**: Auto-deploys on push to `main` branch
- **Production**: Manual approval required after staging succeeds

Workflow: `.github/workflows/continuous_deployment.yml`

## Docker Services

```yaml
services:
    app: # Next.js application
    db: # PostgreSQL database
    nginx: # Reverse proxy
    certbot: # SSL certificate renewal
```

### Production Stack

```bash
# View running services
docker compose ps

# View logs
docker compose logs -f app
docker compose logs -f db

# Restart service
docker compose restart app

# Full restart
docker compose down && docker compose up -d
```

## Background Services

Custom Next.js server (`server.js`) starts SMS scheduler automatically on boot.

**Safety**: Uses PostgreSQL advisory locks for queue processing across multiple instances.

**Monitoring**:

```bash
curl https://your-domain.com/api/health
```

Check `schedulerDetails.isRunning` in response.

## SSL Certificates

Certbot automatically renews certificates via cron job.

### Manual Renewal

```bash
docker compose run --rm certbot renew
docker compose restart nginx
```

### Certificate Locations

- **Staging**: `/etc/letsencrypt/live/staging.your-domain.com/`
- **Production**: `/etc/letsencrypt/live/your-domain.com/`

## Database

### Connection

```bash
# Connect to production database
docker exec -it matkassen-db psql -U matkassen -d matkassen
```

### Backups

**All database backups are encrypted for GDPR compliance.**

#### Automated Encrypted Backups

Production backups run automatically via `Dockerfile.db-backup` using `scripts/backup-db.sh` (cloud storage) or the new `scripts/db-backup.sh` for encrypted local/manual backups.

#### Encryption Details

- **Method**: Symmetric encryption using GPG (GnuPG)
- **Algorithm**: AES256-CFB (industry standard)
- **Passphrase**: Stored in GitHub Secrets as `DB_BACKUP_PASSPHRASE`
- **Output**: `.sql.gpg` encrypted files with `.sql.gpg.sha256` checksums

#### Setting Up Encrypted Backups

##### 1. Generate Strong Passphrase

```bash
# Generate 32-character random passphrase
openssl rand -base64 32

# Or use a passphrase generator
pwgen -s 32 1
```

**CRITICAL**: Store this passphrase securely. Backups cannot be restored without it.

##### 2. Add to GitHub Secrets

1. Go to repository **Settings → Secrets → Actions**
2. Click **New repository secret**
3. Name: `DB_BACKUP_PASSPHRASE`
4. Value: Your generated passphrase
5. Click **Add secret**

##### 3. Deploy Changes

The passphrase is automatically exported to both staging and production environments via CI/CD workflows.

#### Manual Encrypted Backup

```bash
# On the server
export DB_BACKUP_PASSPHRASE="your-passphrase"
export POSTGRES_HOST=localhost
export POSTGRES_USER=matkassen
export POSTGRES_DB=matkassen
export POSTGRES_PASSWORD="your-db-password"

./scripts/db-backup.sh

# Output:
# /var/backups/matkassen/matkassen_backup_20250101_120000.sql.gpg
# /var/backups/matkassen/matkassen_backup_20250101_120000.sql.gpg.sha256
```

**Note**: The script uses `gpg --passphrase-fd` with file descriptor 3 to avoid TTY prompts and process list exposure.

#### Restoring Encrypted Backups

##### Safety Requirements

- **`--force` flag required** to prevent accidental restores
- **Checksum verification** (if `.sha256` file exists)
- **Database will be completely replaced** with backup data

##### Restore Command

```bash
# Export required environment variables
export DB_BACKUP_PASSPHRASE="your-passphrase"
export POSTGRES_HOST=localhost
export POSTGRES_USER=matkassen
export POSTGRES_DB=matkassen
export POSTGRES_PASSWORD="your-db-password"

# Restore from encrypted backup
./scripts/db-restore.sh /var/backups/matkassen/matkassen_backup_20250101_120000.sql.gpg --force
```

##### Restore Process

1. Script validates passphrase and credentials are set
2. Verifies backup file exists
3. Checks SHA256 checksum (if available)
4. Verifies GPG encryption format
5. Decrypts using non-interactive mode (no TTY prompts)
6. Pipes directly to `pg_restore` (no intermediate plaintext files)

**Note**: The script uses `gpg --passphrase-fd 3` with file descriptor to ensure non-interactive operation.

##### Post-Restore Steps

```bash
# 1. Verify application functionality
curl https://your-domain.com/api/health

# 2. Run migrations if schema changed
cd ~/matkassen
pnpm run db:migrate

# 3. Restart application
sudo docker compose restart web
```

#### Passphrase Rotation

**When to rotate**:

- Suspected compromise
- Employee departure (if they had access)
- Every 12 months (best practice)

**Rotation procedure**:

1. Generate new passphrase
2. Update GitHub Secret `DB_BACKUP_PASSPHRASE`
3. Deploy to all environments
4. **Re-encrypt old backups** (critical - they use old passphrase):

```bash
# For each old backup - streaming approach (no intermediate plaintext file)
OLD_PASS="old-passphrase"
NEW_PASS="new-passphrase"

# Decrypt with old passphrase, re-encrypt with new passphrase
gpg --decrypt --batch --passphrase-fd 3 --pinentry-mode loopback old_backup.sql.gpg \
    3<<<"$OLD_PASS" \
    | gpg --symmetric --cipher-algo AES256 --armor --batch \
        --passphrase-fd 3 --pinentry-mode loopback \
        --output old_backup_rekeyed.sql.gpg \
    3<<<"$NEW_PASS"

# Verify and replace
sha256sum old_backup_rekeyed.sql.gpg > old_backup_rekeyed.sql.gpg.sha256
mv old_backup_rekeyed.sql.gpg old_backup.sql.gpg
mv old_backup_rekeyed.sql.gpg.sha256 old_backup.sql.gpg.sha256
```

5. Document rotation date and update runbook

#### Backup Retention

**Production**: 14 days (managed by cloud storage expiry headers)

**Staging**: Optional (test data only)

**Location**: `/var/backups/matkassen/` (local) or cloud object storage

#### Monitoring

```bash
# Check backup service status
sudo docker compose logs db-backup

# List recent backups
ls -lh /var/backups/matkassen/

# Verify backup encryption
file /var/backups/matkassen/matkassen_backup_*.sql.gpg
# Should show: "data" or "PGP message" (encrypted, not readable)

# Test decrypt (without restoring)
gpg --decrypt --batch --passphrase-fd 3 --pinentry-mode loopback backup.sql.gpg \
    3<<<"$DB_BACKUP_PASSPHRASE" | head -c 100
# Should show: PostgreSQL dump header
```

#### Troubleshooting

**"Cannot determine encryption format"**

- Backup file may be corrupted
- Verify checksum: `sha256sum -c backup.sql.gpg.sha256`

**"Checksum verification failed"**

- File corrupted during transfer/storage
- Do not restore - use previous backup

**Restore fails with authentication error**

- Wrong passphrase (check GitHub Secret)
- Wrong database credentials (check .env)

#### Legacy Unencrypted Backups

**Old backup format** (pre-encryption):

```bash
# Manual backup (DEPRECATED - unencrypted)
docker exec matkassen-db pg_dump -U matkassen matkassen > backup-$(date +%Y%m%d).sql

# Restore from backup (DEPRECATED)
docker exec -i matkassen-db psql -U matkassen matkassen < backup-20250101.sql
```

**Migrate old backups to encrypted format**:

```bash
# Encrypt existing plaintext backup
export DB_BACKUP_PASSPHRASE="your-passphrase"

# Using gpg with file descriptor (recommended)
gpg --symmetric --cipher-algo AES256 --armor --batch \
    --passphrase-fd 3 --pinentry-mode loopback \
    --output old_backup.sql.gpg \
    3<<<"$DB_BACKUP_PASSPHRASE" < old_backup.sql

# Generate checksum
sha256sum old_backup.sql.gpg > old_backup.sql.gpg.sha256

# Securely delete plaintext
shred -u old_backup.sql
```

**Backup location**: Configured in deployment scripts (typically `/var/backups/matkassen/`)

### Migrations

Migrations run automatically on deployment via `docker-compose.yml`:

```yaml
command: sh -c "pnpm run db:migrate && pnpm start"
```

## Nginx Configuration

Located in `nginx/` directory:

- `nginx.conf` - Main configuration
- `default.conf` - Server blocks for staging/production

### SSL Configuration

```nginx
server {
    listen 443 ssl;
    server_name your-domain.com;

    ssl_certificate /etc/letsencrypt/live/your-domain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/your-domain.com/privkey.pem;

    location / {
        proxy_pass http://app:3000;
    }
}
```

## Deployment Scripts

### `deploy.sh`

First-time deployment:

- Sets up environment
- Builds Docker images
- Runs migrations
- Starts services

### `update.sh`

Incremental updates:

- Pulls latest code
- Rebuilds images
- Graceful restart (zero downtime)

## Monitoring & Health Checks

### Health Endpoint

```bash
curl https://your-domain.com/api/health
```

Returns:

```json
{
    "status": "ok",
    "timestamp": "2025-10-18T12:00:00Z",
    "checks": {
        "database": "connected",
        "schedulerDetails": {
            "isRunning": true,
            "lastCheck": "2025-10-18T12:00:00Z"
        }
    }
}
```

### Docker Health Checks

```yaml
# docker-compose.yml
healthcheck:
    test: ["CMD", "curl", "-f", "http://localhost:3000/api/health"]
    interval: 30s
    timeout: 10s
    retries: 3
```

## Security

### GitHub OAuth Setup

Required environment variables:

```bash
NEXTAUTH_URL=https://your-domain.com
NEXTAUTH_SECRET=random-string-min-32-chars

GITHUB_ID=your-oauth-app-client-id
GITHUB_SECRET=your-oauth-app-client-secret

GITHUB_APP_ID=your-github-app-id
GITHUB_PRIVATE_KEY="-----BEGIN RSA PRIVATE KEY-----\n..."
GITHUB_ORG_NAME=your-organization-name
```

### Content Security Policy

Configured in `next.config.ts`:

- Reports violations to `/api/csp-report`
- Logs for monitoring

### Rate Limiting

Currently handled at Nginx level. Consider implementing:

- Per-IP rate limits
- API endpoint throttling
- Abuse detection

## Troubleshooting

### App Won't Start

```bash
# Check logs
docker compose logs app

# Common issues:
# - Missing environment variables (check .env file)
# - Database connection failed (check db logs)
# - Migration failed (check migration history)
```

### Database Connection Issues

```bash
# Check database is running
docker compose ps db

# Check connection from app
docker compose exec app sh -c 'psql $DATABASE_URL -c "SELECT 1"'
```

### SSL Certificate Issues

```bash
# Check certificate expiry
docker compose run --rm certbot certificates

# Force renewal
docker compose run --rm certbot renew --force-renewal
```

### Out of Disk Space

```bash
# Clean up Docker
docker system prune -a --volumes

# Clean up old images
docker image prune -a

# Check disk usage
df -h
du -sh /var/lib/docker
```

## Rollback Procedure

```bash
# 1. Identify last working commit
git log --oneline

# 2. SSH into server
ssh user@your-vps

# 3. Checkout previous commit
cd /opt/matkassen
git checkout <commit-hash>

# 4. Rebuild and restart
docker compose build
docker compose up -d

# 5. If database schema changed, restore backup
docker exec -i matkassen-db psql -U matkassen matkassen < /var/backups/matkassen/backup-<date>.sql
```

## Performance Tuning

### Next.js Production Mode

```dockerfile
# Dockerfile
ENV NODE_ENV=production
RUN pnpm run build
```

### PostgreSQL Tuning

```yaml
# docker-compose.yml
db:
    command: postgres -c shared_buffers=256MB -c max_connections=100
```

### Nginx Caching

```nginx
location /_next/static/ {
    proxy_cache_valid 200 7d;
    proxy_pass http://app:3000;
}
```

## Related Documentation

- **Development**: See `docs/dev-guide.md` for local setup
- **Database**: See `docs/database-guide.md` for migration workflow
- **Authentication**: See `docs/auth-guide.md` for GitHub OAuth setup
