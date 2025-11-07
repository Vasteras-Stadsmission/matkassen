# Production Logs Guide

This guide covers viewing and analyzing logs from the production Matkassen instance running on your VPS.

## Overview

Matkassen uses [Pino](https://getpino.io/) for structured JSON logging. All server-side operations are logged as JSON for easy parsing and analysis.

**Log format:**

```json
{
    "level": "INFO",
    "time": "2025-11-07T17:26:57.845Z",
    "msg": "SMS Test Mode explicitly configured",
    "testMode": true
}
```

## Quick Setup (One-Time)

On your VPS, run this script to install helpful log viewing aliases:

```bash
# SSH to your VPS
ssh your-vps

# Clone/pull the repo if needed, then run:
cd /path/to/matkassen
bash scripts/setup-vps-aliases.sh
```

This adds convenient shortcuts to your `~/.bashrc` for viewing logs.

## Common Commands

### Basic Viewing

```bash
# View all logs
logs

# Live tail (follow mode)
logs-tail

# Last 100 lines
logs-100

# Last 1000 lines
logs-1000
```

### Filtered Views

```bash
# Simple readable format (best for browsing)
logs-simple

# Only errors (clean format)
logs-errors-simple

# Errors with full JSON context
logs-errors

# Warnings and errors
logs-warnings

# Errors from the last hour
logs-errors-1h

# Logs from today
logs-today
```

### Search and Analysis

```bash
# Search for text with 5 lines of context
logs-search "SMS"
logs-search "household"
logs-search "parcel"

# Count errors by message
logs-error-count

# Count logs by level
logs-level-count
```

### Application-Specific

```bash
# SMS-related logs
logs-sms

# Cron job / scheduler logs
logs-scheduler

# Health check logs
logs-health
```

## Manual Commands (No Aliases)

If you don't want to install aliases, use these raw Docker commands:

```bash
# View all logs
sudo docker logs matkassen-web-1

# Live tail
sudo docker logs -f matkassen-web-1

# Last 100 lines
sudo docker logs --tail=100 matkassen-web-1

# Errors only (JSON)
sudo docker logs matkassen-web-1 | jq -R 'fromjson? | select(.level == "ERROR")' -C

# Simple format
sudo docker logs matkassen-web-1 | jq -R -r 'fromjson? | select(. != null) | "\(.time) [\(.level)] \(.msg)"'

# Last hour
sudo docker logs --since=1h matkassen-web-1

# Search with grep
sudo docker logs matkassen-web-1 | grep -i "SMS" -C 5
```

## Understanding the Output

### JSON Fields

- **level**: Log severity (DEBUG, INFO, WARN, ERROR, FATAL)
- **time**: ISO 8601 timestamp in UTC
- **msg**: Human-readable message
- **Additional fields**: Context-specific data (householdId, parcelId, etc.)

### Log Levels

| Level | Purpose              | Example                               |
| ----- | -------------------- | ------------------------------------- |
| DEBUG | Development details  | "SMS queue processing lock acquired"  |
| INFO  | Normal operations    | "SMS sent successfully"               |
| WARN  | Warnings, not errors | "SMS test mode enabled in production" |
| ERROR | Failed operations    | "Failed to send SMS"                  |
| FATAL | Critical failures    | "Database connection lost"            |

### Common Patterns

**SMS Operations:**

```json
{"level":"INFO","time":"...","intent":"pickup_reminder","msg":"SMS sent successfully"}
{"level":"ERROR","time":"...","intent":"pickup_reminder","msg":"Failed to send SMS"}
```

**Cron Jobs:**

```json
{"level":"INFO","time":"...","job":"anonymization","status":"started","msg":"Cron job started"}
{"level":"INFO","time":"...","job":"anonymization","status":"completed","anonymized":5}
```

**Health Checks:**

```json
{"level":"INFO","time":"...","health":"healthy","msg":"Health check"}
{"level":"ERROR","time":"...","health":"unhealthy","msg":"Scheduler not running"}
```

## Using jq for Advanced Queries

### Filter by Multiple Criteria

```bash
# Errors OR warnings
sudo docker logs matkassen-web-1 | jq -R 'fromjson? | select(.level == "ERROR" or .level == "WARN")'

# SMS errors only
sudo docker logs matkassen-web-1 | jq -R 'fromjson? | select(.level == "ERROR" and (.msg | contains("SMS")))'

# Specific household
sudo docker logs matkassen-web-1 | jq -R 'fromjson? | select(.householdId == "abc123")'
```

### Extract Specific Fields

```bash
# Just timestamps and messages
sudo docker logs matkassen-web-1 | jq -R -r 'fromjson? | "\(.time) \(.msg)"'

# Error messages only
sudo docker logs matkassen-web-1 | jq -R -r 'fromjson? | select(.level == "ERROR") | .msg'

# Custom format
sudo docker logs matkassen-web-1 | jq -R -r 'fromjson? | "[\(.level)] \(.msg) (household: \(.householdId // "N/A"))"'
```

### Aggregate and Count

```bash
# Count by log level
sudo docker logs matkassen-web-1 | jq -R -r 'fromjson? | .level' | sort | uniq -c

# Count errors by message
sudo docker logs matkassen-web-1 | jq -R -r 'fromjson? | select(.level == "ERROR") | .msg' | sort | uniq -c | sort -rn

# Count SMS by intent
sudo docker logs matkassen-web-1 | jq -R -r 'fromjson? | select(.intent != null) | .intent' | sort | uniq -c
```

## Time-Based Filtering

Docker supports time filters with `--since` and `--until`:

```bash
# Last hour
sudo docker logs --since=1h matkassen-web-1

# Last 30 minutes
sudo docker logs --since=30m matkassen-web-1

# Since specific time (UTC)
sudo docker logs --since=2025-11-07T18:00:00 matkassen-web-1

# Between times
sudo docker logs --since=2025-11-07T18:00:00 --until=2025-11-07T19:00:00 matkassen-web-1

# Today's logs (UTC)
sudo docker logs --since=$(date -u +%Y-%m-%dT00:00:00) matkassen-web-1
```

## Troubleshooting Common Issues

### Non-JSON Lines in Output

**Problem:** Startup messages like "▲ Next.js 15.4.7" break JSON parsing.

**Solution:** Use `jq -R 'fromjson?'` - the `?` suppresses errors for non-JSON lines.

```bash
# ✅ Works with mixed output
sudo docker logs matkassen-web-1 | jq -R 'fromjson?' -C

# ❌ Fails on non-JSON
sudo docker logs matkassen-web-1 | jq
```

### No Color in Output

**Problem:** JSON output is hard to read without syntax highlighting.

**Solution:** Add `-C` flag to jq for color:

```bash
sudo docker logs matkassen-web-1 | jq -R 'fromjson?' -C
```

### Too Much Output

**Problem:** Thousands of log lines make it hard to find issues.

**Solution:** Use filters and limits:

```bash
# Last 100 errors only
sudo docker logs --tail=1000 matkassen-web-1 | jq -R 'fromjson? | select(.level == "ERROR")' | head -20

# Errors from last hour
sudo docker logs --since=1h matkassen-web-1 | jq -R 'fromjson? | select(.level == "ERROR")'
```

## Local Development

For viewing logs while developing locally:

```bash
# If using pnpm run dev
# Logs are automatically pretty-printed in the terminal

# If using Docker locally
docker compose logs -f app | jq -R 'fromjson?' -C
```

## Advanced: Piping from Remote to Local

You can pipe VPS logs to your local machine for processing with local tools:

```bash
# Stream remote logs to local pino-pretty (if you have npm locally)
ssh your-vps "sudo docker logs -f matkassen-web-1" | npx pino-pretty

# Save remote logs locally for analysis
ssh your-vps "sudo docker logs matkassen-web-1" > local-logs.json
cat local-logs.json | jq -R 'fromjson? | select(.level == "ERROR")'
```

## Log Rotation

Docker automatically rotates logs to prevent disk space issues. The current configuration (set in `docker-compose.yml`):

```yaml
logging:
    driver: "json-file"
    options:
        max-size: "10m" # Max file size per log file
        max-file: "3" # Keep 3 files (30MB total)
```

This keeps approximately 30MB of logs (3 × 10MB) per container.

## Related Documentation

- [Deployment Guide](./deployment-guide.md) - VPS deployment process
- [Dev Guide](./dev-guide.md) - Logging in development
- [README.md](../README.md) - Project overview
