# Redis Schema Documentation

**File:** redis-schema.md  
**Description:** Complete Redis key structure and data types for Home Assistant Backend  
**Author:** Michael Lee  
**Created:** 2025-06-27  
**Modified:** 2025-06-27  

This document describes the Redis key namespace, data types, and structure used by the Home Assistant Backend for distributed metrics collection, rate limiting, and caching across PM2 cluster instances.

## Key Prefix

All Redis keys use the configurable prefix: `ha:` (default)  
Environment variable: `REDIS_KEY_PREFIX=ha:`

## Key Summary Table

| Key Pattern | Data Type | TTL | Description |
|-------------|-----------|-----|-------------|
| `ha:connections:http:current` | INTEGER | None | Current active HTTP connections |
| `ha:connections:http:max_since_startup` | INTEGER | None | Maximum HTTP connections since startup |
| `ha:requests:accepted` | INTEGER | None | Total accepted requests |
| `ha:requests:total` | INTEGER | None | Total requests across all instances |
| `ha:requests:speed_per_second` | INTEGER | None | Current request processing speed |
| `ha:requests:max_speed_per_second` | INTEGER | None | Maximum request processing speed |
| `ha:requests:endpoint:{METHOD path}` | INTEGER | None | Request count per endpoint |
| `ha:errors:total` | INTEGER | None | Total errors across all instances |
| `ha:errors:endpoint:{METHOD path}` | INTEGER | None | Error count per endpoint |
| `ha:rate_limit:{identifier}` | SORTED SET | Variable | Fixed window rate limiting |
| `ha:sliding_limit:{identifier}` | SORTED SET | Variable | Sliding window rate limiting |
| `ha:user:{user_id}` | HASH | 7d | Complete user data (device_id, login_time, last_seen, active) |

## Data Categories

### 1. Request Metrics

```redis
ha:connections:http:current            → INTEGER
# Current number of active HTTP connections
# In short, count_http is a simple counter that goes up with each new connection and down with each closed connection, providing a real-time count of active HTTP connections.

ha:connections:http:max_since_startup  → INTEGER
# Maximum number of HTTP connections since the program started.

ha:requests:accepted                   → INTEGER
# Total number of accepted requests, exclude the requests are refused 

ha:requests:total                       → INTEGER
# Total requests across all instances and endpoints
# Incremented on each non-localhost request
# Never expires

ha:requests:speed_per_second           → INTEGER
# Current request processing speed in requests per second.

ha:requests:max_speed_per_second       → INTEGER
# Maximum request processing speed achieved since startup.
```

#### Per-Endpoint Counters

```redis
ha:requests:endpoint:{METHOD path}   → INTEGER
# Request count for specific endpoint
# Examples:
#   ha:requests:endpoint:GET /api/users
#   ha:requests:endpoint:POST /api/auth/login
#   ha:requests:endpoint:PUT /api/forum/questions/123
# Never expires
```

### 2. Error Tracking

#### Global Error Counters

```redis
ha:errors:total                      → INTEGER
# Total errors (4xx/5xx responses) across all instances
# Incremented on HTTP status >= 400
# Never expires
```

#### Per-Endpoint Error Counters

```redis
ha:errors:endpoint:{METHOD path}     → INTEGER
# Error count for specific endpoint
# Examples:
#   ha:errors:endpoint:GET /api/users
#   ha:errors:endpoint:POST /api/auth/login
# Never expires
```

### 3. Distributed Rate Limiting

#### Fixed Window Rate Limiting

```redis
ha:rate_limit:{identifier}           → SORTED SET (TTL: windowMs/1000)
# Stores request timestamps within rate limit window
# Score: timestamp (Date.now())
# Value: timestamp string
# identifier = keyGenerator(req) (usually req.ip)
# Examples:
#   ha:rate_limit:192.168.1.100
#   ha:rate_limit:user:123
# TTL matches rate limit window (e.g., 900s for 15min window)
```

#### Sliding Window Rate Limiting

```redis
ha:sliding_limit:{identifier}        → SORTED SET (TTL: windowMs/1000)
# Stores request timestamps for sliding window calculation
# Score: timestamp (Date.now())
# Value: unique identifier string (timestamp + random)
# More precise than fixed window limiting
# Examples:
#   ha:sliding_limit:192.168.1.100
# TTL matches rate limit window
```

