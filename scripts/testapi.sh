#! /bin/bash

TIMESTAMP=$(date +%s000)
SIGNATURE=$(echo -n "$TIMESTAMP" | openssl dgst -sha256 -hmac "EJFIDNFNGIUHq32923HDFHIHsdf866HU" -binary | xxd -p -c 256)

# /api/auth/anonymous
echo "For /api/auth/anonymous"
echo "curl -X POST \"http://47.94.108.189:10000/api/auth/anonymous\" \
  -H \"Content-Type: application/json\" \
  -H \"X-Timestamp: $TIMESTAMP\" \
  -H \"X-Signature: $SIGNATURE\" \
  -d '{\"device_id\": \"test_device_123\"}'"

# /api/auth/logout
echo "\n For /api/auth/logout"
echo "curl -X POST \"http://47.94.108.189:10000/api/auth/logout\" \
  -H \"Content-Type: application/json\" \
  -H \"X-Timestamp: $TIMESTAMP\" \
  -H \"X-Signature: $SIGNATURE\" \
  -d '{\"device_id\": \"test_device_123\", \"user_id\": \"1\"}'"