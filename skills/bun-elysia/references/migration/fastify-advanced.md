# Fastify to Elysia: Advanced Migration

Side-by-side comparison of WebSocket, Swagger/OpenAPI, file uploads, CORS, streaming, error handling, and production patterns.

## Table of Contents
- [WebSocket](#websocket)
- [Swagger/OpenAPI](#swaggeropenapi)
- [File Uploads](#file-uploads)
- [CORS](#cors)
- [Streaming](#streaming)
- [Error Handling](#error-handling)
- [Testing](#testing)
- [Production Patterns](#production-patterns)
- [Common Gotchas](#common-gotchas)

---

## WebSocket

### Fastify
```typescript
import fastifyWebsocket from "@fastify/websocket";

fastify.register(fastifyWebsocket);

// Basic WebSocket
fastify.get("/ws", { websocket: true }, (connection, request) => {
  connection.socket.on("message", (message) => {
    const data = JSON.parse(message.toString());
    connection.socket.send(JSON.stringify({ echo: data }));
  });

  connection.socket.on("close", () => {
    console.log("Client disconnected");
  });

  connection.socket.on("error", (error) => {
    console.error("WebSocket error:", error);
  });
});

// With authentication
fastify.get("/ws/chat", {
  websocket: true,
  preHandler: [fastify.authenticate]
}, (connection, request) => {
  const user = request.user;

  connection.socket.on("message", (msg) => {
    // Broadcast to all clients
    fastify.websocketServer.clients.forEach((client) => {
      if (client.readyState === 1) { // OPEN
        client.send(JSON.stringify({
          from: user.name,
          message: msg.toString(),
          timestamp: Date.now()
        }));
      }
    });
  });
});
```

### Elysia
```typescript
// Basic WebSocket
app.ws("/ws", {
  message(ws, message) {
    ws.send({ echo: message });
  },
  close(ws) {
    console.log("Client disconnected");
  },
  error(ws, error) {
    console.error("WebSocket error:", error);
  }
});

// With authentication and typed messages
app.ws("/ws/chat", {
  // Schema for incoming messages
  body: t.Object({
    type: t.Union([t.Literal("message"), t.Literal("typing")]),
    text: t.Optional(t.String())
  }),

  // Query params for auth
  query: t.Object({
    token: t.String()
  }),

  // Auth check before upgrade
  beforeHandle({ query, error }) {
    const user = verifyToken(query.token);
    if (!user) return error(401);
  },

  // Connection opened
  open(ws) {
    const user = verifyToken(ws.data.query.token);
    ws.data.user = user;

    // Subscribe to chat room
    ws.subscribe("chat");

    // Notify others
    ws.publish("chat", {
      type: "system",
      text: `${user.name} joined`
    });
  },

  // Message received
  message(ws, msg) {
    if (msg.type === "message") {
      ws.publish("chat", {
        from: ws.data.user.name,
        text: msg.text,
        timestamp: Date.now()
      });
    }
  },

  // Connection closed
  close(ws) {
    ws.publish("chat", {
      type: "system",
      text: `${ws.data.user?.name} left`
    });
  }
});
```

**Key Differences:**
- Elysia uses Bun's native WebSocket (faster)
- Built-in pub/sub with `ws.subscribe()` and `ws.publish()`
- Message validation with TypeBox schemas
- `ws.data` for storing connection-specific data
- No need to iterate over all clients for broadcasts

---

## Swagger/OpenAPI

### Fastify
```typescript
import swagger from "@fastify/swagger";
import swaggerUi from "@fastify/swagger-ui";

fastify.register(swagger, {
  openapi: {
    info: {
      title: "My API",
      version: "1.0.0",
      description: "API Documentation"
    },
    servers: [
      { url: "http://localhost:3000", description: "Development" },
      { url: "https://api.example.com", description: "Production" }
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: "http",
          scheme: "bearer",
          bearerFormat: "JWT"
        }
      }
    },
    tags: [
      { name: "users", description: "User operations" },
      { name: "auth", description: "Authentication" }
    ]
  }
});

fastify.register(swaggerUi, {
  routePrefix: "/docs",
  uiConfig: {
    docExpansion: "list",
    deepLinking: true
  }
});

// Route with full schema
fastify.post("/users", {
  schema: {
    description: "Create a new user",
    tags: ["users"],
    security: [{ bearerAuth: [] }],
    body: {
      type: "object",
      required: ["name", "email"],
      properties: {
        name: { type: "string", description: "User name" },
        email: { type: "string", format: "email" }
      }
    },
    response: {
      201: {
        type: "object",
        properties: {
          id: { type: "integer" },
          name: { type: "string" },
          email: { type: "string" }
        }
      },
      400: {
        type: "object",
        properties: {
          error: { type: "string" }
        }
      }
    }
  }
}, handler);
```

### Elysia
```typescript
import { swagger } from "@elysiajs/swagger";

app
  .use(swagger({
    documentation: {
      info: {
        title: "My API",
        version: "1.0.0",
        description: "API Documentation"
      },
      servers: [
        { url: "http://localhost:3000", description: "Development" },
        { url: "https://api.example.com", description: "Production" }
      ],
      components: {
        securitySchemes: {
          bearerAuth: {
            type: "http",
            scheme: "bearer",
            bearerFormat: "JWT"
          }
        }
      },
      tags: [
        { name: "users", description: "User operations" },
        { name: "auth", description: "Authentication" }
      ]
    },
    path: "/docs",
    scalarConfig: {
      theme: "purple"
    }
  }))

  // Route with full schema
  .post("/users", ({ body }) => createUser(body), {
    body: t.Object({
      name: t.String({ description: "User name" }),
      email: t.String({ format: "email" })
    }),
    response: {
      201: t.Object({
        id: t.Integer(),
        name: t.String(),
        email: t.String()
      }),
      400: t.Object({
        error: t.String()
      })
    },
    detail: {
      description: "Create a new user",
      tags: ["users"],
      security: [{ bearerAuth: [] }]
    }
  });
```

**Key Differences:**
- Elysia uses Scalar UI by default (instead of Swagger UI)
- TypeBox schemas auto-generate OpenAPI spec
- `detail` option for route metadata
- Schemas provide both validation and documentation

---

## File Uploads

### Fastify
```typescript
import multipart from "@fastify/multipart";

fastify.register(multipart, {
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB
    files: 5
  }
});

// Single file upload
fastify.post("/upload", async (request, reply) => {
  const data = await request.file();

  if (!data) {
    reply.code(400).send({ error: "No file uploaded" });
    return;
  }

  // Validate mimetype
  if (!data.mimetype.startsWith("image/")) {
    reply.code(400).send({ error: "Only images allowed" });
    return;
  }

  // Save file
  const buffer = await data.toBuffer();
  const filename = `${Date.now()}-${data.filename}`;
  await fs.writeFile(`./uploads/${filename}`, buffer);

  return { filename, size: buffer.length, mimetype: data.mimetype };
});

// Multiple files
fastify.post("/upload-multiple", async (request, reply) => {
  const parts = request.files();
  const results = [];

  for await (const part of parts) {
    const buffer = await part.toBuffer();
    const filename = `${Date.now()}-${part.filename}`;
    await fs.writeFile(`./uploads/${filename}`, buffer);
    results.push({ filename, size: buffer.length });
  }

  return { files: results };
});

// With form fields
fastify.post("/upload-with-data", async (request, reply) => {
  const parts = request.parts();
  const data: Record<string, any> = {};
  const files = [];

  for await (const part of parts) {
    if (part.type === "file") {
      const buffer = await part.toBuffer();
      files.push({ name: part.filename, size: buffer.length });
    } else {
      data[part.fieldname] = part.value;
    }
  }

  return { data, files };
});
```

### Elysia
```typescript
// Single file upload (built-in, no plugin needed)
app.post("/upload", async ({ body, error }) => {
  const file = body.file;

  // Save file using Bun's native file API
  await Bun.write(`./uploads/${Date.now()}-${file.name}`, file);

  return {
    filename: file.name,
    size: file.size,
    mimetype: file.type
  };
}, {
  body: t.Object({
    file: t.File({
      type: "image/*",           // Validate mimetype
      maxSize: 10 * 1024 * 1024  // 10MB limit
    })
  })
});

// Multiple files
app.post("/upload-multiple", async ({ body }) => {
  const results = [];

  for (const file of body.files) {
    const filename = `${Date.now()}-${file.name}`;
    await Bun.write(`./uploads/${filename}`, file);
    results.push({ filename, size: file.size });
  }

  return { files: results };
}, {
  body: t.Object({
    files: t.Files({
      type: "image/*",
      maxSize: 10 * 1024 * 1024,
      maxItems: 5
    })
  })
});

// With form fields
app.post("/upload-with-data", async ({ body }) => {
  await Bun.write(`./uploads/${body.file.name}`, body.file);

  return {
    title: body.title,
    description: body.description,
    file: { name: body.file.name, size: body.file.size }
  };
}, {
  body: t.Object({
    title: t.String(),
    description: t.Optional(t.String()),
    file: t.File()
  })
});
```

**Key Differences:**
- Elysia has built-in file upload support (no plugin)
- `t.File()` and `t.Files()` for validation
- `Bun.write()` for efficient file saving
- File validation (type, size) in schema

---

## CORS

### Fastify
```typescript
import cors from "@fastify/cors";

fastify.register(cors, {
  origin: (origin, cb) => {
    const allowedOrigins = [
      "http://localhost:3000",
      "https://myapp.com"
    ];

    if (!origin || allowedOrigins.includes(origin)) {
      cb(null, true);
    } else {
      cb(new Error("Not allowed by CORS"), false);
    }
  },
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With"],
  exposedHeaders: ["X-Total-Count"],
  credentials: true,
  maxAge: 86400,
  preflight: true,
  strictPreflight: true
});
```

### Elysia
```typescript
import { cors } from "@elysiajs/cors";

app.use(cors({
  origin: (request) => {
    const origin = request.headers.get("origin");
    const allowedOrigins = [
      "http://localhost:3000",
      "https://myapp.com"
    ];

    if (!origin || allowedOrigins.includes(origin)) {
      return true;
    }
    return false;
  },
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With"],
  exposeHeaders: ["X-Total-Count"],
  credentials: true,
  maxAge: 86400
}));

// Simple configuration
app.use(cors({
  origin: ["http://localhost:3000", "https://myapp.com"],
  credentials: true
}));

// Allow all origins
app.use(cors());
```

**Key Differences:**
- Similar API between both
- Elysia uses `exposeHeaders` (vs `exposedHeaders`)
- Origin function receives request object in Elysia

---

## Streaming

### Fastify
```typescript
import { createReadStream } from "fs";

// File stream
fastify.get("/file/:name", async (request, reply) => {
  const stream = createReadStream(`./files/${request.params.name}`);
  reply.type("application/octet-stream").send(stream);
});

// Server-Sent Events
fastify.get("/events", async (request, reply) => {
  reply.raw.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    "Connection": "keep-alive"
  });

  const interval = setInterval(() => {
    reply.raw.write(`data: ${JSON.stringify({ time: Date.now() })}\n\n`);
  }, 1000);

  request.raw.on("close", () => {
    clearInterval(interval);
  });

  // Keep connection open
  await new Promise(() => {});
});

// Streaming JSON
fastify.get("/large-data", async (request, reply) => {
  reply.type("application/json");

  reply.raw.write("[");
  let first = true;

  for await (const item of fetchLargeDataset()) {
    if (!first) reply.raw.write(",");
    reply.raw.write(JSON.stringify(item));
    first = false;
  }

  reply.raw.end("]");
});
```

### Elysia
```typescript
// File stream using Bun
app.get("/file/:name", ({ params }) => {
  const file = Bun.file(`./files/${params.name}`);
  return new Response(file.stream(), {
    headers: { "Content-Type": file.type || "application/octet-stream" }
  });
});

// Server-Sent Events
app.get("/events", () => {
  const stream = new ReadableStream({
    start(controller) {
      const interval = setInterval(() => {
        controller.enqueue(`data: ${JSON.stringify({ time: Date.now() })}\n\n`);
      }, 1000);

      // Cleanup on cancel
      return () => clearInterval(interval);
    }
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache"
    }
  });
});

// Generator-based streaming
app.get("/stream", async function* () {
  for (let i = 0; i < 10; i++) {
    yield `data: ${JSON.stringify({ count: i })}\n\n`;
    await Bun.sleep(100);
  }
});

// Streaming JSON
app.get("/large-data", async function* () {
  yield "[";
  let first = true;

  for await (const item of fetchLargeDataset()) {
    if (!first) yield ",";
    yield JSON.stringify(item);
    first = false;
  }

  yield "]";
});
```

**Key Differences:**
- Elysia supports async generator functions for streaming
- Uses Web Streams API (ReadableStream)
- `Bun.file()` for efficient file serving
- No need for raw request/reply access

---

## Error Handling

### Fastify
```typescript
// Global error handler
fastify.setErrorHandler((error, request, reply) => {
  // Log error
  request.log.error({
    err: error,
    req: { method: request.method, url: request.url }
  });

  // Validation error
  if (error.validation) {
    reply.status(400).send({
      error: "VALIDATION_ERROR",
      message: "Request validation failed",
      details: error.validation.map(v => ({
        path: v.instancePath,
        message: v.message
      }))
    });
    return;
  }

  // Custom error with status
  if (error.statusCode) {
    reply.status(error.statusCode).send({
      error: error.name,
      message: error.message
    });
    return;
  }

  // Internal error (hide details in production)
  reply.status(500).send({
    error: "INTERNAL_ERROR",
    message: process.env.NODE_ENV === "production"
      ? "An unexpected error occurred"
      : error.message
  });
});

// Not found handler
fastify.setNotFoundHandler((request, reply) => {
  reply.status(404).send({
    error: "NOT_FOUND",
    message: `Route ${request.method} ${request.url} not found`
  });
});

// Custom error classes
class AppError extends Error {
  constructor(public statusCode: number, message: string) {
    super(message);
    this.name = "AppError";
  }
}

// Throwing custom errors
fastify.get("/user/:id", async (request, reply) => {
  const user = await findUser(request.params.id);
  if (!user) {
    throw new AppError(404, "User not found");
  }
  return user;
});
```

### Elysia
```typescript
// Custom error classes
class AppError extends Error {
  constructor(
    public statusCode: number,
    message: string
  ) {
    super(message);
  }
}

class NotFoundError extends AppError {
  constructor(resource: string) {
    super(404, `${resource} not found`);
  }
}

class ValidationError extends AppError {
  constructor(public details: object[]) {
    super(400, "Validation failed");
  }
}

app
  // Register custom errors
  .error({
    APP_ERROR: AppError,
    NOT_FOUND: NotFoundError,
    VALIDATION: ValidationError
  })

  // Global error handler
  .onError(({ code, error, set, request }) => {
    // Log error
    console.error({
      code,
      message: error.message,
      path: new URL(request.url).pathname
    });

    switch (code) {
      case "VALIDATION":
        set.status = 400;
        return {
          error: "VALIDATION_ERROR",
          message: "Request validation failed",
          details: error.all?.map(e => ({
            path: e.path,
            message: e.message
          }))
        };

      case "NOT_FOUND":
        set.status = 404;
        return {
          error: "NOT_FOUND",
          message: error.message || "Resource not found"
        };

      case "APP_ERROR":
        set.status = (error as AppError).statusCode;
        return {
          error: error.name,
          message: error.message
        };

      default:
        set.status = 500;
        return {
          error: "INTERNAL_ERROR",
          message: process.env.NODE_ENV === "production"
            ? "An unexpected error occurred"
            : error.message
        };
    }
  })

  // Usage
  .get("/user/:id", async ({ params, error }) => {
    const user = await findUser(params.id);
    if (!user) {
      throw new NotFoundError("User");
      // Or: return error(404, { error: "User not found" });
    }
    return user;
  });
```

**Key Differences:**
- Register custom error types with `.error()`
- Error code is string identifier, not HTTP status
- Use `error()` helper or throw errors
- `error.all` contains validation errors array

---

## Testing

### Fastify
```typescript
import { test, describe, beforeAll, afterAll } from "node:test";
import assert from "node:assert";
import Fastify from "fastify";
import app from "./app";

describe("API Tests", () => {
  let fastify;

  beforeAll(async () => {
    fastify = Fastify();
    fastify.register(app);
    await fastify.ready();
  });

  afterAll(async () => {
    await fastify.close();
  });

  test("GET /users returns empty array", async () => {
    const response = await fastify.inject({
      method: "GET",
      url: "/users"
    });

    assert.strictEqual(response.statusCode, 200);
    assert.deepStrictEqual(JSON.parse(response.body), []);
  });

  test("POST /users creates user", async () => {
    const response = await fastify.inject({
      method: "POST",
      url: "/users",
      payload: { name: "Alice", email: "[email protected]" },
      headers: { "Content-Type": "application/json" }
    });

    assert.strictEqual(response.statusCode, 201);
    const body = JSON.parse(response.body);
    assert.strictEqual(body.name, "Alice");
  });

  test("POST /users validates input", async () => {
    const response = await fastify.inject({
      method: "POST",
      url: "/users",
      payload: { name: "" }, // Missing email
      headers: { "Content-Type": "application/json" }
    });

    assert.strictEqual(response.statusCode, 400);
  });
});
```

### Elysia
```typescript
import { describe, expect, it, beforeAll, afterAll } from "bun:test";
import { app } from "./app";

describe("API Tests", () => {
  // Using app.handle() directly
  it("GET /users returns empty array", async () => {
    const response = await app.handle(
      new Request("http://localhost/users")
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual([]);
  });

  it("POST /users creates user", async () => {
    const response = await app.handle(
      new Request("http://localhost/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Alice", email: "[email protected]" })
      })
    );

    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body.name).toBe("Alice");
  });

  it("POST /users validates input", async () => {
    const response = await app.handle(
      new Request("http://localhost/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "" })
      })
    );

    expect(response.status).toBe(400);
  });
});

// Using Eden Treaty for type-safe testing
import { treaty } from "@elysiajs/eden";
import type { App } from "./app";

describe("API Tests (Eden)", () => {
  const api = treaty<App>(app);

  it("GET /users returns empty array", async () => {
    const { data, status } = await api.users.get();

    expect(status).toBe(200);
    expect(data).toEqual([]);
  });

  it("POST /users creates user", async () => {
    const { data, status } = await api.users.post({
      name: "Alice",
      email: "[email protected]"
    });

    expect(status).toBe(201);
    expect(data?.name).toBe("Alice");
  });

  it("handles errors properly", async () => {
    const { error, status } = await api.users({ id: "999" }).get();

    expect(status).toBe(404);
    expect(error?.value).toHaveProperty("error");
  });
});
```

**Key Differences:**
- Elysia uses `app.handle()` with standard Request/Response
- Eden Treaty provides type-safe testing client
- No need for inject() - works with native fetch-like API
- Bun's test runner is Jest-compatible

---

## Production Patterns

### Graceful Shutdown

#### Fastify
```typescript
const fastify = Fastify({ logger: true });

// Register cleanup handlers
const signals = ["SIGINT", "SIGTERM"];
for (const signal of signals) {
  process.on(signal, async () => {
    fastify.log.info(`Received ${signal}, shutting down...`);

    // Stop accepting new connections
    await fastify.close();

    // Cleanup resources
    await database.close();
    await cache.disconnect();

    process.exit(0);
  });
}

await fastify.listen({ port: 3000 });
```

#### Elysia
```typescript
const app = new Elysia()
  .onStart(() => {
    console.log("Server starting...");
  })
  .onStop(async () => {
    console.log("Cleaning up...");
    await database.close();
    await cache.disconnect();
  })
  .listen(3000);

console.log(`Server running on ${app.server?.url}`);

// Graceful shutdown
process.on("SIGINT", () => {
  console.log("Shutting down...");
  app.stop();
});

process.on("SIGTERM", () => {
  console.log("Shutting down...");
  app.stop();
});
```

### Health Checks

```typescript
// Elysia health check
app.get("/health", async ({ set }) => {
  const checks = {
    database: await checkDatabase(),
    redis: await checkRedis(),
    memory: process.memoryUsage().heapUsed < 500 * 1024 * 1024
  };

  const healthy = Object.values(checks).every(Boolean);
  set.status = healthy ? 200 : 503;

  return {
    status: healthy ? "healthy" : "unhealthy",
    timestamp: new Date().toISOString(),
    checks: Object.entries(checks).reduce((acc, [key, ok]) => ({
      ...acc,
      [key]: ok ? "ok" : "error"
    }), {}),
    uptime: process.uptime()
  };
});

// Liveness probe (simple)
app.get("/health/live", () => ({ status: "ok" }));

// Readiness probe (dependencies)
app.get("/health/ready", async ({ set }) => {
  const ready = await database.isConnected();
  set.status = ready ? 200 : 503;
  return { ready };
});
```

### Request Logging

```typescript
app
  .onRequest(({ request }) => {
    const url = new URL(request.url);
    console.log(`--> ${request.method} ${url.pathname}`);
  })
  .derive(() => ({
    startTime: performance.now()
  }))
  .afterResponse(({ request, set, startTime }) => {
    const url = new URL(request.url);
    const duration = (performance.now() - startTime).toFixed(2);
    console.log(`<-- ${request.method} ${url.pathname} ${set.status} ${duration}ms`);
  });
```

### Rate Limiting
```typescript
const rateLimiter = (limit: number, windowMs: number) => {
  const requests = new Map<string, { count: number; reset: number }>();

  // Cleanup old entries periodically
  setInterval(() => {
    const now = Date.now();
    for (const [key, value] of requests) {
      if (now > value.reset) requests.delete(key);
    }
  }, windowMs);

  return new Elysia({ name: "rate-limiter" })
    .derive(({ request }) => ({
      clientIp: request.headers.get("x-forwarded-for")?.split(",")[0] ||
                request.headers.get("x-real-ip") ||
                "unknown"
    }))
    .beforeHandle(({ clientIp, set, error }) => {
      const now = Date.now();
      const record = requests.get(clientIp);

      if (!record || now > record.reset) {
        requests.set(clientIp, { count: 1, reset: now + windowMs });
        return;
      }

      if (record.count >= limit) {
        set.headers["Retry-After"] = String(
          Math.ceil((record.reset - now) / 1000)
        );
        set.headers["X-RateLimit-Limit"] = String(limit);
        set.headers["X-RateLimit-Remaining"] = "0";
        return error(429, { error: "Too many requests" });
      }

      record.count++;
      set.headers["X-RateLimit-Limit"] = String(limit);
      set.headers["X-RateLimit-Remaining"] = String(limit - record.count);
    });
};

app.use(rateLimiter(100, 60000)); // 100 requests per minute
```

---

## Common Gotchas

### 1. WebSocket Data Context
```typescript
// Fastify - use request object
fastify.get("/ws", { websocket: true }, (connection, request) => {
  const user = request.user; // From preHandler
});

// Elysia - use ws.data
app.ws("/ws", {
  open(ws) {
    ws.data.user = getUser(ws.data.query.token);
  },
  message(ws, msg) {
    console.log(ws.data.user); // Access stored data
  }
});
```

### 2. Streaming Response Type
```typescript
// Fastify - use reply.raw for streams
fastify.get("/stream", (request, reply) => {
  reply.raw.writeHead(200, { "Content-Type": "text/plain" });
  reply.raw.write("data");
  reply.raw.end();
});

// Elysia - return Response or use generator
app.get("/stream", async function* () {
  yield "data";
});
// Or
app.get("/stream", () => new Response(stream));
```

### 3. File Upload Content-Type
```typescript
// Fastify - multipart handled by plugin
// Request must have Content-Type: multipart/form-data

// Elysia - automatic when t.File() is used
app.post("/upload", handler, {
  body: t.Object({
    file: t.File()
  })
});
// Content-Type header set automatically by Eden/fetch
```

### 4. Error Status Codes
```typescript
// Fastify - reply.code() or error.statusCode
reply.code(404).send({ error: "Not found" });
throw { statusCode: 404, message: "Not found" };

// Elysia - error() helper or set.status
return error(404, { error: "Not found" });
// Or in onError:
set.status = 404;
return { error: "Not found" };
```

### 5. OpenAPI Response Schema
```typescript
// Fastify - response schema per status code
schema: {
  response: {
    200: { type: "object", properties: {...} },
    400: { type: "object", properties: {...} }
  }
}

// Elysia - same structure but with TypeBox
response: {
  200: t.Object({...}),
  400: t.Object({...})
}
```

---

## Migration Checklist

1. [ ] Replace `@fastify/websocket` with native Elysia WebSocket
2. [ ] Update WebSocket message handling to use `ws.data`
3. [ ] Replace `@fastify/swagger` with `@elysiajs/swagger`
4. [ ] Move schema descriptions to TypeBox options
5. [ ] Replace `@fastify/multipart` with native `t.File()`
6. [ ] Update file saving to use `Bun.write()`
7. [ ] Replace streaming with async generators or ReadableStream
8. [ ] Replace `fastify.inject()` with `app.handle()`
9. [ ] Update graceful shutdown with `app.stop()` and `onStop`
10. [ ] Replace pino logger with custom logging hooks
11. [ ] Update health checks with `set.status` for proper codes
12. [ ] Replace `reply.raw` streams with Response objects
13. [ ] Use Eden Treaty for type-safe API testing
