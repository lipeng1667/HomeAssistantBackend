#!/bin/bash

# Test script to verify endpoints are working
# Run this on the remote server to test connectivity

echo "🔍 Testing API endpoints..."

echo "📊 Testing /api/cli-stats:"
curl -s http://127.0.0.1:10000/api/cli-stats | jq '.' || echo "❌ Failed"

echo -e "\n🩺 Testing /health:"
curl -s http://127.0.0.1:10000/health | jq '.' || echo "❌ Failed"

echo -e "\n🗄️ Testing /health/db:"
curl -s http://127.0.0.1:10000/health/db | jq '.' || echo "❌ Failed"

echo -e "\n📋 Testing /health/detailed:"
curl -s http://127.0.0.1:10000/health/detailed | jq '.' || echo "❌ Failed"

echo -e "\n✅ Endpoint tests completed"