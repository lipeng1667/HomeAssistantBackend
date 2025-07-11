# APP : Forum API

Handles forum topics, replies, and community interactions.

## GET /api/forum/topics

Retrieves a paginated list of forum topics with filtering and sorting options.

**App Authentication:** Required (see headers in `api_table.md`)

**Query Parameters:**

| Name | Type | Description | Required | Default |
|---|---|---|---|---|
| `page` | Integer | Page number (1-based) | No | 1 |
| `limit` | Integer | Items per page (1-50) | No | 20 |
| `category` | String | Filter by category | No | All |
| `sort` | String | Sort order: "newest", "oldest", "popular", "trending" | No | "newest" |
| `search` | String | Search in title and content | No | None |

**Example Request:**

```bash
curl -X GET "http://localhost:10000/api/forum/topics?page=1&limit=20&category=Smart&sort=popular" \
  -H "X-Timestamp: 1672531200000" \
  -H "X-Signature: a1b2c3d4e5f6..."
```

**Response Structure:**

| Field | Type | Description |
|-------|------|-------------|
| `status` | String | Request status ("success" or "error") |
| `data` | Object | Response data container |
| `data.topics` | Array | Array of topic objects |
| `data.pagination` | Object | Pagination information |

### Topic Object Structure

| Field | Type | Description |
|-------|------|-------------|
| `id` | Integer | Topic unique ID |
| `title` | String | Topic title |
| `content` | String | Topic content (truncated for list view) |
| `category` | String | Topic category |
| `reply_count` | Integer | Number of replies |
| `like_count` | Integer | Number of likes |
| `status` | Integer | -1 = default(wait for review); 0 = published; 1 = deleted |
| `created_at` | String | ISO timestamp of creation |
| `updated_at` | String | ISO timestamp of last update |

### Pagination Structure

| Field | Type | Description |
|-------|------|-------------|
| `current_page` | Integer | Current page number |
| `total_pages` | Integer | Total number of pages |
| `total_items` | Integer | Total number of topics |
| `has_next` | Boolean | Whether next page exists |
| `has_previous` | Boolean | Whether previous page exists |

**Example Response:**

```json
{
  "status": "success",
  "data": {
    "topics": [
      {
        "id": 1,
        "title": "How to setup motion sensors?",
        "content": "I'm trying to configure motion sensors in my living room...",
        "category": "Smart Home",
        "reply_count": 15,
        "like_count": 8,
        "status": 0,
        "created_at": "2024-01-15T10:30:00Z",
        "updated_at": "2024-01-15T15:45:00Z"
      }
    ],
    "pagination": {
      "current_page": 1,
      "total_pages": 5,
      "total_items": 95,
      "has_next": true,
      "has_previous": false
    }
  }
}
```

## GET /api/forum/topics/:id

Retrieves detailed information about a specific topic including replies.

**App Authentication:** Required (see headers in `api_table.md`)

**Path Parameters:**

| Name | Type | Description | Required |
|---|---|---|---|
| `id` | Integer | Topic ID | Yes |

**Query Parameters:**

| Name | Type | Description | Required | Default |
|---|---|---|---|---|
| `reply_page` | Integer | Reply page number | No | 1 |
| `reply_limit` | Integer | Replies per page (1-50) | No | 20 |

**Example Request:**

```bash
curl -X GET "http://localhost:10000/api/forum/topics/1?reply_page=1&reply_limit=20" \
  -H "X-Timestamp: 1672531200000" \
  -H "X-Signature: a1b2c3d4e5f6..."
```

**Response Structure:**

| Field | Type | Description |
|-------|------|-------------|
| `status` | String | Request status ("success" or "error") |
| `data` | Object | Response data container |
| `data.topic` | Object | Complete topic object |
| `data.replies` | Array | Array of reply objects |
| `data.reply_pagination` | Object | Reply pagination information |

**Topic Object Structure:**

