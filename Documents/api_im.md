# APP : Instant Messaging (IM) API

Handles real-time messaging between users and administrators with WebSocket support for instant communication.

## GET /api/chat/messages

Retrieves chat history for the authenticated user's conversation with administrators.

**App Authentication:** Required (see headers in `api_table.md`)

**Request Body Parameters:**

| Name | Type | Description | Required | Default |
|---|---|---|---|---|
| `user_id` | Integer | User ID for message history | Yes | - |

**Example Request:**

```bash
curl -X GET "http://localhost:10000/api/chat/messages" \
  -H "X-Timestamp: 1672531200000" \
  -H "X-Signature: a1b2c3d4e5f6..." \
  -H "Content-Type: application/json" \
  -d '{"user_id": 123}'
```

**Response Structure:**

| Field | Type | Description |
|-------|------|-------------|
| `status` | String | Request status ("success" or "error") |
| `data` | Object | Response data container |
| `data.conversation_id` | Integer | Conversation ID |
| `data.messages` | Array | Array of message objects |

### Message Object Structure

| Field | Type | Description |
|-------|------|-------------|
| `id` | Integer | Message unique ID |
| `conversation_id` | Integer | Conversation ID |
| `sender_role` | String | Message sender ("user" or "admin") |
| `message` | String | Message content |
| `timestamp` | String | ISO timestamp of message |
| `sender_identifier` | String | Sender identifier (user UUID or admin username) |

**Example Response:**

```json
{
  "status": "success",
  "data": {
    "conversation_id": 123,
    "messages": [
      {
        "id": 1,
        "conversation_id": 123,
        "sender_role": "user",
        "message": "Hello, I need help",
        "timestamp": "2025-07-14T10:30:00Z",
        "sender_identifier": "user_uuid_123"
      },
      {
        "id": 2,
        "conversation_id": 123,
        "sender_role": "admin",
        "message": "How can I help you?",
        "timestamp": "2025-07-14T10:31:00Z",
        "sender_identifier": "admin_username"
      }
    ]
  }
}
```

## POST /api/chat/messages

Sends a message to the conversation with administrators.

**App Authentication:** Required (see headers in `api_table.md`)

**Request Body Parameters:**

| Name | Type | Description | Required | Default |
|---|---|---|---|---|
| `message` | String | Message content | Yes | - |

**Example Request:**

```bash
curl -X POST "http://localhost:10000/api/chat/messages" \
  -H "X-Timestamp: 1672531200000" \
  -H "X-Signature: a1b2c3d4e5f6..." \
  -H "Content-Type: application/json" \
  -d '{"message": "Thank you for your help!"}'
```

**Response Structure:**

| Field | Type | Description |
|-------|------|-------------|
| `status` | String | Request status ("success" or "error") |
| `data` | Object | Response data container |
| `data.id` | Integer | Message unique ID |
| `data.conversation_id` | Integer | Conversation ID |
| `data.message` | String | Message content |
| `data.sender_role` | String | Always "user" for this endpoint |
| `data.timestamp` | String | ISO timestamp of message |

**Example Response:**

```json
{
  "status": "success",
  "data": {
    "id": 3,
    "conversation_id": 123,
    "message": "Thank you for your help!",
    "sender_role": "user",
    "timestamp": "2025-07-14T10:32:00Z"
  }
}
```

## GET /api/chat/conversations

Lists all conversations for the authenticated user with pagination support.

**App Authentication:** Required (see headers in `api_table.md`)

**Query Parameters:**

| Name | Type | Description | Required | Default |
|---|---|---|---|---|
| `page` | Integer | Page number (1-based) | No | 1 |
| `limit` | Integer | Items per page (1-50) | No | 20 |
| `status` | String | Filter by status ("active", "closed", "archived") | No | All |

**Example Request:**

```bash
curl -X GET "http://localhost:10000/api/chat/conversations?page=1&limit=20" \
  -H "X-Timestamp: 1672531200000" \
  -H "X-Signature: a1b2c3d4e5f6..."
```

**Response Structure:**

| Field | Type | Description |
|-------|------|-------------|
| `status` | String | Request status ("success" or "error") |
| `data` | Object | Response data container |
| `data.conversations` | Array | Array of conversation objects |
| `data.pagination` | Object | Pagination information |

### Conversation Object Structure

