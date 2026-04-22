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
docker compose restart web

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

**All production database backups are encrypted with symmetric AES256 GPG before leaving the host.** The dump is piped directly from `pg_dump` into `gpg` — no intermediate plaintext file. The nightly validation step decrypts the backup and does a full `pg_restore` into a throwaway `matkassen_nightly_validate` database on the same Postgres instance; the scratch database is dropped at the end of the run. Plaintext data exists only inside the scratch DB during validation and is destroyed with it.

> ⚠️ **Scope caveat.** This proves "the backup is restorable into _this_ Postgres cluster." It is **not** a cross-host disaster-recovery drill: if the whole VPS is lost, you still have to provision a fresh cluster and restore onto it from Swift. That scenario is intentionally not automated.

#### Automated Encrypted Backups

Production backups run automatically via `Dockerfile.db-backup`, which runs `scripts/backup-db.sh` nightly at 02:00 Europe/Stockholm under supercronic. The script:

1. `pg_dump --format=custom --compress=9` piped directly into `gpg --symmetric --cipher-algo AES256` (no intermediate plaintext file).
2. Uploads the `.dump.gpg` file to the Elastx Swift container via `rclone`.
3. Sets `X-Delete-After` for 14-day automatic expiry as a defense-in-depth retention guarantee.
4. Full-restore validates the upload: creates `matkassen_nightly_validate`, streams `gpg --decrypt | pg_restore --exit-on-error` into it, runs a sentinel query (`SELECT to_regclass('public.households') IS NOT NULL`), drops the scratch DB. A wrong passphrase, corrupted upload, DDL incompatibility, or broken COPY stream fails the same night.
5. Reports success/failure to Slack.

**Cluster-level requirement**: the backup user needs `CREATEDB` to create and drop the scratch database. `deploy.sh` and `update.sh` apply this grant automatically on production. The widened privilege is cluster-level (the role can now create/drop databases), not app-level (it already owned every table in the app schema).

#### Encryption Details

- **Method**: Symmetric encryption using GPG (GnuPG)
- **Algorithm**: AES256
- **Passphrase**: Stored in GitHub Secrets as `DB_BACKUP_PASSPHRASE`, propagated to the host `.env` by `deploy.sh` / `update.sh`, then injected into the backup container via `docker-compose.backup.yml`
- **Output filename**: `matkassen_backup_<timestamp>.dump.gpg` (binary GPG, not ASCII-armored — the payload is a PostgreSQL custom-format dump)

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

The passphrase is automatically exported to the production environment via CI/CD workflows (backups are disabled on staging).

#### Manual Backup Trigger

To run a backup immediately rather than waiting for the 02:00 schedule:

```bash
export ENV_NAME=production   # backup-manage.sh refuses to run without this
./scripts/backup-manage.sh test
```

This rebuilds the backup image (if needed) and execs the cron script inside the running `db-backup` container. The same encryption, upload, and validation steps run as for an automatic nightly backup.

#### Restoring Encrypted Backups

##### Safety Requirements

- **Interactive `y/N` confirmation** before any data is touched
- **Filename must end in `.dump.gpg`** — older unencrypted backups are not supported
- **Database will be completely replaced** with backup data (`pg_restore --clean --if-exists`)

##### Restore Command

Run this on the production server, with the backup container already up under the `backup` profile:

```bash
# The passphrase is already in the running db-backup container's env
# (from the host .env written by deploy.sh/update.sh) — no local export
# needed. Just gate on the production marker.
export ENV_NAME=production

# Restore by filename (no path — the script fetches from Swift)
./scripts/backup-restore.sh matkassen_backup_20250101_020000.dump.gpg
```

The list of available backups is printed when you run the script with no arguments.

##### Restore Process

1. Validates filename is `.dump.gpg` and `ENV_NAME=production`. The passphrase comes from the running `db-backup` container's env (`docker-compose.backup.yml`), not the caller's shell — no local export needed.
2. Prompts for interactive `y/N` confirmation.
3. Inside the `db-backup` container, downloads the encrypted file from Swift to tmpfs.
4. Streams `gpg --decrypt | pg_restore --clean --if-exists` so the decrypted dump never lands on disk.
5. Cleans up the encrypted download from tmpfs.

**Note**: `pg_restore` runs single-threaded (no `--jobs`) because parallel restore needs a seekable file, and we deliberately avoid writing the decrypted dump to disk. For matkassen-scale data this is well under the time we'd ever care about.

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

1. Generate a new passphrase (`openssl rand -base64 32`).
2. Update the `DB_BACKUP_PASSPHRASE` GitHub Secret.
3. Re-deploy: `deploy.sh` / `update.sh` writes the new value into the host `.env`, and recreating the `db-backup` container picks it up.
4. The next nightly backup will be encrypted with the new passphrase and the full-restore validation will confirm it works end-to-end.
5. **Old backups in Swift are still encrypted with the old passphrase.** Pick one of the two strategies below.

##### Strategy A: Wait out retention (routine rotation)

For a planned rotation, archive the old passphrase somewhere recoverable (password manager, sealed envelope in the office) and simply wait the 14-day Swift retention window. After that the last old-passphrase backup expires and every backup in Swift is readable with the new passphrase. This is the right approach for scheduled rotations.

##### Strategy B: Re-encrypt in place (emergency rotation / suspected compromise)

If the old passphrase may have been exposed, don't wait — re-encrypt existing Swift objects with the new passphrase. Run this on the production server with both passphrases exported:

