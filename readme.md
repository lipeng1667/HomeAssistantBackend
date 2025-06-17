# Home Assistant Platform – Backend Overview

This backend project powers the Home Assistant Platform, which supports an iOS app with anonymous login, a community-style forum, real-time chat (IM), and a web-based admin interface.

---

## 📦 Project Structure

This repository includes:

- 🗄️ **Database Design** (MySQL schema)
- 🛠️ **RESTful API Endpoints** for app and admin
- 🔐 Authentication (Anonymous + Admin login)
- 🧾 User Activity Logging

---

## 🧱 Database Overview

**Main Tables:**

- `users`: stores UUID-based user info and device ID
- `forum_questions`: user-submitted questions
- `forum_replies`: threaded admin/user replies
- `conversations`: IM conversation contexts
- `messages`: real-time chat messages
- `admins`: admin login and role
- `user_logs`: activity tracking (e.g., login, tab visits)

---

## 🌐 API Endpoints

### 🔑 Auth (Anonymous)

| Method | Endpoint             | Description                            |
|--------|----------------------|----------------------------------------|
| POST   | `/api/auth/login`    | Anonymous login using UUID & device_id |
| POST   | `/api/auth/logout`   | End session                            |

### 💬 Forum

| Method | Endpoint                        | Description               |
|--------|----------------------------------|---------------------------|
| GET    | `/api/forum/questions`           | List all questions        |
| POST   | `/api/forum/questions`           | Create a new question     |
| GET    | `/api/forum/questions/:id`       | Get details of a question |
| POST   | `/api/forum/questions/:id/reply` | Post a reply              |

### 📩 Instant Messaging (IM)

| Method | Endpoint              | Description                 |
|--------|------------------------|-----------------------------|
| GET    | `/api/chat/messages`   | Fetch chat history          |
| POST   | `/api/chat/messages`   | Send message to admin/user  |

### 📊 Logs

| Method | Endpoint             | Description              |
|--------|----------------------|--------------------------|
| POST   | `/api/logs/activity` | Log user actions (login, navigation, etc.) |

### 🛠️ Admin

| Method | Endpoint                                 | Description                          |
|--------|-------------------------------------------|--------------------------------------|
| POST   | `/api/admin/login`                        | Admin login                          |
| GET    | `/api/admin/forum/questions`              | View all user questions              |
| POST   | `/api/admin/forum/questions/:id/reply`    | Admin replies to a forum question    |
| GET    | `/api/admin/chat/:user_id/messages`       | View chat with a specific user       |
| POST   | `/api/admin/chat/:user_id/messages`       | Admin sends message to a user        |

---

## 🔐 Security

- JWT-based authentication for admin
- UUID + device_id for stateless anonymous sessions
- Role distinction for user/admin actions
- Foreign key integrity and activity tracking

---

## 🚧 Development Notes

- Make sure to load `database.sql` to set up schema
- Use Postman or Swagger for API testing
- Use `.env` file to manage secrets (JWT keys, DB credentials)

---

## 📌 TODO

- [ ] Rate limiting and abuse prevention
- [ ] Admin dashboard UI
- [ ] WebSocket support for real-time IM
