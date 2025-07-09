
# UPLOAD FILES FOR FORUM

## POST /api/forum/uploads

Uploads files for forum posts and replies with chunked upload support and real-time progress tracking.

**App Authentication:** Required (see headers in `api_table.md`)

**Request Method:** POST  
**Content-Type:** multipart/form-data

**Parameters:**

| Name | Type | Description | Required |
|---|---|---|---|
| `file` | File | File to upload (images, documents) | Yes |
| `user_id` | Integer | Uploader user ID | Yes |
| `type` | String | Upload type: "topic" or "reply" | Yes |
| `chunk_index` | Integer | Current chunk index (0-based) | No |
| `total_chunks` | Integer | Total number of chunks | No |
| `upload_id` | String | Unique upload session identifier | No |
| `post_id` | Integer | Associated post ID | No |

**Request Body Example:**

```bash
curl -X POST http://localhost:10000/api/forum/uploads \
  -H "X-Timestamp: 1672531200000" \
  -H "X-Signature: a1b2c3d4e5f6..." \
  -F "file=@/path/to/image.jpg" \
  -F "user_id=123" \
  -F "type=topic" \
  -F "chunk_index=0" \
  -F "total_chunks=5" \
  -F "upload_id=upload_123456789" \
  -F "post_id=42"
```

**Response Structure:**

| Field | Type | Description |
|-------|------|-------------|
| `status` | String | Request status ("success" or "error") |
| `data` | Object | Response data container |
| `data.upload_id` | String | Unique upload session identifier |
| `data.chunk_index` | Integer | Current chunk index |
| `data.total_chunks` | Integer | Total number of chunks |
| `data.uploaded_chunks` | Integer | Number of chunks uploaded |
| `data.progress_percentage` | Integer | Upload progress (0-100) |
| `data.file_url` | String | Final file URL (null until complete) |
| `data.file_id` | Integer | File identifier (null until complete) |
| `data.complete` | Boolean | Whether upload is complete |

**Success Response (200) - Chunk Uploaded:**

```json
{
  "status": "success",
  "data": {
    "upload_id": "upload_123456789",
    "chunk_index": 0,
    "total_chunks": 5,
    "uploaded_chunks": 1,
    "progress_percentage": 20,
    "file_url": null,
    "file_id": null,
    "complete": false
  }
}
```

**Complete Upload Response (200) - All Chunks Uploaded:**

```json
{
  "status": "success",
  "data": {
    "upload_id": "upload_123456789",
    "chunk_index": 4,
    "total_chunks": 5,
    "uploaded_chunks": 5,
    "progress_percentage": 100,
    "file_url": "https://api.example.com/uploads/forum/image_123.jpg",
    "file_id": 789,
    "complete": true
  }
}
```

**Error Response (400) - Invalid Chunk:**

```json
{
  "status": "error",
  "message": "Invalid chunk index or missing upload session",
  "error_code": "INVALID_CHUNK"
}
```

**Error Response (413) - File Too Large:**

```json
{
  "status": "error",
  "message": "File size exceeds maximum limit of 10MB",
  "error_code": "FILE_TOO_LARGE"
}
```

**Error Response (415) - Unsupported File Type:**

```json
{
  "status": "error",
  "message": "Unsupported file type. Allowed: jpg, png, gif, pdf, doc, docx",
  "error_code": "UNSUPPORTED_FILE_TYPE"
}
```

---

## WebSocket /api/forum/upload/progress

**Description:** Real-time upload progress tracking via WebSocket connection.

**Connection URL:** `ws://api.example.com/api/forum/upload/progress`

**Authentication:**

- Send JWT token in connection query: `?token=<jwt_token>`
- Or send token in first message after connection

**WebSocket Room Management:**

- Each upload session creates a unique room: `upload_<upload_id>`
- Client joins room using upload_id
- Server broadcasts progress updates to room members
- Room automatically destroyed after upload completion or timeout
- Rooms expire after 30 minutes of inactivity
- Redis-based room persistence with TTL for scalability
- Room state synchronized across server instances
- Maximum 5 concurrent connections per upload session

**Client Messages:**

**Join Upload Room:**

```json
{
  "action": "join_upload",
  "upload_id": "upload_123456789",
  "user_id": 123
}
```

**Leave Upload Room:**

```json
{
  "action": "leave_upload",
  "upload_id": "upload_123456789"
}
```

**Server Messages:**

**Progress Update:**

