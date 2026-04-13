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
# drop the `user` directive (ignored/errored when master doesn't run as root)
# and move the pid file to a writable path so nginx can run entirely as uid 101.
RUN sed -i \
        -e 's/^user  *nginx;/# user directive disabled — running as non-root/' \
        -e 's|/var/run/nginx.pid|/tmp/nginx.pid|' \
        /etc/nginx/nginx.conf && \
    chown -R nginx:nginx /var/cache/nginx /etc/nginx/conf.d /etc/nginx/shared.conf

# Run as non-root. Port 8080 is used (see NGINX_PORT in generate-nginx-config.sh),
# so CAP_NET_BIND_SERVICE is not required — the compose file drops all capabilities.
USER nginx

EXPOSE 8080
