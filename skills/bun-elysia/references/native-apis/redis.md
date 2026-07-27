# Bun.redis - Native Redis Client

Bun provides native Redis bindings implemented in Zig using RESP3 protocol. Supports Redis 7.2+ and Valkey with 7.9x faster performance than ioredis.

## Table of Contents
- [Connection Setup](#connection-setup)
- [Basic Operations](#basic-operations)
- [Hash Operations](#hash-operations)
- [List Operations](#list-operations)
- [Set Operations](#set-operations)
- [Pub/Sub](#pubsub)
- [Pipelining](#pipelining)
- [Connection Management](#connection-management)
- [Best Practices](#best-practices)

---

## Connection Setup

### Default Client (Environment Variables)

```typescript
import { redis } from "bun";

// Uses env vars in order: VALKEY_URL, REDIS_URL, or defaults to redis://localhost:6379
await redis.set("key", "value");
const value = await redis.get("key");
```

### Custom RedisClient

```typescript
import { RedisClient } from "bun";

// URL format
const client = new RedisClient("redis://localhost:6379");

// With authentication
const client = new RedisClient("redis://user:password@localhost:6379/0");

// TLS connections
const client = new RedisClient("rediss://localhost:6379");
const client = new RedisClient("redis+tls://localhost:6379");

// Unix socket
const client = new RedisClient("redis+unix:///var/run/redis.sock");

// TLS over Unix socket
const client = new RedisClient("redis+tls+unix:///var/run/redis.sock");
```

### Configuration Options

```typescript
const client = new RedisClient(url, {
  // Connection
  connectionTimeout: 5000,    // Connection timeout in ms
  idleTimeout: 30000,         // Close idle connections after ms

  // Reconnection
  autoReconnect: true,        // Auto-reconnect on disconnect
  maxRetries: 10,             // Max reconnection attempts

  // Queueing
  enableOfflineQueue: true,   // Queue commands while disconnected

  // Performance
  enableAutoPipelining: true, // Auto-batch commands (default: true)

  // TLS
  tls: true,
  // Or custom TLS config:
  tls: {
    rejectUnauthorized: true,
    ca: certBuffer
  }
});
```

---

## Basic Operations

### String Operations

```typescript
import { redis } from "bun";

// Set and get
await redis.set("name", "Alice");
const name = await redis.get("name"); // "Alice"

// Get as buffer
const buffer = await redis.getBuffer("name"); // Uint8Array

// Set with expiration
await redis.set("session", "token123");
await redis.expire("session", 3600); // 1 hour TTL

// Check TTL
const ttl = await redis.ttl("session"); // seconds remaining

// Check existence
const exists = await redis.exists("key"); // boolean

// Delete key
await redis.del("key");

// Increment/Decrement
await redis.set("counter", "0");
await redis.incr("counter"); // 1
await redis.decr("counter"); // 0
await redis.incrby("counter", 5); // 5
```

---

## Hash Operations

Store and retrieve multiple fields within a single key.

```typescript
// Set multiple fields
await redis.hmset("user:123", [
  "name", "Alice",
  "email", "[email protected]",
  "active", "true"
]);

// Get single field
const name = await redis.hget("user:123", "name"); // "Alice"

// Get multiple fields
const [name, email] = await redis.hmget("user:123", ["name", "email"]);
// ["Alice", "[email protected]"]

// Get all fields
const user = await redis.hgetall("user:123");
// { name: "Alice", email: "[email protected]", active: "true" }

// Increment numeric field (integer)
await redis.hincrby("user:123", "visits", 1);

// Increment float field
await redis.hincrbyfloat("user:123", "score", 1.5);

// Check field existence
const hasEmail = await redis.hexists("user:123", "email"); // boolean

// Delete field
await redis.hdel("user:123", "active");
```

---

## List Operations

```typescript
// Push to list (left/right)
await redis.lpush("queue", "first");  // Push to left (head)
await redis.rpush("queue", "last");   // Push to right (tail)

// Pop from list
const item = await redis.lpop("queue"); // Pop from left
const item = await redis.rpop("queue"); // Pop from right

// Get range (0-indexed, -1 = last)
const items = await redis.lrange("queue", 0, -1); // All items
const first10 = await redis.lrange("queue", 0, 9);

// Get list length
const len = await redis.llen("queue");

// Get by index
const first = await redis.lindex("queue", 0);

// Using raw send for additional list commands
await redis.send("LPUSH", ["mylist", "value1", "value2"]);
const list = await redis.send("LRANGE", ["mylist", "0", "-1"]);
```

---

## Set Operations

```typescript
// Add to set
await redis.sadd("tags", "javascript");
await redis.sadd("tags", "typescript");

// Remove from set
await redis.srem("tags", "javascript");

// Check membership
const isMember = await redis.sismember("tags", "typescript"); // boolean

// Get all members
const tags = await redis.smembers("tags"); // ["typescript"]

// Get random member (without removing)
const random = await redis.srandmember("tags");

// Pop random member (removes it)
const popped = await redis.spop("tags");

// Set size (cardinality)
const size = await redis.scard("tags");
```

---

## Pub/Sub

### Publishing

```typescript
await redis.publish("notifications", "New message!");
await redis.publish("events", JSON.stringify({ type: "update", id: 123 }));
```

### Subscribing

```typescript
// Subscribe to channel
await redis.subscribe("notifications", (message, channel) => {
  console.log(`[${channel}] ${message}`);
});

// Subscribe to multiple channels
await redis.subscribe("events", handler);
await redis.subscribe("alerts", handler);

// Pattern subscribe (wildcard matching)
await redis.psubscribe("user:*", (message, channel) => {
  console.log(`Pattern match on ${channel}: ${message}`);
});
```

### Unsubscribing

```typescript
await redis.unsubscribe("notifications");  // Specific channel
await redis.unsubscribe();                  // All channels
await redis.punsubscribe("user:*");        // Pattern unsubscribe
```

### Using duplicate() for Pub/Sub

A subscribed client can only use subscribe-related methods. Use `.duplicate()` for separate connections.

```typescript
import { RedisClient } from "bun";

const redis = new RedisClient("redis://localhost:6379");
await redis.connect();

// Create separate connection for subscriptions
const subscriber = await redis.duplicate();

// Subscriber handles messages
await subscriber.subscribe("events", (message) => {
  console.log("Received:", message);
});

// Main client can still send commands
await redis.set("key", "value");
await redis.publish("events", "hello"); // Published via main client
```

---

## Pipelining

Bun automatically pipelines commands for improved performance. Multiple commands sent concurrently are batched into a single network round trip.

### Automatic Pipelining

```typescript
// Commands executed concurrently are automatically pipelined
const [user1, user2, user3] = await Promise.all([
  redis.get("user:1:name"),
  redis.get("user:2:name"),
  redis.get("user:3:name")
]);
// Sent as single batch, reducing network round trips
```

### Manual Batching

```typescript
// Batch multiple operations
const results = await Promise.all([
  redis.set("key1", "value1"),
  redis.set("key2", "value2"),
  redis.incr("counter"),
  redis.get("key1")
]);
```

---

## Connection Management

### Connection Events

```typescript
client.onconnect = () => {
  console.log("Connected to Redis");
};

client.onclose = (error) => {
  if (error) {
    console.error("Disconnected with error:", error);
  } else {
    console.log("Disconnected gracefully");
  }
};
```

### Connection Status

```typescript
console.log(client.connected);      // boolean
console.log(client.bufferedAmount); // bytes buffered for sending
```

### Raw Commands

Use `send()` for any Redis command without a dedicated method.

```typescript
// INFO command
const info = await redis.send("INFO", []);

// Custom commands
const result = await redis.send("LPUSH", ["mylist", "a", "b", "c"]);
const keys = await redis.send("KEYS", ["user:*"]);

// SCAN for iteration
const [cursor, keys] = await redis.send("SCAN", ["0", "MATCH", "user:*"]);
```

### Close Connection

```typescript
await client.close();
```

---

## Best Practices

### 1. Use Environment Variables for Connection

```typescript
// Good - Uses REDIS_URL from environment
import { redis } from "bun";
await redis.get("key");

// Also good - Explicit client when needed
const client = new RedisClient(process.env.REDIS_URL);
```

### 2. Implement Caching Pattern

```typescript
async function cached<T>(
  key: string,
  ttl: number,
  fn: () => Promise<T>
): Promise<T> {
  const cached = await redis.get(key);
  if (cached) return JSON.parse(cached);

  const result = await fn();
  await redis.set(key, JSON.stringify(result));
  await redis.expire(key, ttl);
  return result;
}

// Usage
const users = await cached("users:all", 300, () => db.getUsers());
```

### 3. Rate Limiting Pattern

```typescript
async function rateLimit(
  identifier: string,
  limit: number,
  windowSeconds: number
): Promise<boolean> {
  const key = `ratelimit:${identifier}`;
  const count = await redis.incr(key);

  if (count === 1) {
    await redis.expire(key, windowSeconds);
  }

  return count <= limit;
}

// Usage
if (!await rateLimit(request.ip, 100, 60)) {
  return new Response("Rate limited", { status: 429 });
}
```

### 4. Session Store Pattern

```typescript
async function setSession(sessionId: string, data: object, ttl = 86400) {
  const key = `session:${sessionId}`;
  await redis.hmset(key, Object.entries(data).flat());
  await redis.expire(key, ttl);
}

async function getSession(sessionId: string) {
  return redis.hgetall(`session:${sessionId}`);
}

async function destroySession(sessionId: string) {
  await redis.del(`session:${sessionId}`);
}
```

### 5. Use Separate Clients for Pub/Sub

```typescript
// Create dedicated client for subscriptions
const pubClient = new RedisClient(url);
const subClient = pubClient.duplicate();

// Subscribe on dedicated client
await subClient.subscribe("channel", handler);

// Use main client for other operations
await pubClient.set("key", "value");
```

### 6. Handle Reconnection Gracefully

```typescript
const client = new RedisClient(url, {
  autoReconnect: true,
  maxRetries: 10,
  enableOfflineQueue: true // Queue commands during reconnection
});

client.onclose = (error) => {
  if (error) {
    console.error("Redis disconnected, will attempt reconnection");
  }
};
```

---

## URL Formats

| Format | Description |
|--------|-------------|
| `redis://localhost:6379` | Basic connection |
| `redis://user:pass@host:6379` | With authentication |
| `redis://host:6379/0` | Specific database |
| `rediss://host:6379` | TLS connection |
| `redis+tls://host:6379` | TLS connection (alt) |
| `redis+unix:///path/to/socket` | Unix socket |
| `redis+tls+unix:///path/to/socket` | TLS over Unix socket |

---

## Current Limitations

- Redis Cluster not supported (planned)
- Redis Sentinel not supported (planned)
- Transactions (MULTI/EXEC) via raw commands only
- Streams support planned for future
- Lua scripting planned for future

For transactions, use raw commands:
```typescript
await redis.send("MULTI", []);
await redis.send("SET", ["key1", "value1"]);
await redis.send("SET", ["key2", "value2"]);
await redis.send("EXEC", []);
```
