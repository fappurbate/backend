# Fappurbate Backend

## NPM scripts

- `npm run dev`: Start development mode (load all services locally with hot-reload & REPL)
- `npm run dev:scripts`
- `npm run build:scripts`: Build scripts
- `npm run start`: Start production mode (set `SERVICES` env variable to load certain services)
- `npm run cli`: Start a CLI and connect to production. Don't forget to set production namespace with `--ns` argument in script
- `npm run lint`: Run ESLint
- `npm run ci`: Run continuous test mode with watching
- `npm test`: Run tests & generate coverage report
- `npm run dc:up`: Start the stack with Docker Compose
- `npm run dc:down`: Stop the stack with Docker Compose

## WebSocket protocol

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
