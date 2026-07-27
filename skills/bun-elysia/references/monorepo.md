# Bun Monorepo with Workspaces

Bun's package manager supports npm workspaces for organizing multiple packages in a single repository.

## Table of Contents
- [Workspace Configuration](#workspace-configuration)
- [Project Structure](#project-structure)
- [Cross-Package Dependencies](#cross-package-dependencies)
- [Package Management](#package-management)
- [Scripts and Tasks](#scripts-and-tasks)
- [TypeScript Configuration](#typescript-configuration)
- [Docker Setup](#docker-setup)
- [Best Practices](#best-practices)

---

## Workspace Configuration

### Root package.json

The root `package.json` declares the monorepo structure. Mark it as `private` to prevent accidental publishing.

```json
{
  "name": "my-monorepo",
  "private": true,
  "workspaces": [
    "apps/*",
    "packages/*"
  ],
  "scripts": {
    "dev": "bun run --filter '*' dev",
    "build": "bun run --filter '*' build",
    "test": "bun test"
  },
  "devDependencies": {
    "@types/bun": "latest",
    "typescript": "^5.0.0"
  }
}
```

### Glob Patterns for Workspace Paths

Bun supports full glob syntax in the `workspaces` array:

```json
{
  "workspaces": [
    "packages/*",
    "apps/*",
    "tools/**",
    "!**/excluded/**"
  ]
}
```

| Pattern | Description |
|---------|-------------|
| `packages/*` | All direct subdirectories of packages/ |
| `apps/**` | All subdirectories of apps/ (recursive) |
| `libs/core-*` | Subdirectories matching core-* prefix |
| `!**/test/**` | Exclude test directories (negative pattern) |

### bunfig.toml Settings

Configure workspace behavior in `bunfig.toml`:

```toml
[install]
# Installation preferences
optional = true
dev = true
peer = true
production = false

# Lockfile settings
frozenLockfile = false
saveTextLockfile = false

# Installation strategy: "hoisted" or "isolated"
# "hoisted" - shared node_modules at root (default for non-workspaces)
# "isolated" - each workspace gets its own node_modules
linker = "hoisted"

# Concurrent lifecycle scripts
concurrentScripts = 16

# Link workspace packages locally (set false for CI with pre-built packages)
linkWorkspacePackages = true

# Minimum package age for security (seconds)
minimumReleaseAge = 259200
minimumReleaseAgeExcludes = ["@types/node", "typescript"]
```

---

## Project Structure

### Typical Monorepo Layout

```
my-monorepo/
├── package.json          # Root config with workspaces
├── bun.lockb             # Single lockfile for all packages
├── bunfig.toml           # Optional Bun configuration
├── tsconfig.json         # Base TypeScript config
├── apps/
│   ├── api/              # Backend API (Elysia.js)
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   └── src/
│   │       └── index.ts
│   ├── web/              # Frontend application
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   └── src/
│   └── mobile/           # Mobile app
│       ├── package.json
│       └── src/
└── packages/
    ├── shared/           # Shared utilities and types
    │   ├── package.json
    │   ├── tsconfig.json
    │   └── src/
    │       └── index.ts
    ├── db/               # Database layer
    │   ├── package.json
    │   └── src/
    ├── ui/               # Shared UI components
    │   ├── package.json
    │   └── src/
    └── config/           # Shared configuration
        ├── package.json
        └── src/
```

### Package Naming Convention

Use a scoped namespace to avoid conflicts with npm registry packages:

```json
{
  "name": "@myapp/shared",
  "version": "1.0.0"
}
```

---

## Cross-Package Dependencies

### workspace:* Protocol

Link internal packages using the `workspace:` protocol:

**packages/shared/package.json:**
```json
{
  "name": "@myapp/shared",
  "version": "1.0.0",
  "main": "src/index.ts",
  "types": "src/index.ts",
  "exports": {
    ".": "./src/index.ts",
    "./utils": "./src/utils/index.ts",
    "./types": "./src/types/index.ts"
  }
}
```

**apps/api/package.json:**
```json
{
  "name": "@myapp/api",
  "version": "1.0.0",
  "dependencies": {
    "@myapp/shared": "workspace:*",
    "@myapp/db": "workspace:*",
    "elysia": "^1.0.0"
  }
}
```

### Workspace Protocol Versions

| Protocol | Description |
|----------|-------------|
| `workspace:*` | Use any version from local workspace |
| `workspace:^` | Use workspace with caret semver range |
| `workspace:~` | Use workspace with tilde semver range |
| `workspace:^1.0.0` | Use workspace version matching ^1.0.0 |

### Using Internal Imports

```typescript
// apps/api/src/index.ts
import { formatDate, validateEmail } from "@myapp/shared";
import { createUser, findUser } from "@myapp/db";
import type { User, ApiResponse } from "@myapp/shared/types";
```

### Catalogs for Shared Dependencies

Centralize dependency versions across workspaces (Bun 1.2.14+):

```json
{
  "name": "my-monorepo",
  "workspaces": {
    "packages": ["packages/*", "apps/*"],
    "catalog": {
      "react": "^19.0.0",
      "react-dom": "^19.0.0",
      "typescript": "^5.5.0"
    },
    "catalogs": {
      "testing": {
        "vitest": "^2.0.0",
        "playwright": "^1.45.0"
      }
    }
  }
}
```

Use in workspace package.json:
```json
{
  "dependencies": {
    "react": "catalog:",
    "vitest": "catalog:testing"
  }
}
```

---

## Package Management

### Installing All Workspace Dependencies

```bash
# From root - installs dependencies for all workspaces
bun install

# Frozen lockfile for CI
bun install --frozen-lockfile

# Install for specific workspaces only
bun install --filter '@myapp/api'
bun install --filter './packages/*'

# Exclude specific packages
bun install --filter '!@myapp/legacy'
```

### Adding Dependencies to Specific Workspaces

Use `--cwd` to target a specific workspace:

```bash
# Add runtime dependency to apps/api
bun add elysia --cwd apps/api

# Add dev dependency to packages/shared
bun add -d typescript --cwd packages/shared

# Add peer dependency
bun add --peer react --cwd packages/ui

# Add optional dependency
bun add --optional sharp --cwd apps/api
```

**Note:** `--filter` with `bun add` adds to root, not the workspace. Always use `--cwd`.

### Helper Scripts Pattern

Add convenience scripts to root `package.json`:

```json
{
  "scripts": {
    "add:api": "bun add --cwd apps/api",
    "add:web": "bun add --cwd apps/web",
    "add:shared": "bun add --cwd packages/shared",
    "remove:api": "bun remove --cwd apps/api"
  }
}
```

Usage:
```bash
bun run add:api @elysiajs/swagger
bun run add:shared -d vitest
```

### Removing Dependencies

```bash
bun remove lodash --cwd apps/api
```

### Hoisting Behavior

By default, Bun hoists shared dependencies to the root `node_modules`:

```
my-monorepo/
├── node_modules/
│   ├── elysia/            # Hoisted shared dependency
│   ├── typescript/        # Hoisted dev dependency
│   └── @myapp/
│       ├── shared -> ../../packages/shared  # Symlink
│       └── db -> ../../packages/db          # Symlink
├── apps/
│   └── api/
│       └── node_modules/  # Only non-hoistable deps
└── packages/
```

Configure with `bunfig.toml`:
```toml
[install]
linker = "isolated"  # Each workspace gets full node_modules
```

---

## Scripts and Tasks

### Running Scripts Across Workspaces

```bash
# Run in all workspaces with matching script
bun run --filter '*' dev

# Run in packages matching pattern
bun run --filter 'pkg-*' build
bun run --filter '@myapp/*' test

# Run in specific workspace by name
bun run --filter '@myapp/api' dev

# Run using path pattern
bun run --filter './packages/**' build
bun run --filter './apps/api' start
```

### Parallel Execution

Scripts run in parallel with a terminal UI showing outputs:

```bash
# Both api and web dev servers run simultaneously
bun run --filter '*' dev
```

Bun respects dependency order for build scripts. If `@myapp/api` depends on `@myapp/shared`, building `shared` completes first.

### Root package.json Scripts

```json
{
  "scripts": {
    "dev": "bun run --filter '*' dev",
    "dev:api": "bun run --cwd apps/api dev",
    "dev:web": "bun run --cwd apps/web dev",
    "build": "bun run --filter '*' build",
    "build:packages": "bun run --filter './packages/*' build",
    "test": "bun test",
    "test:api": "bun test --cwd apps/api",
    "lint": "bun run --filter '*' lint",
    "typecheck": "bun run --filter '*' typecheck",
    "clean": "bun run --filter '*' clean"
  }
}
```

### Workspace-Specific Scripts

**apps/api/package.json:**
```json
{
  "scripts": {
    "dev": "bun --watch src/index.ts",
    "build": "bun build src/index.ts --outdir dist --target bun",
    "start": "bun dist/index.js",
    "typecheck": "tsc --noEmit",
    "lint": "eslint src/",
    "clean": "rm -rf dist"
  }
}
```

**packages/shared/package.json:**
```json
{
  "scripts": {
    "build": "tsc",
    "typecheck": "tsc --noEmit",
    "test": "bun test"
  }
}
```

---

## TypeScript Configuration

### Root tsconfig.json

```json
{
  "compilerOptions": {
    "target": "ESNext",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "declaration": true,
    "declarationMap": true,
    "composite": true,
    "paths": {
      "@myapp/*": ["./packages/*/src", "./apps/*/src"]
    }
  }
}
```

### Workspace tsconfig.json

**packages/shared/tsconfig.json:**
```json
{
  "extends": "../../tsconfig.json",
  "compilerOptions": {
    "rootDir": "src",
    "outDir": "dist"
  },
  "include": ["src/**/*"]
}
```

**apps/api/tsconfig.json:**
```json
{
  "extends": "../../tsconfig.json",
  "compilerOptions": {
    "rootDir": "src",
    "outDir": "dist",
    "types": ["bun-types"]
  },
  "include": ["src/**/*"],
  "references": [
    { "path": "../../packages/shared" },
    { "path": "../../packages/db" }
  ]
}
```

---

## Docker Setup

### Multi-Stage Dockerfile

```dockerfile
# ============================================
# Base stage - common setup
# ============================================
FROM oven/bun:1 AS base
WORKDIR /app

# ============================================
# Dependencies stage - install only
# ============================================
FROM base AS deps

# Copy package files for all workspaces
COPY package.json bun.lockb ./
COPY apps/api/package.json ./apps/api/
COPY packages/shared/package.json ./packages/shared/
COPY packages/db/package.json ./packages/db/

# Install dependencies (frozen for reproducibility)
RUN bun install --frozen-lockfile --production

# ============================================
# Builder stage - build the application
# ============================================
FROM base AS builder

# Copy dependencies from deps stage
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/api/node_modules ./apps/api/node_modules 2>/dev/null || true
COPY --from=deps /app/packages/shared/node_modules ./packages/shared/node_modules 2>/dev/null || true
COPY --from=deps /app/packages/db/node_modules ./packages/db/node_modules 2>/dev/null || true

# Copy source files
COPY tsconfig.json ./
COPY packages/shared ./packages/shared
COPY packages/db ./packages/db
COPY apps/api ./apps/api

# Build shared packages first, then app
RUN bun run --filter '@myapp/shared' build && \
    bun run --filter '@myapp/db' build && \
    bun run --filter '@myapp/api' build

# ============================================
# Production stage - minimal runtime
# ============================================
FROM oven/bun:1-slim AS runner
WORKDIR /app

ENV NODE_ENV=production

# Copy only production artifacts
COPY --from=builder /app/apps/api/dist ./dist
COPY --from=builder /app/node_modules ./node_modules

# Create non-root user
RUN addgroup --system --gid 1001 appgroup && \
    adduser --system --uid 1001 appuser && \
    chown -R appuser:appgroup /app

USER appuser

EXPOSE 3000

CMD ["bun", "run", "dist/index.js"]
```

### Optimized Layer Caching

Structure COPY commands to maximize cache hits:

```dockerfile
FROM oven/bun:1 AS deps
WORKDIR /app

# 1. Copy lockfile first (changes less frequently)
COPY bun.lockb ./

# 2. Copy all package.json files (changes occasionally)
COPY package.json ./
COPY apps/api/package.json ./apps/api/
COPY apps/web/package.json ./apps/web/
COPY packages/shared/package.json ./packages/shared/
COPY packages/db/package.json ./packages/db/

# 3. Install dependencies (cached if package.json unchanged)
RUN bun install --frozen-lockfile

# 4. Copy source code last (changes most frequently)
FROM deps AS builder
COPY . .
RUN bun run build
```

### Only Copying Needed Packages

For apps with specific dependencies, copy only what's needed:

```dockerfile
FROM oven/bun:1 AS deps
WORKDIR /app

# Copy only relevant package.json files
COPY package.json bun.lockb ./
COPY apps/api/package.json ./apps/api/
COPY packages/shared/package.json ./packages/shared/

# Install with filter
RUN bun install --frozen-lockfile --filter '@myapp/api'
```

### docker-compose.yml

```yaml
version: "3.8"

services:
  api:
    build:
      context: .
      dockerfile: docker/api.Dockerfile
      args:
        - NODE_ENV=production
    ports:
      - "3000:3000"
    environment:
      - DATABASE_URL=postgres://user:pass@db:5432/myapp
      - REDIS_URL=redis://redis:6379
    depends_on:
      db:
        condition: service_healthy
      redis:
        condition: service_started
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3000/health"]
      interval: 30s
      timeout: 10s
      retries: 3

  web:
    build:
      context: .
      dockerfile: docker/web.Dockerfile
    ports:
      - "5173:5173"
    depends_on:
      - api

  db:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: user
      POSTGRES_PASSWORD: pass
      POSTGRES_DB: myapp
    volumes:
      - postgres_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U user -d myapp"]
      interval: 5s
      timeout: 5s
      retries: 5

  redis:
    image: redis:7-alpine
    volumes:
      - redis_data:/data

volumes:
  postgres_data:
  redis_data:
```

### .dockerignore

```
# Dependencies
node_modules
**/node_modules

# Build output
dist
**/dist
.next
**/build

# Git
.git
.gitignore

# IDE
.vscode
.idea
*.swp
*.swo

# Env files
.env*
!.env.example

# Logs
*.log
logs

# Test
coverage
.nyc_output

# Docs
*.md
!LICENSE.md
docs
```

---

## Best Practices

1. **Keep root package.json minimal** - Only shared devDependencies and scripts
2. **Use workspace protocol** - `workspace:*` for local package dependencies
3. **Single lockfile** - All packages share `bun.lockb` at root
4. **Consistent naming** - Use scoped packages (`@myapp/...`)
5. **TypeScript references** - For proper IDE support and incremental builds
6. **Shared configs** - Extend root tsconfig/eslintrc in workspaces
7. **Avoid barrel files** - They slow down bundlers and cause issues
8. **Use exports field** - Modern alternative to main for package entrypoints
9. **Never access files across boundaries** - Import via package name, not relative paths
10. **Layer Docker builds** - Maximize cache hits with proper COPY ordering

---

## Example: Full Monorepo Setup

### packages/shared/src/index.ts

```typescript
export function formatDate(date: Date): string {
  return date.toISOString().split("T")[0];
}

export function generateId(): string {
  return crypto.randomUUID();
}

export interface User {
  id: string;
  name: string;
  email: string;
  createdAt: Date;
}

export interface ApiResponse<T> {
  data: T;
  success: boolean;
  timestamp: string;
}
```

### apps/api/src/index.ts

```typescript
import { Elysia } from "elysia";
import { formatDate, generateId, type User, type ApiResponse } from "@myapp/shared";

const app = new Elysia()
  .get("/health", () => ({ status: "ok" }))
  .get("/", () => ({
    message: "Hello!",
    date: formatDate(new Date())
  }))
  .get("/users/:id", ({ params }): ApiResponse<User> => {
    const user: User = {
      id: params.id,
      name: "Alice",
      email: "[email protected]",
      createdAt: new Date()
    };
    return {
      data: user,
      success: true,
      timestamp: new Date().toISOString()
    };
  })
  .post("/users", (): ApiResponse<{ id: string }> => {
    return {
      data: { id: generateId() },
      success: true,
      timestamp: new Date().toISOString()
    };
  })
  .listen(3000);

console.log(`Server running at http://localhost:${app.server?.port}`);
```

---

## References

- [Bun Workspaces Documentation](https://bun.com/docs/pm/workspaces)
- [Bun --filter Flag](https://bun.com/docs/pm/filter)
- [Bun Catalogs](https://bun.com/blog/bun-v1.2.14)
- [Turborepo Monorepo Guide](https://turborepo.dev/docs/crafting-your-repository/structuring-a-repository)
