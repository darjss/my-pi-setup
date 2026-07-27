# Elysia.js Validation - TypeBox Schemas

Elysia uses TypeBox for runtime validation with full TypeScript type inference.

## Table of Contents
- [Basic Validation](#basic-validation)
- [Body Validation](#body-validation)
- [Query Validation](#query-validation)
- [Params Validation](#params-validation)
- [Headers Validation](#headers-validation)
- [Response Validation](#response-validation)
- [TypeBox Types](#typebox-types)
- [Custom Types](#custom-types)
- [Guards](#guards)
- [Error Messages](#error-messages)

---

## Basic Validation

### Import
```typescript
import { Elysia, t } from "elysia";
```

### Inline Validation
```typescript
app.post("/users", ({ body }) => {
  return { created: body };
}, {
  body: t.Object({
    name: t.String(),
    email: t.String({ format: "email" })
  })
});
```

---

## Body Validation

### Object Schema
```typescript
app.post("/users", ({ body }) => {
  // body is typed as { name: string, email: string, age: number }
  return body;
}, {
  body: t.Object({
    name: t.String({ minLength: 1 }),
    email: t.String({ format: "email" }),
    age: t.Number({ minimum: 0, maximum: 150 })
  })
});
```

### Optional Fields
```typescript
body: t.Object({
  name: t.String(),
  nickname: t.Optional(t.String()),
  bio: t.Optional(t.String({ maxLength: 500 }))
})
```

### Nested Objects
```typescript
body: t.Object({
  user: t.Object({
    name: t.String(),
    email: t.String()
  }),
  settings: t.Object({
    theme: t.Union([t.Literal("light"), t.Literal("dark")]),
    notifications: t.Boolean()
  })
})
```

### Arrays
```typescript
body: t.Object({
  tags: t.Array(t.String(), { minItems: 1, maxItems: 10 }),
  scores: t.Array(t.Number({ minimum: 0, maximum: 100 }))
})
```

---

## Query Validation

```typescript
app.get("/search", ({ query }) => {
  // query.q is string, query.page is number
  return { term: query.q, page: query.page };
}, {
  query: t.Object({
    q: t.String({ minLength: 1 }),
    page: t.Number({ default: 1 }),
    limit: t.Number({ default: 20, maximum: 100 })
  })
});
```

### Optional Query Params
```typescript
query: t.Object({
  search: t.Optional(t.String()),
  sort: t.Optional(t.Union([
    t.Literal("asc"),
    t.Literal("desc")
  ]))
})
```

---

## Params Validation

```typescript
app.get("/users/:id", ({ params }) => {
  // params.id is number (auto-coerced from string)
  return { userId: params.id };
}, {
  params: t.Object({
    id: t.Number()
  })
});
```

### Multiple Params
```typescript
app.get("/users/:userId/posts/:postId", ({ params }) => {
  return { userId: params.userId, postId: params.postId };
}, {
  params: t.Object({
    userId: t.Number(),
    postId: t.Number()
  })
});
```

---

## Headers Validation

```typescript
app.get("/protected", ({ headers }) => {
  return { token: headers.authorization };
}, {
  headers: t.Object({
    authorization: t.String()
  })
});
```

### Bearer Token Pattern
```typescript
headers: t.Object({
  authorization: t.String({
    pattern: "^Bearer .+$"
  })
})
```

---

## Response Validation

```typescript
app.get("/users/:id", ({ params }) => {
  return {
    id: params.id,
    name: "Alice",
    email: "[email protected]"
  };
}, {
  params: t.Object({ id: t.Number() }),
  response: t.Object({
    id: t.Number(),
    name: t.String(),
    email: t.String()
  })
});
```

### Multiple Response Types
```typescript
app.get("/users/:id", ({ params, status }) => {
  const user = findUser(params.id);
  if (!user) return status(404, { error: "Not found" });
  return user;
}, {
  params: t.Object({ id: t.Number() }),
  response: {
    200: t.Object({
      id: t.Number(),
      name: t.String()
    }),
    404: t.Object({
      error: t.String()
    })
  }
});
```

---

## TypeBox Types

### Primitives
```typescript
t.String()                    // string
t.Number()                    // number
t.Boolean()                   // boolean
t.Integer()                   // integer (whole number)
t.Null()                      // null
t.Undefined()                 // undefined
```

### String Constraints
```typescript
t.String({
  minLength: 1,
  maxLength: 100,
  pattern: "^[a-z]+$",
  format: "email",          // email, uri, uuid, date, date-time
  default: "anonymous"
})
```

### Number Constraints
```typescript
t.Number({
  minimum: 0,
  maximum: 100,
  exclusiveMinimum: 0,
  exclusiveMaximum: 100,
  multipleOf: 5,
  default: 50
})
```

### Composite Types
```typescript
// Union (OR)
t.Union([t.String(), t.Number()])
t.Union([t.Literal("a"), t.Literal("b"), t.Literal("c")])

// Intersection (AND)
t.Intersect([
  t.Object({ name: t.String() }),
  t.Object({ age: t.Number() })
])

// Nullable
t.Nullable(t.String())  // string | null

// Optional
t.Optional(t.String())  // string | undefined
```

### Enums and Literals
```typescript
// Literal values
t.Literal("admin")
t.Literal(42)
t.Literal(true)

// Enum-like
t.Union([
  t.Literal("pending"),
  t.Literal("active"),
  t.Literal("inactive")
])

// Native enum
enum Status { Active, Inactive }
t.Enum(Status)
```

### Arrays and Objects
```typescript
// Array
t.Array(t.String())
t.Array(t.Number(), { minItems: 1, maxItems: 10 })

// Object
t.Object({
  name: t.String(),
  age: t.Number()
})

// Record (dynamic keys)
t.Record(t.String(), t.Number())  // { [key: string]: number }
```

### Special Types
```typescript
// Any
t.Any()

// Unknown
t.Unknown()

// Never
t.Never()

// Date
t.Date()

// File
t.File()
t.File({ type: "image/*", maxSize: 5 * 1024 * 1024 })

// Files (multiple)
t.Files()
```

---

## Custom Types

### Reusable Schemas
```typescript
const UserSchema = t.Object({
  id: t.Number(),
  name: t.String(),
  email: t.String({ format: "email" })
});

const CreateUserSchema = t.Omit(UserSchema, ["id"]);
const UpdateUserSchema = t.Partial(CreateUserSchema);

app
  .post("/users", ({ body }) => body, { body: CreateUserSchema })
  .patch("/users/:id", ({ body }) => body, { body: UpdateUserSchema });
```

### Schema Modifiers
```typescript
// Partial (all fields optional)
t.Partial(UserSchema)

// Required (all fields required)
t.Required(PartialSchema)

// Pick specific fields
t.Pick(UserSchema, ["name", "email"])

// Omit specific fields
t.Omit(UserSchema, ["id"])

// Extend with additional fields
t.Intersect([
  UserSchema,
  t.Object({ role: t.String() })
])
```

---

## Guards

Apply validation to multiple routes:

### Guard with Callback
```typescript
app.guard({
  body: t.Object({
    username: t.String(),
    password: t.String()
  })
}, (app) =>
  app
    .post("/sign-up", ({ body }) => signUp(body))
    .post("/sign-in", ({ body }) => signIn(body))
);
```

### Guard Without Callback (Applies to Subsequent Routes)
```typescript
app
  .get("/none", ({ query }) => "hi")

  .guard({
    query: t.Object({
      name: t.String()
    })
  })
  .get("/query", ({ query }) => query)
  .get("/another", ({ query }) => query.name);
// Guard applies to /query and /another, but not /none
```

### Guard with Hooks and Schema
```typescript
app.guard({
  headers: t.Object({
    authorization: t.String()
  }),
  beforeHandle: [
    ({ headers, status }) => {
      if (!isValidToken(headers.authorization)) {
        return status(401, "Invalid token");
      }
    }
  ],
  query: t.Object({
    name: t.String()
  })
})
.get("/auth", ({ query: { name } }) => `Hello ${name}!`)
.get("/profile", ({ query: { name } }) => `Profile: ${name}`);
```

---

## Error Messages

### Custom Error Messages
```typescript
t.Object({
  email: t.String({
    format: "email",
    error: "Please provide a valid email address"
  }),
  age: t.Number({
    minimum: 18,
    error: "You must be at least 18 years old"
  })
})
```

### Per-Field and Object-Level Errors
```typescript
app.post("/", ({ body }) => body, {
  body: t.Object({
    age: t.Number({
      error: "Age must be a number"
    })
  }, {
    error: "Body must be an object"
  })
});
```

### Array Error Messages
```typescript
t.Array(
  t.String(),
  {
    error: "All members must be a string"
  }
)
```

### Global Error Handler
```typescript
app
  .onError(({ code, error, set }) => {
    if (code === "VALIDATION") {
      set.status = 400;
      return {
        error: "Validation failed",
        details: error.all // All validation errors
      };
    }
  })
  .post("/users", handler, { body: UserSchema });
```

### Validation Error Structure
```typescript
// error.all contains array of:
{
  path: "/body/email",
  message: "Expected string",
  value: undefined
}
```

---

## File Validation

```typescript
app.post("/upload", ({ body }) => {
  // body.avatar is a File object
  return { size: body.avatar.size };
}, {
  body: t.Object({
    avatar: t.File({
      type: ["image/jpeg", "image/png"],
      maxSize: 5 * 1024 * 1024 // 5MB
    }),
    description: t.Optional(t.String())
  })
});
```

### Multiple Files
```typescript
body: t.Object({
  images: t.Files({
    type: "image/*",
    maxSize: 10 * 1024 * 1024,
    minItems: 1,
    maxItems: 5
  })
})
```

---

## Transform Before Validation

```typescript
app.post("/users", ({ body }) => body, {
  body: t.Object({
    id: t.Number()
  }),
  transform({ body }) {
    // Coerce string to number before validation
    if (typeof body.id === "string") {
      body.id = parseInt(body.id, 10);
    }
  }
});
```