| Field | Type | Description |
|-------|------|-------------|
| `id` | Integer | Conversation unique ID |
| `user_id` | Integer | User ID |
| `admin_id` | Integer | Assigned admin ID (null if unassigned) |
| `status` | String | Conversation status |
| `last_message_at` | String | ISO timestamp of last message |
| `unread_count` | Integer | Number of unread messages |
| `last_message` | Object | Last message preview |

**Example Response:**

```json
{
  "status": "success",
  "data": {
    "conversations": [
      {
        "id": 123,
        "user_id": 456,
        "admin_id": 789,
        "status": "active",
        "last_message_at": "2025-07-14T10:32:00Z",
        "unread_count": 2,
        "last_message": {
          "content": "Thank you for your help!",
          "sender_role": "user"
        }
      }
    ],
    "pagination": {
      "page": 1,
      "limit": 20,
      "total": 1,
      "pages": 1
    }
  }
}
```

## POST /api/chat/conversations

Creates a new conversation with an initial message.

**App Authentication:** Required (see headers in `api_table.md`)

**Request Body Parameters:**

| Name | Type | Description | Required | Default |
|---|---|---|---|---|
| `initial_message` | String | First message to start conversation | Yes | - |

**Example Request:**

```bash
curl -X POST "http://localhost:10000/api/chat/conversations" \
  -H "X-Timestamp: 1672531200000" \
  -H "X-Signature: a1b2c3d4e5f6..." \
  -H "Content-Type: application/json" \
  -d '{"initial_message": "I need help with my account"}'
```

**Response Structure:**

| Field | Type | Description |
|-------|------|-------------|
| `status` | String | Request status ("success" or "error") |
| `data` | Object | Response data container |
| `data.conversation_id` | Integer | New conversation ID |
| `data.message` | Object | Initial message details |

**Example Response:**

```json
{
  "status": "success",
  "data": {
    "conversation_id": 124,
    "message": {
      "id": 1,
      "content": "I need help with my account",
      "timestamp": "2025-07-14T10:35:00Z"
    }
  }
}
```

## PUT /api/chat/conversations/:id/read

Marks specific messages in a conversation as read.

**App Authentication:** Required (see headers in `api_table.md`)

**Path Parameters:**

| Name | Type | Description | Required |
|---|---|---|---|
| `id` | Integer | Conversation ID | Yes |

**Request Body Parameters:**

| Name | Type | Description | Required | Default |
|---|---|---|---|---|
| `message_ids` | Array | Array of message IDs to mark as read | Yes | - |

**Example Request:**

```bash
curl -X PUT "http://localhost:10000/api/chat/conversations/123/read" \
  -H "X-Timestamp: 1672531200000" \
  -H "X-Signature: a1b2c3d4e5f6..." \
  -H "Content-Type: application/json" \
  -d '{"message_ids": [1, 2, 3]}'
```

**Response Structure:**

| Field | Type | Description |
|-------|------|-------------|
| `status` | String | Request status ("success" or "error") |
| `data` | Object | Response data container |
| `data.marked_read` | Integer | Number of messages marked as read |

**Example Response:**

```json
{
  "status": "success",
  "data": {
    "marked_read": 3
  }
}
```

## POST /api/chat/conversations/:id/typing

Sends a typing indicator to notify other participants in the conversation.

**App Authentication:** Required (see headers in `api_table.md`)

**Path Parameters:**

| Name | Type | Description | Required |
|---|---|---|---|
| `id` | Integer | Conversation ID | Yes |

**Request Body Parameters:**

| Name | Type | Description | Required | Default |
|---|---|---|---|---|
| `typing` | Boolean | True if user is typing, false if stopped | Yes | - |

**Example Request:**

```bash
curl -X POST "http://localhost:10000/api/chat/conversations/123/typing" \
  -H "X-Timestamp: 1672531200000" \
  -H "X-Signature: a1b2c3d4e5f6..." \
  -H "Content-Type: application/json" \
  -d '{"typing": true}'
```

**Response Structure:**

| Field | Type | Description |
|-------|------|-------------|
| `status` | String | Request status ("success" or "error") |
| `message` | String | Confirmation message |

**Example Response:**

```json
{
  "status": "success",
  "message": "Typing indicator sent"
}
```

## POST /api/chat/upload

Uploads files or images for use in messaging.

**App Authentication:** Required (see headers in `api_table.md`)

