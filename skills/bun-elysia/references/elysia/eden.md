# Elysia.js Eden - End-to-End Type Safety

Eden provides type-safe client generation for Elysia APIs with full TypeScript inference.

## Table of Contents
- [Setup](#setup)
- [Treaty (Recommended)](#treaty-recommended)
- [Basic Usage](#basic-usage)
- [HTTP Methods](#http-methods)
- [Query and Headers](#query-and-headers)
- [Error Handling](#error-handling)
- [WebSocket Client](#websocket-client)
- [File Upload](#file-upload)
- [Advanced Patterns](#advanced-patterns)

---

## Setup

### Installation
```bash
bun add @elysiajs/eden
```

### Export Server Type
```typescript
// server.ts
import { Elysia, t } from "elysia";

const app = new Elysia()
  .get("/", () => "Hello")
  .get("/user/:id", ({ params }) => ({
    id: params.id,
    name: "John Doe"
  }))
  .post("/user", ({ body, status }) => {
    if (body.age < 18) {
      return status(400, { error: "Must be 18 or older" });
    }
    return { id: 1, ...body };
  }, {
    body: t.Object({
      name: t.String(),
      age: t.Number()
    })
  })
  .listen(3000);

// Export type for client
export type App = typeof app;
```

---

## Treaty (Recommended)

Treaty provides a fetch-like API with full type inference.

### Create Client
```typescript
// client.ts
import { treaty } from "@elysiajs/eden";
import type { App } from "./server";

const api = treaty<App>("http://localhost:3000");
```

### With Options
```typescript
const api = treaty<App>("http://localhost:3000", {
  // Custom fetch options
  fetch: {
    credentials: "include"
  },
  // Headers for all requests
  headers: {
    Authorization: "Bearer token"
  },
  // Request hooks
  onRequest: (path, options) => {
    console.log(`Request: ${path}`);
    return options;
  },
  // Response hooks
  onResponse: (response) => {
    console.log(`Response: ${response.status}`);
    return response;
  }
});
```

---

## Basic Usage

### GET Request
```typescript
// GET /
const { data, error } = await api.index.get();
// data is typed as string ("Hello Elysia")

// GET /user/123 (path parameters)
const { data: user } = await api.user({ id: "123" }).get();
// data is typed as { id: string, name: string }
```

### POST Request
```typescript
// POST /user
const { data, error } = await api.user.post({
  name: "Alice",
  age: 25
});
// data is typed as { id: number, name: string, age: number }

if (error) {
  // error is typed based on status codes
  if (error.status === 400) {
    console.log(error.value.error); // Type-safe error message
  }
} else {
  console.log(data); // { id: number, name: string, age: number }
}
```

### Path Parameters
```typescript
// Server: .get("/users/:userId/posts/:postId", ...)
const { data } = await api.users({ userId: "1" }).posts({ postId: "42" }).get();
```

---

## HTTP Methods

```typescript
// GET
const { data } = await api.users.get();

// POST
const { data } = await api.users.post({ name: "Alice" });

// PUT
const { data } = await api.users({ id: "1" }).put({ name: "Bob" });

// PATCH
const { data } = await api.users({ id: "1" }).patch({ name: "Charlie" });

// DELETE
const { data } = await api.users({ id: "1" }).delete();

// HEAD
const response = await api.users.head();

// OPTIONS
const response = await api.users.options();
```

---

## Query and Headers

### Query Parameters
```typescript
// Server:
// .get("/search", ({ query }) => results, {
//   query: t.Object({ q: t.String(), page: t.Number() })
// })

const { data } = await api.search.get({
  query: {
    q: "hello",
    page: 1
  }
});
```

### Custom Headers
```typescript
const { data } = await api.users.get({
  headers: {
    Authorization: "Bearer token",
    "X-Custom-Header": "value"
  }
});
```

### Combined
```typescript
const { data } = await api.users.get({
  query: { limit: 10 },
  headers: { Authorization: "Bearer token" },
  fetch: { cache: "no-store" }
});
```

---

## Error Handling

### Check for Errors
```typescript
const { data, error, status } = await api.users({ id: "999" }).get();

if (error) {
  // error is typed based on server response schema
  console.error(`Error ${status}:`, error);
  return;
}

// data is guaranteed to exist here
console.log(data.name);
```

### Type Narrowing with Status Codes
```typescript
// Server:
app.post("/user", ({ body, status }) => {
  if (body.name === "Otto") return status(400, { message: "Name not allowed" });
  return { id: 1, name: body.name };
}, {
  body: t.Object({ name: t.String() }),
  response: {
    200: t.Object({ id: t.Number(), name: t.String() }),
    400: t.Object({ message: t.String() })
  }
});

// Client:
const submit = async (name: string) => {
  const { data, error } = await api.user.post({ name });

  // data is typed as { id: number, name: string } | null
  console.log(data);

  if (error) {
    switch (error.status) {
      case 400:
        // error.value is narrowed to { message: string }
        throw error.value;
      default:
        throw error.value;
    }
  }

  // Once error is handled, data is unwrapped
  // type: { id: number, name: string }
  return data;
};
```

### Error Structure
```typescript
const { data, error } = await api.users.post({ name: "test" });

if (error) {
  switch (error.status) {
    case 400:
    case 401:
      warnUser(error.value);
      break;
    case 500:
    case 502:
      emergencyCallDev(error.value);
      break;
    default:
      reportError(error.value);
      break;
  }
  throw error;
}

const { id, name } = data;
```

---

## WebSocket Client

### Basic WebSocket
```typescript
// Server:
app.ws("/chat", {
  body: t.String(),
  response: t.String(),
  message(ws, message) {
    ws.send(message);
  }
});

// Client:
const chat = api.chat.subscribe();

// Receive messages
chat.subscribe((message) => {
  // message is typed as string
  console.log("got", message);
});

// Handle events
chat.on("open", () => {
  chat.send("hello from client");
});

chat.on("close", () => console.log("Disconnected"));
chat.on("error", (error) => console.error(error));

// Close connection
chat.close();
```

### With Query Parameters
```typescript
const chat = api.chat.subscribe({
  query: {
    room: "general",
    username: "Alice"
  }
});
```

---

## File Upload

### Single File
```typescript
// Server:
app.post("/upload", ({ body }) => {
  return { filename: body.file.name };
}, {
  body: t.Object({
    file: t.File()
  })
});

// Client:
const file = new File(["content"], "test.txt");
const { data } = await api.upload.post({
  file
});
```

### Multiple Files
```typescript
// Server:
app.post("/upload", ({ body }) => {
  return { count: body.files.length };
}, {
  body: t.Object({
    files: t.Files()
  })
});

// Client:
const { data } = await api.upload.post({
  files: [file1, file2, file3]
});
```

### With Additional Data
```typescript
const { data } = await api.upload.post({
  file,
  description: "Profile photo",
  tags: ["avatar", "user"]
});
```

---

## Advanced Patterns

### Reusable Client Instance
```typescript
// api.ts
import { treaty } from "@elysiajs/eden";
import type { App } from "./server";

export const api = treaty<App>(process.env.API_URL!, {
  headers: () => ({
    Authorization: `Bearer ${getToken()}`
  })
});
```

### Dynamic Headers
```typescript
const api = treaty<App>("http://localhost:3000", {
  headers: () => {
    // Called for each request
    const token = localStorage.getItem("token");
    return token ? { Authorization: `Bearer ${token}` } : {};
  }
});
```

### Request/Response Hooks
```typescript
const api = treaty<App>("http://localhost:3000", {
  onRequest: (path, options) => {
    console.log(`-> ${options.method} ${path}`);
    return options;
  },
  onResponse: async (response) => {
    console.log(`<- ${response.status}`);
    return response;
  }
});
```

### Abort Requests
```typescript
const controller = new AbortController();

const { data } = await api.users.get({
  fetch: {
    signal: controller.signal
  }
});

// Cancel request
controller.abort();
```

### Type Utilities
```typescript
import type { InferRouteBody, InferRouteResponse } from "@elysiajs/eden";
import type { App } from "./server";

// Extract body type
type CreateUserBody = InferRouteBody<App, "/users", "post">;
// { name: string, email: string }

// Extract response type
type UserResponse = InferRouteResponse<App, "/users/:id", "get">;
// { id: string, name: string }
```

---

## Full Example

### Server
```typescript
// server.ts
import { Elysia, t } from "elysia";

const app = new Elysia()
  .get("/users", () => [
    { id: "1", name: "Alice" },
    { id: "2", name: "Bob" }
  ], {
    response: t.Array(t.Object({
      id: t.String(),
      name: t.String()
    }))
  })
  .get("/users/:id", ({ params, status }) => {
    const users: Record<string, string> = { "1": "Alice", "2": "Bob" };
    const name = users[params.id];
    if (!name) return status(404, { message: "Not found" });
    return { id: params.id, name };
  }, {
    params: t.Object({ id: t.String() }),
    response: {
      200: t.Object({ id: t.String(), name: t.String() }),
      404: t.Object({ message: t.String() })
    }
  })
  .post("/users", ({ body }) => ({
    id: crypto.randomUUID(),
    ...body
  }), {
    body: t.Object({
      name: t.String(),
      email: t.String()
    }),
    response: t.Object({
      id: t.String(),
      name: t.String(),
      email: t.String()
    })
  })
  .listen(3000);

export type App = typeof app;
```

### Client
```typescript
// client.ts
import { treaty } from "@elysiajs/eden";
import type { App } from "./server";

const api = treaty<App>("http://localhost:3000");

async function main() {
  // List users
  const { data: users } = await api.users.get();
  console.log("Users:", users);

  // Get single user
  const { data: user, error } = await api.users({ id: "1" }).get();
  if (error) {
    console.error("Error:", error.value.message);
  } else {
    console.log("User:", user);
  }

  // Create user
  const { data: newUser } = await api.users.post({
    name: "Charlie",
    email: "[email protected]"
  });
  console.log("Created:", newUser);
}

main();
```
