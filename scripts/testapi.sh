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

# =================================================================
# FORUM ENDPOINTS
# =================================================================

# /api/forum/topics - GET (List topics with pagination)
echo ""
echo "For /api/forum/topics (GET - List topics)"
echo "curl -X GET \"http://47.94.108.189:10000/api/forum/topics?page=1&limit=20&category=Smart%20Home&sort=newest\" \
  -H \"X-Timestamp: $TIMESTAMP\" \
  -H \"X-Signature: $SIGNATURE\""

# /api/forum/topics - POST (Create topic)
echo ""
echo "For /api/forum/topics (POST - Create topic)"
echo "curl -X POST \"http://47.94.108.189:10000/api/forum/topics\" \
  -H \"Content-Type: application/json\" \
  -H \"X-Timestamp: $TIMESTAMP\" \
  -H \"X-Signature: $SIGNATURE\" \
  -d '{\"user_id\": 1, \"title\": \"How to setup motion sensors?\", \"content\": \"I need help configuring my new motion sensors with Home Assistant. Any recommendations?\", \"category\": \"Smart Home\", \"images\": []}'"

# /api/forum/topics/:id - GET (Get topic details)
echo ""
echo "For /api/forum/topics/:id (GET - Topic details)"
echo "curl -X GET \"http://47.94.108.189:10000/api/forum/topics/1?reply_page=1&reply_limit=20\" \
  -H \"X-Timestamp: $TIMESTAMP\" \
  -H \"X-Signature: $SIGNATURE\""

# /api/forum/topics/:id - PUT (Update topic)
echo ""
echo "For /api/forum/topics/:id (PUT - Update topic)"
echo "curl -X PUT \"http://47.94.108.189:10000/api/forum/topics/1\" \
  -H \"Content-Type: application/json\" \
  -H \"X-Timestamp: $TIMESTAMP\" \
  -H \"X-Signature: $SIGNATURE\" \
  -d '{\"user_id\": 1, \"title\": \"Updated: Motion sensor setup help\", \"content\": \"I need help configuring my new motion sensors with Home Assistant. Updated with more details.\", \"category\": \"Smart Home\"}'"

# /api/forum/topics/:id - DELETE (Delete topic)
echo ""
echo "For /api/forum/topics/:id (DELETE - Delete topic)"
echo "curl -X DELETE \"http://47.94.108.189:10000/api/forum/topics/1\" \
  -H \"Content-Type: application/json\" \
  -H \"X-Timestamp: $TIMESTAMP\" \
  -H \"X-Signature: $SIGNATURE\" \
  -d '{\"user_id\": 1}'"

# /api/forum/topics/:id/replies - GET (Get replies)
echo ""
echo "For /api/forum/topics/:id/replies (GET - Get replies)"
echo "curl -X GET \"http://47.94.108.189:10000/api/forum/topics/1/replies?page=1&limit=20&sort=newest\" \
  -H \"X-Timestamp: $TIMESTAMP\" \
  -H \"X-Signature: $SIGNATURE\""

# /api/forum/topics/:id/replies - POST (Create reply)
echo ""
echo "For /api/forum/topics/:id/replies (POST - Create reply)"
echo "curl -X POST \"http://47.94.108.189:10000/api/forum/topics/1/replies\" \
  -H \"Content-Type: application/json\" \
  -H \"X-Timestamp: $TIMESTAMP\" \
  -H \"X-Signature: $SIGNATURE\" \
  -d '{\"user_id\": 1, \"content\": \"Thanks for the question! I had the same issue and solved it by adjusting the sensitivity settings.\", \"images\": []}'"

# /api/forum/replies/:id - PUT (Update reply)
echo ""
echo "For /api/forum/replies/:id (PUT - Update reply)"
echo "curl -X PUT \"http://47.94.108.189:10000/api/forum/replies/1\" \
  -H \"Content-Type: application/json\" \
  -H \"X-Timestamp: $TIMESTAMP\" \
  -H \"X-Signature: $SIGNATURE\" \
  -d '{\"user_id\": 1, \"content\": \"Updated: Thanks for the question! I solved it by doing this instead.\", \"images\": []}'"

