# IM (Instant Messaging) API Documentation

## Overview

The HomeAssistant IM system provides real-time messaging capabilities between users and administrators. It combines REST API endpoints for basic operations with WebSocket connections for real-time features.

### Architecture

- **Backend**: Node.js + Express + Socket.io + MySQL
- **Real-time**: WebSocket connections via Socket.io
- **iOS Client**: Socket.io-Client-Swift + MessageKit
- **Authentication**: App-level + User-level authentication
- **File Support**: Integrated with forum upload system

---

## Current API Endpoints

### 1. Get Chat History

**Endpoint**: `GET /api/chat/messages`  
**Authentication**: Required (User)  
**Description**: Retrieve chat history for the authenticated user

#### Request

```http
GET /api/chat/messages
Headers:
  X-Timestamp: 1673123456789
  X-Signature: abc123...
  Authorization: Bearer <user_token>
```

#### Response

```json
{
  "status": "success",
  "data": {
    "conversation_id": 123,
    "messages": [
      {
        "id": 1,
        "conversation_id": 123,
        "sender_role": "user",
        "message": "Hello, I need help",
        "timestamp": "2025-07-14T10:30:00Z",
        "sender_identifier": "user_uuid_123"
      },
      {
        "id": 2,
        "conversation_id": 123,
        "sender_role": "admin",
        "message": "How can I help you?",
        "timestamp": "2025-07-14T10:31:00Z",
        "sender_identifier": "admin_username"
      }
    ]
  }
}
```

### 2. Send Message

**Endpoint**: `POST /api/chat/messages`  
**Authentication**: Required (User)  
**Description**: Send a message to the conversation

#### Request

```json
{
  "message": "Thank you for your help!"
}
```

#### Response (201 Created)

```json
{
  "status": "success",
  "data": {
    "id": 3,
    "conversation_id": 123,
    "message": "Thank you for your help!",
    "sender_role": "user",
    "timestamp": "2025-07-14T10:32:00Z"
  }
}
```

---

## Enhanced API Endpoints (Proposed)

### 3. List Conversations

**Endpoint**: `GET /api/chat/conversations`  
**Authentication**: Required (User/Admin)  
**Description**: Get list of conversations for the authenticated user

#### Request Parameters

- `page` (optional): Page number (default: 1)
- `limit` (optional): Items per page (default: 20, max: 50)
- `status` (optional): Filter by status (active, closed, archived)

#### Response

```json
{
  "status": "success",
  "data": {
    "conversations": [
      {
        "id": 123,
        "user_id": 456,
        "admin_id": 789,
        "status": "active",
        "last_message_at": "2025-07-14T10:32:00Z",
        "unread_count": 2,
        "last_message": {
          "content": "Thank you for your help!",
          "sender_role": "user"
        }
      }
    ],
    "pagination": {
      "page": 1,
      "limit": 20,
      "total": 1,
      "pages": 1
    }
  }
}
```

### 4. Create Conversation

**Endpoint**: `POST /api/chat/conversations`  
**Authentication**: Required (User)  
**Description**: Create a new conversation (if not exists)

#### Request

```json
{
  "initial_message": "I need help with my account"
}
```

#### Response (201 Created)

```json
{
  "status": "success",
  "data": {
    "conversation_id": 124,
    "message": {
      "id": 1,
      "content": "I need help with my account",
      "timestamp": "2025-07-14T10:35:00Z"
    }
  }
}
```

### 5. Mark Messages as Read

**Endpoint**: `PUT /api/chat/conversations/:id/read`  
**Authentication**: Required (User/Admin)  
**Description**: Mark messages in a conversation as read

#### Request

```json
{
  "message_ids": [1, 2, 3]
}
```

#### Response

```json
{
  "status": "success",
  "data": {
    "marked_read": 3
  }
}
```

### 6. Send Typing Indicator

**Endpoint**: `POST /api/chat/conversations/:id/typing`  
**Authentication**: Required (User/Admin)  
**Description**: Send typing indicator to conversation

#### Request

```json
{
  "typing": true
}
```

#### Response

```json
{
  "status": "success",
  "message": "Typing indicator sent"
}
```

### 7. Upload File/Image

**Endpoint**: `POST /api/chat/upload`  
**Authentication**: Required (User/Admin)  
**Description**: Upload file or image for messaging

#### Request (multipart/form-data)

```
file: <binary_data>
conversation_id: 123
message_type: "image" | "file"
```

#### Response (201 Created)

```json
{
  "status": "success",
  "data": {
    "file_id": "abc123",
    "file_url": "http://47.94.108.189/uploads/chat/2025/07/14/abc123.jpg",
    "filename": "image.jpg",
    "file_size": 1024000,
    "mime_type": "image/jpeg"
  }
}
```

### 8. Search Messages

**Endpoint**: `GET /api/chat/search`  
**Authentication**: Required (User/Admin)  
**Description**: Search messages in conversations

#### Request Parameters

- `q`: Search query (required, min 2 characters)
- `conversation_id` (optional): Limit search to specific conversation
- `page` (optional): Page number
- `limit` (optional): Items per page