```bash
export OLD_PASS="old-passphrase-from-secret-history"
export NEW_PASS="new-passphrase-from-github-secrets"
export ENV_NAME=production

# List the objects that need rekeying
docker compose -f docker-compose.yml -f docker-compose.backup.yml \
    --profile backup exec db-backup \
    rclone lsf "elastx:${SWIFT_CONTAINER}/${SWIFT_PREFIX:-backups}" \
    --include "matkassen_backup_*.dump.gpg" > /tmp/backups_to_rekey.txt

# For each, stream-rekey with no intermediate plaintext on disk.
# Passphrases arrive via process substitution / pipe rather than bash
# herestrings, so they never touch the filesystem even briefly.
# Value-less `-e OLD_PASS -e NEW_PASS` — docker inherits these from the
# caller's exported env, so the plaintext passphrases never land in
# the host's `docker compose` argv (visible to `ps auxfww`). Only FILE
# is passed by value because it's not a secret.
while read -r FILE; do
    docker compose -f docker-compose.yml -f docker-compose.backup.yml \
        --profile backup exec -T \
        -e OLD_PASS -e NEW_PASS -e FILE="$FILE" \
        db-backup bash -c '
            set -euo pipefail
            SRC="elastx:${SWIFT_CONTAINER}/${SWIFT_PREFIX:-backups}/${FILE}"
            TMPOUT=$(mktemp -t rekey.XXXXXX)
            trap "rm -f \"$TMPOUT\"" EXIT
            rclone cat "$SRC" \
                | gpg --decrypt --batch --passphrase-fd 3 --pinentry-mode loopback \
                    3< <(builtin printf "%s" "$OLD_PASS") \
                | gpg --symmetric --cipher-algo AES256 --batch \
                      --passphrase-fd 3 --pinentry-mode loopback \
                      --output "$TMPOUT" \
                      3< <(builtin printf "%s" "$NEW_PASS")
            # Verify the new object decrypts before overwriting the old one
            builtin printf "%s" "$NEW_PASS" \
                | gpg --decrypt --batch --passphrase-fd 0 --pinentry-mode loopback \
                    "$TMPOUT" | pg_restore --list >/dev/null
            rclone copyto "$TMPOUT" "$SRC" --retries=3
        '
done < /tmp/backups_to_rekey.txt

rm /tmp/backups_to_rekey.txt
```

After re-encryption, rotate any Swift credentials that shared the compromise window as a separate step, and consider whether to revoke database credentials too.

#### Backup Retention

**Production**: 14 days (managed by cloud storage expiry headers)

**Staging**: Optional (test data only)

**Location**: Elastx Swift object storage (cloud). No local backup copies are retained.

#### Monitoring

```bash
# Service status / recent logs
./scripts/backup-manage.sh status
./scripts/backup-manage.sh logs

# List recent backups in Swift (from inside the backup container)
docker compose -f docker-compose.yml -f docker-compose.backup.yml \
    --profile backup exec db-backup \
    rclone lsf "elastx:${SWIFT_CONTAINER}/${SWIFT_PREFIX:-backups}" \
    --include "matkassen_backup_*.dump.gpg"
```

Slack notifications fire on every nightly run (success or failure), with file size, duration, and the validation result. If validation fails the script still uploads the file but flags the run red — investigate before relying on that backup.

#### Troubleshooting

**Backup container exits immediately with "DB_BACKUP_PASSPHRASE is not set"**

- The host `.env` does not contain the variable (re-run `deploy.sh` / `update.sh` after confirming the GitHub Secret is set), or the `db-backup` service env block in `docker-compose.backup.yml` is missing the entry.

**Slack reports "validation failed" but upload succeeded**

The Slack alert is a summary; the specific reason is in the backup container logs:

```bash
sudo docker compose -f docker-compose.yml -f docker-compose.backup.yml \
    --profile backup logs --since 4h db-backup
```

Match the log output to one of these:

- `could not create scratch DB` and a hint mentioning `CREATEDB` → the backup role is missing the `CREATEDB` grant. `deploy.sh` and `update.sh` apply it on production, but both soft-fail (warning, not error). Fix manually: `docker compose exec -T db bash -c 'PGPASSWORD="$POSTGRES_PASSWORD" psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "ALTER USER \"$POSTGRES_USER\" CREATEDB;"'`.
- `pg_restore errored` → the decrypted dump didn't apply cleanly. Usually a DDL version skew between the dumping and restoring Postgres (both are the same instance, so this only happens if someone bumped the image tag mid-flight). Look for the `pg_restore:` error line just above.
- `sentinel query returned 'f'` → the `households` table didn't survive the restore. Most commonly an empty or truncated dump; rarer: the schema was renamed and the sentinel check needs updating.
- `decryption failed` → passphrase mismatch between encrypt and decrypt. Shouldn't happen (same env var in one run) — but check for stray edits and whether the container was restarted mid-run.
- `unable to download backup file` → transient Swift or network issue, usually self-resolves the next night.

**Restore fails with `gpg: decryption failed: Bad session key`**

- Wrong passphrase. The passphrase used to encrypt the backup must match exactly. Old backups encrypted with a previous passphrase need that previous passphrase.

**Restore fails with `pg_restore: error: input file does not appear to be a valid archive`**

- Decryption succeeded but the dump payload is corrupted. Try a different backup. If multiple backups in a row are corrupted, the live database may have produced a bad dump and the backup script should fail validation — check Slack history.

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