see [TOPIC STRUCTURE](#topic-object-structure)

**Reply Pagination Structure:**

see [Pagination STRUCTURE](#pagination-structure)

**Reply Object Structure:**

| Field | Type | Description |
|-------|------|-------------|
| `id` | Integer | Reply unique ID |
| `content` | String | Reply content |
| `author` | Object | Author information (same as topic) |
| `parent_reply_id` | Integer/null | Parent reply ID (null for top-level replies) |
| `parent_reply` | Object/null | Parent reply info (for nested replies) |
| `like_count` | Integer | Number of likes |
| `is_liked` | Boolean | Whether current user liked this reply |
| `images` | Array | Array of image URLs |
| `created_at` | String | ISO timestamp of creation |
| `updated_at` | String | ISO timestamp of last update |

**Example Response:**

```json
{
  "status": "success",
  "data": {
    "topic": {
      "id": 1,
      "title": "How to setup motion sensors?",
      "content": "I'm trying to configure motion sensors in my living room. I have a few questions about the best practices and configuration options. Has anyone successfully set up motion sensors with Home Assistant?",
      "category": "Smart Home",
      "author": {
        "id": 123,
        "name": "John Doe"
      },
      "reply_count": 15,
      "like_count": 8,
      "status": 0,
      "images": ["https://api.example.com/uploads/topic_image.jpg"],
      "created_at": "2024-01-15T10:30:00Z",
      "updated_at": "2024-01-15T15:45:00Z"
    },
    "replies": [
      {
        "id": 1,
        "content": "I've had great success with PIR sensors. Here's what worked for me...",
        "author": {
          "id": 456,
          "name": "Jane Smith"
        },
        "like_count": 5,
        "is_liked": false,
        "images": ["https://api.example.com/uploads/reply_image1.jpg"],
        "created_at": "2024-01-15T11:30:00Z",
        "updated_at": "2024-01-15T11:30:00Z"
      },
      {
        "id": 2,
        "content": "Make sure to adjust the sensitivity settings properly...",
        "author": {
          "id": 789,
          "name": "Mike Johnson"
        },
        "like_count": 3,
        "is_liked": true,
        "images": [],
        "created_at": "2024-01-15T12:15:00Z",
        "updated_at": "2024-01-15T12:15:00Z"
      }
    ],
    "reply_pagination": {
      "current_page": 1,
      "total_pages": 2,
      "total_items": 25,
      "has_next": true,
      "has_previous": false
    }
  }
}
```

---

## POST /api/forum/topics

Creates a new forum topic.

`IMPORTANT: ALL new topics should be reviewed by administrator then set the status from -1 to 0, then this topic is PUBLISHED`

**App Authentication:** Required (see headers in `api_table.md`)

**Request Parameters:**

| Name | Type | Description | Required |
|---|---|---|---|
| `user_id` | Integer | Author user ID | Yes |
| `title` | String | Topic title (3-100 characters) | Yes |
| `content` | String | Topic content (10-2000 characters) | Yes |
| `category` | String | Topic category | Yes |
| `images` | Array | Array of image URLs (max 3) | No |

For more information about **images**, see **api_upload_file.md**.

**Example Request:**

```bash
curl -X POST http://localhost:10000/api/forum/topics \
  -H "Content-Type: application/json" \
  -H "X-Timestamp: 1672531200000" \
  -H "X-Signature: a1b2c3d4e5f6..." \
  -d '{
    "user_id": 123,
    "title": "Motion sensor setup help",
    "content": "I need help configuring my new motion sensors...",
    "category": "Smart Home",
    "images": ["https://api.example.com/uploads/image1.jpg"]
  }'
```

**Response Structure:**

| Field | Type | Description |
|-------|------|-------------|
| `status` | String | Request status ("success" or "error") |
| `data` | Object | Response data container |
| `data.topic` | Object | Created topic object |
| `data.topic.id` | Integer | Topic unique ID |
| `data.topic.created_at` | String | ISO timestamp of creation |

**Example Response:**

```json
{
  "status": "success",
  "data": {
    "topic": {
      "id": 42,
      "created_at": "2024-01-15T16:30:00Z"
    }
  }
}
```

## GET /api/forum/topics/:id/replies

Retrieves replies for a specific topic with pagination.

**App Authentication:** Required (see headers in `api_table.md`)

**Query Parameters:**

| Name | Type | Description | Required | Default |
|---|---|---|---| --- |
| `id` | Integer | Topic ID | Yes | - |
| `page` | Integer | Page number (1-based) | No | 1 |
| `limit` | Integer | Replies per page (1-50) | No | 20 |
| `sort` | String | Sort order: "newest", "oldest", "popular" | No | "newest" |

**Example Request:**

```bash
curl -X GET "http://localhost:10000/api/forum/topics/1/replies?page=1&limit=20&sort=newest" \
  -H "X-Timestamp: 1672531200000" \
  -H "X-Signature: a1b2c3d4e5f6..."
```

**Response Structure:**

| Field | Type | Description |
|-------|------|-------------|
| `status` | String | Request status ("success" or "error") |
| `data` | Object | Response data container |
| `data.replies` | Array | Array of reply objects |
| `data.pagination` | Object | Pagination information |

**Reply Pagination Structure:**

see [Pagination STRUCTURE](#pagination-structure)

**Reply Object Structure:**

| Field | Type | Description |
|-------|------|-------------|
| `id` | Integer | Reply unique ID |
| `content` | String | Reply content |
| `author` | Object | Author information |
| `author.id` | Integer | Author user ID |
| `author.name` | String | Author display name |
| `like_count` | Integer | Number of likes |
| `is_liked` | Boolean | Whether current user liked this reply |
| `images` | Array | Array of image URLs |
| `created_at` | String | ISO timestamp of creation |
| `updated_at` | String | ISO timestamp of last update |

**Example Response:**

```json
{
  "status": "success",
  "data": {
    "replies": [
      {
        "id": 1,
        "content": "Thanks for the question! Here's how I solved it...",
        "author": {
          "id": 456,
          "name": "Jane Smith"
        },
        "like_count": 5,
        "is_liked": false,
        "images": ["https://api.example.com/uploads/reply_image.jpg"],
        "created_at": "2024-01-15T11:30:00Z",
        "updated_at": "2024-01-15T11:30:00Z"
      }
    ],
    "pagination": {
      "current_page": 1,
      "total_pages": 3,
      "total_items": 45,
      "has_next": true,
      "has_previous": false
    }
  }
}
```

## POST /api/forum/topics/:id/replies

Adds a reply to an existing topic or creates a nested reply to another reply.

**Nested Reply Support:**

- To reply to the main topic: omit `parent_reply_id` parameter
- To reply to a specific reply: include `parent_reply_id` with the target reply's ID
- Nested replies maintain the same topic context but show hierarchical relationship

`Like the post, new reply should be review by admin then could be published, set status from -1 to 0`

**App Authentication:** Required (see headers in `api_table.md`)

**Path Parameters:**

| Name | Type | Description | Required |
|---|---|---|---|
| `id` | Integer | Topic ID | Yes |

**Parameters:**

| Name | Type | Description | Required |
|---|---|---|---|
| `user_id` | Integer | Reply author user ID | Yes |
| `content` | String | Reply content (1-1000 characters) | Yes |
| `parent_reply_id` | Integer | Parent reply ID (for nested replies) | No |
| `images` | Array | Array of image URLs (max 2) | No |

**Example Request (Reply to Topic):**

```bash
curl -X POST http://localhost:10000/api/forum/topics/1/replies \
  -H "Content-Type: application/json" \
  -H "X-Timestamp: 1672531200000" \
  -H "X-Signature: a1b2c3d4e5f6..." \
  -d '{
    "user_id": 456,
    "content": "Great question! I had the same issue and solved it by...",
    "images": ["https://api.example.com/uploads/solution_image.jpg"]
  }'
```

**Example Request (Reply to Reply):**

```bash
curl -X POST http://localhost:10000/api/forum/topics/1/replies \
  -H "Content-Type: application/json" \
  -H "X-Timestamp: 1672531200000" \
  -H "X-Signature: a1b2c3d4e5f6..." \
  -d '{
    "user_id": 789,
    "content": "Thanks for the tip! This worked perfectly for me too.",
    "parent_reply_id": 25,
    "images": []
  }'
```

**Response Structure:**

| Field | Type | Description |
|-------|------|-------------|
| `status` | String | Request status ("success" or "error") |
| `data` | Object | Response data container |
| `data.reply` | Object | Created reply object |

**Example Response:**

```json
{
  "status": "success",
  "data": {
    "reply": {
      "id": 25,
      "created_at": "2024-01-15T16:30:00Z"
    }
  }
}
```

## PUT /api/forum/topics/:id

Updates an existing topic (author only).

**App Authentication:** Required (see headers in `api_table.md`)

**Path Parameters:**

| Name | Type | Description | Required |
|---|---|---|---|
| `id` | Integer | Topic ID | Yes |

**Parameters:**

| Name | Type | Description | Required |
|---|---|---|---|
| `user_id` | Integer | Author user ID | Yes |
| `title` | String | Topic title (3-100 characters) | No |
| `content` | String | Topic content (10-2000 characters) | No |
| `category` | String | Topic category | No |
| `images` | Array | Array of image URLs (max 3) | No |

**Example Request:**

```bash
curl -X PUT http://localhost:10000/api/forum/topics/1 \
  -H "Content-Type: application/json" \
  -H "X-Timestamp: 1672531200000" \
  -H "X-Signature: a1b2c3d4e5f6..." \
  -d '{
    "user_id": 123,
    "title": "Updated: Motion sensor setup help",
    "content": "I need help configuring my new motion sensors... [Updated with more details]",
    "category": "Smart Home"
  }'
```

**Response Structure:**

| Field | Type | Description |
|-------|------|-------------|
| `status` | String | Request status ("success" or "error") |
| `data` | Object | Response data container |
| `data.topic` | Object | Updated topic object |

**Example Response:**

```json
{
  "status": "success",
  "data": {
    "topic": {
      "id": 1,
      "title": "Updated: Motion sensor setup help",
      "content": "I need help configuring my new motion sensors... [Updated with more details]",
      "category": "Smart Home",
      "author": {
        "id": 123,
        "name": "John Doe"
      },
      "reply_count": 15,
      "like_count": 8,
      "status": 0,
      "created_at": "2024-01-15T10:30:00Z",
      "updated_at": "2024-01-15T17:00:00Z"
    }
  }
}
```

## DELETE /api/forum/topics/:id

Deletes a topic (author only).

**App Authentication:** Required (see headers in `api_table.md`)

**Path Parameters:**

| Name | Type | Description | Required |
|---|---|---|---|
| `id` | Integer | Topic ID | Yes |

**Parameters:**

| Name | Type | Description | Required |
|---|---|---|---|
| `user_id` | Integer | Author user ID | Yes |

**Example Request:**

```bash
curl -X DELETE http://localhost:10000/api/forum/topics/1 \
  -H "Content-Type: application/json" \
  -H "X-Timestamp: 1672531200000" \
  -H "X-Signature: a1b2c3d4e5f6..." \
  -d '{
    "user_id": 123
  }'
```

**Response Structure:**

| Field | Type | Description |
|-------|------|-------------|
| `status` | String | Request status ("success" or "error") |
| `message` | String | Deletion confirmation message |

**Example Response:**

```json
{
  "status": "success",
  "message": "Topic deleted successfully"
}
```

## PUT /api/forum/replies/:id

Updates an existing reply (author only).

**App Authentication:** Required (see headers in `api_table.md`)

**Path Parameters:**

| Name | Type | Description | Required |
|---|---|---|---|
| `id` | Integer | Reply ID | Yes |

**Parameters:**

| Name | Type | Description | Required |
|---|---|---|---|
| `user_id` | Integer | Author user ID | Yes |
| `content` | String | Reply content (1-1000 characters) | Yes |
| `images` | Array | Array of image URLs (max 2) | No |

**Example Request:**

```bash
curl -X PUT http://localhost:10000/api/forum/replies/25 \
  -H "Content-Type: application/json" \
  -H "X-Timestamp: 1672531200000" \
  -H "X-Signature: a1b2c3d4e5f6..." \
  -d '{
    "user_id": 456,
    "content": "Updated: Great question! I had the same issue and solved it by doing this instead...",
    "images": ["https://api.example.com/uploads/updated_solution.jpg"]
  }'
```

**Response Structure:**

| Field | Type | Description |
|-------|------|-------------|
| `status` | String | Request status ("success" or "error") |
| `data` | Object | Response data container |
| `data.reply` | Object | Updated reply object |

**Example Response:**

```json
{
  "status": "success",
  "data": {
    "reply": {
      "id": 25,
      "content": "Updated: Great question! I had the same issue and solved it by doing this instead...",
      "author": {
        "id": 456,
        "name": "Jane Smith"
      },
      "like_count": 3,
      "is_liked": false,
      "images": ["https://api.example.com/uploads/updated_solution.jpg"],
      "created_at": "2024-01-15T16:30:00Z",
      "updated_at": "2024-01-15T18:15:00Z"
    }
  }
}
```

## DELETE /api/forum/replies/:id

Deletes a reply (author only).

**App Authentication:** Required (see headers in `api_table.md`)

**Path Parameters:**

| Name | Type | Description | Required |
|---|---|---|---|
| `id` | Integer | Reply ID | Yes |

**Parameters:**

| Name | Type | Description | Required |
|---|---|---|---|
| `user_id` | Integer | Author user ID | Yes |

**Example Request:**

```bash
curl -X DELETE http://localhost:10000/api/forum/replies/25 \
  -H "Content-Type: application/json" \
  -H "X-Timestamp: 1672531200000" \
  -H "X-Signature: a1b2c3d4e5f6..." \
  -d '{
    "user_id": 456
  }'
```

**Response Structure:**

| Field | Type | Description |
|-------|------|-------------|
| `status` | String | Request status ("success" or "error") |
| `message` | String | Deletion confirmation message |

**Example Response:**

```json
{
  "status": "success",
  "message": "Reply deleted successfully"
}
```

## POST /api/forum/replies/:id/like

Toggles like status for a reply.

**App Authentication:** Required (see headers in `api_table.md`)

**Path Parameters:**

| Name | Type | Description | Required |
|---|---|---|---|
| `id` | Integer | Reply ID | Yes |

**Parameters:**

| Name | Type | Description | Required |
|---|---|---|---|
| `user_id` | Integer | User ID performing the action | Yes |

**Example Request:**

```bash
curl -X POST http://localhost:10000/api/forum/replies/25/like \
  -H "Content-Type: application/json" \
  -H "X-Timestamp: 1672531200000" \
  -H "X-Signature: a1b2c3d4e5f6..." \
  -d '{
    "user_id": 789
  }'
```

**Response Structure:**

| Field | Type | Description |
|-------|------|-------------|
| `status` | String | Request status ("success" or "error") |
| `data` | Object | Response data container |
| `data.is_liked` | Boolean | New like status |
| `data.like_count` | Integer | Updated like count |

**Example Response:**

```json
{
  "status": "success",
  "data": {
    "is_liked": true,
    "like_count": 4
  }
}
```

## POST /api/forum/topics/:id/like

Toggles like status for a topic.

**App Authentication:** Required (see headers in `api_table.md`)

**Parameters:**

| Name | Type | Description | Required |
|---|---|---|---|
| `user_id` | Integer | User ID performing the action | Yes |

**Example Request:**

```bash
curl -X POST http://localhost:10000/api/forum/topics/25/like \
  -H "Content-Type: application/json" \
  -H "X-Timestamp: 1672531200000" \
  -H "X-Signature: a1b2c3d4e5f6..." \
  -d '{
    "user_id": 789
  }'
```

**Response Structure:**

| Field | Type | Description |
|-------|------|-------------|
| `status` | String | Request status ("success" or "error") |
| `data` | Object | Response data container |
| `data.is_liked` | Boolean | New like status |
| `data.like_count` | Integer | Updated like count |

## GET /api/forum/search

Searches topics and replies by keyword.

**App Authentication:** Required (see headers in `api_table.md`)

**Query Parameters:**

| Name | Type | Description | Required | Default |
|---|---|---|---|---|
| `q` | String | Search query (min 2 characters) | Yes | - |
| `type` | String | Search type: "topics", "replies", "all" | No | "all" |
| `category` | String | Filter by category | No | All |
| `page` | Integer | Page number | No | 1 |
| `limit` | Integer | Results per page (1-50) | No | 20 |

**Example Request:**

```bash
curl -X GET "http://localhost:10000/api/forum/search?q=motion%20sensor&type=all&category=Smart%20Home&page=1&limit=20" \
  -H "X-Timestamp: 1672531200000" \
  -H "X-Signature: a1b2c3d4e5f6..."
```

**Response Structure:**

| Field | Type | Description |
|-------|------|-------------|
| `status` | String | Request status ("success" or "error") |
| `data` | Object | Response data container |
| `data.results` | Array | Array of search result objects |
| `data.pagination` | Object | Pagination information |
| `data.search_info` | Object | Search metadata |

**Search Result Object Structure:**

| Field | Type | Description |
|-------|------|-------------|
| `id` | Integer | Result ID |
| `type` | String | Result type ("topic" or "reply") |
| `title` | String | Result title (for topics) |
| `content` | String | Result content (highlighted with search terms) |
| `category` | String | Result category |
| `author` | Object | Author information |
| `author.id` | Integer | Author user ID |
| `author.name` | String | Author display name |
| `topic_id` | Integer | Parent topic ID (for replies) |
| `like_count` | Integer | Number of likes |
| `reply_count` | Integer | Number of replies (for topics only) |
| `relevance_score` | Float | Search relevance score (0-1) |
| `created_at` | String | ISO timestamp of creation |
| `updated_at` | String | ISO timestamp of last update |

**Search Info Object Structure:**

| Field | Type | Description |
|-------|------|-------------|
| `query` | String | Original search query |
| `total_results` | Integer | Total number of results found |
| `search_time` | Float | Search execution time in seconds |
| `filters_applied` | Object | Applied filters summary |

**Example Response:**

```json
{
  "status": "success",
  "data": {
    "results": [
      {
        "id": 1,
        "type": "topic",
        "title": "How to setup <mark>motion sensors</mark>?",
        "content": "I'm trying to configure <mark>motion sensors</mark> in my living room...",
        "category": "Smart Home",
        "author": {
          "id": 123,
          "name": "John Doe"
        },
        "topic_id": 1,
        "like_count": 8,
        "reply_count": 15,
        "relevance_score": 0.95,
        "created_at": "2024-01-15T10:30:00Z",
        "updated_at": "2024-01-15T15:45:00Z"
      },
      {
        "id": 2,
        "type": "reply",
        "title": null,
        "content": "I've had great success with PIR <mark>sensors</mark>. Here's what worked for me...",
        "category": "Smart Home",
        "author": {
          "id": 456,
          "name": "Jane Smith"
        },
        "topic_id": 1,
        "like_count": 5,
        "reply_count": null,
        "relevance_score": 0.87,
        "created_at": "2024-01-15T11:30:00Z",
        "updated_at": "2024-01-15T11:30:00Z"
      }
    ],
    "pagination": {
      "current_page": 1,
      "total_pages": 3,
      "total_items": 45,
      "has_next": true,
      "has_previous": false
    },
    "search_info": {
      "query": "motion sensor",
      "total_results": 45,
      "search_time": 0.023,
      "filters_applied": {
        "category": "Smart Home",
        "type": "all"
      }
    }
  }
}
```

## GET /api/forum/categories

Retrieves list of available forum categories.

**App Authentication:** Required (see headers in `api_table.md`)

**Request Example:**

```bash
curl -X GET "http://localhost:10000/api/forum/categories" \
  -H "X-Timestamp: 1672531200000" \
  -H "X-Signature: a1b2c3d4e5f6..."
```

**Response Structure:**

| Field | Type | Description |
|-------|------|-------------|
| `status` | String | Request status ("success" or "error") |
| `data` | Object | Response data container |
| `data.categories` | Array | Array of category objects |

**Category Object Structure:**

| Field | Type | Description |
|-------|------|-------------|
| `id` | Integer | Category identifier |
| `name` | String | Category display name |
| `description` | String | Category description |
| `topic_count` | Integer | Number of topics in category |
| `icon` | String | Category icon name |

**Example Response:**

```json
{
  "status": "success",
  "data": {
    "categories": [
      {
        "id": 0,
        "name": "Smart Home",
        "description": "Discussions about smart home devices, automation, and setup",
        "topic_count": 245,
        "icon": "home"
      },
      {
        "id": 1,
        "name": "Security",
        "description": "Home security systems, cameras, and monitoring",
        "topic_count": 132,
        "icon": "shield"
      },
      {
        "id": 2,
        "name": "Lighting",
        "description": "Smart bulbs, switches, and lighting automation",
        "topic_count": 89,
        "icon": "lightbulb"
      },
      {
        "id": 3,
        "name": "Climate Control",
        "description": "Thermostats, HVAC, and temperature management",
        "topic_count": 156,
        "icon": "thermometer"
      }
    ]
  }
}
```

## GET /api/forum/drafts

Retrieves user's saved drafts.

Simplified Draft System:

- ONE topic draft per user - Simple, no confusion
- Multiple reply drafts per user - One draft per topic they're replying to

Logic:

- Topic Draft: User can only work on one new topic at a time
- Reply Drafts: Each tied to specific topic_id, so user can draft replies to different topics
  simultaneously

**App Authentication:** Required (see headers in `api_table.md`)

**Query Parameters:**

| Name | Type | Description | Required |
|---|---|---|---|
| `user_id` | Integer | User ID | Yes |
| `type` | String | Filter by draft type: "topic" or "reply" | No |
| `page` | Integer | Page number (1-based) | No |
| `limit` | Integer | Drafts per page (1-50) | No |

**Example Request:**

```bash
curl -X GET "http://localhost:10000/api/forum/drafts?user_id=123&type=topic&page=1&limit=10" \
  -H "X-Timestamp: 1672531200000" \
  -H "X-Signature: a1b2c3d4e5f6..."
```

**Response Structure:**

| Field | Type | Description |
|-------|------|-------------|
| `status` | String | Request status ("success" or "error") |
| `data` | Object | Response data container |
| `data.topic_draft` | Object | draft topic context |
| `data.reply_drafts` | Array | Array of draft objects |

**Topic Draft Object Structure:**

| Field | Type | Description |
|-------|------|-------------|
| `id` | Integer | Draft unique identifier |
| `user_id` | Integer | Draft owner user ID |
| `title` | String | Draft title |
| `content` | String | Draft content |
| `category` | String | Draft category |
| `created_at` | String | ISO timestamp of creation |
| `updated_at` | String | ISO timestamp of last update |

**Reply Draft Object Structure:**

| Field | Type | Description |
|-------|------|-------------|
| `id` | Integer | Draft unique identifier |
| `user_id` | Integer | Draft owner user ID |
| `content` | String | Draft content |
| `topic_id` | Integer | Parent topic ID |
| `topic_title` | String | Parent topic title (for reference) |
| `created_at` | String | ISO timestamp of creation |
| `updated_at` | String | ISO timestamp of last update |

**Example Response:**

```json
{
  "status": "success",
  "data": {
    "topic_draft": {
      "id": 1001,
      "user_id": 123,
      "title": "Smart bulb recommendations",
      "content": "I'm looking for recommendations for smart bulbs that work well with...",
      "category": "Smart Home",
      "created_at": "2024-01-15T19:00:00Z",
      "updated_at": "2024-01-15T19:00:00Z"
    },
    "reply_drafts": [
      {
        "id": 1002,
        "user_id": 123,
        "content": "Thanks for the question! I had a similar issue and solved it by...",
        "topic_id": 42,
        "topic_title": "Motion sensor setup help",
        "created_at": "2024-01-15T18:30:00Z",
        "updated_at": "2024-01-15T18:30:00Z"
      },
      {
        "id": 1003,
        "user_id": 123,
        "content": "I recommend checking the power consumption settings...",
        "topic_id": 89,
        "topic_title": "Smart thermostat battery drain",
        "created_at": "2024-01-15T17:45:00Z",
        "updated_at": "2024-01-15T17:45:00Z"
      }
    ]
  }
}
```

## POST /api/forum/drafts

Saves or updates a draft.

**App Authentication:** Required (see headers in `api_table.md`)

**Parameters:**

| Name | Type | Description | Required |
|---|---|---|---|
| `user_id` | Integer | Draft owner user ID | Yes |
| `title` | String | Draft title | No |
| `content` | String | Draft content | No |
| `category` | String | Draft category | No |
| `type` | String | Draft type: "topic" or "reply" | Yes |
| `topic_id` | Integer | Parent topic ID (for reply drafts) | No |

**Example Request:**

```bash
curl -X POST http://localhost:10000/api/forum/drafts \
  -H "Content-Type: application/json" \
  -H "X-Timestamp: 1672531200000" \
  -H "X-Signature: a1b2c3d4e5f6..." \
  -d '{
    "user_id": 123,
    "title": "Draft: Smart bulb recommendations",
    "content": "I'm looking for recommendations for smart bulbs that work well with...",
    "category": "Smart Home",
    "type": "topic"
  }'
```

**Response Structure:**

| Field | Type | Description |
|-------|------|-------------|
| `status` | String | Request status ("success" or "error") |
| `data` | Object | Response data container |
| `data.draft` | Object | Created/updated draft object |
| `data.draft.id` | Integer | Draft identifier |

**Example Response:**

```json
{
  "status": "success",
  "data": {
    "draft": {
      "id": 1001,
      "user_id": 123,
      "title": "Draft: Smart bulb recommendations",
      "content": "I'm looking for recommendations for smart bulbs that work well with...",
      "category": "Smart Home",
      "type": "topic",
      "created_at": "2024-01-15T19:00:00Z",
      "updated_at": "2024-01-15T19:00:00Z"
    }
  }
}
```

### DELETE /api/forum/drafts/:id

Deletes a saved draft.

**App Authentication:** Required (see headers in `api_table.md`)

**Path Parameters:**

| Name | Type | Description | Required |
|---|---|---|---|
| `id` | String | Draft ID | Yes |

**Parameters:**

| Name | Type | Description | Required |
|---|---|---|---|
| `user_id` | Integer | Draft owner user ID | Yes |

**Example Request:**

```bash
curl -X DELETE http://localhost:10000/api/forum/drafts/draft_123_1672531200 \
  -H "Content-Type: application/json" \
  -H "X-Timestamp: 1672531200000" \
  -H "X-Signature: a1b2c3d4e5f6..." \
  -d '{
    "user_id": 123
  }'
```

**Response Structure:**

| Field | Type | Description |
|-------|------|-------------|
| `status` | String | Request status ("success" or "error") |
| `message` | String | Deletion confirmation message |

**Example Response:**

```json
{
  "status": "success",
  "message": "Draft deleted successfully"
}
```
