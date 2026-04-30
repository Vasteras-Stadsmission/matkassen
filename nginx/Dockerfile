FROM nginx:1.29.1-alpine3.22

# Install bash (the script might need it)
RUN apk add --no-cache bash

# Remove default nginx config
RUN rm /etc/nginx/conf.d/default.conf

# Copy the template, generation script, and shared config
COPY nginx.conf.template /tmp/
COPY generate-nginx-config.sh /tmp/
COPY shared.conf /etc/nginx/

# Generate local nginx configuration
RUN cd /tmp && \
    chmod +x generate-nginx-config.sh && \
    bash ./generate-nginx-config.sh local && \
    cp local.conf /etc/nginx/conf.d/

# The official nginx:alpine image already ships with an nginx user/group (uid 101)
# and symlinks access/error logs to /dev/stdout and /dev/stderr. We only need to
# silence the `user` directive (it just logs a warning when the master isn't
# running as root anyway) and move the pid file to a writable path so nginx can
# run entirely as uid 101. The base image's nginx.conf uses `pid /run/nginx.pid;`
# — match the filename rather than the full path to stay robust across image
# updates (and verify with `grep` so a silent no-op fails the build).
RUN sed -i \
        -e 's/^user[[:space:]]\+nginx;/# user directive disabled — running as non-root/' \
        -e 's|[^[:space:]]*nginx\.pid|/tmp/nginx.pid|' \
        /etc/nginx/nginx.conf && \
    grep -q '^pid  */tmp/nginx.pid;' /etc/nginx/nginx.conf && \
    chown -R nginx:nginx /var/cache/nginx /etc/nginx/conf.d /etc/nginx/shared.conf

# Run as non-root. Port 8080 is used (see NGINX_PORT in generate-nginx-config.sh),
# so CAP_NET_BIND_SERVICE is not required — the compose file drops all capabilities.
USER nginx

EXPOSE 8080