#### Response

```json
{
  "status": "success",
  "data": {
    "results": [
      {
        "message_id": 123,
        "conversation_id": 456,
        "content": "I need help with my account",
        "sender_role": "user",
        "timestamp": "2025-07-14T10:35:00Z",
        "context": "...help with my account..."
      }
    ],
    "pagination": {
      "page": 1,
      "limit": 20,
      "total": 1,
      "pages": 1
    }
  }
}
```

---

## WebSocket Events

### Connection Setup

```javascript
// Client connection
const socket = io('http://47.94.108.189:10000', {
  auth: {
    token: 'user_token_here'
  }
});
```

### Server Events (Sent to Client)

#### 1. new_message

**Description**: New message received in conversation

```json
{
  "event": "new_message",
  "data": {
    "id": 123,
    "conversation_id": 456,
    "sender_role": "admin",
    "message_type": "text",
    "content": "Hello, how can I help?",
    "timestamp": "2025-07-14T10:35:00Z",
    "sender_identifier": "admin_username"
  }
}
```

#### 2. typing_indicator

**Description**: Someone is typing in the conversation

```json
{
  "event": "typing_indicator",
  "data": {
    "conversation_id": 456,
    "sender_role": "admin",
    "typing": true,
    "sender_identifier": "admin_username"
  }
}
```

#### 3. message_read

**Description**: Message has been read

```json
{
  "event": "message_read",
  "data": {
    "conversation_id": 456,
    "message_ids": [1, 2, 3],
    "read_by": "admin"
  }
}
```

#### 4. conversation_status

**Description**: Conversation status changed

```json
{
  "event": "conversation_status",
  "data": {
    "conversation_id": 456,
    "status": "closed",
    "changed_by": "admin"
  }
}
```

### Client Events (Sent to Server)

#### 1. join_conversation

**Description**: Join a conversation room

```json
{
  "event": "join_conversation",
  "data": {
    "conversation_id": 456
  }
}
```

#### 2. send_message

**Description**: Send a message

```json
{
  "event": "send_message",
  "data": {
    "conversation_id": 456,
    "message_type": "text",
    "content": "Hello there!",
    "file_id": null
  }
}
```

#### 3. typing_start/typing_stop

**Description**: Start/stop typing indicator

```json
{
  "event": "typing_start",
  "data": {
    "conversation_id": 456
  }
}
```

---

## Database Schema

### conversations Table

```sql
CREATE TABLE conversations (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id INT UNSIGNED NOT NULL,
    admin_id INT UNSIGNED NULL,
    status ENUM('active', 'closed', 'archived') DEFAULT 'active',
    last_message_at TIMESTAMP NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    INDEX idx_user_id (user_id),
    INDEX idx_admin_id (admin_id),
    INDEX idx_status (status),
    INDEX idx_last_message (last_message_at),
    
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
```

### messages Table

```sql
CREATE TABLE messages (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    conversation_id INT UNSIGNED NOT NULL,
    user_id INT UNSIGNED NULL,
    admin_id INT UNSIGNED NULL,
    sender_role ENUM('user', 'admin') NOT NULL,
    message_type ENUM('text', 'image', 'file', 'system') DEFAULT 'text',
    content TEXT NOT NULL,
    file_id VARCHAR(255) NULL,
    file_url VARCHAR(500) NULL,
    metadata JSON NULL,
    is_read BOOLEAN DEFAULT FALSE,
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    INDEX idx_conversation (conversation_id),
    INDEX idx_timestamp (timestamp),
    INDEX idx_sender (sender_role, user_id, admin_id),
    INDEX idx_read (is_read),
    FULLTEXT idx_content (content),
    
    FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
);
```

---

## Error Handling

### Standard Error Response Format

```json
{
  "status": "error",
  "message": "Description of the error",
  "error_code": "SPECIFIC_ERROR_CODE"
}
```

### HTTP Status Codes

| Status Code | Description | When It Occurs |
|-------------|-------------|----------------|
| **200** | Success | Request completed successfully |
| **201** | Created | New message/conversation created |
| **400** | Bad Request | Invalid parameters, empty message |
| **401** | Unauthorized | Invalid authentication |
| **403** | Forbidden | Access denied to conversation |
| **404** | Not Found | Conversation not found |
| **413** | Payload Too Large | File upload too large |
| **429** | Too Many Requests | Rate limit exceeded |
| **500** | Internal Server Error | Server-side error |

### WebSocket Error Events

```json
{
  "event": "error",
  "data": {
    "code": "UNAUTHORIZED",
    "message": "Invalid authentication token"
  }
}
```

### Rate Limiting

- **Message sending**: 60 messages per minute
- **File uploads**: 10 files per minute
- **Typing indicators**: 10 per minute

---

## iOS Integration Guide

### 1. Socket.io Client Setup