**Request Body Parameters (multipart/form-data):**

| Name | Type | Description | Required | Default |
|---|---|---|---|---|
| `file` | File | File to upload | Yes | - |
| `conversation_id` | Integer | Conversation ID | Yes | - |
| `message_type` | String | Type of message ("image" or "file") | Yes | - |

**Example Request:**

```bash
curl -X POST "http://localhost:10000/api/chat/upload" \
  -H "X-Timestamp: 1672531200000" \
  -H "X-Signature: a1b2c3d4e5f6..." \
  -F "file=@image.jpg" \
  -F "conversation_id=123" \
  -F "message_type=image"
```

**Response Structure:**

| Field | Type | Description |
|-------|------|-------------|
| `status` | String | Request status ("success" or "error") |
| `data` | Object | Response data container |
| `data.file_id` | String | Unique file identifier |
| `data.file_url` | String | Public URL to access file |
| `data.message_id` | Integer | Created message ID |

**Example Response:**

```json
{
  "status": "success",
  "data": {
    "file_id": "upload_abc123",
    "file_url": "https://cdn.example.com/files/abc123.jpg",
    "message_id": 25
  }
}
```

---

# ADMIN : Chat Management API

Handles chat administration, conversation management, and admin-to-user messaging.

## GET /admin/chat/dashboard

Retrieves dashboard statistics and overview for admin chat management.

**Admin Authentication:** Required (Admin status = 87)

**Query Parameters:**

| Name | Type | Description | Required | Default |
|---|---|---|---|---|
| `admin_id` | Integer | Specific admin ID for personalized data | No | Current admin |

**Example Request:**

```bash
curl -X GET "http://localhost:10000/admin/chat/dashboard" \
  -H "Authorization: Bearer admin_token_here"
```

**Response Structure:**

| Field | Type | Description |
|-------|------|-------------|
| `status` | String | Request status ("success" or "error") |
| `data` | Object | Dashboard data |
| `data.summary` | Object | Overview statistics |
| `data.recent_activity` | Array | Recent conversation activity |
| `data.my_assignments` | Array | Conversations assigned to current admin |

**Example Response:**

```json
{
  "status": "success",
  "data": {
    "summary": {
      "total_conversations": 156,
      "active_conversations": 23,
      "unread_conversations": 8,
      "assigned_to_me": 12,
      "unassigned": 4,
      "closed_today": 15,
      "avg_response_time": "4.2 minutes"
    },
    "recent_activity": [
      {
        "conversation_id": 145,
        "user_name": "Jane Doe",
        "last_message": "Thank you for the quick response!",
        "timestamp": "2025-07-14T11:25:00Z",
        "status": "active"
      }
    ],
    "my_assignments": [
      {
        "conversation_id": 123,
        "user_name": "John Smith",
        "priority": "high",
        "unread_count": 2,
        "last_activity": "2025-07-14T10:32:00Z"
      }
    ]
  }
}
```

## GET /admin/chat/conversations

Lists all conversations across all users for admin management with advanced filtering.

**Admin Authentication:** Required (Admin status = 87)

**Query Parameters:**

| Name | Type | Description | Required | Default |
|---|---|---|---|---|
| `page` | Integer | Page number (1-based) | No | 1 |
| `limit` | Integer | Items per page (1-100) | No | 20 |
| `status` | String | Filter by status | No | All |
| `assigned_admin` | Integer | Filter by assigned admin ID | No | All |
| `user_id` | Integer | Filter by specific user ID | No | All |
| `unread_only` | Boolean | Show only conversations with unread messages | No | false |
| `sort` | String | Sort order ("newest", "oldest", "last_activity") | No | "newest" |

**Example Request:**

```bash
curl -X GET "http://localhost:10000/admin/chat/conversations?unread_only=true&sort=last_activity" \
  -H "Authorization: Bearer admin_token_here"
```

**Response Structure:**

| Field | Type | Description |
|-------|------|-------------|
| `status` | String | Request status ("success" or "error") |
| `data` | Object | Response data container |
| `data.conversations` | Array | Array of detailed conversation objects |
| `data.pagination` | Object | Pagination information |
| `data.summary` | Object | Summary statistics |

### Admin Conversation Object Structure

