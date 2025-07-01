
# API Reference

This document provides a detailed reference for the Home Assistant Backend API.

## APIs Table

### For APP

#### 🔑 Auth (Anonymous Only)

| Method | Endpoint             | Description                            |
| ------ | -------------------- | -------------------------------------- |
| POST   | `/api/auth/anonymous`| Anonymous login using device_id        |
| POST   | `/api/auth/logout`   | End session                            |
| POST   | `/api/auth/register` | Register with username and password    |

#### 💬 Forum

| Method | Endpoint                         | Description               |
| ------ | -------------------------------- | ------------------------- |
| GET    | `/api/forum/questions`           | List all questions        |
| POST   | `/api/forum/questions`           | Create a new question     |
| GET    | `/api/forum/questions/:id`       | Get details of a question |
| POST   | `/api/forum/questions/:id/reply` | Post a reply              |

#### 📩 Instant Messaging (IM)

| Method | Endpoint             | Description                |
| ------ | -------------------- | -------------------------- |
| GET    | `/api/chat/messages` | Fetch chat history         |
| POST   | `/api/chat/messages` | Send message to admin/user |

#### 📊 Logs

| Method | Endpoint             | Description                                |
| ------ | -------------------- | ------------------------------------------ |
| POST   | `/api/logs/activity` | Log user actions (login, navigation, etc.) |

### For WebManger

#### 🛠️ Admin

| Method | Endpoint                               | Description                       |
| ------ | -------------------------------------- | --------------------------------- |
| POST   | `/api/admin/login`                     | Admin login                       |
| GET    | `/api/admin/forum/questions`           | View all user questions           |
| POST   | `/api/admin/forum/questions/:id/reply` | Admin replies to a forum question |
| GET    | `/api/admin/chat/:user_id/messages`    | View chat with a specific user    |
| POST   | `/api/admin/chat/:user_id/messages`    | Admin sends message to a user     |

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

**Example Response:**

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

### `POST /api/auth/logout`

Logs out the authenticated user.

**App Authentication:** Required (see headers above)

**Example Request:**

```bash
curl -X POST http://localhost:10000/api/auth/logout \
  
```

**Example Response:**

```json
{
  "status": "success",
  "message": "Logged out successfully"
}
```

---

## Forum API

Manages forum questions and replies.

### `GET /api/forum/questions`

Retrieves a list of all forum questions.

**Authentication:** Required

**Example Request:

```bash
curl -X GET http://localhost:10000/api/forum/questions \
  
```

**Example Response:**

```json
{
  "status": "success",
  "data": [
    {
      "id": 1,
      "user_id": 1,
      "title": "How to connect to my smart device?",
      "content": "I'm having trouble connecting my new smart device to the app. Any tips?",
      "created_at": "2025-06-30T10:00:00.000Z",
      "user_uuid": "a_unique_user_id",
      "reply_count": 2
    }
  ]
}
```

### `POST /api/forum/questions`

Creates a new forum question.

**Authentication:** Required

**Parameters:**

| Name | Type | Description | Required |
|---|---|---|---|
| `title` | String | The title of the question. | Yes |
| `content` | String | The content of the question. | Yes |

**Example Request:**

```bash
curl -X POST http://localhost:10000/api/forum/questions \
  -H "Content-Type: application/json" \
  -d '{"title": "How to setup WiFi?", "content": "I need help setting up my device WiFi connection."}'
```

**Example Response:**

```json
{
  "status": "success",
  "data": {
    "id": 2,
    "title": "New Question Title",
    "content": "This is the content of the new question.",
    "user_id": 1
  }
}
```

### `GET /api/forum/questions/:id`

Retrieves the details of a specific question, including replies.

**Authentication:** Required

**Parameters:

| Name | Type | Description | Required |
|---|---|---|---|
| `id` | Integer | The ID of the question. | Yes |

**Example Request:**

```bash
curl -X GET http://localhost:10000/api/forum/questions/1 \
```

**Example Response:**

```json
{
  "status": "success",
  "data": {
    "question": {
      "id": 1,
      "user_id": 1,
      "title": "How to connect to my smart device?",
      "content": "I'm having trouble connecting my new smart device to the app. Any tips?",
      "created_at": "2025-06-30T10:00:00.000Z",
      "user_uuid": "a_unique_user_id"
    },
    "replies": [
      {
        "id": 1,
        "question_id": 1,
        "user_id": 2,
        "responder_role": "user",
        "content": "I had the same issue! Make sure your Wi-Fi is on the 2.4GHz band.",
        "created_at": "2025-06-30T11:00:00.000Z",
        "responder_identifier": "another_user_id"
      }
    ]
  }
}
```

