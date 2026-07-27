# Fastify to Elysia: Basic Migration

Side-by-side comparison of Fastify and Elysia patterns for routing, handlers, and context.

## Table of Contents
- [Server Setup](#server-setup)
- [Basic Routing](#basic-routing)
- [Route Parameters](#route-parameters)
- [Query Parameters](#query-parameters)
- [Request Body](#request-body)
- [Response](#response)
- [Headers](#headers)
- [Cookies](#cookies)
- [Common Gotchas](#common-gotchas)

---

## Server Setup

### Fastify
```typescript
import Fastify from "fastify";

const fastify = Fastify({ logger: true });

fastify.get("/", async (request, reply) => {
  return { hello: "world" };
});

fastify.listen({ port: 3000 }, (err) => {
  if (err) throw err;
  console.log("Server running on port 3000");
});
```

### Elysia
```typescript
import { Elysia } from "elysia";

const app = new Elysia()
  .get("/", () => ({ hello: "world" }))
  .listen(3000);

console.log(`Server running on port ${app.server?.port}`);
```

**Key Differences:**
- Elysia uses method chaining (fluent API)
- No separate `request`/`reply` objects - single destructured context
- Direct return instead of `reply.send()`
- Elysia runs on Bun runtime (not Node.js)
- No callback-based error handling needed

---

## Basic Routing

### Fastify
```typescript
// GET
fastify.get("/users", async (request, reply) => {
  return users;
});

// POST
fastify.post("/users", async (request, reply) => {
  return { created: true };
});

// PUT
fastify.put("/users/:id", async (request, reply) => {
  return { updated: true };
});

// DELETE
fastify.delete("/users/:id", async (request, reply) => {
  return { deleted: true };
});

// PATCH
fastify.patch("/users/:id", async (request, reply) => {
  return { patched: true };
});

// All methods
fastify.all("/any", async () => ({ method: "any" }));
```

### Elysia
```typescript
app
  .get("/users", () => users)
  .post("/users", () => ({ created: true }))
  .put("/users/:id", () => ({ updated: true }))
  .delete("/users/:id", () => ({ deleted: true }))
  .patch("/users/:id", () => ({ patched: true }))
  .all("/any", () => ({ method: "any" }));
```

**Key Differences:**
- Elysia handlers are more concise - no `async (request, reply)` boilerplate
- Method chaining allows fluent route definitions
- Return values are automatically serialized to JSON

---

## Route Parameters

### Fastify
```typescript
fastify.get("/users/:id", async (request, reply) => {
  const { id } = request.params as { id: string };
  return { userId: id };
});

// Multiple params
fastify.get("/users/:userId/posts/:postId", async (request, reply) => {
  const { userId, postId } = request.params as { userId: string; postId: string };
  return { userId, postId };
});

// Wildcard
fastify.get("/static/*", async (request, reply) => {
  const path = (request.params as { "*": string })["*"];
  return { path };
});
```

### Elysia
```typescript
app.get("/users/:id", ({ params }) => {
  return { userId: params.id };
});

// Multiple params
app.get("/users/:userId/posts/:postId", ({ params }) => {
  return { userId: params.userId, postId: params.postId };
});

// Wildcard
app.get("/static/*", ({ params }) => {
  return { path: params["*"] };
});

// With validation (typed params)
app.get("/users/:id", ({ params }) => {
  // params.id is typed as number
  return { userId: params.id };
}, {
  params: t.Object({
    id: t.Number()
  })
});
```

**Key Differences:**
- Elysia uses destructured context `{ params }`
- No type casting needed with schema validation
- Params are auto-coerced when schema is defined

---

## Query Parameters

### Fastify
```typescript
fastify.get("/search", async (request, reply) => {
  const { q, page, limit } = request.query as {
    q: string;
    page?: string;
    limit?: string;
  };
  return {
    query: q,
    page: parseInt(page || "1"),
    limit: parseInt(limit || "10")
  };
});
```

### Elysia
```typescript
// Without validation
app.get("/search", ({ query }) => {
  return {
    query: query.q,
    page: Number(query.page) || 1,
    limit: Number(query.limit) || 10
  };
});

// With validation (preferred - provides type safety)
app.get("/search", ({ query }) => {
  // query is typed: { q: string, page: number, limit: number }
  return { query: query.q, page: query.page, limit: query.limit };
}, {
  query: t.Object({
    q: t.String(),
    page: t.Number({ default: 1 }),
    limit: t.Number({ default: 10 })
  })
});
```

**Key Differences:**
- Elysia with TypeBox provides automatic type coercion
- Default values handled in schema, not handler logic
- Query params are typed after validation

---

## Request Body

### Fastify
```typescript
interface CreateUser {
  name: string;
  email: string;
}

fastify.post("/users", async (request, reply) => {
  const body = request.body as CreateUser;
  return { id: 1, name: body.name, email: body.email };
});

// With JSON Schema validation
fastify.post("/users", {
  schema: {
    body: {
      type: "object",
      required: ["name", "email"],
      properties: {
        name: { type: "string" },
        email: { type: "string", format: "email" }
      }
    }
  }
}, async (request, reply) => {
  const body = request.body as CreateUser;
  return { id: 1, ...body };
});
```

### Elysia
```typescript
// Without validation
app.post("/users", ({ body }) => {
  return { id: 1, name: body.name, email: body.email };
});

// With validation (preferred)
app.post("/users", ({ body }) => {
  // body is typed as { name: string, email: string }
  return { id: 1, ...body };
}, {
  body: t.Object({
    name: t.String(),
    email: t.String({ format: "email" })
  })
});
```

**Key Differences:**
- TypeBox is more concise than JSON Schema
- Type inference is automatic with TypeBox
- No separate interface definition needed

---

## Response

### Fastify
```typescript
// Return object (auto JSON)
fastify.get("/json", async () => {
  return { data: "value" };
});

// Set status code
fastify.post("/users", async (request, reply) => {
  reply.code(201);
  return { created: true };
});

// Alternative status method
fastify.post("/users", async (request, reply) => {
  return reply.status(201).send({ created: true });
});

// Custom headers
fastify.get("/custom", async (request, reply) => {
  reply.header("X-Custom", "value");
  return { data: "value" };
});

// Redirect
fastify.get("/old", async (request, reply) => {
  reply.redirect("/new");
});

// Redirect with status
fastify.get("/moved", async (request, reply) => {
  reply.redirect(301, "/new-location");
});

// Plain text
fastify.get("/text", async (request, reply) => {
  reply.type("text/plain");
  return "Hello World";
});
```

### Elysia
```typescript
// Return object (auto JSON)
app.get("/json", () => ({ data: "value" }));

// Set status code (using set)
app.post("/users", ({ set }) => {
  set.status = 201;
  return { created: true };
});

// Set status code (using status helper)
app.post("/users", ({ status }) => {
  return status(201, { created: true });
});

// Custom headers
app.get("/custom", ({ set }) => {
  set.headers["X-Custom"] = "value";
  return { data: "value" };
});

// Redirect
app.get("/old", ({ redirect }) => redirect("/new"));

// Redirect with status
app.get("/moved", ({ redirect }) => redirect("/new-location", 301));

// Plain text
app.get("/text", () => "Hello World");

// Return Response object directly
app.get("/response", () => {
  return new Response("Custom response", {
    status: 200,
    headers: { "X-Custom": "header" }
  });
});
```

**Key Differences:**
- `set.status` vs `reply.code()`
- `set.headers[key]` vs `reply.header(key, value)`
- Elysia uses `status()` helper for inline status+body
- Plain strings auto-detect content type
- Can return native `Response` objects

---

## Headers

### Fastify
```typescript
// Read headers
fastify.get("/", async (request, reply) => {
  const auth = request.headers.authorization;
  const userAgent = request.headers["user-agent"];
  const customHeader = request.headers["x-custom"];
  return { auth, userAgent, customHeader };
});

// Set response headers
fastify.get("/", async (request, reply) => {
  reply.header("Cache-Control", "max-age=3600");
  reply.header("X-Custom", "value");
  reply.headers({ "X-Another": "header", "X-More": "headers" });
  return { ok: true };
});

// Remove header
fastify.get("/", async (request, reply) => {
  reply.removeHeader("X-Powered-By");
  return { ok: true };
});
```

### Elysia
```typescript
// Read headers
app.get("/", ({ headers }) => {
  const auth = headers.authorization;
  const userAgent = headers["user-agent"];
  const customHeader = headers["x-custom"];
  return { auth, userAgent, customHeader };
});

// Set response headers
app.get("/", ({ set }) => {
  set.headers["Cache-Control"] = "max-age=3600";
  set.headers["X-Custom"] = "value";
  return { ok: true };
});

// With header validation
app.get("/protected", ({ headers }) => {
  return { token: headers.authorization };
}, {
  headers: t.Object({
    authorization: t.String()
  })
});
```

**Key Differences:**
- Read headers: `request.headers` vs `{ headers }` destructuring
- Set headers: `reply.header()` vs `set.headers[key] = value`
- Elysia supports header validation with TypeBox

---

## Cookies

### Fastify
```typescript
import cookie from "@fastify/cookie";

fastify.register(cookie);

// Read cookies
fastify.get("/", async (request, reply) => {
  const session = request.cookies.session;
  return { session };
});

// Set cookies
fastify.post("/login", async (request, reply) => {
  reply.setCookie("session", "abc123", {
    path: "/",
    httpOnly: true,
    secure: true,
    maxAge: 3600
  });
  return { success: true };
});

// Clear cookies
fastify.post("/logout", async (request, reply) => {
  reply.clearCookie("session");
  return { success: true };
});
```

### Elysia
```typescript
// Cookies are built-in
app
  // Read cookies
  .get("/", ({ cookie }) => {
    const session = cookie.session.value;
    return { session };
  })

  // Set cookies
  .post("/login", ({ cookie }) => {
    cookie.session.set({
      value: "abc123",
      path: "/",
      httpOnly: true,
      secure: true,
      maxAge: 3600
    });
    return { success: true };
  })

  // Clear cookies
  .post("/logout", ({ cookie }) => {
    cookie.session.remove();
    return { success: true };
  });
```

**Key Differences:**
- Elysia has built-in cookie support (no plugin needed)
- Cookie access via `cookie.name.value` vs `request.cookies.name`
- Set via `cookie.name.set({...})` vs `reply.setCookie()`
- Remove via `cookie.name.remove()` vs `reply.clearCookie()`

---

## Common Gotchas

### 1. Context Destructuring
```typescript
// Fastify - separate request/reply
fastify.get("/", async (request, reply) => {
  console.log(request.url);
  reply.send({ ok: true });
});

// Elysia - destructured context (must destructure what you need)
app.get("/", ({ request, set }) => {
  console.log(request.url);
  return { ok: true };
});
```

### 2. Async Handlers
```typescript
// Fastify - async by default
fastify.get("/", async (request, reply) => {
  const data = await fetchData();
  return data;
});

// Elysia - works with sync and async
app.get("/sync", () => ({ sync: true }));
app.get("/async", async () => {
  const data = await fetchData();
  return data;
});
```

### 3. Error Responses
```typescript
// Fastify
fastify.get("/", async (request, reply) => {
  reply.code(404).send({ error: "Not found" });
});

// Elysia - use error helper or status
app.get("/", ({ error }) => {
  return error(404, { error: "Not found" });
});

// Or with status helper
app.get("/", ({ status }) => {
  return status(404, { error: "Not found" });
});
```

### 4. Request URL Parsing
```typescript
// Fastify - url is just path
fastify.get("/", async (request) => {
  console.log(request.url); // "/path?query=1"
});

// Elysia - request.url is full URL
app.get("/", ({ request }) => {
  const url = new URL(request.url);
  console.log(url.pathname); // "/path"
  console.log(url.searchParams.get("query")); // "1"
});
```

### 5. Method Chaining Required
```typescript
// Fastify - independent statements
const fastify = Fastify();
fastify.get("/a", handlerA);
fastify.get("/b", handlerB);

// Elysia - must chain or lose type inference
const app = new Elysia()
  .get("/a", handlerA)
  .get("/b", handlerB); // Chain required for types!

// This loses type context:
const app = new Elysia();
app.get("/a", handlerA); // Works but loses chained types
```

---

## Quick Reference Table

| Feature | Fastify | Elysia |
|---------|---------|--------|
| Route params | `request.params` | `{ params }` |
| Query params | `request.query` | `{ query }` |
| Body | `request.body` | `{ body }` |
| Headers (read) | `request.headers` | `{ headers }` |
| Headers (set) | `reply.header(k, v)` | `set.headers[k] = v` |
| Status code | `reply.code(n)` | `set.status = n` or `status(n, body)` |
| Send response | `return` or `reply.send()` | `return` |
| Redirect | `reply.redirect(url)` | `redirect(url)` |
| Raw request | `request.raw` | `{ request }` |
| Cookies (read) | `request.cookies.name` | `cookie.name.value` |
| Cookies (set) | `reply.setCookie()` | `cookie.name.set({})` |
| Error response | `reply.code(n).send()` | `error(n, body)` |

---

## Migration Checklist

1. [ ] Replace `request.params` with `{ params }` destructuring
2. [ ] Replace `request.query` with `{ query }` destructuring
3. [ ] Replace `request.body` with `{ body }` destructuring
4. [ ] Replace `reply.code()` with `set.status =` or `status()`
5. [ ] Replace `reply.header()` with `set.headers[] =`
6. [ ] Replace `reply.send()` with direct `return`
7. [ ] Replace `@fastify/cookie` with built-in cookie support
8. [ ] Add TypeBox schemas for type safety (see validation guide)
9. [ ] Update URL parsing to use `new URL(request.url)`
10. [ ] Ensure method chaining for proper type inference