| Field | Type | Description |
|-------|------|-------------|
| `id` | Integer | Conversation unique ID |
| `user_id` | Integer | User ID |
| `user_info` | Object | User information |
| `admin_id` | Integer | Assigned admin ID |
| `admin_info` | Object | Admin information |
| `status` | String | Conversation status |
| `priority` | String | Priority level |
| `created_at` | String | ISO timestamp of creation |
| `last_message_at` | String | ISO timestamp of last message |
| `unread_count` | Integer | Number of unread messages |
| `total_messages` | Integer | Total message count |
| `last_message` | Object | Last message preview |
| `tags` | Array | Array of tag strings |

**Example Response:**

```json
{
  "status": "success",
  "data": {
    "conversations": [
      {
        "id": 123,
        "user_id": 456,
        "user_info": {
          "id": 456,
          "account_name": "John Smith",
          "phone_number": "+1234567890",
          "status": 2
        },
        "admin_id": 789,
        "admin_info": {
          "id": 789,
          "username": "admin_sarah",
          "account_name": "Sarah Wilson"
        },
        "status": "active",
        "priority": "normal",
        "created_at": "2025-07-14T09:15:00Z",
        "last_message_at": "2025-07-14T10:32:00Z",
        "unread_count": 2,
        "total_messages": 8,
        "last_message": {
          "id": 15,
          "content": "Thank you for your help!",
          "sender_role": "user",
          "timestamp": "2025-07-14T10:32:00Z"
        },
        "tags": ["billing", "urgent"]
      }
    ],
    "pagination": {
      "page": 1,
      "limit": 20,
      "total": 45,
      "pages": 3
    },
    "summary": {
      "total_active": 12,
      "total_unread": 5,
      "assigned_to_me": 8,
      "unassigned": 4
    }
  }
}
```

## GET /admin/chat/conversations/:id

Retrieves detailed information about a specific conversation for admin review.

**Admin Authentication:** Required (Admin status = 87)

**Path Parameters:**

| Name | Type | Description | Required |
|---|---|---|---|
| `id` | Integer | Conversation ID | Yes |

**Example Request:**

```bash
curl -X GET "http://localhost:10000/admin/chat/conversations/123" \
  -H "Authorization: Bearer admin_token_here"
```

**Response Structure:**

| Field | Type | Description |
|-------|------|-------------|
| `status` | String | Request status ("success" or "error") |
| `data` | Object | Response data container |
| `data.conversation` | Object | Detailed conversation information |

**Example Response:**

```json
{
  "status": "success",
  "data": {
    "conversation": {
      "id": 123,
      "user_id": 456,
      "user_info": {
        "id": 456,
        "account_name": "John Smith",
        "phone_number": "+1234567890",
        "status": 2,
        "created_at": "2025-06-01T12:00:00Z",
        "last_login": "2025-07-14T08:30:00Z"
      },
      "admin_id": 789,
      "admin_info": {
        "id": 789,
        "username": "admin_sarah",
        "account_name": "Sarah Wilson"
      },
      "status": "active",
      "priority": "normal",
      "created_at": "2025-07-14T09:15:00Z",
      "last_message_at": "2025-07-14T10:32:00Z",
      "total_messages": 8,
      "tags": ["billing", "urgent"],
      "notes": "Customer having issues with premium subscription billing."
    }
  }
}
```

## PUT /admin/chat/conversations/:id/assign

Assigns a conversation to a specific admin for handling.

**Admin Authentication:** Required (Admin status = 87)

**Path Parameters:**

| Name | Type | Description | Required |
|---|---|---|---|
| `id` | Integer | Conversation ID | Yes |

**Request Body Parameters:**

| Name | Type | Description | Required | Default |
|---|---|---|---|---|
| `admin_id` | Integer | Admin ID to assign conversation to | Yes | - |
| `notes` | String | Assignment notes | No | - |

**Example Request:**

```bash
curl -X PUT "http://localhost:10000/admin/chat/conversations/123/assign" \
  -H "Authorization: Bearer admin_token_here" \
  -H "Content-Type: application/json" \
  -d '{"admin_id": 789, "notes": "Customer billing issue - priority handling required"}'
```

**Response Structure:**

| Field | Type | Description |
|-------|------|-------------|
| `status` | String | Request status ("success" or "error") |
| `data` | Object | Response data container |
| `data.conversation_id` | Integer | Conversation ID |
| `data.assigned_admin` | Object | Admin information |
| `data.notes` | String | Assignment notes |

