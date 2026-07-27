# Fastify to Elysia: Authentication Migration

Side-by-side comparison of authentication patterns in Fastify vs Elysia.

## Table of Contents
- [Basic Auth Header](#basic-auth-header)
- [JWT Authentication](#jwt-authentication)
- [Cookie-Based Sessions](#cookie-based-sessions)
- [API Key Authentication](#api-key-authentication)
- [Role-Based Access Control](#role-based-access-control)
- [Guard Patterns](#guard-patterns)
- [OAuth Integration](#oauth-integration)
- [Common Gotchas](#common-gotchas)

---

## Basic Auth Header

### Fastify
```typescript
// Global auth hook
fastify.addHook("preHandler", async (request, reply) => {
  const auth = request.headers.authorization;

  if (!auth?.startsWith("Bearer ")) {
    reply.code(401).send({ error: "Missing token" });
    return;
  }

  const token = auth.slice(7);
  try {
    request.user = verifyToken(token);
  } catch {
    reply.code(401).send({ error: "Invalid token" });
  }
});

fastify.get("/profile", async (request) => {
  return request.user;
});
```

### Elysia
```typescript
app
  // derive: Extract user from token
  .derive(({ headers }) => {
    const auth = headers.authorization;
    if (!auth?.startsWith("Bearer ")) {
      return { user: null };
    }
    try {
      return { user: verifyToken(auth.slice(7)) };
    } catch {
      return { user: null };
    }
  })
  // beforeHandle: Guard - reject if no user
  .beforeHandle(({ user, error }) => {
    if (!user) return error(401, { error: "Unauthorized" });
  })
  .get("/profile", ({ user }) => user);
```

**Key Differences:**
- Use `derive` to add user to context
- Use `beforeHandle` for access control
- Return from `beforeHandle` to short-circuit

---

## JWT Authentication

### Fastify
```typescript
import fastifyJwt from "@fastify/jwt";

fastify.register(fastifyJwt, {
  secret: process.env.JWT_SECRET!,
  sign: {
    expiresIn: "7d",
    issuer: "my-app"
  },
  verify: {
    issuer: "my-app"
  }
});

// Authentication decorator
fastify.decorate("authenticate", async (request, reply) => {
  try {
    await request.jwtVerify();
  } catch (err) {
    reply.code(401).send({ error: "Unauthorized" });
  }
});

// Login endpoint
fastify.post("/login", async (request, reply) => {
  const { email, password } = request.body as { email: string; password: string };
  const user = await authenticate(email, password);

  if (!user) {
    reply.code(401).send({ error: "Invalid credentials" });
    return;
  }

  const token = fastify.jwt.sign({
    id: user.id,
    email: user.email,
    role: user.role
  });

  return { token, user: { id: user.id, email: user.email } };
});

// Refresh token
fastify.post("/refresh", {
  preHandler: [fastify.authenticate]
}, async (request) => {
  const newToken = fastify.jwt.sign({
    id: request.user.id,
    email: request.user.email,
    role: request.user.role
  });
  return { token: newToken };
});

// Protected route
fastify.get("/profile", {
  preHandler: [fastify.authenticate]
}, async (request) => {
  return request.user;
});
```

### Elysia
```typescript
import { jwt } from "@elysiajs/jwt";

app
  .use(jwt({
    secret: process.env.JWT_SECRET!,
    exp: "7d"
  }))

  // Login endpoint
  .post("/login", async ({ body, jwt, error }) => {
    const user = await authenticate(body.email, body.password);

    if (!user) {
      return error(401, { error: "Invalid credentials" });
    }

    const token = await jwt.sign({
      id: user.id,
      email: user.email,
      role: user.role
    });

    return { token, user: { id: user.id, email: user.email } };
  }, {
    body: t.Object({
      email: t.String({ format: "email" }),
      password: t.String({ minLength: 1 })
    })
  })

  // Auth middleware for protected routes
  .derive(async ({ headers, jwt }) => {
    const auth = headers.authorization;
    if (!auth?.startsWith("Bearer ")) {
      return { user: null };
    }

    const payload = await jwt.verify(auth.slice(7));
    return { user: payload || null };
  })

  // Refresh token
  .post("/refresh", async ({ user, jwt, error }) => {
    if (!user) return error(401);

    const newToken = await jwt.sign({
      id: user.id,
      email: user.email,
      role: user.role
    });
    return { token: newToken };
  })

  // Protected route
  .get("/profile", ({ user, error }) => {
    if (!user) return error(401);
    return user;
  });
```

### JWT with Cookies

#### Fastify
```typescript
import fastifyJwt from "@fastify/jwt";
import fastifyCookie from "@fastify/cookie";

fastify.register(fastifyCookie);
fastify.register(fastifyJwt, {
  secret: process.env.JWT_SECRET!,
  cookie: {
    cookieName: "token",
    signed: false
  }
});

fastify.post("/login", async (request, reply) => {
  const user = await authenticate(request.body);
  const token = fastify.jwt.sign({ id: user.id });

  reply.setCookie("token", token, {
    path: "/",
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    maxAge: 7 * 24 * 60 * 60 // 7 days
  });

  return { success: true };
});

fastify.get("/profile", {
  preHandler: [fastify.authenticate]
}, async (request) => {
  return request.user;
});
```

#### Elysia
```typescript
import { jwt } from "@elysiajs/jwt";

app
  .use(jwt({ secret: process.env.JWT_SECRET! }))

  .post("/login", async ({ body, jwt, cookie }) => {
    const user = await authenticate(body);
    const token = await jwt.sign({ id: user.id });

    cookie.token.set({
      value: token,
      path: "/",
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      maxAge: 7 * 24 * 60 * 60
    });

    return { success: true };
  })

  .derive(async ({ jwt, cookie }) => {
    const token = cookie.token.value;
    if (!token) return { user: null };

    const payload = await jwt.verify(token);
    return { user: payload || null };
  })

  .get("/profile", ({ user, error }) => {
    if (!user) return error(401);
    return user;
  });
```

---

## Cookie-Based Sessions

### Fastify
```typescript
import fastifySession from "@fastify/session";
import fastifyCookie from "@fastify/cookie";
import RedisStore from "connect-redis";
import { createClient } from "redis";

const redisClient = createClient();
await redisClient.connect();

fastify.register(fastifyCookie);
fastify.register(fastifySession, {
  secret: process.env.SESSION_SECRET!,
  cookie: {
    secure: process.env.NODE_ENV === "production",
    httpOnly: true,
    maxAge: 86400000 // 1 day
  },
  store: new RedisStore({ client: redisClient })
});

// Login
fastify.post("/login", async (request, reply) => {
  const { email, password } = request.body as { email: string; password: string };
  const user = await authenticate(email, password);

  if (!user) {
    reply.code(401).send({ error: "Invalid credentials" });
    return;
  }

  request.session.set("userId", user.id);
  request.session.set("role", user.role);

  return { success: true };
});

// Check session
fastify.addHook("preHandler", async (request, reply) => {
  const userId = request.session.get("userId");
  if (!userId) return; // Allow unauthenticated routes

  request.user = await getUserById(userId);
});

// Protected route
fastify.get("/profile", async (request, reply) => {
  if (!request.user) {
    reply.code(401).send({ error: "Not logged in" });
    return;
  }
  return request.user;
});

// Logout
fastify.post("/logout", async (request) => {
  request.session.delete();
  return { success: true };
});
```

### Elysia
```typescript
import { createClient } from "redis";

const redis = createClient();
await redis.connect();

// Session helpers
const createSession = async (userId: string) => {
  const sessionId = crypto.randomUUID();
  await redis.setEx(`session:${sessionId}`, 86400, JSON.stringify({ userId }));
  return sessionId;
};

const getSession = async (sessionId: string) => {
  const data = await redis.get(`session:${sessionId}`);
  return data ? JSON.parse(data) : null;
};

const deleteSession = async (sessionId: string) => {
  await redis.del(`session:${sessionId}`);
};

app
  // Login
  .post("/login", async ({ body, cookie, error }) => {
    const user = await authenticate(body.email, body.password);

    if (!user) {
      return error(401, { error: "Invalid credentials" });
    }

    const sessionId = await createSession(user.id);

    cookie.session.set({
      value: sessionId,
      path: "/",
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      maxAge: 86400
    });

    return { success: true };
  }, {
    body: t.Object({
      email: t.String(),
      password: t.String()
    })
  })

  // Session middleware
  .derive(async ({ cookie }) => {
    const sessionId = cookie.session.value;
    if (!sessionId) return { session: null, user: null };

    const session = await getSession(sessionId);
    if (!session) return { session: null, user: null };

    const user = await getUserById(session.userId);
    return { session, user };
  })

  // Protected route
  .get("/profile", ({ user, error }) => {
    if (!user) return error(401, { error: "Not logged in" });
    return user;
  })

  // Logout
  .post("/logout", async ({ cookie }) => {
    const sessionId = cookie.session.value;
    if (sessionId) {
      await deleteSession(sessionId);
    }
    cookie.session.remove();
    return { success: true };
  });
```

---

## API Key Authentication

### Fastify
```typescript
interface ApiClient {
  id: string;
  name: string;
  permissions: string[];
}

fastify.addHook("preHandler", async (request, reply) => {
  const apiKey = request.headers["x-api-key"] as string;

  if (!apiKey) {
    reply.code(401).send({ error: "API key required" });
    return;
  }

  const client = await validateApiKey(apiKey);
  if (!client) {
    reply.code(401).send({ error: "Invalid API key" });
    return;
  }

  request.apiClient = client;
});

// Check permissions decorator
fastify.decorate("requirePermission", (permission: string) => {
  return async (request, reply) => {
    if (!request.apiClient.permissions.includes(permission)) {
      reply.code(403).send({ error: "Insufficient permissions" });
    }
  };
});

fastify.get("/data", async (request) => {
  return { client: request.apiClient.name };
});

fastify.post("/write", {
  preHandler: [fastify.requirePermission("write")]
}, async (request) => {
  return { written: true };
});
```

### Elysia
```typescript
interface ApiClient {
  id: string;
  name: string;
  permissions: string[];
}

app
  // Extract API client from key
  .derive(async ({ headers, error }) => {
    const apiKey = headers["x-api-key"];

    if (!apiKey) {
      return { apiClient: null };
    }

    const client = await validateApiKey(apiKey);
    return { apiClient: client };
  })

  // Global guard - require API key
  .beforeHandle(({ apiClient, error }) => {
    if (!apiClient) {
      return error(401, { error: "Invalid API key" });
    }
  })

  // Permission macro
  .macro(({ onBeforeHandle }) => ({
    requirePermission(permission: string) {
      onBeforeHandle(({ apiClient, error }) => {
        if (!apiClient?.permissions.includes(permission)) {
          return error(403, { error: "Insufficient permissions" });
        }
      });
    }
  }))

  .get("/data", ({ apiClient }) => ({ client: apiClient!.name }))

  .post("/write", () => ({ written: true }), {
    requirePermission: "write"
  });
```

---

## Role-Based Access Control

### Fastify
```typescript
// Role check decorator
fastify.decorate("requireRole", (roles: string[]) => {
  return async (request, reply) => {
    if (!request.user) {
      reply.code(401).send({ error: "Unauthorized" });
      return;
    }

    if (!roles.includes(request.user.role)) {
      reply.code(403).send({ error: "Forbidden" });
      return;
    }
  };
});

// Routes with role requirements
fastify.get("/admin", {
  preHandler: [fastify.authenticate, fastify.requireRole(["admin"])]
}, async (request) => {
  return { admin: true };
});

fastify.get("/dashboard", {
  preHandler: [fastify.authenticate, fastify.requireRole(["admin", "manager"])]
}, async (request) => {
  return { dashboard: true };
});

fastify.get("/reports", {
  preHandler: [
    fastify.authenticate,
    fastify.requireRole(["admin", "manager", "analyst"])
  ]
}, async (request) => {
  return { reports: true };
});
```

### Elysia
```typescript
// Using macro for role checks
app
  .derive(async ({ headers }) => {
    const token = headers.authorization?.split(" ")[1];
    if (!token) return { user: null };
    return { user: await verifyToken(token) };
  })

  .macro(({ onBeforeHandle }) => ({
    requireRole(roles: string[]) {
      onBeforeHandle(({ user, error }) => {
        if (!user) return error(401, { error: "Unauthorized" });
        if (!roles.includes(user.role)) {
          return error(403, { error: "Forbidden" });
        }
      });
    }
  }))

  // Routes with role requirements
  .get("/admin", ({ user }) => ({ admin: true }), {
    requireRole: ["admin"]
  })

  .get("/dashboard", ({ user }) => ({ dashboard: true }), {
    requireRole: ["admin", "manager"]
  })

  .get("/reports", ({ user }) => ({ reports: true }), {
    requireRole: ["admin", "manager", "analyst"]
  });
```

### Permission-Based Access

```typescript
// Elysia - Fine-grained permissions
app
  .macro(({ onBeforeHandle }) => ({
    requirePermissions(permissions: string[]) {
      onBeforeHandle(({ user, error }) => {
        if (!user) return error(401);

        const hasAll = permissions.every(p =>
          user.permissions.includes(p)
        );

        if (!hasAll) {
          return error(403, {
            error: "Missing permissions",
            required: permissions
          });
        }
      });
    }
  }))

  .post("/users", handler, {
    requirePermissions: ["users:create"]
  })

  .delete("/users/:id", handler, {
    requirePermissions: ["users:delete"]
  })

  .put("/settings", handler, {
    requirePermissions: ["settings:read", "settings:write"]
  });
```

---

## Guard Patterns

### Fastify - Plugin-Based Guards
```typescript
// Admin routes plugin with guard
const adminRoutes = async (fastify, opts) => {
  // Guard applies to all routes in this plugin
  fastify.addHook("preHandler", async (request, reply) => {
    if (!request.user || request.user.role !== "admin") {
      reply.code(403).send({ error: "Admin access required" });
    }
  });

  fastify.get("/users", async () => getUsers());
  fastify.get("/settings", async () => getSettings());
  fastify.post("/config", async (request) => updateConfig(request.body));
};

fastify.register(adminRoutes, { prefix: "/admin" });
```

### Elysia - Guard Pattern
```typescript
// Guard with grouped routes
const adminGuard = new Elysia({ name: "admin-guard" })
  .derive(({ headers }) => ({
    user: getUserFromToken(headers.authorization)
  }))
  .beforeHandle(({ user, error }) => {
    if (!user) return error(401);
    if (user.role !== "admin") return error(403);
  });

// Apply guard to group
app.group("/admin", (app) =>
  app
    .use(adminGuard)
    .get("/users", () => getUsers())
    .get("/settings", () => getSettings())
    .post("/config", ({ body }) => updateConfig(body))
);

// Or use guard() method
app.guard(
  {
    beforeHandle: ({ user, error }) => {
      if (!user?.isAdmin) return error(403);
    }
  },
  (app) =>
    app
      .get("/admin/users", () => getUsers())
      .get("/admin/settings", () => getSettings())
);
```

### Elysia - Scoped Guard Plugin
```typescript
// Reusable auth guard
const authGuard = (options: { roles?: string[] } = {}) =>
  new Elysia({ name: "auth-guard", scoped: true })
    .derive(async ({ headers }) => {
      const token = headers.authorization?.split(" ")[1];
      if (!token) return { user: null };
      return { user: await verifyToken(token) };
    })
    .beforeHandle(({ user, error }) => {
      if (!user) return error(401, { error: "Unauthorized" });
      if (options.roles && !options.roles.includes(user.role)) {
        return error(403, { error: "Forbidden" });
      }
    });

// Usage
app
  .group("/api", (app) =>
    app
      .use(authGuard())
      .get("/profile", ({ user }) => user)
  )
  .group("/admin", (app) =>
    app
      .use(authGuard({ roles: ["admin"] }))
      .get("/dashboard", () => "admin only")
  );
```

---

## OAuth Integration

### Fastify
```typescript
import fastifyOAuth2 from "@fastify/oauth2";

fastify.register(fastifyOAuth2, {
  name: "googleOAuth2",
  credentials: {
    client: {
      id: process.env.GOOGLE_CLIENT_ID!,
      secret: process.env.GOOGLE_CLIENT_SECRET!
    },
    auth: fastifyOAuth2.GOOGLE_CONFIGURATION
  },
  scope: ["email", "profile"],
  startRedirectPath: "/login/google",
  callbackUri: "http://localhost:3000/login/google/callback"
});

fastify.get("/login/google/callback", async (request, reply) => {
  try {
    const { token } = await fastify.googleOAuth2
      .getAccessTokenFromAuthorizationCodeFlow(request);

    // Get user info from Google
    const userInfo = await fetch(
      "https://www.googleapis.com/oauth2/v2/userinfo",
      { headers: { Authorization: `Bearer ${token.access_token}` } }
    ).then(r => r.json());

    // Find or create user
    let user = await findUserByEmail(userInfo.email);
    if (!user) {
      user = await createUser({
        email: userInfo.email,
        name: userInfo.name,
        avatar: userInfo.picture,
        provider: "google"
      });
    }

    // Create session/JWT
    const jwt = fastify.jwt.sign({ id: user.id, email: user.email });

    reply.redirect(`/?token=${jwt}`);
  } catch (err) {
    reply.redirect("/login?error=oauth_failed");
  }
});
```

### Elysia
```typescript
// OAuth configuration
const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_USERINFO_URL = "https://www.googleapis.com/oauth2/v2/userinfo";

app
  .use(jwt({ secret: process.env.JWT_SECRET! }))

  // Start OAuth flow
  .get("/login/google", ({ redirect }) => {
    const params = new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID!,
      redirect_uri: "http://localhost:3000/login/google/callback",
      response_type: "code",
      scope: "email profile",
      access_type: "offline"
    });
    return redirect(`${GOOGLE_AUTH_URL}?${params}`);
  })

  // OAuth callback
  .get("/login/google/callback", async ({ query, jwt, redirect, error, cookie }) => {
    if (!query.code) {
      return redirect("/login?error=no_code");
    }

    try {
      // Exchange code for tokens
      const tokenRes = await fetch(GOOGLE_TOKEN_URL, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          code: query.code,
          client_id: process.env.GOOGLE_CLIENT_ID!,
          client_secret: process.env.GOOGLE_CLIENT_SECRET!,
          redirect_uri: "http://localhost:3000/login/google/callback",
          grant_type: "authorization_code"
        })
      }).then(r => r.json());

      if (!tokenRes.access_token) {
        return redirect("/login?error=token_failed");
      }

      // Get user info
      const userInfo = await fetch(GOOGLE_USERINFO_URL, {
        headers: { Authorization: `Bearer ${tokenRes.access_token}` }
      }).then(r => r.json());

      // Find or create user
      let user = await findUserByEmail(userInfo.email);
      if (!user) {
        user = await createUser({
          email: userInfo.email,
          name: userInfo.name,
          avatar: userInfo.picture,
          provider: "google"
        });
      }

      // Create JWT
      const token = await jwt.sign({ id: user.id, email: user.email });

      // Set cookie or redirect with token
      cookie.auth.set({
        value: token,
        httpOnly: true,
        secure: true,
        maxAge: 7 * 24 * 60 * 60
      });

      return redirect("/dashboard");
    } catch (err) {
      console.error("OAuth error:", err);
      return redirect("/login?error=oauth_failed");
    }
  }, {
    query: t.Object({
      code: t.Optional(t.String()),
      error: t.Optional(t.String())
    })
  });
```

---

## Common Gotchas

### 1. Token Verification Timing
```typescript
// Fastify - request.jwtVerify() is async
fastify.addHook("preHandler", async (request, reply) => {
  try {
    await request.jwtVerify(); // Throws on invalid
  } catch {
    reply.code(401).send({ error: "Unauthorized" });
  }
});

// Elysia - jwt.verify() returns null on invalid (doesn't throw)
app.derive(async ({ jwt, headers }) => {
  const token = headers.authorization?.slice(7);
  const payload = await jwt.verify(token); // null if invalid
  return { user: payload || null };
});
```

### 2. Cookie vs Header Tokens
```typescript
// Fastify - @fastify/jwt can read from cookies automatically
fastify.register(fastifyJwt, {
  secret: "...",
  cookie: { cookieName: "token" }
});

// Elysia - check both manually
app.derive(async ({ jwt, headers, cookie }) => {
  // Try header first, then cookie
  const token = headers.authorization?.slice(7) || cookie.token?.value;
  if (!token) return { user: null };
  return { user: await jwt.verify(token) };
});
```

### 3. Guard Scope
```typescript
// Fastify - guards are scoped to plugin
fastify.register(async (instance) => {
  instance.addHook("preHandler", authGuard);
  instance.get("/protected", handler); // Guard applies
});
fastify.get("/public", handler); // Guard does NOT apply

// Elysia - guards apply to subsequent routes unless scoped
app
  .beforeHandle(authGuard) // Applies to ALL routes after this
  .get("/protected", handler)
  .get("/also-protected", handler);

// Use scoped plugin or guard() for isolated guards
app.guard(
  { beforeHandle: authGuard },
  (app) => app.get("/protected", handler)
);
app.get("/public", handler); // Guard does NOT apply
```

### 4. User Type Declaration
```typescript
// Fastify - augment FastifyRequest
declare module "fastify" {
  interface FastifyRequest {
    user?: { id: string; email: string; role: string };
  }
}

// Elysia - types flow from derive automatically
app.derive(({ headers }) => {
  return { user: verifyToken(headers.authorization) as User | null };
}).get("/", ({ user }) => {
  // user is typed as User | null
});
```

### 5. Error Response Consistency
```typescript
// Fastify - different patterns for errors
reply.code(401).send({ error: "Unauthorized" });
throw new Error("Unauthorized"); // Goes to error handler

// Elysia - consistent pattern
return error(401, { error: "Unauthorized" }); // From beforeHandle
throw new Error("Unauthorized"); // Goes to onError
```

---

## Migration Checklist

1. [ ] Replace `@fastify/jwt` with `@elysiajs/jwt`
2. [ ] Replace `request.jwtVerify()` with `jwt.verify(token)`
3. [ ] Replace `fastify.jwt.sign()` with `jwt.sign()`
4. [ ] Replace `@fastify/session` with cookie-based sessions
5. [ ] Replace `preHandler` auth hooks with `derive` + `beforeHandle`
6. [ ] Replace role decorator pattern with macros
7. [ ] Move `request.user` attachment to `derive()` return
8. [ ] Replace `reply.code().send()` with `error(code, body)`
9. [ ] Update OAuth to use manual flow (or community plugins)
10. [ ] Use `guard()` or scoped plugins for route-level protection
11. [ ] Update cookie handling from `reply.setCookie()` to `cookie.name.set()`
12. [ ] Handle `jwt.verify()` returning `null` instead of throwing