### 4. User Management

#### User Data and Session

```redis
ha:user:{user_id}                    → HASH (TTL: 604800s = 7d)
# Stores complete user information including session and status
# Fields:
#   device_id: Device identifier from login
#   login_time: Unix timestamp when session was created
#   last_seen: Unix timestamp of last API request
#   status: User status ('anonymous'/'login'/'blocked')
#   ip_address: Client IP address (optional)
# Examples:
#   HSET ha:user:123 device_id "iPhone_12_ABC123"
#   HSET ha:user:123 login_time "1672531200000"
#   HSET ha:user:123 last_seen "1672531800000"
#   HSET ha:user:123 status "login"
#   HSET ha:user:123 ip_address "192.168.1.100"
# 
# Session Management:
#   - Automatically expires after 7 days of inactivity
#   - TTL is refreshed on each API request
#   - Can be manually deleted for instant logout
#
# Status Control:
#   - status="login": Full access
#   - status="anonymous": User can access APIs, but only VIEW, can not create topics or chat with admin
#   - status="blocked": User is blocked (even with valid session)
#   - Instant user control without waiting for session expiry
```

## Data Types Summary

| Data Type | Keys | Purpose |
|-----------|------|---------|
| INTEGER | requests:*, errors:* | Counters and totals |
| SORTED SET | rate_limit:*, sliding_limit:* | Rate limiting |
| HASH | user:* | Complete user data and session storage |

## TTL (Time To Live) Policies

| Key Pattern | TTL | Reason |
|-------------|-----|--------|
| rate_limit:* | Variable (window size) | Rate limit window management |
| sliding_limit:* | Variable (window size) | Sliding window management |
| user:* | 604800s (7d) | User session timeout and auto-cleanup |
| All others | None (persistent) | Core metrics preservation |

## Key Naming Conventions

1. **Colon separation** for hierarchy: `category:subcategory:identifier`
2. **Lowercase with underscores** for multi-word keys: `response_times`
3. **Method and path encoding** for endpoints: `GET_/api/users` or `GET /api/users`
4. **Timestamp-based** for time-series: Unix timestamp in milliseconds
5. **Configurable prefix** for namespace isolation: `ha:` (default)

## Memory Considerations

- **Rate limiting**: Auto-expire based on window size
- **User data**: Auto-expire after 7 days of inactivity
- **Core counters**: Persistent (no automatic cleanup)
- **Single hash per user**: Efficient memory usage vs separate keys

## Redis Commands Used

- `INCR`, `INCRBY` - Counter increments
- `ZADD`, `ZCARD`, `ZRANGE` - Sorted set operations
- `ZREMRANGEBYSCORE` - Rate limit cleanup
- `HSET`, `HGET`, `HGETALL` - Hash field operations
- `SET`, `GET` - String operations
- `EXPIRE` - TTL management
- `MULTI`, `EXEC` - Atomic transactions

## Example Usage

```javascript
// Create user session on login
await client.hSet('ha:user:123', {
  device_id: 'iPhone_12_ABC123',
  login_time: Date.now().toString(),
  last_seen: Date.now().toString(),
  active: 'true',
  ip_address: '192.168.1.100'
})
await client.expire('ha:user:123', 604800) // 7 days

// Validate user on API request
const user = await client.hGetAll('ha:user:123')
if (!user.device_id) {
  return 'Session expired'
}
if (user.active !== 'true') {
  return 'User disabled'
}

// Update last seen and refresh TTL
await client.multi()
  .hSet('ha:user:123', 'last_seen', Date.now().toString())
  .expire('ha:user:123', 604800)
  .exec()

// Disable user instantly
await client.hSet('ha:user:123', 'active', 'false')

// Logout user (delete session)
await client.del('ha:user:123')

// Increment request counter
await client.incrBy('ha:requests:total', 1)
await client.incrBy('ha:requests:endpoint:GET /api/forum/questions', 1)
```

This schema enables comprehensive monitoring and analytics across distributed PM2 instances while maintaining optimal performance and memory usage.