### `POST /api/forum/questions/:id/reply`

Posts a reply to a specific question.

**Authentication:** Required

**Parameters:**

| Name | Type | Description | Required |
|---|---|---|---|
| `id` | Integer | The ID of the question. | Yes |
| `content` | String | The content of the reply. | Yes |

**Example Request:**

```bash
curl -X POST http://localhost:10000/api/forum/questions/1/reply \
  -H "Content-Type: application/json" \
  -d '{"content": "Try checking your router settings first."}'
```

**Example Response:**

```json
{
  "status": "success",
  "data": {
    "id": 2,
    "question_id": 1,
    "content": "This is a new reply.",
    "responder_role": "user"
  }
}
```

---

## Chat API

Handles real-time chat between users and admins.

### `GET /api/chat/messages`

Retrieves the chat history for the authenticated user.

**Authentication:** Required

**Example Request:**

```bash
curl -X GET http://localhost:10000/api/chat/messages \
```

**Example Response:**

```json
{
  "status": "success",
  "data": {
    "conversation_id": 1,
    "messages": [
      {
        "id": 1,
        "conversation_id": 1,
        "user_id": 1,
        "sender_role": "user",
        "message": "Hello, I need help with my device.",
        "timestamp": "2025-06-30T12:00:00.000Z",
        "sender_identifier": "a_unique_user_id"
      }
    ]
  }
}
```

### `POST /api/chat/messages`

Sends a message in the chat.

**Authentication:** Required

**Parameters:**

| Name | Type | Description | Required |
|---|---|---|---|
| `message` | String | The content of the message. | Yes |

**Example Request:**

```bash
curl -X POST http://localhost:10000/api/chat/messages \
  -H "Content-Type: application/json" \
  -d '{"message": "Hello, I need assistance with my device setup."}'
```

**Example Response:**

```json
{
  "status": "success",
  "data": {
    "id": 2,
    "conversation_id": 1,
    "message": "This is a new message.",
    "sender_role": "user",
    "timestamp": "2025-06-30T12:05:00.000Z"
  }
}
```

---

## Logs API

Handles user activity logging.

### `POST /api/logs/activity`

Logs a user activity.

**Authentication:** Required

**Parameters:**

| Name | Type | Description | Required |
|---|---|---|---|
| `action_type` | Integer | The type of action (e.g., 0 for login, 1 for view forum). | Yes |
| `action` | String | A description of the action. | Yes |
| `metadata` | Object | Optional metadata for the action. | No |

**Example Request:**

```bash
curl -X POST http://localhost:10000/api/logs/activity \
  -H "Content-Type: application/json" \
  -d '{"action_type": 1, "action": "view_forum", "metadata": {"page_number": 1}}'
```

**Example Response:**

```json
{
  "status": "success",
  "data": {
    "id": 1,
    "user_id": 1,
    "action_type": 1,
    "action": "view_forum",
    "metadata": null,
    "created_at": "2025-06-30T13:00:00.000Z"
  }
}
```

---

## Admin API

**Note:** These endpoints are for administrative use only and require admin authentication.

### `POST /api/admin/login`

**App Authentication:** Required (see headers above)

**Parameters:**

| Name | Type | Description | Required |
|---|---|---|---|
| `username` | String | The admin's username. | Yes |
| `password` | String | The admin's password. | Yes |

**Headers:**

| Name | Type | Description | Required |
|---|---|---|---|
| `X-App-Type` | String | Must be `"ios"` | Yes |
| `X-Timestamp` | String | Unix timestamp in milliseconds | Yes |
| `X-Signature` | String | HMAC-SHA256 signature | Yes |

**Example Request:**

```bash
curl -X POST http://localhost:10000/api/admin/login \
  -H "Content-Type: application/json" \
  -H "X-App-Type: ios" \
  -H "X-Timestamp: 1672531200000" \
  -H "X-Signature: a1b2c3d4e5f6..." \
  -d '{"username": "admin", "password": "secure_password"}'
```

**Example Response:**

```json
{
  "status": "success",
  "data": {
    "admin": {
      "id": 1,
      "username": "admin",
      "role": "admin"
    }
  }
}
```

### `GET /api/admin/forum/questions`

Retrieves all forum questions for admin view.

**Authentication:** Admin Required