```swift
import SocketIO

class ChatService: ObservableObject {
    private let manager: SocketManager
    private let socket: SocketIOClient
    
    init() {
        manager = SocketManager(
            socketURL: URL(string: "http://47.94.108.189:10000")!,
            config: [
                .log(true),
                .compress
            ]
        )
        socket = manager.defaultSocket
        setupSocketEvents()
    }
    
    private func setupSocketEvents() {
        socket.on(clientEvent: .connect) { data, ack in
            print("Connected to chat server")
        }
        
        socket.on("new_message") { [weak self] data, ack in
            if let messageData = data[0] as? [String: Any] {
                self?.handleNewMessage(messageData)
            }
        }
        
        socket.on("typing_indicator") { [weak self] data, ack in
            if let typingData = data[0] as? [String: Any] {
                self?.handleTypingIndicator(typingData)
            }
        }
    }
    
    func connect() {
        socket.connect()
    }
    
    func disconnect() {
        socket.disconnect()
    }
    
    func joinConversation(_ conversationId: Int) {
        socket.emit("join_conversation", ["conversation_id": conversationId])
    }
    
    func sendMessage(_ content: String, conversationId: Int) {
        socket.emit("send_message", [
            "conversation_id": conversationId,
            "message_type": "text",
            "content": content
        ])
    }
}
```

### 2. MessageKit Integration

```swift
import MessageKit

struct ChatMessage: MessageType {
    var sender: SenderType
    var messageId: String
    var sentDate: Date
    var kind: MessageKind
}

struct ChatUser: SenderType {
    var senderId: String
    var displayName: String
}

class ChatViewController: MessagesViewController {
    private let chatService = ChatService()
    private var messages: [ChatMessage] = []
    
    override func viewDidLoad() {
        super.viewDidLoad()
        setupMessageKit()
        chatService.connect()
    }
    
    private func setupMessageKit() {
        messagesCollectionView.messagesDataSource = self
        messagesCollectionView.messagesLayoutDelegate = self
        messagesCollectionView.messagesDisplayDelegate = self
        messageInputBar.delegate = self
    }
}
```

### 3. Push Notifications Setup

```swift
import UserNotifications
import Firebase

class NotificationService {
    func requestPermission() {
        UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .badge, .sound]) { granted, error in
            if granted {
                DispatchQueue.main.async {
                    UIApplication.shared.registerForRemoteNotifications()
                }
            }
        }
    }
    
    func handleRemoteNotification(_ userInfo: [AnyHashable: Any]) {
        if let conversationId = userInfo["conversation_id"] as? Int {
            // Navigate to conversation
        }
    }
}
```

---

## Security Considerations

### Authentication Flow

1. **App-level Authentication**: X-Timestamp + X-Signature headers
2. **User Authentication**: Bearer token in Authorization header
3. **WebSocket Authentication**: Token passed in socket auth config

### Message Security

- **Input Sanitization**: All message content sanitized for XSS
- **File Validation**: File type, size, and content validation
- **Rate Limiting**: Prevents spam and abuse

### Data Protection

- **Encryption**: Optional message encryption at rest
- **Access Control**: Users can only access their own conversations
- **Audit Logging**: All admin actions logged

---

## Performance Optimizations

### Database Optimizations

- **Indexes**: Proper indexing on frequently queried fields
- **Pagination**: Large result sets paginated
- **Archiving**: Old conversations moved to archive tables

### WebSocket Optimizations

- **Connection Pooling**: Efficient connection management
- **Room Management**: Users only join relevant conversation rooms
- **Message Queuing**: Offline message delivery

### Caching Strategy

- **Active Conversations**: Cache frequently accessed conversations
- **Message History**: Cache recent messages for quick access
- **User Presence**: Cache online/offline status

---

## Admin Features (Web Manager)

### Conversation Management

- **Dashboard**: Overview of all active conversations
- **Assignment**: Assign conversations to specific admins
- **Status Control**: Open/close/archive conversations
- **Bulk Actions**: Mass operations on conversations

### Analytics

- **Response Time**: Average admin response time
- **Message Volume**: Daily/weekly message statistics
- **User Satisfaction**: Optional feedback system
- **Resolution Rate**: Conversation resolution tracking

---

## Testing

### Unit Tests

- Message validation
- Authentication flow
- Database operations
- WebSocket event handling

### Integration Tests

- End-to-end message flow
- File upload process
- Real-time event delivery
- iOS client integration

### Load Testing

- Concurrent connections
- Message throughput
- Database performance
- WebSocket scalability

---

## Deployment Considerations

### Server Requirements

- **Node.js**: v16+ for Socket.io support
- **Memory**: Additional RAM for WebSocket connections
- **Network**: WebSocket-compatible reverse proxy

### Monitoring

- **Connection Count**: Active WebSocket connections
- **Message Rate**: Messages per second
- **Error Rate**: Failed message delivery
- **Response Time**: API and WebSocket latency

### Scaling

- **Horizontal Scaling**: Multiple server instances
- **Load Balancing**: Sticky sessions for WebSocket
- **Database Sharding**: Partition by conversation_id
- **CDN**: File attachments served via CDN
