# Nginx Configuration Management

This directory contains nginx configuration files for both local development and production deployment.

## Files

- **`nginx.conf.template`** - Single source of truth template file with resilience features
- **`generate-nginx-config.sh`** - Script to generate configs from the template
- **`local.conf`** - Generated local configuration (DO NOT EDIT MANUALLY)
- **`shared.conf`** - Common settings shared between local and production
- **`Dockerfile`** - Docker image for local nginx container

## Resilience Features

The nginx configuration now includes several resilience improvements:

### Upstream Configuration
- **Health checks** with `max_fails=3` and `fail_timeout=30s`
- **Keepalive connections** to reduce connection overhead
- **Automatic failover** and retry logic

### Proxy Resilience
- **Connection timeouts** (60s for connect/send/read)
- **Upstream retry logic** for failed requests
- **Multiple retry attempts** with timeout limits

### Error Handling
- **Custom error pages** with JSON responses for API-style errors
- **Health check endpoint** at `/nginx-health` for monitoring
- **Proper HTTP status codes** and retry-after headers

### Logging & Monitoring
- **Structured access and error logging**
- **Health check endpoint** bypasses rate limiting
- **Clear error messages** for troubleshooting

## Usage

### Local Development

Generate the local configuration:

```bash
./nginx/generate-nginx-config.sh local
```

This creates `nginx/local.conf` which is used by the Docker container.

### Production Deployment

The production configuration is automatically generated during deployment by `deploy.sh`:

```bash
./nginx/generate-nginx-config.sh production "matkassen.org www.matkassen.org" "matkassen.org"
```

## Configuration Synchronization

Both local and production configs are generated from the same template (`nginx.conf.template`), ensuring:

- ✅ **Single source of truth** - no duplicate configuration to maintain
- ✅ **Automatic synchronization** - changes to the template affect both environments
- ✅ **Environment-specific settings** - SSL, domain names, upstream hosts vary by environment

## Making Changes

1. Edit `nginx.conf.template` with your changes
2. Run `./nginx/generate-nginx-config.sh local` to update local config
3. Test your changes locally with Docker Compose
4. Deploy to production (which will automatically generate and validate production config)

## Validation

The production deployment automatically validates nginx configurations before applying them:

- `deploy.sh` runs `nginx -t` to test configuration syntax
- Only valid configurations are applied to the running server
- Failed configurations prevent deployment and preserve the working setup

## Environment Variables Used

| Variable              | Local Value  | Production Value                  |
| --------------------- | ------------ | --------------------------------- |
| `NGINX_PORT`          | `80`         | `443`                             |
| `SSL_PARAMS`          | _(empty)_    | ` ssl`                            |
| `SERVER_NAMES`        | `localhost`  | `matkassen.org www.matkassen.org` |
| `NEXTJS_UPSTREAM`     | `nextjs`     | `localhost`                       |
| `HTTP_REDIRECT_BLOCK` | Comment only | HTTP→HTTPS redirect               |
| `SSL_CONFIG_BLOCK`    | Comment only | SSL certificate paths             |
| `HSTS_HEADER`         | Comment only | HSTS security header              |
