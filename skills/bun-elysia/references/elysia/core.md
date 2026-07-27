# Elysia.js Core - Routing and Handlers

Elysia is an ergonomic, type-safe web framework for Bun with end-to-end type safety.

## Table of Contents
- [Getting Started](#getting-started)
- [Routing](#routing)
- [Path Parameters](#path-parameters)
- [Query Parameters](#query-parameters)
- [Request Body](#request-body)
- [Headers and Cookies](#headers-and-cookies)
- [Response](#response)
- [Context Object](#context-object)
- [Groups and Prefixes](#groups-and-prefixes)

---

## Getting Started

### Installation
```bash
bun add elysia
```

### Basic Server
```typescript
import { Elysia } from "elysia";

const app = new Elysia()
  .get("/", () => "Hello, World!")
  .listen(3000);

console.log(`Server running at http://localhost:${app.server?.port}`);
```

---

## Routing

### HTTP Methods
```typescript
const app = new Elysia()
  .get("/users", () => "Get users")
  .post("/users", () => "Create user")
  .put("/users/:id", () => "Update user")
  .patch("/users/:id", () => "Partial update")
  .delete("/users/:id", () => "Delete user")
  .options("/users", () => "Options")
  .head("/users", () => "Head");
```

### All Methods
```typescript
app.all("/any", () => "Handles all HTTP methods");
```

---

## Path Parameters

### Basic Parameters
```typescript
app.get("/users/:id", ({ params }) => {
  return { userId: params.id };
});

// GET /users/123 -> { userId: "123" }
```

### Multiple Parameters
```typescript
app.get("/users/:userId/posts/:postId", ({ params }) => {
  return {
    userId: params.userId,
    postId: params.postId
  };
});
```

### Wildcard
```typescript
app.get("/files/*", ({ params }) => {
  return { path: params["*"] };
});

// GET /files/docs/readme.md -> { path: "docs/readme.md" }
```

### Optional Parameters
```typescript
app.get("/users/:id?", ({ params }) => {
  if (params.id) {
    return { user: params.id };
  }
  return { users: "all" };
});
```

---

## Query Parameters

### Access Query
```typescript
app.get("/search", ({ query }) => {
  return {
    term: query.q,
    page: query.page,
    limit: query.limit
  };
});

// GET /search?q=hello&page=1&limit=10
```

### Default Values
```typescript
app.get("/search", ({ query }) => {
  const page = Number(query.page) || 1;
  const limit = Number(query.limit) || 20;
  return { page, limit };
});
```

---

## Request Body

### JSON Body
```typescript
app.post("/users", ({ body }) => {
  // body is automatically parsed as JSON
  return { created: body };
});
```

### With Type Annotation
```typescript
interface CreateUser {
  name: string;
  email: string;
}

app.post("/users", ({ body }) => {
  const user = body as CreateUser;
  return { name: user.name, email: user.email };
});
```

---

## Headers and Cookies

### Read Headers
```typescript
app.get("/", ({ headers }) => {
  const auth = headers.authorization;
  const userAgent = headers["user-agent"];
  return { auth, userAgent };
});
```

### Set Headers
```typescript
app.get("/", ({ set }) => {
  set.headers["X-Custom-Header"] = "value";
  set.headers["Cache-Control"] = "max-age=3600";
  return "OK";
});
```

### Cookies
```typescript
app.get("/", ({ cookie }) => {
  // Read cookie
  const session = cookie.session.value;

  // Set cookie
  cookie.session.set({
    value: "abc123",
    httpOnly: true,
    maxAge: 86400,
    path: "/"
  });

  return "OK";
});
```

### Cookie Options
```typescript
cookie.token.set({
  value: "jwt-token",
  httpOnly: true,
  secure: true,
  sameSite: "strict",
  maxAge: 7 * 24 * 60 * 60, // 7 days
  path: "/",
  domain: ".example.com"
});

// Remove cookie
cookie.token.remove();
```

---

## Response

### Return Types
```typescript
// String
app.get("/text", () => "Hello");

// JSON (automatic)
app.get("/json", () => ({ message: "Hello" }));

// Response object
app.get("/custom", () => {
  return new Response("Hello", {
    headers: { "Content-Type": "text/plain" }
  });
});
```

### Set Status Code with status()
```typescript
app.get("/", ({ status }) => {
  return status(418, "I'm a teapot");
});

app.get("/created", ({ status }) => {
  return status(201, { id: 1, name: "Created" });
});

app.get("/not-found", ({ status }) => {
  return status(404, { error: "Not found" });
});
```

### Using set.status (Legacy)
```typescript
app.get("/", ({ set }) => {
  set.status = 201;
  return { id: 1 };
});
```

### Redirect
```typescript
app.get("/old", ({ redirect }) => {
  return redirect("/new");
});

app.get("/external", ({ redirect }) => {
  return redirect("https://example.com", 301);
});
```

### Stream Response
```typescript
app.get("/stream", () => {
  return new ReadableStream({
    async start(controller) {
      controller.enqueue("Hello ");
      await new Promise((r) => setTimeout(r, 1000));
      controller.enqueue("World!");
      controller.close();
    }
  });
});
```

---

## Context Object

The context object contains all request data and utilities:

```typescript
app.get("/", (context) => {
  // Destructure what you need
  const {
    // Request data
    body,      // Parsed request body
    query,     // Query parameters
    params,    // Path parameters
    headers,   // Request headers
    cookie,    // Cookies
    path,      // URL path
    request,   // Raw Request object

    // Response utilities
    set,       // Set response headers/status
    status,    // Return with status code (recommended)
    redirect,  // Redirect response

    // Custom context (from derive/resolve)
    store,     // Shared state
  } = context;

  return "OK";
});
```

### Accessing Raw Request
```typescript
app.get("/", ({ request }) => {
  console.log(request.method);  // "GET"
  console.log(request.url);     // Full URL
  console.log(request.headers); // Headers object
  return "OK";
});
```

---

## Groups and Prefixes

### Route Groups
```typescript
const app = new Elysia()
  .group("/api", (app) =>
    app
      .get("/users", () => "Users list")
      .get("/posts", () => "Posts list")
  )
  .group("/admin", (app) =>
    app
      .get("/dashboard", () => "Admin dashboard")
      .get("/settings", () => "Admin settings")
  );

// Routes: /api/users, /api/posts, /admin/dashboard, /admin/settings
```

### Prefix (Plugin-style)
```typescript
const users = new Elysia({ prefix: "/user" })
  .post("/sign-in", () => "Sign in")
  .post("/sign-up", () => "Sign up")
  .post("/profile", () => "Profile");

new Elysia()
  .use(users)
  .get("/", () => "hello world")
  .listen(3000);

// Routes: /user/sign-in, /user/sign-up, /user/profile, /
```

### Nested Groups
```typescript
const app = new Elysia()
  .group("/api", (app) =>
    app
      .group("/v1", (app) =>
        app.get("/users", () => "v1 users")
      )
      .group("/v2", (app) =>
        app.get("/users", () => "v2 users")
      )
  );

// Routes: /api/v1/users, /api/v2/users
```

---

## Multiple Instances

### Composing Apps
```typescript
const users = new Elysia({ prefix: "/users" })
  .get("/", () => "List users")
  .get("/:id", ({ params }) => `User ${params.id}`);

const posts = new Elysia({ prefix: "/posts" })
  .get("/", () => "List posts")
  .get("/:id", ({ params }) => `Post ${params.id}`);

const app = new Elysia()
  .use(users)
  .use(posts)
  .listen(3000);
```

---

## Method Chaining

Elysia uses method chaining for composability:

```typescript
const app = new Elysia()
  // Routes
  .get("/", () => "Home")
  .post("/users", () => "Create")

  // Plugins
  .use(somePlugin)

  // Groups
  .group("/api", (app) =>
    app.get("/status", () => "OK")
  )

  // State
  .state("version", "1.0.0")

  // Decorators
  .decorate("logger", console.log)

  // Start server
  .listen(3000);
```

### Type Inference
```typescript
// Types flow through the chain
const app = new Elysia()
  .state("count", 0)
  .get("/", ({ store }) => {
    // store.count is typed as number
    return { count: store.count };
  });
```

---

## Static Files

```typescript
import { staticPlugin } from "@elysiajs/static";

const app = new Elysia()
  .use(staticPlugin({
    assets: "public",
    prefix: "/static"
  }))
  .listen(3000);

// Serves files from ./public at /static/*
```