**Example Response:**

```json
{
  "status": "success",
  "data": {
    "conversation_id": 123,
    "assigned_admin": {
      "id": 789,
      "username": "admin_sarah",
      "account_name": "Sarah Wilson"
    },
    "notes": "Customer billing issue - priority handling required"
  }
}
```

## PUT /admin/chat/conversations/:id/status

Updates conversation status, priority, and management tags.

**Admin Authentication:** Required (Admin status = 87)

**Path Parameters:**

| Name | Type | Description | Required |
|---|---|---|---|
| `id` | Integer | Conversation ID | Yes |

**Request Body Parameters:**

| Name | Type | Description | Required | Default |
|---|---|---|---|---|
| `status` | String | New status ("active", "closed", "archived") | No | Current |
| `priority` | String | Priority level ("low", "normal", "high", "urgent") | No | Current |
| `tags` | Array | Array of tag strings | No | Current |
| `resolution_notes` | String | Notes when closing conversation | No | - |

**Example Request:**

```bash
curl -X PUT "http://localhost:10000/admin/chat/conversations/123/status" \
  -H "Authorization: Bearer admin_token_here" \
  -H "Content-Type: application/json" \
  -d '{
    "status": "closed",
    "priority": "high",
    "tags": ["billing", "resolved"],
    "resolution_notes": "Issue resolved - refund processed"
  }'
```

**Response Structure:**

| Field | Type | Description |
|-------|------|-------------|
| `status` | String | Request status ("success" or "error") |
| `data` | Object | Response data container |
| `data.conversation_id` | Integer | Conversation ID |
| `data.status` | String | Updated status |
| `data.priority` | String | Updated priority |
| `data.tags` | Array | Updated tags |
| `data.resolution_notes` | String | Resolution notes |
| `data.updated_by` | String | Admin who made the update |
| `data.updated_at` | String | ISO timestamp of update |

**Example Response:**

```json
{
  "status": "success",
  "data": {
    "conversation_id": 123,
    "status": "closed",
    "priority": "high",
    "tags": ["billing", "resolved"],
    "resolution_notes": "Issue resolved - refund processed",
    "updated_by": "admin_sarah",
    "updated_at": "2025-07-14T11:45:00Z"
  }
}
```

## POST /admin/chat/conversations/:id/messages

Sends a message as an admin to a specific conversation.

**Admin Authentication:** Required (Admin status = 87)

**Path Parameters:**

| Name | Type | Description | Required |
|---|---|---|---|
| `id` | Integer | Conversation ID | Yes |

**Request Body Parameters:**

| Name | Type | Description | Required | Default |
|---|---|---|---|---|
| `message` | String | Message content | Yes | - |
| `message_type` | String | Type of message ("text", "image", "file") | No | "text" |
| `internal_note` | String | Private admin note (not visible to user) | No | - |

**Example Request:**

```bash
curl -X POST "http://localhost:10000/admin/chat/conversations/123/messages" \
  -H "Authorization: Bearer admin_token_here" \
  -H "Content-Type: application/json" \
  -d '{
    "message": "Hello! I have reviewed your account and processed the refund. It should appear in 3-5 business days.",
    "message_type": "text",
    "internal_note": "Refund processed via admin panel - $29.99"
  }'
```

**Response Structure:**

| Field | Type | Description |
|-------|------|-------------|
| `status` | String | Request status ("success" or "error") |
| `data` | Object | Response data container |
| `data.id` | Integer | Message ID |
| `data.conversation_id` | Integer | Conversation ID |
| `data.message` | String | Message content |
| `data.sender_role` | String | Always "admin" |
| `data.sender_identifier` | String | Admin username |
| `data.timestamp` | String | ISO timestamp |
| `data.internal_note` | String | Internal note (if provided) |

**Example Response:**

```json
{
  "status": "success",
  "data": {
    "id": 25,
    "conversation_id": 123,
    "message": "Hello! I have reviewed your account and processed the refund. It should appear in 3-5 business days.",
    "sender_role": "admin",
    "sender_identifier": "admin_sarah",
    "timestamp": "2025-07-14T11:30:00Z",
    "internal_note": "Refund processed via admin panel - $29.99"
  }
}
```

---

## WebSocket Events

The IM system uses WebSocket connections for real-time messaging and notifications.

### Connection Setup

