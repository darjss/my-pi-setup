# Bun.serve - HTTP Server

Bun's built-in HTTP server is extremely fast, follows web standards (Request/Response API), and supports WebSockets natively.

## Table of Contents
- [Basic Server](#basic-server)
- [Routes Object](#routes-object)
- [Request Handling](#request-handling)
- [Response Types](#response-types)
- [Static File Serving](#static-file-serving)
- [WebSocket Upgrade](#websocket-upgrade)
- [Error Handling](#error-handling)
- [Server Options](#server-options)
- [Best Practices](#best-practices)

---

## Basic Server

### Minimal Setup

```typescript
const server = Bun.serve({
  port: 3000,
  fetch(request) {
    return new Response("Hello, World!");
  }
});

console.log(`Server running at http://localhost:${server.port}`);
```

### With Hostname

```typescript
Bun.serve({
  hostname: "0.0.0.0",  // Listen on all interfaces
  port: 3000,
  fetch(request) {
    return new Response("Hello!");
  }
});
```

---

## Routes Object

The `routes` object (Bun v1.2.3+) provides declarative routing with ~15% better performance than manual routing.

### Static Routes

```typescript
Bun.serve({
  routes: {
    // Static response (cached for server lifetime)
    "/api/status": new Response("OK"),

    // Static JSON
    "/api/health": Response.json({ status: "healthy" })
  }
});
```

### Dynamic Routes with Parameters

```typescript
Bun.serve({
  routes: {
    // URL parameters available via req.params
    "/users/:id": (req) => {
      return Response.json({ userId: req.params.id });
    },

    "/posts/:postId/comments/:commentId": (req) => {
      const { postId, commentId } = req.params;
      return Response.json({ postId, commentId });
    }
  }
});
```

### Per-HTTP Method Handlers

```typescript
import { Database } from "bun:sqlite";

const db = new Database("posts.db");

Bun.serve({
  routes: {
    "/api/posts": {
      GET: () => {
        const posts = db.query("SELECT * FROM posts").all();
        return Response.json(posts);
      },

      POST: async (req) => {
        const body = await req.json();
        const id = crypto.randomUUID();
        db.query(
          "INSERT INTO posts (id, title, content) VALUES (?, ?, ?)"
        ).run(id, body.title, body.content);
        return Response.json({ id, ...body }, { status: 201 });
      },

      DELETE: async (req) => {
        // Handle DELETE
        return new Response(null, { status: 204 });
      }
    }
  }
});
```

### Wildcard Routes

```typescript
Bun.serve({
  routes: {
    // Match any path under /api/
    "/api/*": Response.json({ message: "API endpoint not found" }, { status: 404 }),

    // Specific routes take precedence over wildcards
    "/api/users": Response.json([])
  }
});
```

### Redirects

```typescript
Bun.serve({
  routes: {
    "/old-path": Response.redirect("/new-path"),
    "/external": Response.redirect("https://example.com", 301)
  }
});
```

### File Serving in Routes

```typescript
import index from "./public/index.html";

Bun.serve({
  routes: {
    "/": index,  // Serve HTML file
    "/favicon.ico": Bun.file("./public/favicon.ico")
  }
});
```

### Fallback Handler

```typescript
Bun.serve({
  routes: {
    "/api/users": () => Response.json([]),
    "/api/posts": () => Response.json([])
  },

  // Handles requests not matching any route
  fetch(request) {
    return new Response("Not Found", { status: 404 });
  }
});
```

### Hot Reload Routes

```typescript
const server = Bun.serve({
  routes: {
    "/api/version": () => Response.json({ version: "1.0.0" })
  }
});

// Update routes without restart
server.reload({
  routes: {
    "/api/version": () => Response.json({ version: "2.0.0" }),
    "/api/new-endpoint": () => Response.json({ new: true })
  }
});
```

---

## Request Handling

### URL and Query Parameters

```typescript
fetch(request) {
  const url = new URL(request.url);

  // Pathname
  console.log(url.pathname); // "/api/users"

  // Query parameters
  const limit = url.searchParams.get("limit");      // "10"
  const tags = url.searchParams.getAll("tag");      // ["js", "ts"]
  const page = url.searchParams.get("page") ?? "1"; // Default value

  return new Response("OK");
}
```

### Headers

```typescript
fetch(request) {
  // Read headers
  const auth = request.headers.get("Authorization");
  const contentType = request.headers.get("Content-Type");
  const userAgent = request.headers.get("User-Agent");

  // Check header existence
  if (!auth) {
    return new Response("Unauthorized", { status: 401 });
  }

  return new Response("OK");
}
```

### Body Parsing

```typescript
fetch(request) {
  // JSON body
  const json = await request.json();

  // Text body
  const text = await request.text();

  // Form data (multipart or urlencoded)
  const formData = await request.formData();
  const name = formData.get("name");
  const file = formData.get("file"); // Blob for file uploads

  // Binary data
  const buffer = await request.arrayBuffer();
  const blob = await request.blob();

  return new Response("OK");
}
```

### File Uploads

```typescript
fetch(request) {
  const formData = await request.formData();
  const file = formData.get("file");

  if (file instanceof Blob) {
    // Get file info
    console.log(file.name, file.size, file.type);

    // Save to disk
    await Bun.write(`./uploads/${file.name}`, file);

    // Or read content
    const content = await file.text();
    const bytes = await file.arrayBuffer();
  }

  return Response.json({ uploaded: true });
}
```

### Client IP Address

```typescript
Bun.serve({
  fetch(request, server) {
    const ip = server.requestIP(request);
    // { address: "127.0.0.1", family: "IPv4", port: 54321 }

    return new Response(`Your IP: ${ip?.address}`);
  }
});
```

---

## Response Types

### Text

```typescript
return new Response("Hello, World!");
return new Response("Hello", {
  headers: { "Content-Type": "text/plain; charset=utf-8" }
});
```

### JSON

```typescript
return Response.json({ message: "Hello" });
return Response.json({ error: "Not found" }, { status: 404 });
return Response.json(data, {
  headers: { "Cache-Control": "max-age=3600" }
});
```

### HTML

```typescript
return new Response("<h1>Hello</h1>", {
  headers: { "Content-Type": "text/html" }
});
```

### File

```typescript
return new Response(Bun.file("./index.html"));
return new Response(Bun.file("./image.png"), {
  headers: { "Content-Type": "image/png" }
});
```

### Stream

```typescript
const stream = new ReadableStream({
  async start(controller) {
    controller.enqueue("Hello ");
    await Bun.sleep(1000);
    controller.enqueue("World!");
    controller.close();
  }
});

return new Response(stream, {
  headers: { "Content-Type": "text/plain" }
});
```

### Redirect

```typescript
return Response.redirect("/new-location");           // 302 default
return Response.redirect("/new-location", 301);      // Permanent
return Response.redirect("https://example.com", 307); // Temporary, preserve method
```

### Custom Headers

```typescript
return new Response("OK", {
  status: 200,
  headers: {
    "Content-Type": "application/json",
    "Cache-Control": "max-age=3600, public",
    "X-Custom-Header": "value",
    "Access-Control-Allow-Origin": "*"
  }
});
```

---

## Static File Serving

### Basic Static Server

```typescript
Bun.serve({
  async fetch(request) {
    const url = new URL(request.url);
    const filePath = `./public${url.pathname}`;
    const file = Bun.file(filePath);

    if (await file.exists()) {
      return new Response(file);
    }

    return new Response("Not Found", { status: 404 });
  }
});
```

### With Index Fallback (SPA)

```typescript
Bun.serve({
  async fetch(request) {
    const url = new URL(request.url);
    let path = `./public${url.pathname}`;

    // Serve index.html for directories
    if (path.endsWith("/")) {
      path += "index.html";
    }

    const file = Bun.file(path);
    if (await file.exists()) {
      return new Response(file);
    }

    // SPA fallback - serve index.html for all routes
    return new Response(Bun.file("./public/index.html"));
  }
});
```

### In Routes Object

```typescript
Bun.serve({
  routes: {
    // Buffer file in memory for faster serving
    "/favicon.ico": new Response(
      await Bun.file("./public/favicon.ico").bytes(),
      { headers: { "Content-Type": "image/x-icon" } }
    ),

    // Direct file reference
    "/robots.txt": Bun.file("./public/robots.txt")
  }
});
```

---

## WebSocket Upgrade

### Basic WebSocket Server

```typescript
Bun.serve({
  fetch(request, server) {
    // Attempt upgrade
    if (server.upgrade(request)) {
      return; // Upgrade successful, Bun handles 101 response
    }

    // Not a WebSocket request
    return new Response("HTTP endpoint");
  },

  websocket: {
    open(ws) {
      console.log("Client connected");
      ws.send("Welcome!");
    },

    message(ws, message) {
      console.log("Received:", message);
      ws.send(`Echo: ${message}`);
    },

    close(ws, code, reason) {
      console.log("Client disconnected:", code, reason);
    },

    drain(ws) {
      console.log("Backpressure relieved");
    }
  }
});
```

### With Data Attachment

```typescript
Bun.serve({
  fetch(request, server) {
    const token = new URL(request.url).searchParams.get("token");
    const userId = validateToken(token);

    if (!userId) {
      return new Response("Unauthorized", { status: 401 });
    }

    // Attach data to WebSocket connection
    server.upgrade(request, {
      data: { userId, connectedAt: Date.now() }
    });
  },

  websocket: {
    message(ws, message) {
      console.log(`User ${ws.data.userId} sent: ${message}`);
    }
  }
});
```

### Pub/Sub Pattern

```typescript
Bun.serve({
  fetch(request, server) {
    const room = new URL(request.url).searchParams.get("room") || "general";
    server.upgrade(request, { data: { room } });
  },

  websocket: {
    open(ws) {
      // Subscribe to room
      ws.subscribe(ws.data.room);
      ws.publish(ws.data.room, `User joined ${ws.data.room}`);
    },

    message(ws, message) {
      // Broadcast to all subscribers in room
      ws.publish(ws.data.room, message);
    },

    close(ws) {
      ws.unsubscribe(ws.data.room);
    }
  }
});

// Server-side publish (from fetch handler)
Bun.serve({
  fetch(request, server) {
    if (request.url.endsWith("/broadcast")) {
      server.publish("announcements", "Server announcement!");
      return new Response("Broadcasted");
    }
    // ...
  }
});
```

---

## Error Handling

### Global Error Handler

```typescript
Bun.serve({
  fetch(request) {
    // Your route handling
    throw new Error("Something went wrong");
  },

  // Catches unhandled errors from fetch
  error(error) {
    console.error("Unhandled error:", error);
    return new Response(`Error: ${error.message}`, { status: 500 });
  }
});
```

### Per-Route Error Handling

```typescript
Bun.serve({
  async fetch(request) {
    try {
      const data = await riskyOperation();
      return Response.json(data);
    } catch (error) {
      if (error.code === "NOT_FOUND") {
        return Response.json({ error: "Not found" }, { status: 404 });
      }
      if (error.code === "UNAUTHORIZED") {
        return Response.json({ error: "Unauthorized" }, { status: 401 });
      }

      // Re-throw for global handler
      throw error;
    }
  },

  error(error) {
    console.error(error);
    return Response.json(
      { error: "Internal Server Error" },
      { status: 500 }
    );
  }
});
```

### Development Mode

```typescript
Bun.serve({
  development: true, // Shows error overlay in browser

  fetch(request) {
    throw new Error("Debug this!");
  }
});
```

---

## Server Options

```typescript
const server = Bun.serve({
  // Network
  port: 3000,
  hostname: "localhost",          // Default: "0.0.0.0"
  unix: "/tmp/my-app.sock",       // Unix socket (mutually exclusive with port)
  reusePort: true,                // Allow multiple processes to bind

  // TLS/HTTPS
  tls: {
    key: Bun.file("./key.pem"),
    cert: Bun.file("./cert.pem"),
    ca: Bun.file("./ca.pem")      // Optional CA certificate
  },

  // Limits
  maxRequestBodySize: 1024 * 1024 * 100, // 100MB (default: 128MB)

  // Development
  development: true,               // Error overlay, detailed errors

  // Handlers
  fetch(request, server) {
    return new Response("OK");
  },

  error(error) {
    return new Response("Error", { status: 500 });
  },

  // WebSocket configuration
  websocket: {
    message(ws, message) {},
    open(ws) {},
    close(ws, code, reason) {},
    drain(ws) {},
    maxPayloadLength: 16 * 1024 * 1024,  // 16MB max message
    idleTimeout: 120,                     // Seconds before disconnect
    backpressureLimit: 1024 * 1024,       // 1MB buffer limit
    closeOnBackpressureLimit: false,
    perMessageDeflate: true               // Compression
  }
});
```

---

## Server Methods

```typescript
const server = Bun.serve({ /* ... */ });

// Server info
console.log(server.port);           // 3000
console.log(server.hostname);       // "localhost"
console.log(server.url);            // "http://localhost:3000"

// Pending connections
console.log(server.pendingRequests);
console.log(server.pendingWebSockets);

// Stop server
server.stop();                      // Immediate stop
await server.stop();                // Wait for current request
await server.stop(true);            // Force close all connections

// Hot reload
server.reload({
  fetch(request) {
    return new Response("Updated handler");
  },
  routes: {
    "/new": () => new Response("New route")
  }
});

// Publish to WebSocket topics
server.publish("channel", "message");
```

---

## Best Practices

### 1. Use Routes Object for Better Performance

```typescript
// Good - 15% faster, declarative
Bun.serve({
  routes: {
    "/api/users": () => Response.json(users),
    "/api/posts": () => Response.json(posts)
  }
});

// Works but slower
Bun.serve({
  fetch(req) {
    const url = new URL(req.url);
    if (url.pathname === "/api/users") return Response.json(users);
    if (url.pathname === "/api/posts") return Response.json(posts);
  }
});
```

### 2. Static Responses for Constant Data

```typescript
// Good - response cached, zero allocation per request
Bun.serve({
  routes: {
    "/api/status": new Response("OK"),
    "/api/health": Response.json({ status: "healthy" })
  }
});
```

### 3. Stream Large Responses

```typescript
// Good - memory efficient
return new Response(Bun.file("./large-video.mp4"));

// Avoid for large files
const content = await Bun.file("./large-video.mp4").arrayBuffer();
return new Response(content);
```

### 4. Validate Request Bodies Early

```typescript
fetch(request) {
  // Check content-type before parsing
  if (!request.headers.get("Content-Type")?.includes("application/json")) {
    return Response.json({ error: "Expected JSON" }, { status: 400 });
  }

  const body = await request.json();
  // ...
}
```

### 5. Use Graceful Shutdown

```typescript
const server = Bun.serve({ /* ... */ });

process.on("SIGTERM", async () => {
  console.log("Shutting down...");
  await server.stop(); // Wait for pending requests
  process.exit(0);
});
```

### 6. Separate WebSocket Concerns

```typescript
// Good - clear separation
Bun.serve({
  fetch(request, server) {
    const url = new URL(request.url);

    // WebSocket upgrade only on specific path
    if (url.pathname === "/ws") {
      if (server.upgrade(request)) return;
      return new Response("WebSocket upgrade failed", { status: 400 });
    }

    // HTTP routes
    return handleHTTP(request);
  },

  websocket: { /* ... */ }
});
```

---

## Note on Elysia

For building complex APIs with Bun, consider using **Elysia.js** which provides:
- Declarative routing with validation
- End-to-end type safety
- Plugin ecosystem
- OpenAPI generation
- Better developer experience

See [references/elysia/core.md](../elysia/core.md) for Elysia documentation.
