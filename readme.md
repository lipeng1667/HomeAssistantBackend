# Home Assistant Platform Backend

A robust backend system for the Home Assistant Platform, providing APIs for user authentication, forum management, real-time chat, and admin functionality.

## Features

- **App-Level Authentication** (iOS client validation with HMAC signatures)
- **User Authentication** (Anonymous, device-based login)
- **Forum System** (Questions and Replies)
- **Instant Messaging System** (User-to-Admin)
- **Activity Logging** with comprehensive audit trails
- **Admin Panel** with role-based access control
- **Redis-based Distributed Metrics** across PM2 cluster instances
- **Advanced Rate Limiting** with Redis-backed cluster coordination
- **Real-time Performance Monitoring** with connection tracking
- **CLI Dashboard** for comprehensive system monitoring
- **Database Optimization** with connection pooling
- **Service Layer Architecture** with clean separation of concerns

## Architecture

The backend follows a **layered architecture** pattern with clear separation of concerns:

### 🏗️ Service Layer Pattern

- **Routes**: Thin HTTP controllers handling request/response
- **Services**: Business logic and data access operations  
- **Middleware**: Authentication, validation, rate limiting
- **Config**: Centralized configuration management

### 📂 Directory Structure

```text
├── routes/           # HTTP endpoint handlers
├── services/         # Business logic layer
├── middleware/       # Request processing middleware
├── config/           # Configuration and connections
├── logs/             # Application logs
└── database.sql      # Database schema
```

### 🔄 Request Flow

```text
HTTP Request → Middleware → Routes → Services → Database/Redis
```

This architecture ensures:

- **Testability**: Business logic isolated from HTTP concerns
- **Maintainability**: Clear separation of responsibilities  
- **Reusability**: Services can be used across multiple routes
- **Scalability**: Easy to modify or extend individual layers

## Prerequisites

- **Node.js** (v14 or higher)
- **MariaDB** (v10.5 or higher)
- **Redis** (v6.0 or higher) - for distributed metrics and rate limiting
- **PM2** (recommended for production) - for process management
- **npm** or yarn

## Local Development Setup

1.Clone the repository:

```bash
git clone [repository-url]
cd HomeAssistantBackend
```

2.Install dependencies:

```bash
npm install
```

3.Create a `.env` file based on `.env.example`:

```bash
cp .env.example .env
```

4.Configure your environment variables in `.env`:

```env
# Server Configuration
PORT=10000
NODE_ENV=development
HOST=0.0.0.0

# Database Configuration
DB_HOST=localhost
DB_USER=your_db_user
DB_PASSWORD=your_db_password
DB_NAME=home_assistant

# Redis Configuration (Optional - will use defaults if not set)
REDIS_HOST=127.0.0.1
REDIS_PORT=6379
REDIS_PASSWORD=
REDIS_DB=0
REDIS_KEY_PREFIX=ha:

# iOS App Authentication
IOS_APP_SECRET=your_very_secure_ios_app_secret_32chars_min
TIMESTAMP_WINDOW_MS=300000

# Rate Limiting
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100
RATE_LIMIT_AUTH_MAX=5

# Logging
LOG_LEVEL=info
LOG_FORMAT=combined
```

5.Install and start MariaDB and Redis:

```bash
# For macOS
brew install mariadb redis
brew services start mariadb
brew services start redis

# For Ubuntu/Debian
sudo apt update
sudo apt install mariadb-server redis-server
sudo systemctl start mariadb
sudo systemctl start redis-server
sudo systemctl enable mariadb
sudo systemctl enable redis-server

# For Windows
# Download MariaDB from https://mariadb.org/download/
# Download Redis from https://redis.io/download
```

6.Set up the database:

```bash
# Create database and user
sudo mariadb
CREATE DATABASE HomeAssistant;
CREATE USER 'your_db_user'@'localhost' IDENTIFIED BY 'your_db_password';
GRANT ALL PRIVILEGES ON HomeAssistant.* TO 'your_db_user'@'localhost';
FLUSH PRIVILEGES;
exit;

# Import schema
mariadb -u your_db_user -p HomeAssistant < database.sql
```

