#!/bin/bash

# Test script for nginx resilience features
# Run this after starting the production preview

echo "🧪 Testing nginx resilience features..."

# Test 1: Health check endpoint
echo "1. Testing nginx health endpoint..."
if curl -s http://localhost:8080/nginx-health | grep -q "nginx healthy"; then
    echo "✅ Health endpoint working"
else
    echo "❌ Health endpoint failed"
fi

# Test 2: Main application
echo "2. Testing main application..."
if curl -s -o /dev/null -w "%{http_code}" http://localhost:8080 | grep -q "200"; then
    echo "✅ Main application responding"
else
    echo "❌ Main application not responding"
fi

# Test 3: Upstream configuration
echo "3. Testing if nginx is using upstream configuration..."
docker compose -f docker-compose.local.yml logs nginx | grep -q "upstream" && echo "✅ Upstream config loaded" || echo "ℹ️ Check nginx logs for upstream details"

# Test 4: Error handling
echo "4. Testing error page..."
curl -s http://localhost:8080/nonexistent-page | grep -q "error" && echo "✅ Custom error pages working" || echo "ℹ️ Standard error handling"

# Test 5: Container health
echo "5. Checking container health status..."
docker compose -f docker-compose.local.yml ps

echo ""
echo "🎯 Manual tests to try:"
echo "  - Open http://localhost:8080 in browser"
echo "  - Stop/start nextjs container: docker compose -f docker-compose.local.yml restart nextjs"
echo "  - Check nginx logs: docker compose -f docker-compose.local.yml logs nginx"
echo "  - Check nginx config: docker compose -f docker-compose.local.yml exec nginx cat /etc/nginx/conf.d/local.conf"