**User Connection:**

```javascript
const socket = io('http://47.94.108.189:10000', {
  auth: {
    token: 'user_token_here'
  }
});
```

**Admin Connection:**

```javascript
const adminSocket = io('http://47.94.108.189:10000', {
  auth: {
    token: 'admin_token_here',
    role: 'admin'
  }
});

// Auto-join admin rooms
adminSocket.emit('join_admin_rooms', {
  rooms: ['admin_dashboard', 'admin_notifications']
});
```

### Client Events (Sent to Server)

#### join_conversation

Join a conversation room to receive real-time updates.

```json
{
  "event": "join_conversation",
  "data": {
    "conversation_id": 456
  }
}
```

#### send_message

Send a message through WebSocket.

```json
{
  "event": "send_message",
  "data": {
    "conversation_id": 456,
    "message_type": "text",
    "content": "Hello there!",
    "file_id": null
  }
}
```

#### typing_start/typing_stop

Send typing indicators.

```json
{
  "event": "typing_start",
  "data": {
    "conversation_id": 456
  }
}
```

### Server Events (Sent to Client)

#### new_message

Receive new messages in real-time.

```json
{
  "event": "new_message",
  "data": {
    "id": 123,
    "conversation_id": 456,
    "sender_role": "admin",
    "message_type": "text",
    "content": "Hello, how can I help?",
    "timestamp": "2025-07-14T10:35:00Z",
    "sender_identifier": "admin_username"
  }
}
```

#### typing_indicator

Receive typing indicators from other participants.

```json
{
  "event": "typing_indicator",
  "data": {
    "conversation_id": 456,
    "sender_role": "admin",
    "typing": true,
    "sender_identifier": "admin_username"
  }
}
```

#### admin_conversation_assigned

Notify admin when conversation is assigned (Admin only).

```json
{
  "event": "admin_conversation_assigned",
  "data": {
    "conversation_id": 456,
    "user_info": {
      "id": 123,
      "account_name": "John Smith",
      "status": 2
    },
    "priority": "high",
    "tags": ["billing", "urgent"],
    "assigned_by": "admin_manager",
    "notes": "Customer billing issue - priority handling required"
  }
}
```

#### admin_new_conversation

Notify admins of new conversations (Admin only).

```json
{
  "event": "admin_new_conversation",
  "data": {
    "conversation_id": 789,
    "user_info": {
      "id": 456,
      "account_name": "Jane Doe",
      "status": 2
    },
    "initial_message": "I'm having trouble with my subscription",
    "created_at": "2025-07-14T12:00:00Z",
    "priority": "normal"
  }
}
```

#### admin_dashboard_update

Real-time dashboard statistics (Admin only).

```json
{
  "event": "admin_dashboard_update",
  "data": {
    "total_active": 23,
    "total_unread": 8,
    "assigned_to_me": 12,
    "unassigned": 4,
    "avg_response_time": "4.2 minutes"
  }
}
```

---

## Error Handling

All IM API endpoints follow the standard error response format described in `api_table.md`.

### Common IM-Specific Error Codes

| Status Code | Error Message | Description |
|-------------|---------------|-------------|
| **400** | "Invalid conversation ID" | Conversation does not exist |
| **403** | "Access denied to conversation" | User not authorized for conversation |
| **403** | "Admin access required" | Endpoint requires admin privileges |
| **404** | "Conversation not found" | Conversation ID invalid |
| **413** | "File too large" | Upload exceeds size limit |
| **429** | "Rate limit exceeded" | Too many messages sent |

### Rate Limiting

- **Message sending**: 60 messages per minute per user
- **File uploads**: 10 files per minute per user
- **Typing indicators**: 10 per minute per conversation
- **Admin operations**: 100 requests per minute per admin

### WebSocket Error Events

```json
{
  "event": "error",
  "data": {
    "code": "UNAUTHORIZED",
    "message": "Invalid authentication token"
  }
}
```

---

## Security Notes

1. **Authentication**: All endpoints require valid app-level authentication
2. **Admin Authorization**: Admin endpoints verify `status = 87` in users table
3. **WebSocket Security**: Token-based authentication for Socket.IO connections
4. **File Upload Security**: Virus scanning and file type validation
5. **Rate Limiting**: Prevents spam and abuse
6. **Audit Trail**: All admin actions logged in `admin_activity_log` table
