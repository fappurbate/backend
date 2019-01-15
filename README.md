# WebSocket protocol

Event:
```json
{
  "type": "event",
  "subject": "|string|",
  "data": "|any+optional|"
}
```

Request:
```json
{
  "type": "request",
  "requestId": "|number|string|",
  "subject": "|string|",
  "data": "|any+optional|"
}
```

Successful response:
```json
{
  "type": "response",
  "requestId": "|number|string|",
  "data": "|any+optional|"
}
```

Failing response:
```json
{
    "type": "response",
    "requestId": "|number|string|",
    "error": "|string|",
    "data": "|any+optional|"
}
```
