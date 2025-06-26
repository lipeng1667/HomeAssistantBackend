# Home Assistant Platform Backend

A robust backend system for the Home Assistant Platform, providing APIs for user authentication, forum management, real-time chat, and admin functionality.

## Features

- User Authentication (Anonymous, device-based login)
- Forum System (Questions and Replies)
- Instant Messaging System (User-to-Admin)
- Activity Logging
- Admin Panel
- Secure API Endpoints
- Rate Limiting
- Database Optimization

## Prerequisites

- Node.js (v14 or higher)
- MariaDB (v10.5 or higher)
- npm or yarn

## Local Development Setup

1. Clone the repository:

```bash
git clone [repository-url]
cd HomeAssistantBackend
```

2. Install dependencies:

```bash
npm install
```

3. Create a `.env` file based on `.env.example`:

```bash
cp .env.example .env
```

4. Configure your environment variables in `.env`:

```env
# Server Configuration
PORT=10000
NODE_ENV=development

# Database Configuration
DB_HOST=localhost
DB_USER=your_db_user
DB_PASSWORD=your_db_password
DB_NAME=home_assistant

# JWT Configuration
JWT_SECRET=your_jwt_secret
JWT_ADMIN_SECRET=your_admin_jwt_secret

# Rate Limiting
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100
```

5. Install and start MariaDB:

```bash
# For macOS
brew install mariadb
brew services start mariadb

# For Ubuntu/Debian
sudo apt update
sudo apt install mariadb-server
sudo systemctl start mariadb

# For Windows
# Download and install from https://mariadb.org/download/
```

6. Set up the database:

```bash
# Create database and user
sudo mariadb
CREATE DATABASE home_assistant;
CREATE USER 'your_db_user'@'localhost' IDENTIFIED BY 'your_db_password';
GRANT ALL PRIVILEGES ON home_assistant.* TO 'your_db_user'@'localhost';
FLUSH PRIVILEGES;
exit;

# Import schema
mariadb -u your_db_user -p home_assistant < database.sql
```

7. Start the development server:

```bash
npm run dev
```

## Remote Server Deployment

1. SSH into your remote server:

```bash
ssh user@your-server-ip
```

2. Install Node.js and MariaDB if not already installed:

```bash
# For Ubuntu/Debian
sudo apt update
sudo apt install nodejs npm mariadb-server

# For CentOS/RHEL
sudo yum install nodejs npm mariadb-server
```

3. Start and secure MariaDB:

```bash
# Start MariaDB service
sudo systemctl start mariadb
sudo systemctl enable mariadb

# Run security script
sudo mysql-secure-installation
```

4. Clone the repository:

```bash
git clone [repository-url]
cd HomeAssistantBackend
```

5. Install dependencies:

```bash
npm install
```

6. Create and configure `.env` file:

```bash
cp .env.example .env
nano .env  # Edit with your production settings
```

7. Set up the database:

```bash
mariadb -u your_db_user -p your_db_name < database.sql
```

8. Start the production server:

```bash
npm start
```

### Using PM2 for Process Management

For better process management in production:

1. Install PM2 globally:

```bash
npm install -g pm2
```

2. Start the application with PM2:

```bash
# Using ecosystem config (recommended)
npm run pm2:start

# Or directly
pm2 start ecosystem.config.js
```

3. Other useful PM2 commands:

```bash
npm run pm2:status                    # Check application status
npm run pm2:restart                   # Restart application
npm run pm2:stop                      # Stop application
npm run pm2:delete                    # Remove from PM2

# Or using PM2 directly
pm2 status                            # Check application status
pm2 logs home-assistant-backend       # View logs
pm2 restart home-assistant-backend    # Restart application
pm2 stop home-assistant-backend       # Stop application
```

## CLI Dashboard

The project includes a comprehensive CLI dashboard for monitoring and managing the backend application.

### Features

- 📊 Real-time application status monitoring
- 📋 Log viewing (combined, output, error, PM2)
- 🔄 Application lifecycle management (start/stop/restart)
- 📈 Performance monitoring with live updates
- 🗑️ Log management and clearing
- 🔧 Configuration viewing

### Usage

1. Install dependencies:

```bash
npm install
```

2. Start the CLI dashboard:

```bash
npm run dashboard
```

3. Use the interactive menu to:
   - View application status and health checks
   - Monitor real-time performance metrics
   - View and manage logs
   - Control application lifecycle
   - View configuration settings

### Dashboard Commands

```bash
# Start dashboard
npm run dashboard

# PM2 Management
npm run pm2:start     # Start with PM2
npm run pm2:stop      # Stop PM2 process
npm run pm2:restart   # Restart PM2 process
npm run pm2:delete    # Remove from PM2
```

## API Documentation

The API documentation is available in JSDoc format. To generate HTML documentation:

```bash
npm install -g jsdoc
jsdoc -c jsdoc.json
```

## Security Considerations

1. Always use HTTPS in production
2. Keep your JWT secrets secure and complex
3. Regularly update dependencies
4. Monitor rate limiting and adjust as needed
5. Keep your MariaDB server secure and updated
6. Regularly backup your database
7. Use strong passwords for database users

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'feat: add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Author

Michael Lee

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

| Method | Endpoint           | Description                            |
| ------ | ------------------ | -------------------------------------- |
| POST   | `/api/auth/login`  | Anonymous login using UUID & device_id |
| POST   | `/api/auth/logout` | End session                            |

### 💬 Forum

| Method | Endpoint                         | Description               |
| ------ | -------------------------------- | ------------------------- |
| GET    | `/api/forum/questions`           | List all questions        |
| POST   | `/api/forum/questions`           | Create a new question     |
| GET    | `/api/forum/questions/:id`       | Get details of a question |
| POST   | `/api/forum/questions/:id/reply` | Post a reply              |

### 📩 Instant Messaging (IM)

| Method | Endpoint             | Description                |
| ------ | -------------------- | -------------------------- |
| GET    | `/api/chat/messages` | Fetch chat history         |
| POST   | `/api/chat/messages` | Send message to admin/user |

### 📊 Logs

| Method | Endpoint             | Description                                |
| ------ | -------------------- | ------------------------------------------ |
| POST   | `/api/logs/activity` | Log user actions (login, navigation, etc.) |

### 🛠️ Admin

| Method | Endpoint                               | Description                       |
| ------ | -------------------------------------- | --------------------------------- |
| POST   | `/api/admin/login`                     | Admin login                       |
| GET    | `/api/admin/forum/questions`           | View all user questions           |
| POST   | `/api/admin/forum/questions/:id/reply` | Admin replies to a forum question |
| GET    | `/api/admin/chat/:user_id/messages`    | View chat with a specific user    |
| POST   | `/api/admin/chat/:user_id/messages`    | Admin sends message to a user     |

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
- [x] Rate limiting and abuse prevention
- [ ] Admin dashboard UI
- [ ] WebSocket support for real-time IM
