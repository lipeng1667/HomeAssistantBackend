# APP : Admin API

Handles admin-only operations and role-based access control.

## Authentication & Authorization

All admin endpoints require:

1. **User Authentication**: Valid user session (same as regular API)
2. **Admin Role**: User must have status = 87 (admin)

**Admin Authentication Headers:**

- All standard authentication headers (see api_table.md)
- User must be logged in with admin status

## User Status Values

| Status | Role | Description |
|--------|------|-------------|
| `-1` | Deleted | Soft-deleted user (excluded from queries) |
| `0` | Normal User | Regular application user |
| `87` | Admin | Administrator with full system access |

## Admin Dashboard

### `GET /admin/dashboard`

Get admin dashboard overview with system metrics and quick stats.

**Admin Authentication:** Required (status = 87)

**Parameters:** None

**Example Request:**

```bash
curl -X GET http://localhost:10000/admin/dashboard \
  -H "Content-Type: application/json" \
  -H "X-Timestamp: 1672531200000" \
  -H "X-Signature: a1b2c3d4e5f6..." \
  -H "Authorization: Bearer user_session_token"
```

**Response Structure:**

| Field | Type | Description |
|-------|------|-------------|
| `status` | String | Request status ("success" or "error") |
| `data` | Object | Dashboard data container |
| `data.admin_user` | Object | Current admin user info |
| `data.available_features` | Array | List of admin features available |

**Response Error Codes:**

| Status | Error Message | Cause | Solution |
|--------|---------------|-------|----------|
| **401** | `"Authentication required"` | User not logged in | Login first |
| **403** | `"Admin access required"` | User status is not 87 | Must be admin user |
| **500** | `"Internal server error"` | Database or system error | Check server logs |

**Example Responses:**

**Success (200)**:

```json
{
  "status": "success",
  "data": {
    "admin_user": {
      "id": 1,
      "username": "admin_user",
      "status": 87
    },
    "available_features": [
      "User Management",
      "Content Moderation",
      "System Metrics",
      "Analytics & Reporting"
    ]
  }
}
```

**Error (403)**:

```json
{
  "status": "error",
  "message": "Admin access required"
}
```

## Admin Profile

### `GET /admin/profile`

Get current admin user profile and permissions.

**Admin Authentication:** Required (status = 87)

**Parameters:** None

**Example Request:**

```bash
curl -X GET http://localhost:10000/admin/profile \
  -H "Content-Type: application/json" \
  -H "X-Timestamp: 1672531200000" \
  -H "X-Signature: a1b2c3d4e5f6..." \
  -H "Authorization: Bearer user_session_token"
```

**Response Structure:**

| Field | Type | Description |
|-------|------|-------------|
| `status` | String | Request status ("success" or "error") |
| `data` | Object | Profile data container |
| `data.id` | Integer | Admin user ID |
| `data.username` | String | Admin username |
| `data.status` | Integer | User status (87 for admin) |
| `data.role` | String | Role name ("admin") |
| `data.permissions` | Array | List of admin permissions |

**Example Response:**

**Success (200)**:

```json
{
  "status": "success",
  "data": {
    "id": 1,
    "username": "admin_user",
    "status": 87,
    "role": "admin",
    "permissions": [
      "user_management",
      "content_moderation",
      "system_administration",
      "analytics_access"
    ]
  }
}
```

## Admin Permissions

Admin users (status = 87) have access to:

### User Management

- View all users (including deleted)
- Delete/restore users
- Change user status
- View user activity logs
- Mass user operations

### Content Moderation

- Review pending forum posts (status = -1)
- Delete inappropriate content
- Manage forum categories
- Content analytics dashboard

### System Administration

- Server metrics and monitoring
- Database statistics
- File upload management
- System configuration

### Analytics & Reporting

- User engagement metrics
- Content statistics
- Performance monitoring
- Export data reports

## Security Features

### Audit Logging

All admin actions are automatically logged with:

- Admin user ID
- Action performed
- Target resource type and ID
- Timestamp and additional details
- IP address and route accessed

### Permission Checks

- **Explicit Status Validation**: Only status = 87 users can access admin routes
- **Route-Level Protection**: Each admin route validates admin status
- **Action Logging**: All admin operations are tracked for audit
- **Unauthorized Access Tracking**: Failed admin access attempts are logged

### Future Admin Levels

The system is designed to support additional admin levels:

- `50` = Moderator (content moderation only)
- `87` = Admin (full system access)
- `99` = Super Admin (future use)

## Implementation Notes

### Client-Side Integration

The login response now includes the `status` field:

```json
{
  "data": {
    "user": {
      "id": 1,
      "name": "username",
      "status": 87
    }
  }
}
```

Apps can check `user.status === 87` to show/hide admin features.

### Route Protection Pattern

Admin routes use the following middleware pattern:

```javascript
// Require admin status for route access
router.use('/admin', requireAdmin);

// Allow admin or resource owner
router.put('/users/:id', requireAdminOrOwner('id'));

// Check specific admin permissions
router.get('/admin/metrics', checkAdminPermission('analytics'));
```

---
