# Elysia.js WebSocket

Elysia provides first-class WebSocket support with type-safe messages.

## Table of Contents
- [Basic WebSocket](#basic-websocket)
- [Handler Events](#handler-events)
- [Type-Safe Messages](#type-safe-messages)
- [Connection Data](#connection-data)
- [Pub/Sub](#pubsub)
- [Client Example](#client-example)
- [Configuration Options](#configuration-options)

---

## Basic WebSocket

```typescript
import { Elysia } from "elysia";

const app = new Elysia()
  .ws("/ws", {
    open(ws) {
      console.log("Client connected");
      ws.send("Welcome!");
    },
    message(ws, message) {
      console.log("Received:", message);
      ws.send(`Echo: ${message}`);
    },
    close(ws) {
      console.log("Client disconnected");
    }
  })
  .listen(3000);
```

---

## Handler Events

### All Available Handlers
```typescript
app.ws("/chat", {
  // Called when connection opens
  open(ws) {
    ws.send({ type: "connected", id: ws.id });
  },

  // Called for each message
  message(ws, message) {
    // message is the parsed data
    ws.send({ type: "echo", data: message });
  },

  // Called when connection closes
  close(ws, code, reason) {
    console.log(`Closed: ${code} - ${reason}`);
  },

  // Called when backpressure is relieved
  drain(ws) {
    console.log("Ready to send more data");
  },

  // Called on error
  error(ws, error) {
    console.error("WebSocket error:", error);
  }
});
```

### Send Methods
```typescript
message(ws, msg) {
  // Send string
  ws.send("Hello");

  // Send JSON (auto-serialized)
  ws.send({ type: "message", data: msg });

  // Send binary
  ws.send(new Uint8Array([1, 2, 3]));

  // Send with compression
  ws.send("data", true);
}
```

### Close Connection
```typescript
ws.close();              // Normal close
ws.close(1000, "Done");  // With code and reason
```

---

## Type-Safe Messages

### Schema Validation
```typescript
import { Elysia, t } from "elysia";

app.ws("/ws", {
  // Validate incoming messages
  body: t.Object({
    message: t.String(),
    userId: t.Number()
  }),
  // Validate query parameters
  query: t.Object({
    room: t.String()
  }),

  open(ws) {
    const { room } = ws.data.query;
    console.log(`User joined room: ${room}`);
    ws.subscribe(room);
  },

  message(ws, { message, userId }) {
    const { room } = ws.data.query;
    // Broadcast to all subscribers in room
    ws.publish(room, {
      message,
      userId,
      timestamp: Date.now()
    });
  },

  close(ws) {
    const { room } = ws.data.query;
    console.log(`User left room: ${room}`);
  }
});

// Client: new WebSocket('ws://localhost:3000/ws?room=chat')
// ws.send(JSON.stringify({ message: 'Hello!', userId: 1 }))
```

### Discriminated Unions
```typescript
const MessageSchema = t.Union([
  t.Object({
    type: t.Literal("chat"),
    room: t.String(),
    text: t.String()
  }),
  t.Object({
    type: t.Literal("join"),
    room: t.String()
  }),
  t.Object({
    type: t.Literal("leave"),
    room: t.String()
  })
]);

app.ws("/chat", {
  body: MessageSchema,
  message(ws, msg) {
    switch (msg.type) {
      case "chat":
        ws.publish(msg.room, { from: ws.data.username, text: msg.text });
        break;
      case "join":
        ws.subscribe(msg.room);
        break;
      case "leave":
        ws.unsubscribe(msg.room);
        break;
    }
  }
});
```

### WebSocket Schema Options
WebSocket schema can validate:
- **body** - Incoming message
- **query** - Query string parameters
- **params** - Path parameters
- **headers** - Request headers
- **cookie** - Request cookies
- **response** - Value returned from handler

---

## Connection Data

### Access Query and Data
```typescript
app.ws("/ws", {
  query: t.Object({
    token: t.String(),
    username: t.String()
  }),

  open(ws) {
    // Access validated data via ws.data
    const { token, username } = ws.data.query;
    console.log(`${username} connected with token: ${token}`);
  },

  message(ws, msg) {
    console.log(`Message from ${ws.data.query.username}:`, msg);
  }
});
```

### Using beforeHandle for Auth
```typescript
app.ws("/ws", {
  query: t.Object({
    token: t.String()
  }),

  beforeHandle({ query, status }) {
    if (!isValidToken(query.token)) {
      return status(401, "Invalid token");
    }
  },

  open(ws) {
    // Connection allowed - token was valid
  }
});
```

---

## Pub/Sub

### Subscribe to Topics
```typescript
app.ws("/chat", {
  open(ws) {
    // Subscribe to topics
    ws.subscribe("general");
    ws.subscribe(`user:${ws.data.userId}`);
  },

  message(ws, msg) {
    if (msg.type === "join") {
      ws.subscribe(msg.room);
    }

    if (msg.type === "leave") {
      ws.unsubscribe(msg.room);
    }

    if (msg.type === "message") {
      // Publish to all subscribers
      ws.publish(msg.room, {
        from: ws.data.username,
        text: msg.text
      });
    }
  },

  close(ws) {
    // Automatically unsubscribes on close
  }
});
```

### Server-Side Publishing
```typescript
const app = new Elysia()
  .ws("/ws", {
    open(ws) {
      ws.subscribe("notifications");
    }
  })
  .get("/notify", ({ query }) => {
    // Publish from HTTP route
    app.server?.publish("notifications", JSON.stringify({
      type: "notification",
      message: query.message
    }));
    return "Sent";
  })
  .listen(3000);
```

### Publish Options
```typescript
// Send to all subscribers
ws.publish("room", message);

// Send to all subscribers with compression
ws.publish("room", message, true);
```

---

## Client Example

### Browser Client
```typescript
// Connect
const ws = new WebSocket("ws://localhost:3000/ws?token=abc123");

// Connection opened
ws.onopen = () => {
  console.log("Connected");
  ws.send(JSON.stringify({
    type: "join",
    room: "general"
  }));
};

// Receive messages
ws.onmessage = (event) => {
  const data = JSON.parse(event.data);
  console.log("Received:", data);
};

// Send message
function sendMessage(room: string, text: string) {
  ws.send(JSON.stringify({
    type: "message",
    room,
    text
  }));
}

// Handle close
ws.onclose = (event) => {
  console.log(`Closed: ${event.code} - ${event.reason}`);
};

// Handle error
ws.onerror = (error) => {
  console.error("WebSocket error:", error);
};
```

### Using Eden (Type-Safe Client)
```typescript
import { treaty } from "@elysiajs/eden";
import type { App } from "./server";

const client = treaty<App>("localhost:3000");

// Type-safe WebSocket
const chat = client.chat.subscribe();

chat.subscribe((message) => {
  // message is fully typed
  console.log(message);
});

chat.on("open", () => {
  chat.send({
    type: "message",
    room: "general",
    text: "Hello!"
  });
});

chat.on("close", () => console.log("Disconnected"));
chat.on("error", (error) => console.error(error));

// Close connection
chat.close();
```

---

## Configuration Options

```typescript
app.ws("/ws", {
  // Handler options
  open(ws) {},
  message(ws, msg) {},
  close(ws) {},
  drain(ws) {},
  error(ws, error) {},

  // Validation
  body: t.Any(),
  response: t.Any(),
  query: t.Object({}),
  headers: t.Object({}),
  params: t.Object({}),

  // Lifecycle hooks
  beforeHandle() {},

  // WebSocket options
  idleTimeout: 120,           // Seconds before idle close
  maxPayloadLength: 16777216, // 16MB max message size
  backpressureLimit: 1048576, // 1MB backpressure limit
  closeOnBackpressureLimit: false,
  sendPingsAutomatically: true,
  publishToSelf: false        // Receive own published messages
});
```

---

## Full Chat Example

```typescript
import { Elysia, t } from "elysia";

const app = new Elysia()
  .ws("/chat", {
    body: t.Object({
      type: t.Union([
        t.Literal("join"),
        t.Literal("leave"),
        t.Literal("message")
      ]),
      room: t.String(),
      text: t.Optional(t.String())
    }),

    query: t.Object({
      username: t.String()
    }),

    open(ws) {
      const { username } = ws.data.query;
      ws.send({ type: "connected", username });
    },

    message(ws, msg) {
      const { username } = ws.data.query;

      switch (msg.type) {
        case "join":
          ws.subscribe(msg.room);
          ws.publish(msg.room, {
            type: "system",
            text: `${username} joined ${msg.room}`
          });
          break;

        case "leave":
          ws.publish(msg.room, {
            type: "system",
            text: `${username} left ${msg.room}`
          });
          ws.unsubscribe(msg.room);
          break;

        case "message":
          ws.publish(msg.room, {
            type: "message",
            from: username,
            text: msg.text,
            timestamp: Date.now()
          });
          break;
      }
    },

    close(ws) {
      console.log(`${ws.data.query.username} disconnected`);
    }
  })
  .listen(3000);

export type App = typeof app;
```
