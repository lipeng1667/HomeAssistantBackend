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

#### Per-Instance Counters

```redis
ha:requests:instance:{instanceId}    → INTEGER
# Request count per PM2 instance
# instanceId = process.env.pm_id || `instance-${Date.now()}`
# Examples:
#   ha:requests:instance:0
#   ha:requests:instance:1
#   ha:requests:instance:instance-1672531200000
# Never expires
```

#### Time-Series Data

```redis
ha:requests:hourly:{timestamp}       → INTEGER (TTL: 86400s = 24h)
# Hourly aggregated request counts
# timestamp = Math.floor(Date.now() / 3600000) * 3600000
# Examples:
#   ha:requests:hourly:1672531200000  (2023-01-01 00:00:00 UTC)
#   ha:requests:hourly:1672534800000  (2023-01-01 01:00:00 UTC)
# Automatically expires after 24 hours
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

#### Per-Status Code Counters

```redis
ha:errors:status:{statusCode}        → INTEGER
# Error count by HTTP status code
# Examples:
#   ha:errors:status:400  (Bad Request)
#   ha:errors:status:401  (Unauthorized)
#   ha:errors:status:404  (Not Found)
#   ha:errors:status:500  (Internal Server Error)
# Never expires
```

### 3. Response Time Analytics

#### Response Time Series

```redis
ha:response_times:{endpoint}         → SORTED SET
# Stores recent response times for percentile calculations
# Score: timestamp (Date.now())
# Value: response time in milliseconds
# Examples:
#   ZADD ha:response_times:GET_/api/users 1672531200123 "150"
#   ZADD ha:response_times:POST_/api/auth/login 1672531200456 "89"
# Maintains only last 1000 entries (older entries auto-removed)
# Never expires (managed by ZREMRANGEBYRANK)
```

#### Running Response Time Averages

```redis
ha:avg_response:{endpoint}           → FLOAT
# Running sum of all response times for endpoint
# Used with response_count to calculate average
# Examples:
#   ha:avg_response:GET_/api/users → 15000.5 (sum of all response times)
# Never expires
```

```redis
ha:response_count:{endpoint}         → INTEGER
# Count of recorded response times for endpoint
# Used with avg_response to calculate average
# Examples:
#   ha:response_count:GET_/api/users → 100 (number of requests)
#   Average = 15000.5 / 100 = 150.005ms
# Never expires
```

### 4. Distributed Rate Limiting

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

## Data Types Summary

| Data Type | Keys | Purpose |
|-----------|------|---------|
| INTEGER | requests:*, errors:*, response_count:* | Counters and totals |
| FLOAT | avg_response:* | Response time sums |
| SORTED SET | response_times:*, rate_limit:*, sliding_limit:* | Time-series and rate limiting |

## TTL (Time To Live) Policies

| Key Pattern | TTL | Reason |
|-------------|-----|--------|
| requests:hourly:* | 86400s (24h) | Historical data cleanup |
| rate_limit:* | Variable (window size) | Rate limit window management |
| sliding_limit:* | Variable (window size) | Sliding window management |
| All others | None (persistent) | Core metrics preservation |

## Key Naming Conventions

1. **Colon separation** for hierarchy: `category:subcategory:identifier`
2. **Lowercase with underscores** for multi-word keys: `response_times`
3. **Method and path encoding** for endpoints: `GET_/api/users` or `GET /api/users`
4. **Timestamp-based** for time-series: Unix timestamp in milliseconds
5. **Configurable prefix** for namespace isolation: `ha:` (default)

## Memory Considerations

- **Response times**: Limited to 1000 recent entries per endpoint
- **Hourly metrics**: Auto-expire after 24 hours
- **Rate limiting**: Auto-expire based on window size
- **Core counters**: Persistent (no automatic cleanup)

## Redis Commands Used

- `INCR`, `INCRBY` - Counter increments
- `INCRBY_FLOAT` - Response time sum updates
- `ZADD`, `ZCARD`, `ZRANGE` - Sorted set operations
- `ZREMRANGEBYRANK`, `ZREMRANGEBYSCORE` - Cleanup operations
- `EXPIRE` - TTL management
- `MULTI`, `EXEC` - Atomic transactions

## Example Usage

```javascript
// Increment request counter
await client.incrBy('ha:requests:total', 1)
await client.incrBy('ha:requests:endpoint:GET /api/users', 1)

// Record response time
await client.zAdd('ha:response_times:GET /api/users', {
  score: Date.now(),
  value: "150"
})

// Get metrics
const totalRequests = await client.get('ha:requests:total')
const responseTimes = await client.zRange('ha:response_times:GET /api/users', 0, -1)
```

This schema enables comprehensive monitoring and analytics across distributed PM2 instances while maintaining optimal performance and memory usage.
