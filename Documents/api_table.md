
# API Reference

This document provides a detailed reference for the Home Assistant Backend API.

## APIs Table

### For APP

- 🔑 Auth

| Method | Endpoint             | Description                            |Done|
| ------ | -------------------- | -------------------------------------- |----|
| POST   | `/api/auth/anonymous`| Anonymous login using device_id        | ✅ |
| POST   | `/api/auth/logout`   | End session                            | ✅ |
| POST   | `/api/auth/register` | Register with username and password    | ✅ |
| POST   | `/api/auth/login`    | Register with username and password    | ✅ |

- 💬 Forum

| Method | Endpoint                         | Description                  |Done|
| ------ | -------------------------------- | ---------------------------- |----|
| GET    | `/api/forum/topics`              | List all topics with pagination | ✅ |
| GET    | `/api/forum/topics/:id`          | Get topic details with replies  | ✅ |
| POST   | `/api/forum/topics`              | Create a new topic           | ✅ |
| PUT    | `/api/forum/topics/:id`          | Update topic (author only)   | ✅ |
| DELETE | `/api/forum/topics/:id`          | Delete topic (author only)   | ✅ |
| GET    | `/api/forum/topics/:id/replies`  | Get replies for a topic      | ✅ |
| POST   | `/api/forum/topics/:id/replies`  | Add reply to topic (or nested replies) | ✅ |
| PUT    | `/api/forum/replies/:id`         | Update reply (author only)   | ✅ |
| DELETE | `/api/forum/replies/:id`         | Delete reply (author only)   | ✅ |
| POST   | `/api/forum/topics/:id/like`     | Like/unlike topic            | ✅ |
| POST   | `/api/forum/replies/:id/like`    | Like/unlike reply            | ✅ |
| GET    | `/api/forum/search`              | Search topics and replies    | ✅ |
| GET    | `/api/forum/categories`          | Get available categories     | ✅ |
| POST   | `/api/forum/upload`              | Upload image attachments     | ✅ |
| GET    | `/api/forum/drafts`              | Get user's saved drafts      | ✅ |
| POST   | `/api/forum/drafts`              | Save/update draft            | ✅ |
| DELETE | `/api/forum/drafts/:id`          | Delete draft                 | ✅ |

- 📩 Instant Messaging (IM)

| Method | Endpoint             | Description                |Done|
| ------ | -------------------- | -------------------------- |----|
| GET    | `/api/chat/messages` | Fetch chat history         | ❌ |
| POST   | `/api/chat/messages` | Send message to admin/user | ❌ |

- 📊 Logs

| Method | Endpoint             | Description                                |Done|
| ------ | -------------------- | ------------------------------------------ |----|
| POST   | `/api/logs/activity` | Log user actions (login, navigation, etc.) | ❌ |

### For WebManger

- 🛠️ Admin

| Method | Endpoint                               | Description                       |Done|
| ------ | -------------------------------------- | --------------------------------- |----|
| POST   | `/api/admin/login`                     | Admin login                       | ❌ |

---

## App-Level Authentication (APP Client Validation)

All authentication endpoints require **app-level authentication** to verify requests originate from authorized mobile APP clients.

**Required Headers:**

| Header | Value | Description |
|--------|-------|-------------|
| `X-Timestamp` | Unix timestamp (ms) | Current timestamp for replay protection |
| `X-Signature` | HMAC-SHA256 hex | Signature: `HMAC-SHA256(app_secret, timestamp)` |

**Signature Generation:**

```javascript
const timestamp = Date.now().toString()
const payload = `${timestamp}`
const signature = crypto.createHmac('sha256', app_secret).update(payload).digest('hex')
```

## App-Level Authentication Errors

| Error Message | Cause | Solution |
|---------------|-------|----------|
| `"Missing required headers"` | Missing X-Timestamp, X-Signature, or X-App-Type headers | Include all required headers in request |
| `"Invalid timestamp"` | Timestamp is outside 5-minute window or malformed | Use current timestamp in milliseconds |
| `"Invalid signature"` | HMAC-SHA256 signature doesn't match expected value | Verify payload and secret key for signature generation |
| `"Timestamp too old"` | Request timestamp is more than 5 minutes old | Use fresh timestamp for each request |
| `"Timestamp too far in future"` | Request timestamp is more than 5 minutes in future | Check system clock synchronization |

**Security Notes:**

- Timestamp must be within ±5 minutes of server time
- **app_secret** is both store at the client and the server
- Signatures prevent unauthorized access and replay attacks
- All authentication requests are validated before user authentication

---

## Error Reference

All API endpoints return standardized error responses with the following format:

```json
{
  "status": "error",
  "message": "Description of the error"
}
```

### HTTP Status Codes

| Status Code | Description | When It Occurs |
|-------------|-------------|----------------|
| **200** | Success | Request completed successfully (data retrieval, updates, deletes) |
| **201** | Created | New resource created successfully (topics, replies, drafts) |
| **400** | Bad Request | Missing required parameters, invalid input format |
| **401** | Unauthorized | Invalid authentication, expired session, missing headers |
| **403** | Forbidden | Access denied (e.g., localhost-only endpoints) |
| **404** | Not Found | Endpoint doesn't exist |
| **429** | Too Many Requests | Rate limit exceeded |
| **500** | Internal Server Error | Server-side error, database connection issues |

### Rate Limiting Errors

| Error Message | Cause | Solution |
|---------------|-------|----------|
| `"Too many requests, please try again later"` | Exceeded rate limit (100 requests per 15 minutes) | Wait before making more requests |
| `"Too many login attempts, please try again later"` | Exceeded auth rate limit (5 attempts per 15 minutes) | Wait before attempting authentication |

### System Errors

| Error Message | Cause | Solution |
|---------------|-------|----------|
| `"Endpoint not found"` | Invalid URL or HTTP method | Check API documentation for correct endpoint |
| `"Access denied. This endpoint is only accessible from localhost."` | Accessing localhost-only endpoint from external IP | Use localhost or 127.0.0.1 for health endpoints |

### Best Practices for Error Handling

1. **Always check status field**: Use `status === "error"` to detect failures
2. **Log error messages**: Store error messages for debugging
3. **Implement retry logic**: For 5xx errors, retry with exponential backoff
4. **Handle rate limits**: Implement proper delays when receiving 429 responses
5. **Validate inputs**: Check required parameters before making requests
6. **Monitor timestamps**: Ensure system clocks are synchronized for auth

---