**Example Request:**

```bash
curl -X GET http://localhost:10000/api/admin/forum/questions \
```

**Example Response:**

```json
{
  "status": "success",
  "data": [
    {
      "id": 1,
      "user_id": 1,
      "title": "How to connect to my smart device?",
      "content": "I'm having trouble connecting my new smart device to the app. Any tips?",
      "created_at": "2025-06-30T10:00:00.000Z",
      "user_uuid": "a_unique_user_id",
      "reply_count": 2
    }
  ]
}
```

### `POST /api/admin/forum/questions/:id/reply`

Allows an admin to reply to a forum question.

**Authentication:** Admin Required

**Parameters:**

| Name | Type | Description | Required |
|---|---|---|---|
| `id` | Integer | The ID of the question. | Yes |
| `content` | String | The content of the reply. | Yes |

**Example Request:**

```bash
curl -X POST http://localhost:10000/api/admin/forum/questions/1/reply \
  -H "Content-Type: application/json" \
  -d '{"content": "This is a comprehensive solution to your problem..."}'
```

**Example Response:**

```json
{
  "status": "success",
  "data": {
    "id": 3,
    "question_id": 1,
    "content": "This is a comprehensive solution to your problem...",
    "responder_role": "admin"
  }
}
```

### `GET /api/admin/chat/:user_id/messages`

Retrieves the chat history between an admin and a user.

**Authentication:** Admin Required

**Parameters:**

| Name | Type | Description | Required |
|---|---|---|---|
| `user_id` | Integer | The ID of the user. | Yes |

**Example Request:**

```bash
curl -X GET http://localhost:10000/api/admin/chat/1/messages \
```

**Example Response:**

```json
{
  "status": "success",
  "data": {
    "conversation_id": 1,
    "messages": [
      {
        "id": 1,
        "conversation_id": 1,
        "user_id": 1,
        "sender_role": "user",
        "message": "Hello, I need help with my device.",
        "timestamp": "2025-06-30T12:00:00.000Z",
        "sender_identifier": "a_unique_user_id"
      }
    ]
  }
}
```

### `POST /api/admin/chat/:user_id/messages`

Allows an admin to send a message to a user.

**Authentication:** Admin Required

**Parameters:**

| Name | Type | Description | Required |
|---|---|---|---|
| `user_id` | Integer | The ID of the user. | Yes |
| `message` | String | The content of the message. | Yes |

**Example Request:**

```bash
curl -X POST http://localhost:10000/api/admin/chat/1/messages \
  -H "Content-Type: application/json" \
  -d '{"message": "Hello! How can I assist you today?"}'
```

**Example Response:**

```json
{
  "status": "success",
  "data": {
    "id": 2,
    "conversation_id": 1,
    "message": "Hello! How can I assist you today?",
    "sender_role": "admin",
    "timestamp": "2025-06-30T12:05:00.000Z"
  }
}
```

## Health API(INNER USER)

Provides health check endpoints for the application.

### `GET /health`

Returns the basic health status of the application.

**Example Request:**

```bash
curl -X GET http://localhost:10000/health
```

**Example Response:**

```json
{
  "status": "healthy",
  "timestamp": "2025-06-30T14:00:00.000Z",
  "uptime": 12345.67,
  "memory": {
    "rss": 51200000,
    "heapTotal": 32000000,
    "heapUsed": 16000000,
    "external": 1000000
  },
  "version": "1.0.0"
}
```

### `GET /health/db`

Checks the health of the database connection.

**Example Request:**

```bash
curl -X GET http://localhost:10000/health/db
```

**Example Response:**

```json
{
  "status": "healthy",
  "database": "connected",
  "responseTime": "15ms",
  "timestamp": "2025-06-30T14:05:00.000Z"
}
```

### `GET /health/detailed`

Returns a detailed health report of the system.

**Example Request:**

```bash
curl -X GET http://localhost:10000/health/detailed
```

**Example Response:**

```json
{
  "status": "healthy",
  "timestamp": "2025-06-30T14:10:00.000Z",
  "system": {
    "uptime": 12345.67,
    "memory": {
      "rss": 51200000,
      "heapTotal": 32000000,
      "heapUsed": 16000000,
      "external": 1000000
    },
    "cpu": {
      "user": 100000,
      "system": 50000
    },
    "version": "v18.12.1",
    "platform": "darwin",
    "arch": "x64"
  },
  "database": {
    "status": "connected",
    "responseTime": "12ms"
  }
}
```

---
