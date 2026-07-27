# Elysia.js Lifecycle - Hooks, Middleware, and Plugins

Elysia provides lifecycle hooks for intercepting requests at different stages.

## Table of Contents
- [Lifecycle Overview](#lifecycle-overview)
- [Request Hooks](#request-hooks)
- [Handler Hooks](#handler-hooks)
- [Response Hooks](#response-hooks)
- [Error Handling](#error-handling)
- [Derive and Resolve](#derive-and-resolve)
- [State and Decorate](#state-and-decorate)
- [Plugins](#plugins)
- [Plugin Scoping](#plugin-scoping)

---

## Lifecycle Overview

Request lifecycle order:
1. `onRequest` - Raw request received
2. `parse` - Parse body
3. `transform` - Transform context
4. `derive` - Compute values before validation
5. **Validation** - Schema validation
6. `resolve` - Compute values after validation
7. `beforeHandle` - Before handler execution
8. **Handler** - Route handler
9. `afterHandle` - After handler, before response
10. `mapResponse` - Transform response
11. `afterResponse` - After response sent
12. `onError` - On any error

---

## Request Hooks

### onRequest
Runs immediately when request is received, before routing:

```typescript
app.onRequest(({ request, set }) => {
  console.log(`${request.method} ${request.url}`);

  // Can short-circuit with response
  if (request.url.includes("/blocked")) {
    set.status = 403;
    return "Blocked";
  }
});
```

### Logging Example
```typescript
app.onRequest(({ request }) => {
  console.log(`-> ${request.method} ${new URL(request.url).pathname}`);
});
```

### transform
Modify context before validation:

```typescript
app.transform(({ body, params }) => {
  // Coerce string ID to number
  if (params?.id) {
    params.id = Number(params.id);
  }

  // Trim string fields
  if (body && typeof body === "object") {
    for (const key in body) {
      if (typeof body[key] === "string") {
        body[key] = body[key].trim();
      }
    }
  }
});
```

---

## Handler Hooks

### beforeHandle
Runs after validation, before handler:

```typescript
// Authentication
app.beforeHandle(({ headers, status }) => {
  const token = headers.authorization?.replace("Bearer ", "");
  if (!token || !isValidToken(token)) {
    return status(401, "Unauthorized");
  }
});

// Rate limiting
app.beforeHandle(({ request, status }) => {
  const ip = request.headers.get("x-forwarded-for");
  if (isRateLimited(ip)) {
    return status(429, "Too many requests");
  }
});
```

### Early Return
```typescript
app.beforeHandle(({ path }) => {
  // Return response to skip handler
  if (path === "/health") {
    return { status: "ok" };
  }
  // Return nothing to continue to handler
});
```

### Multiple beforeHandle
```typescript
app.beforeHandle([
  // Runs in order
  checkAuth,
  checkPermissions,
  logRequest
]);
```

---

## Response Hooks

### afterHandle
Modify response after handler:

```typescript
app.afterHandle(({ response, set }) => {
  // Add response time header
  set.headers["X-Response-Time"] = `${performance.now()}ms`;

  // Wrap response
  return {
    success: true,
    data: response,
    timestamp: Date.now()
  };
});
```

### mapResponse
Transform final response:

```typescript
app.mapResponse(({ response, set }) => {
  // Always return JSON
  if (typeof response === "string") {
    set.headers["Content-Type"] = "application/json";
    return JSON.stringify({ message: response });
  }
  return response;
});
```

### afterResponse
Runs after response is sent (cleanup, logging):

```typescript
app.afterResponse(({ request, response }) => {
  // Log completed request
  console.log(`<- ${request.method} ${request.url} completed`);

  // Analytics, metrics, etc.
  trackRequest(request, response);
});
```

---

## Error Handling

### onError
Global error handler:

```typescript
app.onError(({ code, error, set }) => {
  console.error(error);

  switch (code) {
    case "VALIDATION":
      set.status = 400;
      return { error: "Validation failed", details: error.all };

    case "NOT_FOUND":
      set.status = 404;
      return { error: "Not found" };

    case "PARSE":
      set.status = 400;
      return { error: "Invalid request body" };

    default:
      set.status = 500;
      return { error: "Internal server error" };
  }
});
```

### Error Codes
| Code | Description |
|------|-------------|
| `VALIDATION` | Schema validation failed |
| `NOT_FOUND` | Route not found |
| `PARSE` | Body parsing failed |
| `UNKNOWN` | Unhandled error |
| `INTERNAL_SERVER_ERROR` | Server error |
| Custom codes | Your defined error codes |

### Custom Error Codes
```typescript
class AuthError extends Error {
  code = "AUTH_ERROR";
}

app
  .error({ AUTH_ERROR: AuthError })
  .onError(({ code, error }) => {
    if (code === "AUTH_ERROR") {
      return { error: error.message };
    }
  });
```

---

## Derive and Resolve

### derive
Add computed properties to context (runs before validation):

```typescript
app
  .derive(({ headers }) => {
    const token = headers.authorization?.replace("Bearer ", "");
    return {
      authorization: token
    };
  })
  .get("/", ({ authorization }) => authorization);
```

### resolve
Like derive, but runs after validation (at beforeHandle lifecycle):

```typescript
app
  .guard({
    headers: t.Object({
      bearer: t.String({
        pattern: "^Bearer .+$"
      })
    })
  })
  .resolve(({ headers }) => {
    return {
      bearer: headers.bearer.slice(7) // Remove "Bearer " prefix
    };
  })
  .get("/", ({ bearer }) => bearer);
```

### Difference: derive vs resolve
- `derive`: Runs early, before validation, synchronous preferred
- `resolve`: Runs after validation at beforeHandle, can safely use validated data

### Full Context Extension Example
```typescript
app
  // State: Global mutable store
  .state("requestCount", 0)

  // Decorate: Add immutable properties
  .decorate("getTime", () => new Date().toISOString())
  .decorate("config", { apiUrl: "https://api.example.com" })

  // Derive: Compute values from request context (runs before validation)
  .derive(({ headers, store }) => {
    store.requestCount++;
    return {
      userId: headers["x-user-id"] || "anonymous",
      requestId: crypto.randomUUID()
    };
  })

  // Resolve: Compute values after validation
  .resolve(({ headers }) => ({
    user: {
      id: headers["x-user-id"],
      role: headers["x-user-role"] || "guest"
    }
  }))

  .get("/info", ({ store, userId, requestId, user, getTime, config }) => {
    return {
      timestamp: getTime(),
      apiUrl: config.apiUrl,
      totalRequests: store.requestCount,
      currentUser: userId,
      requestId,
      userRole: user.role
    };
  });
```

---

## State and Decorate

### state
Shared state across requests:

```typescript
app
  .state("version", "1.0.0")
  .state("config", { debug: true })
  .get("/info", ({ store }) => ({
    version: store.version,
    debug: store.config.debug
  }));
```

### decorate
Add utilities to context:

```typescript
app
  .decorate("logger", {
    info: (msg: string) => console.log(`[INFO] ${msg}`),
    error: (msg: string) => console.error(`[ERROR] ${msg}`)
  })
  .decorate("db", database)
  .get("/users", ({ db, logger }) => {
    logger.info("Fetching users");
    return db.query("SELECT * FROM users");
  });
```

---

## Plugins

### Creating Plugins
```typescript
import { Elysia } from "elysia";

const authPlugin = new Elysia({ name: "auth" })
  .derive(({ headers }) => ({
    user: getUserFromHeader(headers.authorization)
  }))
  .macro(({ onBeforeHandle }) => ({
    requireAuth(enabled: boolean) {
      if (enabled) {
        onBeforeHandle(({ user, status }) => {
          if (!user) return status(401, "Unauthorized");
        });
      }
    }
  }));

// Usage
app
  .use(authPlugin)
  .get("/public", () => "Public")
  .get("/private", ({ user }) => user, { requireAuth: true });
```

### Plugin with Options
```typescript
const corsPlugin = (options: { origin: string }) =>
  new Elysia({ name: "cors" })
    .onRequest(({ set }) => {
      set.headers["Access-Control-Allow-Origin"] = options.origin;
    });

app.use(corsPlugin({ origin: "*" }));
```

### Official Plugins
```typescript
import { swagger } from "@elysiajs/swagger";
import { cors } from "@elysiajs/cors";
import { jwt } from "@elysiajs/jwt";
import { staticPlugin } from "@elysiajs/static";

app
  .use(swagger())
  .use(cors())
  .use(jwt({ secret: "your-secret" }))
  .use(staticPlugin());
```

---

## Plugin Scoping

### Default Behavior (Local Hooks)
Starting from Elysia 1.0, hooks are local by default:

```typescript
const plugin = new Elysia()
  .onBeforeHandle(() => {
    console.log("Only runs for routes in this plugin");
  })
  .get("/plugin-route", () => "hi");

app
  .use(plugin)
  .get("/app-route", () => "no hook here"); // Hook doesn't run
```

### as('scoped') - Share with Parent
```typescript
const plugin = new Elysia()
  .onBeforeHandle(() => {
    console.log("Runs for plugin routes and parent routes");
  })
  .as("scoped"); // Apply to parent instance

app
  .use(plugin)
  .get("/app-route", () => "hook runs here");
```

### as('global') - Share Globally
```typescript
const profile = new Elysia()
  .onBeforeHandle(
    { as: "global" }, // Apply globally to all instances
    ({ cookie }) => {
      throwIfNotSignIn(cookie);
    }
  )
  .get("/profile", () => "Hi there!");

const app = new Elysia()
  .use(profile)
  // This route also has sign-in check
  .patch("/rename", ({ body }) => updateProfile(body));
```

### Plugin Deduplication with name
```typescript
const plugin = new Elysia({ name: "my-plugin" })
  .state("count", 0)
  .get("/count", ({ store }) => store.count);

app
  .use(plugin)
  .use(plugin) // Skipped - same name
  .use(plugin); // Skipped - same name
// Plugin registered only once
```

### Plugin Deduplication with seed
```typescript
const plugin = <T extends string>(config: { prefix: T }) =>
  new Elysia({
    name: "my-plugin",
    seed: config // Different seeds = different instances
  })
  .get(`${config.prefix}/hi`, () => "Hi");

app
  .use(plugin({ prefix: "/v1" })) // Registered
  .use(plugin({ prefix: "/v2" })) // Registered (different seed)
  .use(plugin({ prefix: "/v1" })); // Skipped (same seed as first)
```

---

## Hook Scope

### Local Hooks (Route-specific)
```typescript
app.get("/users", handler, {
  beforeHandle: ({ headers }) => {
    // Only runs for this route
  }
});
```

### Global Hooks
```typescript
app
  .beforeHandle(() => {
    // Runs for all routes after this
  })
  .get("/a", handlerA)
  .get("/b", handlerB);
```

### Scoped Hooks (Plugin/Group)
```typescript
app.group("/api", (app) =>
  app
    .beforeHandle(authCheck) // Only for /api routes
    .get("/users", getUsers)
    .get("/posts", getPosts)
);
```

---

## Macro

Create reusable route configurations:

```typescript
app
  .macro(({ onBeforeHandle }) => ({
    // Define macro
    roles(allowedRoles: string[]) {
      onBeforeHandle(({ user, status }) => {
        if (!allowedRoles.includes(user?.role)) {
          return status(403, "Forbidden");
        }
      });
    }
  }))
  // Use macro
  .get("/admin", () => "Admin", { roles: ["admin"] })
  .get("/user", () => "User", { roles: ["admin", "user"] });
```
