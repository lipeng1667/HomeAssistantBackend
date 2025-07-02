# ToDo list

- [x]Security authrozation for each API request
- [x]redis schema review
- logs/access.log logic review
- [x]JWT secret methods needed?
- [x]Reset webservice stat datas when npm run pm2:restart
- [x]modify file name in middleware/auth.js to userAuth.js

## Test for APIs

- /auth/anonymous

```bash
curl -X POST "http://47.94.108.189:10000/api/auth/anonymous" \
  -H "Content-Type: application/json" \
  -H "X-Timestamp: 1751474778984" \
  -H "X-Signature: 33260bf9c60de648d281ff0047cf4ccfa075b850be1fb188ed02409cd521b4f7" \
  -d '{"device_id": "test_device_123"}'
```
