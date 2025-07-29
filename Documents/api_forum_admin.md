# APP : Forum Admin API

Handles admin-only forum moderation and management operations.

## Authentication & Authorization

All forum admin endpoints require:

1. **App-Level Authentication**: Standard HMAC-SHA256 signature validation
2. **User Session**: Valid Redis session with user_id
3. **Admin Role**: User must have status = 87 (admin) stored in session
4. **Optional Security**: Session token for enhanced admin security

**Required Headers & Parameters:**

| Header/Parameter | Type | Description | Required |
|------------------|------|-------------|----------|
| `X-Timestamp` | Header | Unix timestamp (ms) for signature | Yes |
| `X-Signature` | Header | HMAC-SHA256(app_secret, timestamp) | Yes |
| `user_id` | Body | Admin user ID for session validation | Yes |
| `X-Session-Token` | Header | Optional session token for enhanced security | No |

**Authentication Flow:**

1. **App Validation**: HMAC signature validates request authenticity
2. **Session Lookup**: Redis session `ha:user:{user_id}` must exist and be active
3. **Admin Check**: Session `user_status` field must equal "87"
4. **Token Validation**: If `X-Session-Token` provided, must match session token
5. **Audit Logging**: All admin access attempts logged for security

**Enhanced Login Response:**

After successful admin login, the response includes a session token for enhanced security:

```json
{
  "status": "success", 
  "data": {
    "user": {
      "id": 123,
      "name": "admin_user",
      "status": 87,
      "session_token": "uuid-v4-token"
    }
  }
}
```

**Redis Session Structure:**

```text
ha:user:123 → HASH {
  device_id: "iPhone_ABC123",
  login_time: "1672531200000", 
  last_seen: "1672531300000",
  status: "login",
  user_status: "87",
  username: "admin_user", 
  session_token: "uuid-v4-token",
  ip_address: "192.168.1.100"
}
```

## Forum Post Status Values

| Status | State | Description | Visibility |
|--------|-------|-------------|------------|
| `-1` | Under Review | Awaiting admin moderation | Author/Admin only |
| `0` | Published | Approved and visible | Public |
| `1` | Deleted | Soft deleted by admin | Hidden |

---

## Review Queue Management

### `GET /admin/forum/review-queue`

Get all posts awaiting moderation (status = -1) for admin review.

**Admin Authentication:** Required (status = 87)

**Query Parameters:**

| Name | Type | Description | Required | Default |
|------|------|-------------|----------|---------|
| `page` | Integer | Page number (1-based) | No | 1 |
| `limit` | Integer | Items per page (1-100) | No | 20 |
| `type` | String | Filter: "topic", "reply", "all" | No | "all" |
| `sort` | String | Sort: "newest", "oldest", "priority" | No | "newest" |
| `category` | String | Filter by forum category | No | All |

**Example Request:**

```bash
curl -X GET "http://localhost:10000/admin/forum/review-queue?page=1&limit=50&type=topic" \
  -H "Content-Type: application/json" \
  -H "X-Timestamp: 1672531200000" \
  -H "X-Signature: a1b2c3d4e5f6..." \
  -H "X-Session-Token: optional-uuid-token" \
  -d '{"user_id": 123}'
```

**Response Structure:**

| Field | Type | Description |
|-------|------|-------------|
| `status` | String | Request status ("success" or "error") |
| `data` | Object | Response data container |
| `data.pending_items` | Array | Array of items awaiting review |
| `data.pagination` | Object | Pagination information |
| `data.stats` | Object | Queue statistics |

**Response Error Codes:**

| Status | Error Message | Cause | Solution |
|--------|---------------|-------|----------|
| **400** | `"user_id is required"` | Missing user_id in request body | Include user_id parameter |
| **401** | `"Session not found or expired"` | Invalid/expired Redis session | Login again |
| **401** | `"Invalid session token"` | X-Session-Token doesn't match | Use correct session token |
| **403** | `"Admin access required"` | User status is not 87 | Must be admin user |
| **500** | `"Session service unavailable"` | Redis connection error | Check Redis service |
| **500** | `"Internal server error"` | Database error | Check server logs |

**Example Response:**

```json
{
  "status": "success",
  "data": {
    "pending_items": [
      {
        "id": 123,
        "type": "topic",
        "title": "Smart Home Automation Tips",
        "content": "Here are some great tips for...",
        "author": {
          "id": 45,
          "name": "user123",
          "role": "user"
        },
        "category": "Smart Home",
        "created_at": "2025-01-15T10:30:00Z",
        "priority": "normal"
      },
      {
        "id": 89,
        "type": "reply",
        "content": "Great post! I also recommend...",
        "topic_id": 67,
        "topic_title": "Home Security Systems",
        "author": {
          "id": 32,
          "name": "homeowner99",
          "role": "user"
        },
        "created_at": "2025-01-15T09:15:00Z",
        "priority": "normal"
      }
    ],
    "pagination": {
      "current_page": 1,
      "total_pages": 3,
      "total_items": 47,
      "has_next": true,
      "has_previous": false
    },
    "stats": {
      "total_pending": 47,
      "topics_pending": 23,
      "replies_pending": 24,
      "average_wait_time_hours": 2.5
    }
  }
}
```

