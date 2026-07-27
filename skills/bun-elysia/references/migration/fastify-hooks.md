# Fastify to Elysia: Hooks Migration

Side-by-side comparison of lifecycle hooks in Fastify vs Elysia.

## Table of Contents
- [Lifecycle Overview](#lifecycle-overview)
- [Request Hooks](#request-hooks)
- [Pre-Handler Hooks](#pre-handler-hooks)
- [Response Hooks](#response-hooks)
- [Error Handling](#error-handling)
- [Decorators and State](#decorators-and-state)
- [Hook Ordering](#hook-ordering)
- [Common Gotchas](#common-gotchas)

---

## Lifecycle Overview

### Fastify Lifecycle
```
Incoming Request
       |
   onRequest ─────────────> (can short-circuit)
       |
   preParsing ────────────> (can modify payload stream)
       |
     parse
       |
   preValidation ─────────> (can modify body before validation)
       |
    validate
       |
   preHandler ────────────> (can short-circuit, auth checks)
       |
    handler
       |
   preSerialization ──────> (can modify response payload)
       |
   onSend ────────────────> (can modify final response)
       |
   onResponse ────────────> (cleanup, logging)
       |
Response Sent
```

### Elysia Lifecycle
```
Incoming Request
       |
   onRequest ─────────────> (can short-circuit)
       |
     parse
       |
   transform ─────────────> (can modify body/query/params)
       |
    validate
       |
   beforeHandle ──────────> (can short-circuit, auth checks)
       |
    handler
       |
   afterHandle ───────────> (can modify response)
       |
   mapResponse ───────────> (transform response format)
       |
   afterResponse ─────────> (cleanup, logging)
       |
Response Sent
```

### Hook Mapping

| Fastify | Elysia | Notes |
|---------|--------|-------|
| `onRequest` | `onRequest` | First hook, before parsing |
| `preParsing` | `parse` (custom parser) | Modify raw body stream |
| `preValidation` | `transform` | Modify before validation |
| `preHandler` | `beforeHandle` | Auth, guards, can short-circuit |
| *handler* | *handler* | Route handler |
| `preSerialization` | `afterHandle` | Modify response before sending |
| `onSend` | `mapResponse` | Final response transformation |
| `onResponse` | `afterResponse` | After response sent, cleanup |
| `onError` | `onError` | Error handling |

---

## Request Hooks

### Fastify: onRequest
```typescript
// Global hook
fastify.addHook("onRequest", async (request, reply) => {
  console.log(`${request.method} ${request.url}`);
  request.startTime = Date.now();
});

// Short-circuit response
fastify.addHook("onRequest", async (request, reply) => {
  if (request.url === "/maintenance") {
    reply.code(503).send({ error: "Under maintenance" });
    return; // Stops further processing
  }
});

// Route-level hook
fastify.get("/admin", {
  onRequest: async (request, reply) => {
    // Only runs for this route
  }
}, handler);
```

### Elysia: onRequest
```typescript
// Global hook
app.onRequest(({ request }) => {
  const url = new URL(request.url);
  console.log(`${request.method} ${url.pathname}`);
});

// Short-circuit response
app.onRequest(({ request, set }) => {
  const url = new URL(request.url);
  if (url.pathname === "/maintenance") {
    set.status = 503;
    return { error: "Under maintenance" }; // Stops further processing
  }
});

// Route-level hook
app.get("/admin", handler, {
  onRequest: ({ request }) => {
    // Only runs for this route
  }
});

// Note: request.url is full URL in Elysia, not just path
```

**Key Differences:**
- Elysia's `request` is a standard `Request` object
- `request.url` is full URL in Elysia, use `new URL()` for pathname
- Return a value to short-circuit in Elysia

---

## Pre-Handler Hooks

### Fastify: preHandler
```typescript
// Authentication hook
fastify.addHook("preHandler", async (request, reply) => {
  const token = request.headers.authorization?.replace("Bearer ", "");

  if (!token) {
    reply.code(401).send({ error: "Unauthorized" });
    return;
  }

  try {
    request.user = await verifyToken(token);
  } catch {
    reply.code(401).send({ error: "Invalid token" });
  }
});

// Access decorated data in route
fastify.get("/profile", async (request) => {
  return request.user;
});

// Route-specific preHandler
fastify.get("/admin", {
  preHandler: async (request, reply) => {
    if (request.user?.role !== "admin") {
      reply.code(403).send({ error: "Forbidden" });
    }
  }
}, handler);

// Multiple preHandlers
fastify.get("/special", {
  preHandler: [authHook, roleCheck, rateLimiter]
}, handler);
```

### Elysia: derive + beforeHandle
```typescript
// derive: Add context properties (runs before beforeHandle)
app.derive(async ({ headers }) => {
  const token = headers.authorization?.replace("Bearer ", "");
  if (!token) return { user: null };

  try {
    const user = await verifyToken(token);
    return { user };
  } catch {
    return { user: null };
  }
});

// beforeHandle: Guard logic (can short-circuit)
app.beforeHandle(({ user, error }) => {
  if (!user) {
    return error(401, { error: "Unauthorized" });
  }
});

// Access derived data in route
app.get("/profile", ({ user }) => user);

// Route-specific beforeHandle
app.get("/admin", ({ user }) => ({ admin: true }), {
  beforeHandle: ({ user, error }) => {
    if (user?.role !== "admin") {
      return error(403, { error: "Forbidden" });
    }
  }
});

// Multiple beforeHandle hooks
app.get("/special", handler, {
  beforeHandle: [authCheck, roleCheck, rateLimiter]
});
```

**Key Differences:**
- Use `derive` to add context properties (like `request.user`)
- Use `beforeHandle` for guard logic that may reject requests
- `derive` runs before validation, `resolve` runs after
- Return from `beforeHandle` to short-circuit

### Elysia: resolve (Post-Validation)
```typescript
// resolve: Like derive but runs AFTER validation
app
  .guard({
    headers: t.Object({
      authorization: t.String({ pattern: "^Bearer .+" })
    })
  })
  .resolve(({ headers }) => {
    // headers.authorization is guaranteed to exist here
    const token = headers.authorization.slice(7);
    return { token };
  })
  .get("/profile", ({ token }) => ({ token }));
```

---

## Response Hooks

### Fastify: preSerialization
```typescript
fastify.addHook("preSerialization", async (request, reply, payload) => {
  // Wrap all responses in standard format
  return {
    success: true,
    data: payload,
    timestamp: Date.now()
  };
});
```

### Elysia: afterHandle
```typescript
app.afterHandle(({ response }) => {
  // Wrap all responses in standard format
  if (typeof response === "object" && response !== null) {
    return {
      success: true,
      data: response,
      timestamp: Date.now()
    };
  }
  return response;
});

// Route-specific
app.get("/users", () => users, {
  afterHandle: ({ response }) => ({
    count: response.length,
    items: response
  })
});
```

### Fastify: onSend
```typescript
fastify.addHook("onSend", async (request, reply, payload) => {
  // Add response time header
  const duration = Date.now() - request.startTime;
  reply.header("X-Response-Time", `${duration}ms`);
  return payload;
});

// Modify payload (must return serialized form)
fastify.addHook("onSend", async (request, reply, payload) => {
  if (typeof payload === "string") {
    return payload.replace(/password/gi, "[REDACTED]");
  }
  return payload;
});
```

### Elysia: mapResponse
```typescript
app.mapResponse(({ response, set }) => {
  // Add response time header
  set.headers["X-Response-Time"] = `${Date.now()}ms`;

  // Return Response object to fully control output
  if (typeof response === "object") {
    return new Response(JSON.stringify(response), {
      headers: { "Content-Type": "application/json" }
    });
  }
  return response;
});
```

### Fastify: onResponse
```typescript
fastify.addHook("onResponse", async (request, reply) => {
  // Runs AFTER response is sent
  const duration = Date.now() - request.startTime;
  console.log(`${request.method} ${request.url} - ${reply.statusCode} (${duration}ms)`);

  // Analytics, metrics, cleanup
  await analytics.track({
    path: request.url,
    status: reply.statusCode,
    duration
  });
});
```

### Elysia: afterResponse
```typescript
app.afterResponse(({ request, set }) => {
  // Runs AFTER response is sent
  const url = new URL(request.url);
  console.log(`${request.method} ${url.pathname} - ${set.status}`);

  // Analytics, metrics, cleanup (async safe)
  analytics.track({
    path: url.pathname,
    status: set.status
  });
});
```

---

## Error Handling

### Fastify: setErrorHandler
```typescript
fastify.setErrorHandler(async (error, request, reply) => {
  // Log error
  request.log.error(error);

  // Validation error
  if (error.validation) {
    reply.status(400).send({
      error: "VALIDATION_ERROR",
      message: "Request validation failed",
      details: error.validation
    });
    return;
  }

  // Not found
  if (error.code === "FST_ERR_NOT_FOUND") {
    reply.status(404).send({
      error: "NOT_FOUND",
      message: "Resource not found"
    });
    return;
  }

  // Custom error types
  if (error.name === "AuthError") {
    reply.status(401).send({
      error: "AUTH_ERROR",
      message: error.message
    });
    return;
  }

  // Default: Internal server error
  reply.status(500).send({
    error: "INTERNAL_ERROR",
    message: "An unexpected error occurred"
  });
});
```

### Elysia: onError
```typescript
// Register custom error types
class AuthError extends Error {
  code = "AUTH_ERROR" as const;
  constructor(message: string) {
    super(message);
  }
}

app
  .error({ AUTH_ERROR: AuthError })
  .onError(({ code, error, set, request }) => {
    // Log error
    console.error(`Error on ${request.method} ${request.url}:`, error);

    switch (code) {
      case "VALIDATION":
        set.status = 400;
        return {
          error: "VALIDATION_ERROR",
          message: "Request validation failed",
          details: error.all
        };

      case "NOT_FOUND":
        set.status = 404;
        return {
          error: "NOT_FOUND",
          message: "Resource not found"
        };

      case "AUTH_ERROR":
        set.status = 401;
        return {
          error: "AUTH_ERROR",
          message: error.message
        };

      default:
        set.status = 500;
        return {
          error: "INTERNAL_ERROR",
          message: "An unexpected error occurred"
        };
    }
  });
```

### Elysia Error Codes
```typescript
// Built-in error codes
type ElysiaErrorCode =
  | "NOT_FOUND"           // Route not found
  | "PARSE"               // Body parsing failed
  | "VALIDATION"          // Schema validation failed
  | "INTERNAL_SERVER_ERROR"
  | "INVALID_COOKIE_SIGNATURE"
  | "INVALID_FILE_TYPE"
  | "UNKNOWN"
  | number;               // HTTP status codes
```

### Route-Level Error Handling
```typescript
// Fastify
fastify.get("/risky", {
  errorHandler: async (error, request, reply) => {
    // Route-specific error handling
    reply.send({ routeError: error.message });
  }
}, handler);

// Elysia
app.get("/risky", handler, {
  error: ({ error }) => {
    // Route-specific error handling
    return { routeError: error.message };
  }
});
```

---

## Decorators and State

### Fastify: decorate
```typescript
// Decorate instance (shared across all requests)
fastify.decorate("db", database);
fastify.decorate("config", { env: "production" });
fastify.decorate("utils", {
  hash: (str: string) => crypto.hash(str),
  random: () => Math.random()
});

// Use in routes (via `this`)
fastify.get("/", async function (request, reply) {
  const users = await this.db.query("SELECT * FROM users");
  return { env: this.config.env, users };
});
```

### Elysia: decorate
```typescript
// Decorate (shared across all requests)
app
  .decorate("db", database)
  .decorate("config", { env: "production" })
  .decorate("utils", {
    hash: (str: string) => crypto.hash(str),
    random: () => Math.random()
  })
  // Access via destructuring
  .get("/", async ({ db, config }) => {
    const users = await db.query("SELECT * FROM users");
    return { env: config.env, users };
  });
```

### Fastify: decorateRequest
```typescript
// Add to request object (per-request)
fastify.decorateRequest("startTime", 0);
fastify.decorateRequest("user", null);

fastify.addHook("onRequest", async (request) => {
  request.startTime = Date.now();
});

fastify.addHook("preHandler", async (request) => {
  request.user = await getUser(request.headers.authorization);
});
```

### Elysia: derive
```typescript
// Add to context (per-request)
app
  .derive(() => ({
    startTime: Date.now()
  }))
  .derive(async ({ headers }) => ({
    user: await getUser(headers.authorization)
  }))
  .get("/", ({ startTime, user }) => ({
    duration: Date.now() - startTime,
    user
  }));
```

### Fastify: State (via decorate)
```typescript
// Mutable state
fastify.decorate("counter", { value: 0 });

fastify.get("/count", async function () {
  this.counter.value++;
  return { count: this.counter.value };
});
```

### Elysia: state
```typescript
// Mutable state
app
  .state("counter", 0)
  .get("/count", ({ store }) => {
    store.counter++;
    return { count: store.counter };
  });

// State with typed initial value
app
  .state("users", [] as User[])
  .get("/users", ({ store }) => store.users)
  .post("/users", ({ store, body }) => {
    store.users.push(body);
    return { count: store.users.length };
  });
```

---

## Hook Ordering

### Fastify Hook Order
```typescript
// Hooks execute in registration order
fastify.addHook("preHandler", () => console.log("1")); // First
fastify.addHook("preHandler", () => console.log("2")); // Second
fastify.addHook("preHandler", () => console.log("3")); // Third

// Route-level hooks run AFTER global hooks
fastify.get("/", {
  preHandler: () => console.log("4") // After 1, 2, 3
}, handler);
```

### Elysia Hook Order
```typescript
// Hooks execute in registration order
app
  .beforeHandle(() => console.log("1")) // First
  .beforeHandle(() => console.log("2")) // Second
  .beforeHandle(() => console.log("3")) // Third
  .get("/", handler, {
    beforeHandle: () => console.log("4") // After 1, 2, 3
  });

// Or array syntax
app.beforeHandle([hook1, hook2, hook3]);
```

### Plugin Hook Inheritance
```typescript
// Fastify - hooks inherited by child contexts
fastify.addHook("onRequest", parentHook);
fastify.register(async (child) => {
  child.addHook("onRequest", childHook);
  // Both parentHook and childHook run for child routes
});

// Elysia - hooks inherited unless scoped
const plugin = new Elysia()
  .onRequest(pluginHook);

app
  .onRequest(appHook)
  .use(plugin); // Both appHook and pluginHook run

// Scoped plugin - hooks don't leak
const scopedPlugin = new Elysia({ scoped: true })
  .onRequest(scopedHook); // Only runs for plugin routes

app.use(scopedPlugin);
app.get("/", handler); // scopedHook does NOT run here
```

---

## Common Gotchas

### 1. Short-Circuit Return Values
```typescript
// Fastify - use reply.send() to short-circuit
fastify.addHook("preHandler", async (request, reply) => {
  reply.code(401).send({ error: "Unauthorized" });
  return; // Must return to stop processing
});

// Elysia - return a value to short-circuit
app.beforeHandle(({ error }) => {
  return error(401, { error: "Unauthorized" });
  // Returning anything stops processing
});

// Elysia - void return continues processing
app.beforeHandle(() => {
  console.log("Logging...");
  // No return = continue to handler
});
```

### 2. Accessing Request Data in onRequest
```typescript
// Fastify - body not yet parsed in onRequest
fastify.addHook("onRequest", async (request) => {
  console.log(request.body); // undefined!
});

// Elysia - same limitation
app.onRequest(({ body }) => {
  console.log(body); // undefined!
});

// Use preHandler/beforeHandle for body access
```

### 3. Async Hook Handling
```typescript
// Fastify - async hooks automatically awaited
fastify.addHook("preHandler", async (request, reply) => {
  request.user = await fetchUser(); // Awaited
});

// Elysia - same behavior
app.derive(async ({ headers }) => {
  const user = await fetchUser(headers.authorization);
  return { user }; // Awaited
});
```

### 4. Hook Scope in Plugins
```typescript
// Fastify - use fastify-plugin to share decorators
import fp from "fastify-plugin";

const plugin = fp(async (fastify) => {
  fastify.decorate("shared", true);
});

// Elysia - use scoped: false (default) to share
const plugin = new Elysia({ name: "my-plugin" })
  .decorate("shared", true);

// Or scope to prevent sharing
const scopedPlugin = new Elysia({ name: "scoped", scoped: true })
  .decorate("local", true); // Not shared
```

### 5. Error Handler Scope
```typescript
// Fastify - setErrorHandler replaces, addHook adds
fastify.setErrorHandler(handler1); // Handler1 active
fastify.setErrorHandler(handler2); // Handler2 replaces Handler1

// Elysia - onError can have multiple handlers
app
  .onError(handler1) // Runs first
  .onError(handler2); // Runs if handler1 doesn't return

// Return from onError to stop chain
app.onError(({ code }) => {
  if (code === "VALIDATION") {
    return { error: "Handled" }; // Stops here
  }
  // Falls through to next handler
});
```

---

## Migration Checklist

1. [ ] Replace `addHook("onRequest", ...)` with `.onRequest(...)`
2. [ ] Replace `addHook("preHandler", ...)` with `.beforeHandle(...)`
3. [ ] Replace `addHook("preSerialization", ...)` with `.afterHandle(...)`
4. [ ] Replace `addHook("onSend", ...)` with `.mapResponse(...)`
5. [ ] Replace `addHook("onResponse", ...)` with `.afterResponse(...)`
6. [ ] Replace `setErrorHandler` with `.onError(...)`
7. [ ] Replace `decorate()` with `.decorate()`
8. [ ] Replace `decorateRequest()` with `.derive()` or `.resolve()`
9. [ ] Replace `reply.code().send()` with `return error(code, body)`
10. [ ] Use `{ set }` instead of `reply` for response modifications
11. [ ] Update `request.url` usage to handle full URLs
12. [ ] Add custom error types with `.error()` method
13. [ ] Use `scoped: true` for encapsulated plugins