```json
{
  "type": "upload_progress",
  "upload_id": "upload_123456789",
  "progress_percentage": 45,
  "uploaded_chunks": 2,
  "total_chunks": 5,
  "current_chunk": 2,
  "bytes_uploaded": 2048000,
  "total_bytes": 4608000,
  "estimated_time_remaining": 30,
  "upload_speed": "1.2MB/s"
}
```

**Upload Complete:**

```json
{
  "type": "upload_complete",
  "upload_id": "upload_123456789",
  "file_url": "https://api.example.com/uploads/forum/image_123.jpg",
  "file_id": 789,
  "total_time": 45,
  "final_size": 4608000
}
```

**Upload Error:**

```json
{
  "type": "upload_error",
  "upload_id": "upload_123456789",
  "error_code": "CHUNK_TIMEOUT",
  "message": "Chunk upload timeout after 30 seconds",
  "retry_chunk": 2
}
```

**Room Status:**

```json
{
  "type": "room_status",
  "upload_id": "upload_123456789",
  "connected_clients": 1,
  "room_created": "2025-07-08T10:30:00Z",
  "expires_at": "2025-07-08T11:00:00Z"
}
```

---

## Direct File Upload (Instant Upload)

For users who want to upload files directly without progress tracking, the API supports instant upload without chunking parameters. This is useful for smaller files or when WebSocket progress tracking is not needed.

**Direct Upload Request:**

Simply omit the chunking parameters (`chunk_index`, `total_chunks`, `upload_id`) and the file will be uploaded instantly.

**Example Direct Upload:**

```bash
curl -X POST http://localhost:10000/api/forum/uploads \
  -H "X-Timestamp: 1672531200000" \
  -H "X-Signature: a1b2c3d4e5f6..." \
  -F "file=@/path/to/image.jpg" \
  -F "user_id=123" \
  -F "type=topic" \
  -F "post_id=42"
```

**Direct Upload Response:**

```json
{
  "status": "success",
  "data": {
    "upload_id": "upload_123456789",
    "chunk_index": 0,
    "total_chunks": 1,
    "uploaded_chunks": 1,
    "progress_percentage": 100,
    "file_url": "https://api.example.com/uploads/forum/image_123.jpg",
    "file_id": 789,
    "complete": true
  }
}
```

**When to Use Direct Upload:**

- **Small files** (< 1MB) that don't require progress tracking
- **Simple integrations** where WebSocket complexity is unnecessary
- **Batch uploads** where individual file progress is not critical
- **Mobile applications** with limited WebSocket support

**Benefits:**

- **Simpler implementation** - No WebSocket connection required
- **Faster for small files** - No chunking overhead
- **Immediate response** - Get file URL and ID instantly
- **Lower server resources** - No session management or Redis usage

---

## Error Handling and Retry Mechanisms

**Error Codes:**

- `INVALID_CHUNK`: Invalid chunk index or sequence
- `UPLOAD_TIMEOUT`: Chunk upload timeout (30 seconds)
- `FILE_TOO_LARGE`: File exceeds 10MB limit
- `UNSUPPORTED_FILE_TYPE`: File type not allowed
- `QUOTA_EXCEEDED`: User storage quota exceeded
- `CHUNK_CORRUPTION`: Chunk data corruption detected
- `SESSION_EXPIRED`: Upload session expired (30 minutes)
- `DUPLICATE_CHUNK`: Chunk already uploaded
- `MISSING_CHUNKS`: Some chunks missing in sequence

**Retry Logic:**

- **Chunk Failures**: Retry failed chunks up to 3 times
- **Network Timeout**: 30-second timeout per chunk
- **WebSocket Reconnection**: Auto-reconnect with exponential backoff
- **Session Recovery**: Resume upload from last successful chunk

**File Validation:**

- **Size Limit**: 10MB maximum per file
- **Type Validation**: jpg, png, gif, pdf, doc, docx, txt
- **Content Validation**: MIME type verification
- **Virus Scanning**: ClamAV integration for security
- **Metadata Stripping**: Remove EXIF data from images

**Security Considerations:**

- **Authentication**: JWT token required for all requests
- **Rate Limiting**: 5 uploads per minute per user
- **File Quarantine**: 24-hour quarantine for virus scanning
- **Access Control**: Files only accessible to authorized users
- **Encryption**: Files encrypted at rest using AES-256
- **Audit Logging**: All upload activities logged with timestamps
