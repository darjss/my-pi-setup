# Fastify to Elysia: Plugins Migration

Side-by-side comparison of plugin architecture in Fastify vs Elysia.

## Table of Contents
- [Plugin Structure](#plugin-structure)
- [Plugin Options](#plugin-options)
- [Encapsulation](#encapsulation)
- [Plugin Registration](#plugin-registration)
- [Prefix Routing](#prefix-routing)
- [Common Plugins](#common-plugins)
- [Plugin Patterns](#plugin-patterns)
- [Common Gotchas](#common-gotchas)

---

## Plugin Structure

### Fastify
```typescript
import fp from "fastify-plugin";
import type { FastifyPluginCallback, FastifyPluginAsync } from "fastify";

// Callback-style plugin
const myPluginCallback: FastifyPluginCallback = (fastify, options, done) => {
  fastify.decorate("utility", () => "helper");
  fastify.addHook("onRequest", async (request) => {
    request.startTime = Date.now();
  });
  fastify.get("/plugin-route", async () => ({ from: "plugin" }));
  done();
};

// Async plugin
const myPluginAsync: FastifyPluginAsync = async (fastify, options) => {
  fastify.decorate("utility", () => "helper");
  fastify.addHook("onRequest", async (request) => {
    request.startTime = Date.now();
  });
  fastify.get("/plugin-route", async () => ({ from: "plugin" }));
};

// Wrap with fastify-plugin to break encapsulation
export default fp(myPluginAsync, {
  name: "my-plugin",
  fastify: "4.x"
});

// Usage
fastify.register(myPlugin, { option: "value" });
```

### Elysia
```typescript
import { Elysia } from "elysia";

// Plugin is just an Elysia instance
const myPlugin = new Elysia({ name: "my-plugin" })
  .decorate("utility", () => "helper")
  .derive(() => ({
    startTime: Date.now()
  }))
  .get("/plugin-route", () => ({ from: "plugin" }));

// Usage
app.use(myPlugin);

// Plugin factory (for options)
const createPlugin = (options: { prefix?: string }) =>
  new Elysia({ name: "my-plugin", prefix: options.prefix })
    .decorate("utility", () => "helper")
    .get("/route", () => ({ from: "plugin" }));

app.use(createPlugin({ prefix: "/api" }));
```

**Key Differences:**
- No `fp()` wrapper needed in Elysia
- Elysia plugins are regular Elysia instances
- No callback/done pattern - just method chaining
- Decorators shared by default (opposite of Fastify)

---

## Plugin Options

### Fastify
```typescript
import fp from "fastify-plugin";

interface AuthOptions {
  secret: string;
  issuer: string;
  expiresIn?: string;
}

const authPlugin = fp<AuthOptions>(async (fastify, options) => {
  const { secret, issuer, expiresIn = "7d" } = options;

  fastify.decorate("verifyToken", (token: string) => {
    return jwt.verify(token, secret, { issuer });
  });

  fastify.decorate("signToken", (payload: object) => {
    return jwt.sign(payload, secret, { issuer, expiresIn });
  });

  fastify.addHook("preHandler", async (request, reply) => {
    const token = request.headers.authorization?.split(" ")[1];
    if (token) {
      try {
        request.user = fastify.verifyToken(token);
      } catch {
        // Token invalid, user remains undefined
      }
    }
  });
}, {
  name: "auth-plugin"
});

// Usage
fastify.register(authPlugin, {
  secret: process.env.JWT_SECRET!,
  issuer: "my-app",
  expiresIn: "30d"
});
```

### Elysia
```typescript
import { Elysia } from "elysia";

interface AuthOptions {
  secret: string;
  issuer: string;
  expiresIn?: string;
}

const authPlugin = (options: AuthOptions) => {
  const { secret, issuer, expiresIn = "7d" } = options;

  return new Elysia({ name: "auth" })
    .decorate("verifyToken", (token: string) => {
      return jwt.verify(token, secret, { issuer });
    })
    .decorate("signToken", (payload: object) => {
      return jwt.sign(payload, secret, { issuer, expiresIn });
    })
    .derive(({ headers, verifyToken }) => {
      const token = headers.authorization?.split(" ")[1];
      if (!token) return { user: null };

      try {
        return { user: verifyToken(token) };
      } catch {
        return { user: null };
      }
    });
};

// Usage
app.use(authPlugin({
  secret: process.env.JWT_SECRET!,
  issuer: "my-app",
  expiresIn: "30d"
}));
```

**Key Differences:**
- Fastify: options passed to `register()` second argument
- Elysia: factory function returns configured plugin
- Elysia plugins can access their own decorators in `derive`

---

## Encapsulation

### Fastify (Default: Encapsulated)
```typescript
// Without fp() - decorators are encapsulated
const encapsulatedPlugin = async (fastify, options) => {
  fastify.decorate("local", "only in plugin");
  fastify.get("/local", () => fastify.local); // Works
};

fastify.register(encapsulatedPlugin);
fastify.get("/outside", () => fastify.local); // Error: local is undefined

// With fp() - decorators are shared globally
import fp from "fastify-plugin";

const globalPlugin = fp(async (fastify) => {
  fastify.decorate("global", "everywhere");
});

fastify.register(globalPlugin);
fastify.get("/outside", () => fastify.global); // Works - "everywhere"
```

### Elysia (Default: Shared)
```typescript
// Default - decorators are shared
const sharedPlugin = new Elysia({ name: "shared" })
  .decorate("shared", "everywhere")
  .get("/local", ({ shared }) => shared);

app.use(sharedPlugin);
app.get("/outside", ({ shared }) => shared); // Works - "everywhere"

// With scoped: true - decorators are encapsulated
const scopedPlugin = new Elysia({ name: "scoped", scoped: true })
  .decorate("local", "only in plugin")
  .get("/local", ({ local }) => local); // Works

app.use(scopedPlugin);
app.get("/outside", ({ local }) => local); // Error: local is undefined
```

### Side-Effect Comparison
```typescript
// Fastify - hooks are encapsulated by default
const fastifyPlugin = async (fastify, opts) => {
  fastify.addHook("preHandler", authHook);
  // authHook only runs for routes defined in this plugin
};

fastify.register(fastifyPlugin);
fastify.get("/no-auth", handler); // authHook does NOT run

// Elysia - hooks are shared by default
const elysiaPlugin = new Elysia()
  .beforeHandle(authHook);

app.use(elysiaPlugin);
app.get("/has-auth", handler); // authHook DOES run

// Use scoped to prevent hook leakage
const scopedElysiaPlugin = new Elysia({ scoped: true })
  .beforeHandle(authHook);

app.use(scopedElysiaPlugin);
app.get("/no-auth", handler); // authHook does NOT run
```

---

## Plugin Registration

### Fastify: Sequential Registration
```typescript
// Plugins registered in order, async
await fastify.register(databasePlugin);
await fastify.register(authPlugin);
await fastify.register(routesPlugin);

// Wait for all plugins
await fastify.ready();

// With prefix
fastify.register(apiRoutes, { prefix: "/api" });
fastify.register(adminRoutes, { prefix: "/admin" });

// Nested registration
fastify.register(async (instance) => {
  instance.register(subPlugin);
  instance.get("/nested", handler);
}, { prefix: "/v1" });
```

### Elysia: Method Chaining
```typescript
// Plugins composed via .use() - synchronous
app
  .use(databasePlugin)
  .use(authPlugin)
  .use(routesPlugin);

// With prefix (set in plugin constructor)
const apiRoutes = new Elysia({ prefix: "/api" })
  .get("/users", () => "users");

const adminRoutes = new Elysia({ prefix: "/admin" })
  .get("/dashboard", () => "dashboard");

app
  .use(apiRoutes)
  .use(adminRoutes);

// Nested with group
app.group("/v1", (app) =>
  app
    .use(subPlugin)
    .get("/nested", handler)
);
```

### Async Plugin Initialization

```typescript
// Fastify - async in register
fastify.register(async (instance) => {
  const db = await connectDatabase();
  instance.decorate("db", db);
});

await fastify.ready(); // Wait for async initialization

// Elysia - async in derive
const dbPlugin = new Elysia({ name: "db" })
  .derive(async () => {
    const db = await connectDatabase();
    return { db };
  });

app.use(dbPlugin);

// Or lazy initialization
let dbConnection: Database | null = null;

const lazyDbPlugin = new Elysia({ name: "lazy-db" })
  .derive(async () => {
    if (!dbConnection) {
      dbConnection = await connectDatabase();
    }
    return { db: dbConnection };
  });
```

---

## Prefix Routing

### Fastify
```typescript
// Via register options
fastify.register(userRoutes, { prefix: "/users" });

// Inside plugin
const userRoutes = async (fastify, opts) => {
  // Routes are automatically prefixed
  fastify.get("/", handler);      // GET /users
  fastify.get("/:id", handler);   // GET /users/:id
  fastify.post("/", handler);     // POST /users
};

// Nested prefixes
fastify.register(async (instance) => {
  instance.register(v1Routes, { prefix: "/v1" });
  instance.register(v2Routes, { prefix: "/v2" });
}, { prefix: "/api" });
// Results in /api/v1/... and /api/v2/...
```

### Elysia
```typescript
// Via constructor
const userRoutes = new Elysia({ prefix: "/users" })
  .get("/", handler)      // GET /users
  .get("/:id", handler)   // GET /users/:id
  .post("/", handler);    // POST /users

app.use(userRoutes);

// Via group
app.group("/users", (app) =>
  app
    .get("/", handler)
    .get("/:id", handler)
    .post("/", handler)
);

// Nested prefixes
const v1Routes = new Elysia({ prefix: "/v1" })
  .get("/data", handler);

const v2Routes = new Elysia({ prefix: "/v2" })
  .get("/data", handler);

const apiRoutes = new Elysia({ prefix: "/api" })
  .use(v1Routes)   // /api/v1/data
  .use(v2Routes);  // /api/v2/data

app.use(apiRoutes);
```

---

## Common Plugins

### CORS

#### Fastify
```typescript
import cors from "@fastify/cors";

fastify.register(cors, {
  origin: ["http://localhost:3000", "https://myapp.com"],
  methods: ["GET", "POST", "PUT", "DELETE"],
  credentials: true,
  allowedHeaders: ["Content-Type", "Authorization"],
  maxAge: 86400
});
```

#### Elysia
```typescript
import { cors } from "@elysiajs/cors";

app.use(cors({
  origin: ["http://localhost:3000", "https://myapp.com"],
  methods: ["GET", "POST", "PUT", "DELETE"],
  credentials: true,
  allowedHeaders: ["Content-Type", "Authorization"],
  maxAge: 86400
}));
```

### Static Files

#### Fastify
```typescript
import fastifyStatic from "@fastify/static";
import path from "path";

fastify.register(fastifyStatic, {
  root: path.join(__dirname, "public"),
  prefix: "/static/",
  decorateReply: false
});
```

#### Elysia
```typescript
import { staticPlugin } from "@elysiajs/static";

app.use(staticPlugin({
  assets: "public",
  prefix: "/static"
}));
```

### JWT

#### Fastify
```typescript
import fastifyJwt from "@fastify/jwt";

fastify.register(fastifyJwt, {
  secret: "supersecret",
  sign: {
    expiresIn: "7d"
  }
});

// Decorator for auth
fastify.decorate("authenticate", async (request, reply) => {
  try {
    await request.jwtVerify();
  } catch (err) {
    reply.code(401).send({ error: "Unauthorized" });
  }
});

fastify.post("/login", async (request, reply) => {
  const token = fastify.jwt.sign({ userId: 1 });
  return { token };
});

fastify.get("/protected", {
  preHandler: [fastify.authenticate]
}, async (request) => {
  return request.user;
});
```

#### Elysia
```typescript
import { jwt } from "@elysiajs/jwt";

app
  .use(jwt({
    secret: "supersecret",
    exp: "7d"
  }))
  .post("/login", async ({ jwt }) => {
    const token = await jwt.sign({ userId: 1 });
    return { token };
  })
  .derive(async ({ jwt, headers }) => {
    const token = headers.authorization?.split(" ")[1];
    if (!token) return { user: null };
    const payload = await jwt.verify(token);
    return { user: payload || null };
  })
  .get("/protected", ({ user, error }) => {
    if (!user) return error(401);
    return user;
  });
```

### Swagger/OpenAPI

#### Fastify
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
    components: {
      securitySchemes: {
        bearerAuth: {
          type: "http",
          scheme: "bearer"
        }
      }
    }
  }
});

fastify.register(swaggerUi, {
  routePrefix: "/docs",
  uiConfig: {
    docExpansion: "list"
  }
});
```

#### Elysia
```typescript
import { swagger } from "@elysiajs/swagger";

app.use(swagger({
  documentation: {
    info: {
      title: "My API",
      version: "1.0.0",
      description: "API Documentation"
    },
    components: {
      securitySchemes: {
        bearerAuth: {
          type: "http",
          scheme: "bearer"
        }
      }
    }
  },
  path: "/docs",
  scalarConfig: {
    layout: "classic"
  }
}));
```

---

## Plugin Patterns

### Database Plugin

#### Fastify
```typescript
import fp from "fastify-plugin";

export default fp(async (fastify, options) => {
  const pool = createPool(options.connectionString);

  // Test connection
  await pool.query("SELECT 1");

  fastify.decorate("db", {
    query: (sql: string, params?: any[]) => pool.query(sql, params),
    transaction: async (fn: (client: Client) => Promise<void>) => {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        await fn(client);
        await client.query("COMMIT");
      } catch (e) {
        await client.query("ROLLBACK");
        throw e;
      } finally {
        client.release();
      }
    }
  });

  // Cleanup on close
  fastify.addHook("onClose", async () => {
    await pool.end();
  });
});
```

#### Elysia
```typescript
export const databasePlugin = (connectionString: string) => {
  const pool = createPool(connectionString);

  return new Elysia({ name: "database" })
    .decorate("db", {
      query: (sql: string, params?: any[]) => pool.query(sql, params),
      transaction: async (fn: (client: Client) => Promise<void>) => {
        const client = await pool.connect();
        try {
          await client.query("BEGIN");
          await fn(client);
          await client.query("COMMIT");
        } catch (e) {
          await client.query("ROLLBACK");
          throw e;
        } finally {
          client.release();
        }
      }
    })
    .onStart(async () => {
      // Test connection on startup
      await pool.query("SELECT 1");
    })
    .onStop(async () => {
      await pool.end();
    });
};
```

### Rate Limiting Plugin

#### Fastify
```typescript
import fp from "fastify-plugin";

interface RateLimitOptions {
  max: number;
  windowMs: number;
}

export default fp<RateLimitOptions>(async (fastify, options) => {
  const requests = new Map<string, { count: number; resetTime: number }>();

  fastify.addHook("preHandler", async (request, reply) => {
    const ip = request.ip;
    const now = Date.now();
    const record = requests.get(ip);

    if (!record || now > record.resetTime) {
      requests.set(ip, { count: 1, resetTime: now + options.windowMs });
      return;
    }

    if (record.count >= options.max) {
      reply.code(429).send({ error: "Too many requests" });
      return;
    }

    record.count++;
  });
});

// Usage
fastify.register(rateLimitPlugin, { max: 100, windowMs: 60000 });
```

#### Elysia
```typescript
interface RateLimitOptions {
  max: number;
  windowMs: number;
}

export const rateLimitPlugin = (options: RateLimitOptions) => {
  const requests = new Map<string, { count: number; resetTime: number }>();

  return new Elysia({ name: "rate-limit" })
    .derive(({ request }) => {
      const ip = request.headers.get("x-forwarded-for") ||
                 request.headers.get("x-real-ip") ||
                 "unknown";
      return { clientIp: ip };
    })
    .beforeHandle(({ clientIp, error, set }) => {
      const now = Date.now();
      const record = requests.get(clientIp);

      if (!record || now > record.resetTime) {
        requests.set(clientIp, { count: 1, resetTime: now + options.windowMs });
        return;
      }

      if (record.count >= options.max) {
        set.headers["Retry-After"] = String(
          Math.ceil((record.resetTime - now) / 1000)
        );
        return error(429, { error: "Too many requests" });
      }

      record.count++;
    });
};

// Usage
app.use(rateLimitPlugin({ max: 100, windowMs: 60000 }));
```

---

## Common Gotchas

### 1. Plugin Name Collisions
```typescript
// Fastify - name is optional, deduplication by name
fastify.register(fp(plugin, { name: "my-plugin" }));
fastify.register(fp(plugin, { name: "my-plugin" })); // Skipped (deduplicated)

// Elysia - name is required for deduplication
const plugin = new Elysia({ name: "my-plugin" });
app.use(plugin);
app.use(plugin); // Skipped (same name)

// Without name, plugin runs multiple times
const unnamed = new Elysia();
app.use(unnamed);
app.use(unnamed); // Runs again!
```

### 2. Decorator Access in Plugins
```typescript
// Fastify - decorators available via `this`
fastify.register(async function (instance) {
  console.log(this.db); // Accessible if parent decorated
});

// Elysia - decorators available via destructuring
const plugin = new Elysia()
  .get("/", ({ db }) => {
    // db available if parent decorated
    return db.query("SELECT 1");
  });
```

### 3. Plugin Prefix Behavior
```typescript
// Fastify - prefix in register options
fastify.register(routes, { prefix: "/api" });

// Elysia - prefix in constructor
const routes = new Elysia({ prefix: "/api" });

// Elysia - cannot change prefix after creation
app.use(routes); // Prefix is /api
// No way to override prefix when using
```

### 4. Async Plugin Initialization
```typescript
// Fastify - can await in register
fastify.register(async (instance) => {
  const data = await loadConfig(); // Works
  instance.decorate("config", data);
});

// Elysia - use derive for async
const plugin = new Elysia()
  // This doesn't work for one-time init:
  // .decorate("config", await loadConfig())

  // Use derive or onStart instead:
  .onStart(async () => {
    // One-time async initialization
  })
  .derive(async () => {
    // Per-request async (cached if needed)
    return { config: await getConfig() };
  });
```

### 5. Hook Inheritance Direction
```typescript
// Fastify - child inherits from parent
fastify.addHook("onRequest", parentHook);
fastify.register(async (child) => {
  // parentHook runs for all child routes
  child.get("/", handler);
});

// Elysia - plugin hooks flow to parent (unless scoped)
const plugin = new Elysia()
  .onRequest(pluginHook);

app.use(plugin);
app.get("/", handler); // pluginHook runs here too!

// Use scoped to prevent
const scopedPlugin = new Elysia({ scoped: true })
  .onRequest(scopedHook);

app.use(scopedPlugin);
app.get("/", handler); // scopedHook does NOT run
```

---

## Migration Checklist

1. [ ] Replace `fp()` wrapper with `new Elysia({ name: "..." })`
2. [ ] Replace `fastify.register(plugin)` with `app.use(plugin)`
3. [ ] Replace callback `(fastify, options, done)` with factory `(options) => new Elysia()`
4. [ ] Replace `fastify.decorate()` with `.decorate()`
5. [ ] Replace `fastify.decorateRequest()` with `.derive()`
6. [ ] Replace `fastify.addHook()` with appropriate hook methods
7. [ ] Use `scoped: true` if encapsulation is needed
8. [ ] Set `prefix` in Elysia constructor instead of register options
9. [ ] Replace `fastify.ready()` with synchronous plugin composition
10. [ ] Add `name` to plugins to enable deduplication
11. [ ] Replace `onClose` hook with `onStop`
12. [ ] Update async initialization to use `onStart` or `derive`
