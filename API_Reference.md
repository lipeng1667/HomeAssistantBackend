
# API Reference

This document provides a detailed reference for the Home Assistant Backend API.

## APIs Table

### For APP

#### 🔑 Auth

| Method | Endpoint             | Description                            |Done|
| ------ | -------------------- | -------------------------------------- |----|
| POST   | `/api/auth/anonymous`| Anonymous login using device_id        |✅|
| POST   | `/api/auth/logout`   | End session                            |✅|
| POST   | `/api/auth/register` | Register with username and password    |❌|

#### 💬 Forum

| Method | Endpoint                         | Description               |Done|
| ------ | -------------------------------- | ------------------------- |----|
| GET    | `/api/forum/questions`           | List all questions        |❌|
| POST   | `/api/forum/questions`           | Create a new question     |❌|
| GET    | `/api/forum/questions/:id`       | Get details of a question |❌|
| POST   | `/api/forum/questions/:id/reply` | Post a reply              |❌|

#### 📩 Instant Messaging (IM)

| Method | Endpoint             | Description                |Done|
| ------ | -------------------- | -------------------------- |----|
| GET    | `/api/chat/messages` | Fetch chat history         |❌|
| POST   | `/api/chat/messages` | Send message to admin/user |❌|

#### 📊 Logs

| Method | Endpoint             | Description                                |Done|
| ------ | -------------------- | ------------------------------------------ |----|
| POST   | `/api/logs/activity` | Log user actions (login, navigation, etc.) |❌|

### For WebManger

#### 🛠️ Admin

| Method | Endpoint                               | Description                       |Done|
| ------ | -------------------------------------- | --------------------------------- |---|
| POST   | `/api/admin/login`                     | Admin login                       |❌|

---

## Authentication

### App-Level Authentication (APP Client Validation)

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

#### App-Level Authentication Errors

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

## APP : Auth API

Handles user authentication.

### `POST /api/auth/anonymous`

Logs in a user anonymous. User set device_id which is generated at the APP side, then server generate user id to
mark this new user, and store the information into the table 'user' in database.

**App Authentication:** Required (see headers above)

**Parameters:**

| Name | Type | Description | Required |
|---|---|---|---|
| `device_id` | String | A unique identifier for the user's device. | Yes |

**Example Request:**

```bash
curl -X POST http://localhost:10000/api/auth/login \
  -H "Content-Type: application/json" \
  -H "X-Timestamp: 1672531200000" \
  -H "X-Signature: a1b2c3d4e5f6..." \
  -d '{"device_id": "iPhone_12_ABC123"}'
```

**Response Structure:**

| Field | Type | Description |
|-------|------|-------------|
| `status` | String | Request status ("success" or "error") |
| `data` | Object | Response data container |
| `data.user` | Object | User information object |
| `data.user.id` | Integer | User's unique database ID |

**Response Error Codes:**

| Status | Error Message | Cause | Solution |
|--------|---------------|-------|----------|
| **400** | `"parameter not found"` | Missing device_id in request body | Include device_id parameter |
| **500** | `"Internal server error"` | Database or Redis error | Check server logs, retry request |

**Example Responses:**

**Success (200)**:
```json
{
  "status": "success",
  "data": {
    "user": {
      "id": 1
    }
  }
}
```

**Error (400)**:
```json
{
  "status": "error",
  "message": "parameter not found"
}
```

### `POST /api/auth/logout`

Logs out the authenticated user.

**App Authentication:** Required (see headers above)

**Parameters:**

| Name | Type | Description | Required |
|---|---|---|---|
| `user_id` | String | user id return from login | Yes |
| `device_id` | String | A unique identifier for the user's device. | Yes |

**Example Request:**

```bash
curl -X POST http://localhost:10000/api/auth/logout \
  -H "Content-Type: application/json" \
  -H "X-Timestamp: 1672531200000" \
  -H "X-Signature: a1b2c3d4e5f6..." \
  -d '{"user_id": "1", "device_id" : "iPhone_12_ABC123"}'
```

**Response Error Codes:**

| Status | Error Message | Cause | Solution |
|--------|---------------|-------|----------|
| **400** | `"parameter is required"` | Missing device_id in request body | Include device_id parameter |
| **400** | `"Session validation failed or session not found"` | Device ID mismatch or session doesn't exist | Verify device_id matches login device |
| **401** | `"Session not found or expired"` | Invalid user_id or expired session | Login again with valid credentials |
| **500** | `"Internal server error"` | Database or Redis error | Check server logs, retry request |

**Example Responses:**

**Success (200)**:
```json
{
  "status": "success",
  "message": "Logged out successfully"
}
```

**Error (400)**:
```json
{
  "status": "error",
  "message": "parameter is required"
}
```

**Error (401)**:
```json
{
  "status": "error",
  "message": "Session not found or expired"
}
```

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
| **200** | Success | Request completed successfully |
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