7.Start the development server:

```bash
npm run dev
```

## Remote Server Deployment

1.SSH into your remote server:

```bash
ssh user@your-server-ip
```

2.Install Node.js, MariaDB, and Redis if not already installed:

```bash
# For Ubuntu/Debian
sudo apt update
sudo apt install nodejs npm mariadb-server redis-server
sudo systemctl enable mariadb redis-server

# For CentOS/RHEL
sudo yum install nodejs npm mariadb-server redis
sudo systemctl enable mariadb redis
```

3.Start and secure MariaDB and Redis:

```bash
# Start services
sudo systemctl start mariadb redis-server
sudo systemctl enable mariadb redis-server

# Secure MariaDB
sudo mysql-secure-installation

# Configure Redis (optional, for production)
sudo nano /etc/redis/redis.conf
# Set: requirepass your_redis_password
# Set: bind 127.0.0.1
sudo systemctl restart redis-server
```

4.Clone the repository:

```bash
git clone [repository-url]
cd HomeAssistantBackend
```

5.Install dependencies:

```bash
npm install
```

6.Create and configure `.env` file:

```bash
cp .env.example .env
nano .env  # Edit with your production settings
```

7.Set up the database:

```bash
mariadb -u your_db_user -p your_db_name < database.sql
```

8.Start the production server:

```bash
npm start
```

### Using PM2 for Process Management

For better process management in production:

1.Install PM2 globally:

```bash
npm install -g pm2
```

2.Start the application with PM2:

```bash
# Using ecosystem config (recommended)
npm run pm2:start

# Or directly
pm2 start ecosystem.config.js
```

3.Other useful PM2 commands:

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

### Dashboard Features

📊 **Real-time application status monitoring** with Redis-based cluster metrics

Start the CLI dashboard:

```bash
npm run dashboard
```

## API Documentation

The API documentation is available in JSDoc format. To generate HTML documentation:

```bash
npm install -g jsdoc
jsdoc -c jsdoc.json
```

## App Authentication

The backend implements **app-level authentication** to ensure requests originate from authorized iOS clients before processing user authentication.

### How It Works

1. **Client generates signature**: `HMAC-SHA256(ios_secret, timestamp + device_id)`
2. **Required headers** on authentication requests:
   - `X-App-Type: ios`
   - `X-Timestamp: {unix_timestamp_ms}`
   - `X-Signature: {hmac_hex_signature}`
3. **Server validates**: timestamp window (±5 minutes) and signature
4. **Prevents**: unauthorized access from unknown sources and replay attacks

### iOS Client Implementation

```swift
// Generate timestamp and signature
let timestamp = String(Int64(Date().timeIntervalSince1970 * 1000))
let payload = "\(timestamp)\(deviceId)"
let signature = payload.hmacSHA256(key: iosSecret)

// Add headers to request
request.setValue("ios", forHTTPHeaderField: "X-App-Type")
request.setValue(timestamp, forHTTPHeaderField: "X-Timestamp")
request.setValue(signature, forHTTPHeaderField: "X-Signature")
```

### Security Features

- **HMAC-SHA256** signature validation
- **Timestamp-based** replay attack prevention
- **Constant-time** signature comparison
- **5-minute window** for clock drift tolerance

## Security Considerations

1. **Always use HTTPS in production**
2. **Secure your iOS app secret** - never expose in client code, use secure key storage
3. **Secure your Redis instance** with authentication and network restrictions
4. **Regularly update dependencies** and security patches
5. **Monitor rate limiting** and adjust thresholds as needed
6. **Keep MariaDB and Redis servers secure** and updated
7. **Regularly backup your database** and Redis data if persistence is enabled
8. **Use strong passwords** for database and Redis authentication
9. **Implement network firewalls** to restrict database and Redis access
10. **Monitor application metrics** for unusual patterns or attacks

### Redis Security

