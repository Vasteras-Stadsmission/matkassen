# Nginx Systemd Override Configuration

This directory contains systemd configuration overrides to improve nginx resilience in production.

## Files

- **`nginx-override.conf`** - Systemd service override for nginx auto-recovery

## Nginx Auto-Recovery Features

The systemd override provides the following resilience improvements:

### Automatic Restart

- **`Restart=on-failure`** - Automatically restart nginx if it crashes or fails
- **`RestartSec=10`** - Wait 10 seconds between restart attempts to avoid rapid restart loops
- **`StartLimitInterval=600`** - Allow up to 5 restart attempts within 10 minutes
- **`StartLimitBurst=5`** - Maximum 5 restart attempts before giving up

### Process Management

- **`KillMode=mixed`** - Use SIGTERM for main process, SIGKILL for remaining processes
- **`TimeoutStopSec=30`** - Kill remaining processes if stop takes longer than 30 seconds

### Network Dependencies

- **`After=network-online.target`** - Start only after network is fully available
- **`Wants=network-online.target`** - Request network-online target activation

## Deployment

The `deploy.sh` script automatically:

1. Creates `/etc/systemd/system/nginx.service.d/` directory
2. Copies `nginx-override.conf` to `/etc/systemd/system/nginx.service.d/override.conf`
3. Runs `systemctl daemon-reload` to apply changes

## Manual Installation

If you need to install manually:

```bash
sudo mkdir -p /etc/systemd/system/nginx.service.d
sudo cp systemd/nginx-override.conf /etc/systemd/system/nginx.service.d/override.conf
sudo systemctl daemon-reload
sudo systemctl restart nginx
```

## Verification

Check if the override is active:

```bash
# View effective service configuration
sudo systemctl cat nginx.service

# Check service status
sudo systemctl status nginx

# View restart history
sudo journalctl -u nginx.service -n 50
```

## Troubleshooting

If nginx keeps restarting:

1. Check logs: `sudo journalctl -u nginx.service -f`
2. Test configuration: `sudo nginx -t`
3. Check port conflicts: `sudo ss -tlnp | grep -E ':(80|443)'`
4. Temporarily disable auto-restart: `sudo systemctl edit nginx.service` and add `Restart=no`
