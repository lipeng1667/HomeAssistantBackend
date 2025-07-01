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

## Data Types Summary

| Data Type | Keys | Purpose |
|-----------|------|---------|
| INTEGER | requests:*, errors:* | Counters and totals |
| SORTED SET | rate_limit:*, sliding_limit:* | Rate limiting |

## TTL (Time To Live) Policies

| Key Pattern | TTL | Reason |
|-------------|-----|--------|
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

- **Rate limiting**: Auto-expire based on window size
- **Core counters**: Persistent (no automatic cleanup)

## Redis Commands Used

- `INCR`, `INCRBY` - Counter increments
- `ZADD`, `ZCARD`, `ZRANGE` - Sorted set operations
- `ZREMRANGEBYSCORE` - Rate limit cleanup
- `EXPIRE` - TTL management
- `MULTI`, `EXEC` - Atomic transactions

## Example Usage

```javascript
// Increment request counter
await client.incrBy('ha:requests:total', 1)
await client.incrBy('ha:requests:endpoint:GET /api/users', 1)

// Rate limiting check
await client.zAdd('ha:rate_limit:192.168.1.100', {
  score: Date.now(),
  value: Date.now().toString()
})

// Get metrics
const totalRequests = await client.get('ha:requests:total')
const totalErrors = await client.get('ha:errors:total')
```

This schema enables comprehensive monitoring and analytics across distributed PM2 instances while maintaining optimal performance and memory usage.