- Use Redis password authentication in production
- Bind Redis to localhost or private networks only
- Consider Redis ACLs for fine-grained access control
- Monitor Redis memory usage and set appropriate limits

### Redis Persistence Configuration

For production deployments, configure Redis persistence to prevent data loss:

1.**Edit Redis configuration**:

```bash
sudo vim /etc/redis/redis.conf
```

2.**Configure RDB persistence** (recommended for session data):

```bash
# Point-in-time snapshots
# Save if at least 1 key changed in 900 seconds
save 900 1
# Save if at least 10 keys changed in 300 seconds
save 300 10
# Save if at least 10000 keys changed in 60 seconds
save 60 10000

# RDB settings
stop-writes-on-bgsave-error yes
rdbcompression yes
rdbchecksum yes
dbfilename dump.rdb
dir /var/lib/redis/

# Disable AOF (if using RDB only)
appendonly no
```

3.**Test configuration**:

```bash
sudo redis-server /etc/redis/redis.conf --test-config
```

4.**Restart Redis**:

```bash
sudo systemctl restart redis-server
```

5.**Verify persistence**:

```bash
redis-cli CONFIG GET save
redis-cli LASTSAVE
```

**Note**: Comments must be on separate lines, not inline with `save` directives to avoid syntax errors.

### Database Backup Configuration

For production deployments, set up automated MariaDB backups to prevent data loss:

**Backup script location**:

```bash
scripts/backup-database.sh
```

**Configure backup credentials** in the script:

```bash
DB_USER="your_db_user"
DB_PASSWORD="your_db_password"
DB_NAME="HomeAssistant"
DB_HOST="127.0.0.1"
```

**Create backup directories**:

```bash
sudo mkdir -p /var/backups/homeassistant
sudo chown $USER:$USER /var/backups/homeassistant
```

**Make script executable**:

```bash
chmod +x scripts/backup-database.sh
```

**Test backup manually**:

```bash
./scripts/backup-database.sh
```

**Set up automated daily backups with crontab**:

```bash
crontab -e
```

Add this line for daily backup at 2 AM:

```bash
0 2 * * * /path/to/HomeAssistantBackend/scripts/backup-database.sh
```

**Backup Features**:

- **Compression**: Gzip compression for space efficiency
- **Rotation**: Keeps 7 daily backups, 4 weekly backups
- **Weekly backups**: Automatic weekly backup creation on Sundays
- **Logging**: Comprehensive logging to `/var/log/homeassistant-backup.log`
- **Error handling**: Proper error detection and reporting

**Backup locations**:

- Daily: `/var/backups/homeassistant/homeassistant_backup_YYYYMMDD_HHMMSS.sql.gz`
- Weekly: `/var/backups/homeassistant/weekly/homeassistant_weekly_YYYYMMDD.sql.gz`

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
- 🏗️ **Service Layer Architecture** with business logic separation

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

See `API_Reference.md` for API endpoints information.

---

## 🚧 Development Notes

- Make sure to load `database.sql` to set up schema
- Use Postman or Swagger for API testing
- Use `.env` file to manage secrets (DB credentials)

## 🔧 Redis Metrics Architecture

This application uses Redis for distributed metrics collection across PM2 cluster instances:

### Key Benefits

- **Cluster-wide visibility**: Metrics aggregated across all PM2 instances
- **Real-time performance monitoring**: Connection tracking, request speeds, error rates
- **Persistent metrics**: Data survives server restarts and deployments
- **Scalable architecture**: Supports horizontal scaling with consistent metrics

### Metrics Collected

- **HTTP Connections**: Current active connections and maximum since startup
- **Request Processing**: Total, accepted, and error requests with rates
- **Performance Speed**: Current and maximum requests per second
- **Endpoint Analytics**: Per-route request counts and error rates
- **Time-series Data**: Hourly aggregations for trending analysis
- **Response Times**: Percentile calculations for performance analysis

### Redis Key Schema

See `redis-schema.md` for complete documentation of Redis keys and data structures.

---
