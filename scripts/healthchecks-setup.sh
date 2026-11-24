#!/bin/bash

# Creates or updates the production checks on healthchecks.io. Safe to re-run:
# checks are matched on their slug, so this also applies changed schedules.
#
# Usage: ./scripts/healthchecks-setup.sh
#
# Run it after the first production deploy with HEALTHCHECKS_PING_KEY: it
# pings each newly created check once, because a new check never alerts
# until its first ping, and from then on the app must keep pinging.
#
# Needs a read-write API key from the project's settings page on
# healthchecks.io. It is read from the terminal and never stored or put in
# a command line. The project's ping key goes to the GitHub secret
# HEALTHCHECKS_PING_KEY (see docs/deployment-guide.md, "Alerting").
#
# The cron schedules must match ANONYMIZATION_SCHEDULE, ORG_SYNC_SCHEDULE and
# SMS_REPORT_SCHEDULE in .github/workflows/continuous_deployment.yml (or their
# defaults in scripts/write-env.sh), and the backup's crontab.

set -euo pipefail

read -rsp "healthchecks.io read-write API key: " API_KEY
echo

upsert() {
    local slug=$1 fields=$2 response code ping_url
    response=$(curl -fsS -w '\n%{http_code}' \
        -X POST https://healthchecks.io/api/v3/checks/ \
        -H @<(printf 'X-Api-Key: %s\n' "$API_KEY") \
        -H "Content-Type: application/json" \
        --data-binary "{\"slug\": \"${slug}\", \"unique\": [\"slug\"], \"channels\": \"*\", ${fields}}")
    code=${response##*$'\n'}
    if [ "$code" = 201 ]; then
        ping_url=$(printf '%s' "${response%$'\n'*}" | python3 -c 'import json, sys; print(json.load(sys.stdin)["ping_url"])')
        curl -fsS -o /dev/null -X POST "$ping_url"
        echo "created and pinged ${slug}"
    else
        echo "updated ${slug}"
    fi
}

upsert site '"name": "Site /api/health", "timeout": 900, "grace": 2700,
    "desc": "GitHub Actions (site-check.yml) checks https://matcentralen.com/api/health every 15 min, 4 tries 30 s apart. Down: site unreachable, or database, scheduler or disk not healthy, or no check for an hour."'
upsert backup '"name": "Nightly backup", "schedule": "0 2 * * *", "tz": "Europe/Stockholm", "grace": 3600,
    "desc": "scripts/backup-db.sh. Down: backup or restore validation failed, or it did not run. Reason: logs of the db-backup container."'
upsert sms-scheduler '"name": "SMS scheduler", "timeout": 300, "grace": 900,
    "desc": "Pinged after each completed SMS run (every 5 min). Down: no completed run for 20 min. Reason: web container logs."'
upsert sms-credits '"name": "SMS credits", "timeout": 300, "grace": 3600,
    "desc": "Down: HelloSMS credits below 100, top up at hellosms.se. Recovers by itself after top-up. Also down if the balance could not be read for about an hour."'
upsert sms-delivery '"name": "SMS delivery", "schedule": "0 8 * * *", "tz": "Europe/Stockholm", "grace": 3600,
    "desc": "Daily check of recent SMS. Down: SMS failed or are unconfirmed; see the SMS page in the admin UI."'
upsert sms-reconciliation '"name": "SMS status reconciliation", "timeout": 3600, "grace": 10800,
    "desc": "Hourly fallback check of SMS delivery statuses. Down: no clean run for 4 hours. Reason: web container logs."'
upsert anonymization '"name": "GDPR anonymization", "schedule": "0 2 * * 0", "tz": "Europe/Stockholm", "grace": 7200,
    "desc": "Weekly anonymization of inactive households and deactivated users. Down: errors, or it did not run. Reason: web container logs."'
upsert org-sync '"name": "Org membership sync", "schedule": "0 3 * * *", "tz": "Europe/Stockholm", "grace": 3600,
    "desc": "Daily deactivation of users who left the GitHub org. Down: errors, or it did not run. Reason: web container logs."'
