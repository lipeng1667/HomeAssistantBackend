
# API Reference

This document provides a detailed reference for the Home Assistant Backend API.

## Base URL

All API endpoints are prefixed with `/api`.

## Authentication

Most endpoints require authentication via a JSON Web Token (JWT). The token must be included in the `Authorization` header of your requests as a Bearer token.

`Authorization: Bearer <your_jwt_token>`

---

## Auth API

Handles user authentication.

### `POST /api/auth/login`

Logs in a user and returns a JWT token.

**Parameters:**

| Name | Type | Description | Required |
|---|---|---|---|
| `device_id` | String | A unique identifier for the user's device. | Yes |

**Example Response:**

```json
{
  "status": "success",
  "data": {
    "token": "your_jwt_token",
    "user": {
      "id": 1,
      "uuid": "a_unique_user_id",
      "device_id": "your_device_id"
    }
  }
}
```

### `POST /api/auth/logout`

Logs out the authenticated user.

**Authentication:** Required

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

**Parameters:**

| Name | Type | Description | Required |
|---|---|---|---|
| `id` | Integer | The ID of the question. | Yes |

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

## Health API

Provides health check endpoints for the application.

### `GET /health`

Returns the basic health status of the application.

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

## Admin API

**Note:** These endpoints are for administrative use only and require admin authentication.

### `POST /api/admin/login`

Logs in an admin and returns a JWT token.

**Parameters:**

| Name | Type | Description | Required |
|---|---|---|---|
| `username` | String | The admin's username. | Yes |
| `password` | String | The admin's password. | Yes |

### `GET /api/admin/forum/questions`

Retrieves all forum questions for admin view.

**Authentication:** Admin Required

### `POST /api/admin/forum/questions/:id/reply`

Allows an admin to reply to a forum question.

**Authentication:** Admin Required

**Parameters:**

| Name | Type | Description | Required |
|---|---|---|---|
| `id` | Integer | The ID of the question. | Yes |
| `content` | String | The content of the reply. | Yes |

### `GET /api/admin/chat/:user_id/messages`

Retrieves the chat history between an admin and a user.

**Authentication:** Admin Required

**Parameters:**

| Name | Type | Description | Required |
|---|---|---|---|
| `user_id` | Integer | The ID of the user. | Yes |

### `POST /api/admin/chat/:user_id/messages`

Allows an admin to send a message to a user.

**Authentication:** Admin Required

**Parameters:**

| Name | Type | Description | Required |
|---|---|---|---|
| `user_id` | Integer | The ID of the user. | Yes |
| `message` | String | The content of the message. | Yes |
