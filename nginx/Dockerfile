FROM nginx:alpine

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

# Create nginx user and set permissions
RUN addgroup -g 101 -S nginx || true
RUN adduser -S -D -H -u 101 -h /var/cache/nginx -s /sbin/nologin -G nginx -g nginx nginx || true

# Expose port 80
EXPOSE 80
