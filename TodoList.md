# ToDo list

- [x]Security authrozation for each API request
- [x]redis schema review
- logs/access.log logic review
- [x]JWT secret methods needed?
- [x]Reset webservice stat datas when npm run pm2:restart
- [x]modify file name in middleware/auth.js to userAuth.js

## Test for APIs

- /auth/anonymous
 curl -X POST <http://47.94.108.189:10000/api/auth/anonymous> \
    -H "Content-Type: application/json" \
    -H "X-Timestamp: 1751468434501" \
    -H "X-Signature: d40dc7eaa13286b4051c9936f8f50364b6244be1a8b77
  425baf226b01e632d07" \
    -d '{"device_id": "test_device_123"}'