---

## Individual Post Moderation

### `POST /admin/forum/moderate`

Moderate a single forum post (topic or reply) with approve/reject actions.

**Admin Authentication:** Required (status = 87)

**Parameters:**

| Name | Type | Description | Required |
|------|------|-------------|----------|
| `user_id` | Integer | Admin user ID for authentication | Yes |
| `post_id` | Integer | ID of post to moderate | Yes |
| `post_type` | String | "topic" or "reply" | Yes |
| `action` | String | "approve" or "reject" | Yes |
| `reason` | String | Moderation reason/comment | No |

**Example Request:**

```bash
curl -X POST http://localhost:10000/admin/forum/moderate \
  -H "Content-Type: application/json" \
  -H "X-Timestamp: 1672531200000" \
  -H "X-Signature: a1b2c3d4e5f6..." \
  -H "X-Session-Token: optional-uuid-token" \
  -d '{
    "user_id": 123,
    "post_id": 123,
    "post_type": "topic",
    "action": "approve",
    "reason": "Content meets community guidelines"
  }'
```

**Response Structure:**

| Field | Type | Description |
|-------|------|-------------|
| `status` | String | Request status ("success" or "error") |
| `data` | Object | Response data container |
| `data.post_id` | Integer | ID of moderated post |
| `data.new_status` | Integer | New post status after moderation |
| `data.action_taken` | String | Action that was performed |
| `data.moderated_by` | Object | Admin user who performed action |

**Response Error Codes:**

| Status | Error Message | Cause | Solution |
|--------|---------------|-------|----------|
| **400** | `"Invalid parameters"` | Missing required fields | Check request parameters |
| **403** | `"Admin access required"` | User not admin | Must be admin user |
| **404** | `"Post not found"` | Invalid post_id | Verify post exists |
| **409** | `"Post already moderated"` | Post status is not -1 | Post already processed |
| **500** | `"Internal server error"` | Database error | Check server logs |

**Example Response:**

```json
{
  "status": "success",
  "data": {
    "post_id": 123,
    "new_status": 0,
    "action_taken": "approved",
    "moderated_by": {
      "id": 1,
      "name": "admin_user",
      "role": "admin"
    },
    "moderated_at": "2025-01-15T14:30:00Z",
    "reason": "Content meets community guidelines"
  }
}
```

---

## Bulk Moderation Actions

### `POST /admin/forum/moderate/bulk`

Perform moderation actions on multiple posts simultaneously for efficient queue management.

**Admin Authentication:** Required (status = 87)

**Parameters:**

| Name | Type | Description | Required |
|------|------|-------------|----------|
| `user_id` | Integer | Admin user ID for authentication | Yes |
| `items` | Array | Array of moderation items | Yes |
| `global_reason` | String | Reason applied to all items | No |

**Moderation Item Structure:**

| Field | Type | Description | Required |
|-------|------|-------------|----------|
| `post_id` | Integer | ID of post to moderate | Yes |
| `post_type` | String | "topic" or "reply" | Yes |
| `action` | String | "approve" or "reject" | Yes |
| `reason` | String | Individual reason (overrides global) | No |

**Example Request:**

```bash
curl -X POST http://localhost:10000/admin/forum/moderate/bulk \
  -H "Content-Type: application/json" \
  -H "X-Timestamp: 1672531200000" \
  -H "X-Signature: a1b2c3d4e5f6..." \
  -H "X-Session-Token: optional-uuid-token" \
  -d '{
    "user_id": 123,
    "items": [
      {
        "post_id": 123,
        "post_type": "topic",
        "action": "approve"
      },
      {
        "post_id": 124,
        "post_type": "reply",
        "action": "reject",
        "reason": "Spam content"
      },
      {
        "post_id": 125,
        "post_type": "topic",
        "action": "approve"
      }
    ],
    "global_reason": "Batch moderation - content review complete"
  }'
```

**Response Structure:**

| Field | Type | Description |
|-------|------|-------------|
| `status` | String | Request status ("success" or "error") |
| `data` | Object | Response data container |
| `data.results` | Array | Results for each moderated item |
| `data.summary` | Object | Summary statistics |

**Example Response:**

