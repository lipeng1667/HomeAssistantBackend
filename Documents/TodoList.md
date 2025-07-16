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

2025.07.16

```text
about websocket to different instance, here is the solution from gemini, let talk about it later:
 Of course. This is a classic and important challenge when scaling real-time applications with Node.js clustering. Your analysis is correct: the @socket.io/redis-adapter is doing its job of broadcasting events across instances, but it doesn't handle how incoming connections are distributed.

  The root of the problem is that each of your PM2 instances is a separate server, and without a mechanism to ensure a client "sticks" to one instance, the client can establish connections with multiple instances.

  Here are some solutions, starting with the most standard and recommended approach.

  Solution 1: Implement Sticky Sessions (Recommended)

  The most robust solution is to use "sticky sessions" (also known as session affinity) at the load balancer level. This ensures that all requests (including the initial HTTP polling and the WebSocket upgrade) from a specific user are always routed to the same PM2 instance.

  How to achieve this:

  If you are using a reverse proxy like Nginx in front of your Node.js application, you can use the ip_hash directive. This uses the client's IP address to determine which server instance should handle the request.

  Here is an example Nginx configuration snippet:

    1 upstream my_app {
    2   # Use ip_hash for sticky sessions
    3   ip_hash;
    4
    5   server 127.0.0.1:3001; # PM2 instance 1
    6   server 127.0.0.1:3002; # PM2 instance 2
    7   server 127.0.0.1:3003; # PM2 instance 3
    8   # ... add all your PM2 instance addresses
    9 }
   10
   11 server {
   12   listen 80;
   13   server_name your_domain.com;
   14
   15   location / {
   16     proxy_pass http://my_app;
   17     proxy_http_version 1.1;
   18     proxy_set_header Upgrade $http_upgrade;
   19     proxy_set_header Connection "upgrade";
   20     proxy_set_header Host $host;
   21     proxy_set_header X-Real-IP $remote_addr;
   22     proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
   23   }
   24 }

  If you are using a different load balancer (e.g., AWS ELB, HAProxy, or a cloud provider's service), look for a "session affinity" or "sticky session" setting and enable it.

  Solution 2: Force WebSocket Transport Only

  The multiple connection issue is often exacerbated by Socket.io's default behavior, which starts with HTTP long-polling and then tries to upgrade to WebSockets. Each polling request is a separate HTTP request that a load balancer might send to a different server instance.

  You can configure Socket.io to only use the WebSocket transport, which establishes a more persistent, single connection.

  Server-side configuration (`services/socketService.js`):

   1 const { Server } = require("socket.io");
   2
   3 const io = new Server(httpServer, {
   4   transports: ['websocket'] // Force WebSocket-only
   5 });

  Client-side configuration:

   1 const socket = io({
   2   transports: ['websocket'] // Force WebSocket-only
   3 });

  Caveat: This approach is simpler but has a downside: users behind corporate firewalls or proxies that block WebSocket connections will not be able to connect. The sticky session approach (Solution 1) is generally more reliable as it supports all transports.

  Solution 3: Review Client-Side Connection Logic

  Aggressive reconnection logic on the client can sometimes worsen this issue, especially if instances are restarting or network conditions are unstable. While not a primary fix, ensuring your client-side code doesn't try to reconnect too rapidly or create new socket instances unnecessarily can help mitigate the symptoms.

  In summary, implementing sticky sessions (Solution 1) is the industry-standard and most effective way to resolve this issue while maintaining a robust and scalable architecture.
```
