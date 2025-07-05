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

# /api/auth/register
echo ""
echo "For /api/auth/register"
# SHA-256 hash of "testpassword123"
HASHED_PASSWORD="ef92b778bafe771e89245b89ecbc08a44a4e166c06659911881f383d4473e94f"
echo "curl -X POST \"http://47.94.108.189:10000/api/auth/register\" \
  -H \"Content-Type: application/json\" \
  -H \"X-Timestamp: $TIMESTAMP\" \
  -H \"X-Signature: $SIGNATURE\" \
  -d '{\"device_id\": \"test_device_123\", \"account_name\": \"testuser\", \"phone_number\": \"18611112222\", \"password\": \"$HASHED_PASSWORD\"}'"

# /api/auth/login
echo ""
echo "For /api/auth/login"
# Create timestamped password: SHA-256(stored_hash + timestamp)
LOGIN_PASSWORD=$(echo -n "${HASHED_PASSWORD}${TIMESTAMP}" | openssl dgst -sha256 -binary | xxd -p -c 256)
echo "curl -X POST \"http://47.94.108.189:10000/api/auth/login\" \
  -H \"Content-Type: application/json\" \
  -H \"X-Timestamp: $TIMESTAMP\" \
  -H \"X-Signature: $SIGNATURE\" \
  -d '{\"user_id\": \"1\", \"phone_number\": \"18611112222\", \"password\": \"$LOGIN_PASSWORD\"}'"

# /api/auth/logout
echo ""
echo "For /api/auth/logout"
echo "curl -X POST \"http://47.94.108.189:10000/api/auth/logout\" \
  -H \"Content-Type: application/json\" \
  -H \"X-Timestamp: $TIMESTAMP\" \
  -H \"X-Signature: $SIGNATURE\" \
  -d '{\"device_id\": \"test_device_123\", \"user_id\": \"1\"}'"