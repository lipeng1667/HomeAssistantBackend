# ToDo list

2025.06.30

- [x]Security authrozation for each API request
- [x]redis schema review
- [x]logs/access.log logic review
- [x]JWT secret methods needed?
- [x]Reset webservice stat datas when npm run pm2:restart
- [x]modify file name in middleware/auth.js to userAuth.js
- [x]redis persistence
- [x]mariadb cold backup

2025.07.09

- [x]forum endpoints for posts, that's the main feature
- []forum upload file system, web socket system
- [x]image file system design

- []Should there be a limit on drafts per user? (e.g., max 10 drafts)
- []Should drafts auto-expire after a certain time? (e.g., 30 days)
- []Should we allow multiple drafts per topic for replies?

- [] when user edit a topic or reply, change it's status to -1 for review

2025.07.25

## Admin Role System & Enhanced Authentication

### Core Admin Infrastructure

- [x] Update users table status field: -1=deleted, 0=normal, 87=admin
- [x] Update all SQL queries to use 'status >= 0' pattern
- [x] Create adminAuth middleware with role-based access control
- [x] Create permission utilities for scalable admin features
- [x] Enhance login response to include user status and session_token
- [x] Update API documentation for admin endpoints and authentication

### Enhanced Authentication System

- [x] Implement enhanced Redis session structure with user_status and session_token
- [x] Update authService.userLogin to generate and store session tokens
- [x] Update authService.registerUser to generate and store session tokens
- [x] Enhance authenticateUser middleware to handle session tokens
- [x] Create authenticateAdmin middleware with audit logging
- [x] Add session token validation in admin operations

### Forum Admin Features

- [x] Implement review queue API (/admin/forum/review-queue)
- [x] Create individual post moderation API (/admin/forum/moderate)
- [x] Build bulk moderation actions API (/admin/forum/moderate/bulk)
- [x] Add forum analytics and statistics APIs
- [x] Enhance forum responses with admin role identification
- [x] Implement admin action audit logging for all moderation activities

### Admin Route Infrastructure

- [x] Create /routes/admin/forum.js with protected admin routes
- [ ] Implement admin user management APIs (view/delete/restore users)
- [ ] Create admin system metrics and monitoring endpoints

### Documentation & Integration

- [ ] Create admin user guide and API integration examples
- [ ] Update client-side integration documentation
- [ ] Add security best practices guide for admin operations
- [ ] Create admin troubleshooting and monitoring guide

---
