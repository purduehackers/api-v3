# Purdue Hackers API v3

Coordination server for managing Purdue Hackers hardware and systems. Controls doorbells, phones, LED signs, Discord message feeds, and event attendance tracking — all through a unified REST + WebSocket API built on Cloudflare Workers.

Successor to the [original API](https://github.com/purduehackers/api).

## Tech Stack

- **Runtime**: Cloudflare Workers
- **Framework**: [Hono](https://hono.dev)
- **Database**: Cloudflare D1 (SQLite) via [Drizzle ORM](https://orm.drizzle.team)
- **State**: Durable Objects (Discord, Doorbell, Phonebell, Sign)
- **Validation**: Zod
- **Language**: TypeScript

## Quickstart

```bash
bun install
bun run db:apply:local
bun dev
```

Server runs at `http://localhost:3000`.

### Environment Variables

Create a `.env.local` file

```
PHONE_API_KEY=
DISCORD_API_KEY=
DOOR_OPENER_API_KEY=
SIGN_PROVISION_KEY=
DSAI_SIGN_API_KEY=
BIDC_SIGN_API_KEY=
```

### Other Commands

| Command | Description |
|---------|-------------|
| `bun run lint` | Lint with oxlint |
| `bun run format` | Format with oxfmt |
| `bun run typecheck` | Type-check with tsc |
| `bun run test` | Run tests (Vitest + Workers pool) |
| `bun run db:generate` | Generate Drizzle migrations |
| `bun run db:push` | Push schema to remote D1 |
| `bun run db:apply:remote` | Apply migrations to remote D1 |
| `bun run cf:deploy` | Deploy to Cloudflare |

## API Routes

### Health Check

#### `GET /`

Returns API info.

**Response:**
```json
{ "ok": true, "readme": "...", "version": 3 }
```

---

### Attendance

CRUD for attendance topics and increment/decrement counters. No authentication required.

#### `GET /attendance/topics`

List all topics with current counts.

**Response:**
```json
{
  "topics": [
    {
      "id": "uuid",
      "name": "Hack Night",
      "description": "Weekly hack night",
      "createdAtMs": 1711234567890,
      "updatedAtMs": 1711234567890,
      "count": 42
    }
  ]
}
```

#### `POST /attendance/topics`

Create a new topic.

**Request body:**
```json
{
  "name": "Hack Night",
  "description": "Weekly hack night"
}
```
- `name` — required, 1-120 characters, must be unique
- `description` — optional, 0-1000 characters

**Response (201):** `{ "topic": { ... } }`

**Errors:** `400` invalid body, `409` name already exists

#### `GET /attendance/topics/:topicId`

Get a single topic with its current count.

**Response (200):** `{ "topic": { ... } }`

**Errors:** `404` not found

#### `PATCH /attendance/topics/:topicId`

Update a topic's name and/or description.

**Request body:**
```json
{
  "name": "New Name",
  "description": "New description"
}
```

**Response (200):** `{ "topic": { ... } }`

**Errors:** `400` invalid body, `404` not found, `409` name conflict

#### `DELETE /attendance/topics/:topicId`

Delete a topic and all its events.

**Response (200):** `{ "ok": true, "topicId": "uuid" }`

**Errors:** `404` not found

#### `GET|POST /attendance/topics/:topicId/increment`

Increment the attendance count by 1.

**Response (200):** `{ "ok": true, "topicId": "uuid", "count": 43 }`

**Errors:** `404` not found

#### `GET|POST /attendance/topics/:topicId/decrement`

Decrement the attendance count by 1.

**Response (200):** `{ "ok": true, "topicId": "uuid", "count": 41 }`

**Errors:** `404` not found, `409` count cannot go negative

---

### Discord

Real-time Discord message feed via WebSocket. Bot connections require authentication; dashboard connections are receive-only.

#### `GET /discord/bot` (WebSocket)

Connect the Discord bot. Requires WebSocket upgrade.

**Auth:** After connecting, send an auth message:
```json
{ "token": "<DISCORD_API_KEY>" }
```

Server responds with `{ "auth": "complete" }` or `{ "auth": "rejected" }` (closes with code 1008).

**Messages from bot:**
```json
{
  "id": "string",
  "channel": { "id": "string", "name": "string" },
  "author": { "id": "string", "name": "string", "avatarHash": "string|null" },
  "timestamp": "ISO 8601",
  "content": { "markdown": "string", "html": "string" },
  "attachments": ["url", "..."]
}
```

Messages are broadcast to all connected dashboard clients.

#### `POST /discord/bot`

Publish a Discord message to all connected dashboard clients. The body uses the same shape as the WebSocket message above.

**Auth:** `Authorization: Bearer <DISCORD_API_KEY>`

**Response (200):** `{ "ok": true }`

**Errors:** `400` invalid JSON or message shape, `403` invalid API key

#### `GET /discord/dashboard` (WebSocket)

Subscribe to receive Discord messages. No authentication. Receives all messages sent by authenticated bots.

---

### Doorbell

Controls the physical doorbell. Supports both WebSocket (real-time) and HTTP.

#### `GET /doorbell/` (WebSocket)

Connect to doorbell state. Receives broadcasts when ringing state changes.

**Messages:**
| Type | Direction | Fields |
|------|-----------|--------|
| `set` | Client → Server | `ringing: boolean` |
| `status` | Server → Client | `ringing: boolean` |
| `ping` / `pong` | Both | — |
| `diagnostic` | Client → Server | `level`, `kind`, `message` |

#### `GET /doorbell/status`

Get current doorbell state via HTTP.

**Response (200):** `{ "ringing": true }` or `{ "ringing": false }`

#### `POST /doorbell/ring`

Trigger the doorbell.

**Response (200):** `{ "ok": true }`

**Errors:** `400` already ringing

---

### Phonebell

Manages the physical phone system — two phones (outside/inside), door opener, and WebRTC signaling for audio.

#### `GET /phonebell/outside` (WebSocket)

Connect the outside phone. Authenticated via handshake protocol.

**Messages:**
```json
{ "type": "Dial", "number": "string" }
{ "type": "Hook", "state": true }
```

#### `GET /phonebell/inside` (WebSocket)

Connect the inside phone. Same protocol as outside.

#### `GET /phonebell/door-opener` (WebSocket)

Connect the door opener device. Receives unlock commands from the phone state machine.

#### `GET /phonebell/signaling` (WebSocket)

WebRTC signaling relay between phones for peer-to-peer audio.

#### `POST /phonebell/open`

Trigger the door opener via HTTP.

**Auth:** `Authorization: Bearer <DOOR_OPENER_API_KEY>`

**Response (204):** No content

**Errors:** `403` invalid API key

---

### Sign

Manages LED sign devices — provisioning, device listing, and WiFi configuration.

#### `POST /sign/provision`

One-time provisioning of the sign system. Returns the provision key. Can only be called once.

**Response (200):** `{ "key": "<SIGN_PROVISION_KEY>" }`

**Errors:** `403` already provisioned or provisioning disabled

#### `GET /sign/devices`

List all connected sign devices.

**Response (200):** `{ "devices": ["device-name-1", "device-name-2"] }`

#### `GET /sign/:device/wifi`

Get WiFi networks from a specific sign device. 10-second timeout.

**Response (200):** `{ "networks": [...] }`

#### `PUT /sign/:device/wifi`

Set WiFi configuration for a sign device.

**Request body:**
```json
{
  "networks": [
    {
      "ssid": "PurdueHackers",
      "password": "secret",
      "network_type": "personal"
    }
  ]
}
```

Supports `"personal"` and `"enterprise"` network types. Enterprise networks accept optional `enterprise_email` and `enterprise_username` fields.

**Response (200):** `{ "ok": true }`

#### `GET /sign/ws` (WebSocket)

Connect a sign device. Requires authentication after connecting:

```json
{ "type": "auth", "key": "<DSAI_SIGN_API_KEY or BIDC_SIGN_API_KEY>" }
```

**Messages:**
| Type | Direction | Fields |
|------|-----------|--------|
| `auth` | Device → Server | `key` |
| `status` | Device → Server | — |
| `ping` / `pong` | Both | — |
| `wifi_networks` | Device → Server | `request_id`, `networks` |
| `wifi_ack` | Device → Server | `request_id` |

## Architecture

```
src/
├── actors/          # Durable Objects (stateful WebSocket actors)
│   ├── discord/     # Discord bot ↔ dashboard message relay
│   ├── doorbell/    # Doorbell state management
│   ├── phonebell/   # Phone system state machine + signaling
│   └── sign/        # Sign device registry + WiFi config
├── db/              # Drizzle ORM schema and connection
├── lib/             # Shared utilities and types
├── protocol/        # Zod message schemas for WebSocket protocols
├── server/          # Hono route definitions
├── services/        # Business logic (AttendanceService)
└── index.ts         # Worker entry point
```

Each Durable Object maintains persistent WebSocket connections and state. The attendance system uses D1 (SQLite) for durable storage via Drizzle ORM.