```json
{
  "status": "success",
  "data": {
    "results": [
      {
        "post_id": 123,
        "success": true,
        "new_status": 0,
        "action": "approved"
      },
      {
        "post_id": 124,
        "success": true,
        "new_status": 1,
        "action": "rejected"
      },
      {
        "post_id": 125,
        "success": true,
        "new_status": 0,
        "action": "approved"
      }
    ],
    "summary": {
      "total_processed": 3,
      "successful": 3,
      "failed": 0,
      "approved": 2,
      "rejected": 1
    },
    "moderated_by": {
      "id": 1,
      "name": "admin_user"
    },
    "moderated_at": "2025-01-15T14:45:00Z"
  }
}
```

---

## Forum Analytics & Statistics

### `GET /admin/forum/analytics`

Get comprehensive forum analytics and moderation statistics for admin dashboard.

**Admin Authentication:** Required (status = 87)

**Query Parameters:**

| Name | Type | Description | Required | Default |
|------|------|-------------|----------|---------|
| `period` | String | "today", "week", "month", "all" | No | "week" |
| `metrics` | String | Comma-separated: "moderation,engagement,users" | No | "all" |

**Example Request:**

```bash
curl -X GET "http://localhost:10000/admin/forum/analytics?period=week&metrics=moderation,engagement" \
  -H "Content-Type: application/json" \
  -H "X-Timestamp: 1672531200000" \
  -H "X-Signature: a1b2c3d4e5f6..." \
  -H "X-Session-Token: optional-uuid-token" \
  -d '{"user_id": 123}'
```

**Example Response:**

```json
{
  "status": "success",
  "data": {
    "period": "week",
    "moderation_stats": {
      "total_moderated": 156,
      "approved": 134,
      "rejected": 22,
      "pending": 47,
      "average_response_time_hours": 2.3,
      "top_moderators": [
        {
          "admin_id": 1,
          "name": "admin_user",
          "actions_count": 89
        }
      ]
    },
    "engagement_stats": {
      "new_topics": 89,
      "new_replies": 234,
      "total_likes": 456,
      "active_users": 78,
      "most_active_categories": [
        {
          "category": "Smart Home",
          "posts": 45
        },
        {
          "category": "Security",
          "posts": 23
        }
      ]
    },
    "generated_at": "2025-01-15T15:00:00Z"
  }
}
```

---

## Quick Stats Dashboard

### `GET /admin/forum/stats`

Get real-time forum statistics for admin dashboard widgets and notifications.

**Admin Authentication:** Required (status = 87)

**Parameters:** None

**Example Request:**

```bash
curl -X GET http://localhost:10000/admin/forum/stats \
  -H "Content-Type: application/json" \
  -H "X-Timestamp: 1672531200000" \
  -H "X-Signature: a1b2c3d4e5f6..." \
  -H "X-Session-Token: optional-uuid-token" \
  -d '{"user_id": 123}'
```

**Example Response:**

```json
{
  "status": "success",
  "data": {
    "pending_review": {
      "total": 47,
      "topics": 23,
      "replies": 24,
      "urgent": 3
    },
    "recent_activity": {
      "last_24h": {
        "new_posts": 34,
        "moderated": 28,
        "user_signups": 5
      }
    },
    "queue_health": {
      "average_wait_time_hours": 2.5,
      "oldest_pending_hours": 8.2,
      "status": "healthy"
    },
    "last_updated": "2025-01-15T15:00:00Z"
  }
}
```

---

## Enhanced User Identification

### Updated Forum Response Format

All existing forum endpoints now include enhanced user information for admin badge display:

**Enhanced Author Object:**

```json
{
  "author": {
    "id": 1,
    "name": "admin_user",
    "role": "admin",        // "user" or "admin"
    "is_admin": true,       // Boolean for easy client checks
    "status": 87            // Raw status value
  }
}
```

This enhancement applies to:

- `GET /api/forum/topics`
- `GET /api/forum/topics/:id`
- `GET /api/forum/topics/:id/replies`
- All other forum endpoints returning user information

---

## Security & Audit Features

### Admin Action Logging

All admin moderation actions are automatically logged with:

- Admin user ID and name
- Action performed (approve/reject/bulk)
- Target post ID and type
- Timestamp and reason
- IP address and session info

### Permission Validation

- **Route Level**: All `/admin/forum/*` routes require admin status
- **Action Level**: Each moderation action validates admin permissions
- **Audit Trail**: Failed admin access attempts are logged

### Rate Limiting

Admin endpoints have enhanced rate limits:

- Review queue: 100 requests per 15 minutes
- Individual moderation: 500 actions per 15 minutes  
- Bulk moderation: 50 requests per 15 minutes
- Analytics: 20 requests per 15 minutes

---