# /api/forum/replies/:id - DELETE (Delete reply)
echo ""
echo "For /api/forum/replies/:id (DELETE - Delete reply)"
echo "curl -X DELETE \"http://47.94.108.189:10000/api/forum/replies/1\" \
  -H \"Content-Type: application/json\" \
  -H \"X-Timestamp: $TIMESTAMP\" \
  -H \"X-Signature: $SIGNATURE\" \
  -d '{\"user_id\": 1}'"

# /api/forum/topics/:id/like - POST (Like/unlike topic)
echo ""
echo "For /api/forum/topics/:id/like (POST - Like topic)"
echo "curl -X POST \"http://47.94.108.189:10000/api/forum/topics/1/like\" \
  -H \"Content-Type: application/json\" \
  -H \"X-Timestamp: $TIMESTAMP\" \
  -H \"X-Signature: $SIGNATURE\" \
  -d '{\"user_id\": 1}'"

# /api/forum/replies/:id/like - POST (Like/unlike reply)
echo ""
echo "For /api/forum/replies/:id/like (POST - Like reply)"
echo "curl -X POST \"http://47.94.108.189:10000/api/forum/replies/1/like\" \
  -H \"Content-Type: application/json\" \
  -H \"X-Timestamp: $TIMESTAMP\" \
  -H \"X-Signature: $SIGNATURE\" \
  -d '{\"user_id\": 1}'"

# /api/forum/search - GET (Search content)
echo ""
echo "For /api/forum/search (GET - Search)"
echo "curl -X GET \"http://47.94.108.189:10000/api/forum/search?q=motion%20sensor&type=all&category=Smart%20Home&page=1&limit=20\" \
  -H \"X-Timestamp: $TIMESTAMP\" \
  -H \"X-Signature: $SIGNATURE\""

# /api/forum/categories - GET (Get categories)
echo ""
echo "For /api/forum/categories (GET - Get categories)"
echo "curl -X GET \"http://47.94.108.189:10000/api/forum/categories\" \
  -H \"X-Timestamp: $TIMESTAMP\" \
  -H \"X-Signature: $SIGNATURE\""

# /api/forum/drafts - GET (Get user drafts)
echo ""
echo "For /api/forum/drafts (GET - Get drafts)"
echo "curl -X GET \"http://47.94.108.189:10000/api/forum/drafts?user_id=1&type=topic&page=1&limit=10\" \
  -H \"X-Timestamp: $TIMESTAMP\" \
  -H \"X-Signature: $SIGNATURE\""

# /api/forum/drafts - POST (Save draft)
echo ""
echo "For /api/forum/drafts (POST - Save draft)"
echo "curl -X POST \"http://47.94.108.189:10000/api/forum/drafts\" \
  -H \"Content-Type: application/json\" \
  -H \"X-Timestamp: $TIMESTAMP\" \
  -H \"X-Signature: $SIGNATURE\" \
  -d '{\"user_id\": 1, \"type\": \"topic\", \"title\": \"Draft: Smart bulb recommendations\", \"content\": \"I am looking for recommendations for smart bulbs...\", \"category\": \"Smart Home\"}'"

# /api/forum/drafts/:id - DELETE (Delete draft)
echo ""
echo "For /api/forum/drafts/:id (DELETE - Delete draft)"
echo "curl -X DELETE \"http://47.94.108.189:10000/api/forum/drafts/1\" \
  -H \"Content-Type: application/json\" \
  -H \"X-Timestamp: $TIMESTAMP\" \
  -H \"X-Signature: $SIGNATURE\" \
  -d '{\"user_id\": 1}'"

# =================================================================
# UPLOAD ENDPOINTS
# =================================================================

# /api/forum/uploads - POST (Upload file - instant upload)
echo ""
echo "For /api/forum/uploads (POST - Upload file)"
echo "curl -X POST \"http://47.94.108.189:10000/api/forum/uploads\" \
  -H \"X-Timestamp: $TIMESTAMP\" \
  -H \"X-Signature: $SIGNATURE\" \
  -F \"file=@/path/to/test-image.jpg\" \
  -F \"user_id=1\" \
  -F \"type=topic\" \
  -F \"post_id=1\""

echo ""
echo "Note: For upload test, replace '/path/to/test-image.jpg' with actual file path"
echo "Example: Create a test file first:"
echo "echo 'test content' > test-file.txt"
echo "Then use: -F \"file=@test-file.txt\""