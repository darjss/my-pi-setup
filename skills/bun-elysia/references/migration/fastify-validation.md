# Fastify to Elysia: Validation Migration

Side-by-side comparison of schema validation in Fastify (JSON Schema + Ajv) vs Elysia (TypeBox).

## Table of Contents
- [Schema Overview](#schema-overview)
- [Body Validation](#body-validation)
- [Query Validation](#query-validation)
- [Params Validation](#params-validation)
- [Headers Validation](#headers-validation)
- [Response Validation](#response-validation)
- [Type Mapping](#type-mapping)
- [Custom Validators](#custom-validators)
- [Reusable Schemas](#reusable-schemas)
- [Error Handling](#error-handling)
- [Common Gotchas](#common-gotchas)

---

## Schema Overview

### Fastify (JSON Schema + Ajv)
```typescript
import Fastify from "fastify";

const fastify = Fastify();

// Schema defined separately
const userSchema = {
  type: "object",
  required: ["name", "email"],
  properties: {
    name: { type: "string", minLength: 1 },
    email: { type: "string", format: "email" }
  },
  additionalProperties: false
};

fastify.post("/users", {
  schema: {
    body: userSchema
  }
}, async (request, reply) => {
  // body needs type assertion
  const body = request.body as { name: string; email: string };
  return body;
});
```

### Elysia (TypeBox)
```typescript
import { Elysia, t } from "elysia";

const app = new Elysia();

// Schema defined with TypeBox
const userSchema = t.Object({
  name: t.String({ minLength: 1 }),
  email: t.String({ format: "email" })
});

app.post("/users", ({ body }) => {
  // body is automatically typed as { name: string; email: string }
  return body;
}, {
  body: userSchema
});
```

**Key Differences:**
- TypeBox provides automatic TypeScript type inference
- Shorter, more readable syntax
- Schema placed in route options, not wrapper object
- No type assertions needed

---

## Body Validation

### Fastify
```typescript
fastify.post("/users", {
  schema: {
    body: {
      type: "object",
      required: ["name", "email"],
      properties: {
        name: { type: "string" },
        email: { type: "string", format: "email" },
        age: { type: "integer", minimum: 0, maximum: 150 },
        tags: {
          type: "array",
          items: { type: "string" },
          maxItems: 10
        },
        metadata: {
          type: "object",
          additionalProperties: true
        }
      },
      additionalProperties: false
    }
  }
}, async (request, reply) => {
  const { name, email, age, tags, metadata } = request.body as {
    name: string;
    email: string;
    age?: number;
    tags?: string[];
    metadata?: Record<string, unknown>;
  };
  return { name, email, age, tags, metadata };
});
```

### Elysia
```typescript
app.post("/users", ({ body }) => {
  // body is fully typed automatically
  return body;
}, {
  body: t.Object({
    name: t.String(),
    email: t.String({ format: "email" }),
    age: t.Optional(t.Integer({ minimum: 0, maximum: 150 })),
    tags: t.Optional(t.Array(t.String(), { maxItems: 10 })),
    metadata: t.Optional(t.Record(t.String(), t.Unknown()))
  })
});
```

**Key Differences:**
- `t.Optional()` vs omitting from `required` array
- `t.Record()` vs `additionalProperties: true`
- No explicit `type: "object"` wrapper needed
- `additionalProperties: false` is default in TypeBox

---

## Query Validation

### Fastify
```typescript
fastify.get("/search", {
  schema: {
    querystring: {  // Note: "querystring" not "query"
      type: "object",
      required: ["q"],
      properties: {
        q: { type: "string", minLength: 1 },
        page: { type: "integer", default: 1, minimum: 1 },
        limit: { type: "integer", default: 20, minimum: 1, maximum: 100 },
        sort: { type: "string", enum: ["asc", "desc"] }
      }
    }
  }
}, async (request, reply) => {
  const { q, page, limit, sort } = request.query as {
    q: string;
    page: number;
    limit: number;
    sort?: "asc" | "desc";
  };
  return { q, page, limit, sort };
});
```

### Elysia
```typescript
app.get("/search", ({ query }) => {
  // query is typed as { q: string, page: number, limit: number, sort?: "asc" | "desc" }
  return query;
}, {
  query: t.Object({
    q: t.String({ minLength: 1 }),
    page: t.Integer({ default: 1, minimum: 1 }),
    limit: t.Integer({ default: 20, minimum: 1, maximum: 100 }),
    sort: t.Optional(t.Union([t.Literal("asc"), t.Literal("desc")]))
  })
});
```

**Key Differences:**
- `query` vs `querystring` property name
- `t.Union([t.Literal(...)])` vs `enum` array
- Type coercion automatic (query strings become numbers)

---

## Params Validation

### Fastify
```typescript
fastify.get("/users/:id", {
  schema: {
    params: {
      type: "object",
      required: ["id"],
      properties: {
        id: { type: "integer" }
      }
    }
  }
}, async (request, reply) => {
  const { id } = request.params as { id: number };
  return { userId: id };
});

// Multiple params
fastify.get("/users/:userId/posts/:postId", {
  schema: {
    params: {
      type: "object",
      properties: {
        userId: { type: "integer" },
        postId: { type: "string", format: "uuid" }
      }
    }
  }
}, async (request, reply) => {
  const { userId, postId } = request.params as { userId: number; postId: string };
  return { userId, postId };
});
```

### Elysia
```typescript
app.get("/users/:id", ({ params }) => {
  // params.id is typed as number
  return { userId: params.id };
}, {
  params: t.Object({
    id: t.Integer()
  })
});

// Multiple params
app.get("/users/:userId/posts/:postId", ({ params }) => {
  return { userId: params.userId, postId: params.postId };
}, {
  params: t.Object({
    userId: t.Integer(),
    postId: t.String({ format: "uuid" })
  })
});
```

---

## Headers Validation

### Fastify
```typescript
fastify.get("/protected", {
  schema: {
    headers: {
      type: "object",
      required: ["authorization"],
      properties: {
        authorization: { type: "string", pattern: "^Bearer .+" },
        "x-request-id": { type: "string", format: "uuid" }
      }
    }
  }
}, async (request, reply) => {
  const auth = request.headers.authorization;
  return { token: auth };
});
```

### Elysia
```typescript
app.get("/protected", ({ headers }) => {
  return { token: headers.authorization };
}, {
  headers: t.Object({
    authorization: t.String({ pattern: "^Bearer .+" }),
    "x-request-id": t.Optional(t.String({ format: "uuid" }))
  })
});
```

**Key Differences:**
- Header names are case-insensitive in both
- Elysia validates and types headers automatically

---

## Response Validation

### Fastify
```typescript
fastify.get("/users/:id", {
  schema: {
    params: {
      type: "object",
      properties: { id: { type: "integer" } }
    },
    response: {
      200: {
        type: "object",
        properties: {
          id: { type: "integer" },
          name: { type: "string" },
          email: { type: "string" }
        }
      },
      404: {
        type: "object",
        properties: {
          error: { type: "string" },
          message: { type: "string" }
        }
      }
    }
  }
}, async (request, reply) => {
  const user = await findUser(request.params.id);
  if (!user) {
    reply.code(404);
    return { error: "NOT_FOUND", message: "User not found" };
  }
  return user;
});
```

### Elysia
```typescript
app.get("/users/:id", async ({ params, error }) => {
  const user = await findUser(params.id);
  if (!user) {
    return error(404, { error: "NOT_FOUND", message: "User not found" });
  }
  return user;
}, {
  params: t.Object({ id: t.Integer() }),
  response: {
    200: t.Object({
      id: t.Integer(),
      name: t.String(),
      email: t.String()
    }),
    404: t.Object({
      error: t.String(),
      message: t.String()
    })
  }
});
```

**Key Differences:**
- Use `error(status, body)` for error responses
- Response schemas provide type narrowing
- OpenAPI documentation generated automatically

---

## Type Mapping

### Basic Types

| JSON Schema | TypeBox |
|-------------|---------|
| `{ type: "string" }` | `t.String()` |
| `{ type: "number" }` | `t.Number()` |
| `{ type: "integer" }` | `t.Integer()` |
| `{ type: "boolean" }` | `t.Boolean()` |
| `{ type: "null" }` | `t.Null()` |
| `{ type: "array", items: {...} }` | `t.Array(...)` |
| `{ type: "object", properties: {...} }` | `t.Object({...})` |

### Union and Literal Types

| JSON Schema | TypeBox |
|-------------|---------|
| `{ enum: ["a", "b"] }` | `t.Union([t.Literal("a"), t.Literal("b")])` |
| `{ const: "value" }` | `t.Literal("value")` |
| `{ oneOf: [...] }` | `t.Union([...])` |
| `{ anyOf: [...] }` | `t.Union([...])` |
| `{ allOf: [...] }` | `t.Intersect([...])` |
| `{ type: ["string", "null"] }` | `t.Union([t.String(), t.Null()])` |

### String Constraints

| JSON Schema | TypeBox |
|-------------|---------|
| `{ minLength: 1 }` | `t.String({ minLength: 1 })` |
| `{ maxLength: 100 }` | `t.String({ maxLength: 100 })` |
| `{ pattern: "^[a-z]+$" }` | `t.String({ pattern: "^[a-z]+$" })` |
| `{ format: "email" }` | `t.String({ format: "email" })` |
| `{ format: "uri" }` | `t.String({ format: "uri" })` |
| `{ format: "uuid" }` | `t.String({ format: "uuid" })` |
| `{ format: "date-time" }` | `t.String({ format: "date-time" })` |
| `{ format: "date" }` | `t.String({ format: "date" })` |

### Number Constraints

| JSON Schema | TypeBox |
|-------------|---------|
| `{ minimum: 0 }` | `t.Number({ minimum: 0 })` |
| `{ maximum: 100 }` | `t.Number({ maximum: 100 })` |
| `{ exclusiveMinimum: 0 }` | `t.Number({ exclusiveMinimum: 0 })` |
| `{ exclusiveMaximum: 100 }` | `t.Number({ exclusiveMaximum: 100 })` |
| `{ multipleOf: 5 }` | `t.Number({ multipleOf: 5 })` |

### Array Constraints

| JSON Schema | TypeBox |
|-------------|---------|
| `{ minItems: 1 }` | `t.Array(T, { minItems: 1 })` |
| `{ maxItems: 10 }` | `t.Array(T, { maxItems: 10 })` |
| `{ uniqueItems: true }` | `t.Array(T, { uniqueItems: true })` |

### Object Constraints

| JSON Schema | TypeBox |
|-------------|---------|
| `{ additionalProperties: false }` | Default in `t.Object()` |
| `{ additionalProperties: true }` | Use `t.Record()` for dynamic keys |
| `{ minProperties: 1 }` | `t.Object({...}, { minProperties: 1 })` |
| `{ propertyNames: {...} }` | Use `t.Record()` |

---

## Custom Validators

### Fastify (Custom Ajv Keywords)
```typescript
import Ajv from "ajv";

const fastify = Fastify();

// Add custom format
fastify.addSchema({
  $id: "customFormats",
  type: "object"
});

const ajv = new Ajv({
  removeAdditional: true,
  coerceTypes: true
});

ajv.addFormat("phone", /^\+?[1-9]\d{1,14}$/);

fastify.setValidatorCompiler(({ schema }) => {
  return ajv.compile(schema);
});

fastify.post("/contact", {
  schema: {
    body: {
      type: "object",
      properties: {
        phone: { type: "string", format: "phone" }
      }
    }
  }
}, handler);
```

### Elysia (Custom Types with Refine)
```typescript
import { Elysia, t } from "elysia";

// Custom type with pattern
const PhoneNumber = t.String({
  pattern: "^\\+?[1-9]\\d{1,14}$",
  error: "Invalid phone number format"
});

// Custom type with transform
const Slug = t.Transform(t.String())
  .Decode((value) => value.toLowerCase().replace(/\s+/g, "-"))
  .Encode((value) => value);

// Custom validation with refinement
const PositiveNumber = t.Number({
  minimum: 0,
  exclusiveMinimum: 0
});

// Using custom types
app.post("/contact", ({ body }) => body, {
  body: t.Object({
    phone: PhoneNumber,
    slug: Slug,
    amount: PositiveNumber
  })
});
```

### Elysia (Custom Error Messages)
```typescript
app.post("/users", ({ body }) => body, {
  body: t.Object({
    email: t.String({
      format: "email",
      error: "Please provide a valid email address"
    }),
    age: t.Integer({
      minimum: 18,
      error: "You must be at least 18 years old"
    })
  })
});
```

---

## Reusable Schemas

### Fastify (with $ref)
```typescript
// Register shared schema
fastify.addSchema({
  $id: "User",
  type: "object",
  properties: {
    id: { type: "integer" },
    name: { type: "string" },
    email: { type: "string" }
  }
});

// Reference in routes
fastify.get("/users", {
  schema: {
    response: {
      200: {
        type: "array",
        items: { $ref: "User#" }
      }
    }
  }
}, handler);

fastify.post("/users", {
  schema: {
    body: { $ref: "User#" },
    response: { 201: { $ref: "User#" } }
  }
}, handler);
```

### Elysia (with TypeBox)
```typescript
// Define base schema
const User = t.Object({
  id: t.Integer(),
  name: t.String(),
  email: t.String()
});

// Create variants using TypeBox utilities
const CreateUser = t.Omit(User, ["id"]);
const UpdateUser = t.Partial(t.Omit(User, ["id"]));
const UserWithTimestamps = t.Intersect([
  User,
  t.Object({
    createdAt: t.String({ format: "date-time" }),
    updatedAt: t.String({ format: "date-time" })
  })
]);

// Use in routes
app
  .get("/users", () => users, {
    response: t.Array(User)
  })
  .post("/users", ({ body }) => create(body), {
    body: CreateUser,
    response: { 201: User }
  })
  .patch("/users/:id", ({ body }) => update(body), {
    body: UpdateUser,
    response: User
  });
```

### TypeBox Schema Utilities

```typescript
// Pick specific fields
const UserName = t.Pick(User, ["name"]);

// Omit fields
const UserWithoutId = t.Omit(User, ["id"]);

// Make all fields optional
const PartialUser = t.Partial(User);

// Make all fields required
const RequiredUser = t.Required(PartialUser);

// Combine schemas
const UserWithRole = t.Intersect([
  User,
  t.Object({ role: t.String() })
]);

// Extend schema
const AdminUser = t.Object({
  ...User.properties,
  permissions: t.Array(t.String())
});
```

---

## Error Handling

### Fastify
```typescript
fastify.setErrorHandler((error, request, reply) => {
  if (error.validation) {
    reply.status(400).send({
      error: "VALIDATION_ERROR",
      message: "Request validation failed",
      details: error.validation.map(v => ({
        field: v.instancePath,
        message: v.message
      }))
    });
    return;
  }
  reply.send(error);
});

// Per-route validation error handling
fastify.post("/users", {
  schema: { body: userSchema },
  attachValidation: true
}, async (request, reply) => {
  if (request.validationError) {
    reply.status(400).send({
      error: "Invalid input",
      details: request.validationError.validation
    });
    return;
  }
  // Handle valid request
});
```

### Elysia
```typescript
app
  .onError(({ code, error, set }) => {
    if (code === "VALIDATION") {
      set.status = 400;
      return {
        error: "VALIDATION_ERROR",
        message: "Request validation failed",
        details: error.all.map(e => ({
          field: e.path,
          message: e.message
        }))
      };
    }
  })
  .post("/users", ({ body }) => body, {
    body: t.Object({
      name: t.String(),
      email: t.String({ format: "email" })
    })
  });

// Access specific error details
app.onError(({ code, error }) => {
  if (code === "VALIDATION") {
    console.log("First error:", error.First());
    console.log("All errors:", error.all);
    console.log("Error count:", error.all.length);
  }
});
```

### Elysia Validation Error Properties
```typescript
// error.all returns array of:
interface ValidationError {
  type: string;       // Error type (e.g., "string", "number")
  schema: object;     // The schema that failed
  path: string;       // JSONPath to the field
  value: unknown;     // The actual value
  message: string;    // Human-readable message
}
```

---

## Common Gotchas

### 1. Schema Property Name Differences
```typescript
// Fastify uses "querystring"
fastify.get("/", {
  schema: {
    querystring: { type: "object", properties: { q: { type: "string" } } }
  }
}, handler);

// Elysia uses "query"
app.get("/", handler, {
  query: t.Object({ q: t.String() })
});
```

### 2. Optional vs Required Fields
```typescript
// Fastify - use required array
const schema = {
  type: "object",
  required: ["name"],  // Only name is required
  properties: {
    name: { type: "string" },
    age: { type: "integer" }  // Optional by omission from required
  }
};

// Elysia - use t.Optional()
const schema = t.Object({
  name: t.String(),              // Required by default
  age: t.Optional(t.Integer())   // Explicitly optional
});
```

### 3. Default Values
```typescript
// Fastify - default in schema
const schema = {
  type: "object",
  properties: {
    page: { type: "integer", default: 1 }
  }
};

// Elysia - default in TypeBox options
const schema = t.Object({
  page: t.Integer({ default: 1 })
});
```

### 4. Nullable vs Optional
```typescript
// Fastify - nullable type
const schema = {
  type: "object",
  properties: {
    deletedAt: { type: ["string", "null"], format: "date-time" }
  }
};

// Elysia - use t.Nullable() or t.Union()
const schema = t.Object({
  deletedAt: t.Nullable(t.String({ format: "date-time" }))
  // Or: t.Union([t.String({ format: "date-time" }), t.Null()])
});

// Note: Optional allows undefined, Nullable allows null
// t.Optional(t.String()) -> string | undefined
// t.Nullable(t.String()) -> string | null
```

### 5. Type Coercion
```typescript
// Fastify - configure Ajv for coercion
const fastify = Fastify({
  ajv: {
    customOptions: {
      coerceTypes: true  // "123" becomes 123 for integer
    }
  }
});

// Elysia - coercion is automatic for query/params
app.get("/users/:id", ({ params }) => {
  // params.id is already a number if schema says t.Integer()
  return { id: params.id };
}, {
  params: t.Object({ id: t.Integer() })
});
```

### 6. Additional Properties
```typescript
// Fastify - explicit additionalProperties
const schema = {
  type: "object",
  additionalProperties: false,  // Must specify to reject extra props
  properties: { name: { type: "string" } }
};

// Elysia - additionalProperties: false is default
const schema = t.Object({
  name: t.String()
});  // Extra properties rejected by default

// Allow additional properties with t.Record
const schema = t.Record(t.String(), t.Unknown());
```

---

## Migration Checklist

1. [ ] Replace JSON Schema objects with TypeBox (`t.*`) equivalents
2. [ ] Replace `schema.body` with inline `body:` option
3. [ ] Replace `schema.querystring` with `query:`
4. [ ] Replace `schema.params` with `params:`
5. [ ] Replace `schema.headers` with `headers:`
6. [ ] Replace `schema.response` with `response:`
7. [ ] Remove type assertions - TypeBox provides inference
8. [ ] Use `t.Optional()` instead of omitting from `required`
9. [ ] Use `t.Nullable()` for null-allowed fields
10. [ ] Use schema modifiers (`t.Partial`, `t.Pick`, `t.Omit`) for variants
11. [ ] Replace `fastify.addSchema()` with exported TypeBox schemas
12. [ ] Update error handler to use `code === "VALIDATION"`
13. [ ] Add custom error messages with `error` option in TypeBox
