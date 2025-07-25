
# APP : Auth API

Handles user authentication.

## `POST /api/auth/anonymous`

Logs in a user anonymous. User set device_id which is generated at the APP side, then server generate user id to
mark this new user, and store the information into the table 'user' in database.

**App Authentication:** Required (see headers in api_table.md)

**Parameters:**

| Name | Type | Description | Required |
|---|---|---|---|
| `device_id` | String | A unique identifier for the user's device. | Yes |

**Example Request:**

```bash
curl -X POST http://localhost:10000/api/auth/anonymous \
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

## `POST /api/auth/register`

Since user can login anonymously, the APP client should provids two registions options: on the login screen or via settings
menu. If a user register from a setting's menu, it means they've already had an anonymous session and therefor already have a
user ID, this user ID MUST also be sent with the register request. The server will use this user ID to valide that the provided
device id matches the ones stored in Database.

**App Authentication:** Required (see headers above)

**Parameters:**

| Name | Type | Description | Required |
|---|---|---|---|
| `device_id` | String | A unique identifier for the user's device. | Yes |
| `account_name` | String | user name | Yes |
| `phone_number` | String | phone number | Yes |
| `password` | String | sha-256(original password) | Yes |
| `user_id` | String | A id generate by the server and sent to client after anonymously login | NO |

**Example Request:**

```bash
curl -X POST http://localhost:10000/api/auth/register \
  -H "Content-Type: application/json" \
  -H "X-Timestamp: 1672531200000" \
  -H "X-Signature: a1b2c3d4e5f6..." \
  -d '{"device_id": "iPhone_12_ABC123", "account_name": "michale", "phone_number":"18611112222", "password":"64-bit sha256 password"}'
```

**Response Structure:**

| Field | Type | Description |
|-------|------|-------------|
| `status` | String | Request status ("success" or "error") |
| `data` | Object | Response data container |
| `data.user` | Object | User information object |
| `data.user.id` | Integer | User's unique database ID |
| `data.user.name` | String | User's name |
| `data.user.status` | Integer | User's role status (-1=deleted, 0=normal, 87=admin) |
| `data.user.session_token` | String | UUID v4 token for enhanced admin security |

**Response Error Codes:**

| Status | Error Message | Cause | Solution |
|--------|---------------|-------|----------|
| **400** | `"parameter invalid"` | parameters missed incorrect format(8-bit password, letters & numbers) | Include required parameter |
| **500** | `"Internal server error"` | Database or Redis error | Check server logs, retry request |

**Example Responses:**

**Success (200)**:

```json
{
  "status": "success",
  "data": {
    "user": {
      "id": 1,
      "name": "michale",
      "status": 0,
      "session_token": "b2c3d4e5-f6g7-4890-8bcd-def123456789"
    }
  }
}
```

**Error (400)**:

```json
{
  "status": "error",
  "message": "parameter invalid"
}
```

## `POST /api/auth/login`

Login with phone number and password. Database stores SHA-256(original password), so server can compare the password using the same encryption method.

**Cross-Device Login Support**: The `user_id` parameter is now optional to support login from new devices where the user_id is unknown. When `user_id` is provided, it will be validated against the phone number lookup for additional security.

**Enhanced Security**: Login response now includes a session token for admin operations and enhanced security validation.

**App Authentication:** Required (see headers above)

**Parameters:**

| Name | Type | Description | Required |
|---|---|---|---|
| `user_id` | String | A unique identifier for the user (optional for cross-device login) | No |
| `phone_number` | String | phone number | Yes |
| `password` | String | sha-256(sha-256(original password)+timestamp) | Yes |

**Example Requests:**

**Cross-device login (new device, user_id unknown):**

```bash
curl -X POST http://localhost:10000/api/auth/login \
  -H "Content-Type: application/json" \
  -H "X-Timestamp: 1672531200000" \
  -H "X-Signature: a1b2c3d4e5f6..." \
  -d '{"phone_number":"18611112222", "password":"64-bit sha256 password"}'
```

**Same device login (with user_id validation):**

```bash
curl -X POST http://localhost:10000/api/auth/login \
  -H "Content-Type: application/json" \
  -H "X-Timestamp: 1672531200000" \
  -H "X-Signature: a1b2c3d4e5f6..." \
  -d '{"user_id":"23", "phone_number":"18611112222", "password":"64-bit sha256 password"}'
```

**Response Structure:**

| Field | Type | Description |
|-------|------|-------------|
| `status` | String | Request status ("success" or "error") |
| `data` | Object | Response data container |
| `data.user` | Object | User information object |
| `data.user.id` | Integer | User's unique database ID |
| `data.user.name` | String | User's name |
| `data.user.status` | Integer | User's role status (-1=deleted, 0=normal, 87=admin) |
| `data.user.session_token` | String | UUID v4 token for enhanced admin security |

**Response Error Codes:**

| Status | Error Message | Cause | Solution |
|--------|---------------|-------|----------|
| **400** | `"parameter invalid"` | parameters missed | Include required parameter |
| **403** | `Forbidden` | wrong password | input the correct passowrd |
| **500** | `"Internal server error"` | Database or Redis error | Check server logs, retry request |

**Example Responses:**

**Success (200)**:

```json
{
  "status": "success",
  "data": {
    "user": {
      "id": 1,
      "name": "Test",
      "status": 0,
      "session_token": "a1b2c3d4-e5f6-4789-9abc-def012345678"
    }
  }
}
```

**Error (400)**:

```json
{
  "status": "error",
  "message": "parameter invalid"
}
```

## `POST /api/auth/logout`

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
