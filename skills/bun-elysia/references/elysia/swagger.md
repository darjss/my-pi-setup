# Elysia.js Swagger - OpenAPI Documentation

Elysia auto-generates OpenAPI documentation from your routes and schemas.

## Table of Contents
- [Setup](#setup)
- [Basic Configuration](#basic-configuration)
- [Route Documentation](#route-documentation)
- [Schema Documentation](#schema-documentation)
- [Tags and Groups](#tags-and-groups)
- [Security Schemes](#security-schemes)
- [Customization](#customization)

---

## Setup

### Installation
```bash
bun add @elysiajs/swagger
```

### Basic Usage
```typescript
import { Elysia } from "elysia";
import { swagger } from "@elysiajs/swagger";

const app = new Elysia()
  .use(swagger())
  .get("/", () => "Hello")
  .post("/users", () => "Create user")
  .listen(3000);

// Docs available at:
// - http://localhost:3000/swagger (Scalar UI)
// - http://localhost:3000/swagger/json (OpenAPI JSON)
```

---

## Basic Configuration

```typescript
app.use(swagger({
  // Documentation info
  documentation: {
    info: {
      title: "My API",
      version: "1.0.0",
      description: "API documentation for My App"
    },
    tags: [
      { name: "users", description: "User operations" },
      { name: "posts", description: "Post operations" }
    ]
  },

  // UI path (default: /swagger)
  path: "/docs",

  // Exclude routes from docs
  exclude: ["/health", "/metrics"],

  // Provider: "scalar" (default) or "swagger-ui"
  provider: "scalar",

  // Exclude static files from docs (default: true)
  excludeStaticFile: true
}));
```

---

## Route Documentation

### Detail Object
```typescript
app.get("/users/:id", ({ params }) => {
  return { id: params.id, name: "Alice" };
}, {
  params: t.Object({ id: t.Number() }),
  response: t.Object({
    id: t.Number(),
    name: t.String()
  }),
  detail: {
    summary: "Get user by ID",
    description: "Retrieve a single user by their unique identifier",
    tags: ["users"],
    deprecated: false
  }
});
```

### Complete Route Documentation
```typescript
app.post("/users", ({ body }) => {
  return { id: 1, ...body };
}, {
  body: t.Object({
    name: t.String({ description: "User's full name" }),
    email: t.String({
      format: "email",
      description: "User's email address"
    }),
    age: t.Optional(t.Number({
      minimum: 0,
      description: "User's age in years"
    }))
  }),
  response: {
    200: t.Object({
      id: t.Number(),
      name: t.String(),
      email: t.String()
    }),
    400: t.Object({
      error: t.String()
    })
  },
  detail: {
    summary: "Create user",
    description: "Create a new user account",
    tags: ["users"],
    externalDocs: {
      description: "User guide",
      url: "https://docs.example.com/users"
    }
  }
});
```

---

## Schema Documentation

### Field Descriptions
```typescript
const UserSchema = t.Object({
  id: t.Number({ description: "Unique user identifier" }),
  name: t.String({
    description: "User's display name",
    examples: ["Alice", "Bob"]
  }),
  email: t.String({
    format: "email",
    description: "Primary email address"
  }),
  role: t.Union([
    t.Literal("admin"),
    t.Literal("user"),
    t.Literal("guest")
  ], {
    description: "User's role in the system",
    default: "user"
  }),
  createdAt: t.String({
    format: "date-time",
    description: "Account creation timestamp"
  })
}, {
  description: "User account information"
});
```

### Examples
```typescript
body: t.Object({
  name: t.String(),
  email: t.String()
}, {
  examples: [
    { name: "Alice", email: "[email protected]" },
    { name: "Bob", email: "[email protected]" }
  ]
})
```

---

## Tags and Groups

### Using Tags
```typescript
app.use(swagger({
  documentation: {
    tags: [
      { name: "auth", description: "Authentication endpoints" },
      { name: "users", description: "User management" },
      { name: "posts", description: "Blog posts" }
    ]
  }
}));

app
  .post("/login", handler, { detail: { tags: ["auth"] } })
  .post("/register", handler, { detail: { tags: ["auth"] } })
  .get("/users", handler, { detail: { tags: ["users"] } })
  .get("/posts", handler, { detail: { tags: ["posts"] } });
```

### Group-Based Tags
```typescript
app.group("/api/users", { detail: { tags: ["users"] } }, (app) =>
  app
    .get("/", () => "List users")
    .get("/:id", ({ params }) => `User ${params.id}`)
    .post("/", () => "Create user")
);
```

---

## Security Schemes

### Bearer Token
```typescript
app.use(swagger({
  documentation: {
    components: {
      securitySchemes: {
        bearerAuth: {
          type: "http",
          scheme: "bearer",
          bearerFormat: "JWT"
        }
      }
    },
    security: [{ bearerAuth: [] }]
  }
}));
```

### API Key
```typescript
documentation: {
  components: {
    securitySchemes: {
      apiKey: {
        type: "apiKey",
        in: "header",
        name: "X-API-Key"
      }
    }
  }
}
```

### OAuth2
```typescript
documentation: {
  components: {
    securitySchemes: {
      oauth2: {
        type: "oauth2",
        flows: {
          authorizationCode: {
            authorizationUrl: "https://auth.example.com/authorize",
            tokenUrl: "https://auth.example.com/token",
            scopes: {
              "read:users": "Read user data",
              "write:users": "Modify user data"
            }
          }
        }
      }
    }
  }
}
```

### Route-Specific Security
```typescript
app.get("/public", handler, {
  detail: {
    security: [] // No auth required
  }
});

app.get("/private", handler, {
  detail: {
    security: [{ bearerAuth: [] }]
  }
});
```

---

## Customization

### Scalar UI Configuration
```typescript
app.use(swagger({
  provider: "scalar",
  scalarConfig: {
    theme: "purple",
    layout: "modern",
    defaultHttpClient: {
      targetKey: "javascript",
      clientKey: "fetch"
    },
    hiddenClients: ["curl"],
    showSidebar: true
  }
}));
```

### Swagger UI Configuration
```typescript
app.use(swagger({
  provider: "swagger-ui",
  swaggerUIConfig: {
    deepLinking: true,
    displayRequestDuration: true,
    filter: true,
    syntaxHighlight: {
      theme: "monokai"
    }
  }
}));
```

### Custom Path
```typescript
app.use(swagger({
  path: "/api-docs",           // UI path
  excludeStaticFile: true,     // Exclude static files
  exclude: ["/health", /^\/internal/]
}));

// Docs at /api-docs
// JSON at /api-docs/json
```

### Multiple Doc Versions
```typescript
app
  .use(swagger({
    path: "/v1/docs",
    documentation: {
      info: { title: "API v1", version: "1.0.0" }
    },
    exclude: [/^\/v2/]
  }))
  .use(swagger({
    path: "/v2/docs",
    documentation: {
      info: { title: "API v2", version: "2.0.0" }
    },
    exclude: [/^\/v1/]
  }));
```

---

## Full Example

```typescript
import { Elysia, t } from "elysia";
import { swagger } from "@elysiajs/swagger";

const app = new Elysia()
  .use(swagger({
    documentation: {
      info: {
        title: "User Service API",
        version: "1.0.0",
        description: "API for managing users",
        contact: {
          name: "API Support",
          email: "[email protected]"
        }
      },
      tags: [
        { name: "users", description: "User CRUD operations" }
      ],
      components: {
        securitySchemes: {
          bearerAuth: {
            type: "http",
            scheme: "bearer",
            bearerFormat: "JWT"
          }
        }
      }
    },
    path: "/docs"
  }))
  .get("/users", () => {
    return [{ id: 1, name: "Alice" }];
  }, {
    response: t.Array(t.Object({
      id: t.Number(),
      name: t.String()
    })),
    detail: {
      summary: "List all users",
      tags: ["users"]
    }
  })
  .get("/users/:id", ({ params, status }) => {
    if (params.id === 0) return status(404, { error: "Not found" });
    return { id: params.id, name: "Alice" };
  }, {
    params: t.Object({ id: t.Number() }),
    response: {
      200: t.Object({ id: t.Number(), name: t.String() }),
      404: t.Object({ error: t.String() })
    },
    detail: {
      summary: "Get user by ID",
      tags: ["users"]
    }
  })
  .post("/users", ({ body }) => {
    return { id: 1, ...body };
  }, {
    body: t.Object({
      name: t.String({ minLength: 1 }),
      email: t.String({ format: "email" })
    }),
    response: t.Object({
      id: t.Number(),
      name: t.String(),
      email: t.String()
    }),
    detail: {
      summary: "Create user",
      tags: ["users"],
      security: [{ bearerAuth: [] }]
    }
  })
  .listen(3000);

console.log("Docs at http://localhost:3000/docs");
```
