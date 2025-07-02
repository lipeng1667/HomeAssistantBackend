# ToDo list

- [x]Security authrozation for each API request
- [x]redis schema review
- logs/access.log logic review
- [x]JWT secret methods needed?
- [x]Reset webservice stat datas when npm run pm2:restart
- [x]modify file name in middleware/auth.js to userAuth.js

 TIMESTAMP=$(date +%s000) && SIGNATURE=$(echo -n "$TIMESTAMP" | openssl dgst -sha256 -hmac "EJFIDNFNGIUHq32923HDFHIHsdf866HU" -binary | xxd -p -c 256) && curl -X POST http://47.94.108.189:10000/api/auth/anonymous -H "Content-Type: application/json" -H "X-Timestamp: $TIMESTAMP" -H "X-Signature: $SIGNATURE" -d '{"device_id": "test_device_123"}'
