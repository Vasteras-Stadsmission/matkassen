# Nginx Configuration Management

This directory contains nginx configuration files for both local development and production deployment.

## Files

- **`nginx.conf.template`** - Single source of truth template file
- **`generate-nginx-config.sh`** - Script to generate configs from the template
- **`local.conf`** - Generated local configuration (DO NOT EDIT MANUALLY)
- **`Dockerfile`** - Docker image for local nginx container

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
4. Deploy to production (which will automatically generate production config)

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
