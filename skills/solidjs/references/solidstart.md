# SolidStart branch

Load this reference only when the application is actually built with SolidStart. Astro, plain Solid/Vite, and Astro-hosted Solid islands follow their own host architecture.

SolidStart’s router, server-function, cache, and deployment APIs evolve. Before implementation:

1. inspect the installed `@solidjs/start`, `@solidjs/router`, Vinxi/Nitro, and adapter versions;
2. retrieve matching current official docs at <https://docs.solidjs.com/solid-start>;
3. inspect the app’s route convention, server boundary, deployment target, and existing data owner;
4. follow repository instructions over generic examples.

**Complete when:** the changed route works by direct request and client navigation, server-only code stays out of the client bundle, request state is isolated, and the production target builds.

## Routing

SolidStart normally owns file-based UI and API routes. Preserve the installed route convention rather than mixing manual route trees with generated routes.

- Route filenames and folders are runtime contracts; confirm dynamic, optional, catch-all, and group syntax against the installed version.
- Layouts own shared UI and boundaries for their route subtree.
- UI routes and API routes are distinct seams even when colocated under the route directory.
- Default exports may be required by file routing even when the repository otherwise prefers named exports; host-required conventions win at that seam.
- Validate params and search values before domain use.

## Server/client boundary

`"use server"` marks server-function code for the SolidStart compiler. Treat it as an RPC boundary, not a trusted function call.

- Parse every argument at runtime.
- Reload authentication and authorization on the server.
- Import secrets, databases, and server-only SDKs only from server-owned modules.
- Return bounded serializable data, never raw database rows or secret-bearing provider responses.
- Map expected failures into the repository’s transport contract.
- Keep domain operations independent of the transport wrapper.

Do not rely on a client route guard, hidden button, TypeScript type, or serialized closure for authority.

## Request isolation

A long-lived server process reuses modules. Module-scoped mutable signals, stores, users, request events, headers, and caches can cross requests.

- Create request-specific state under the request event or route execution.
- Use framework request-context APIs only within their documented lifetime.
- Keep application singletons stateless or explicitly concurrency-safe.
- Key any intentional server cache by all authority and variation inputs.

## Data ownership

Current Solid Router/SolidStart supports query primitives and async accessors. Some projects deliberately choose another cache such as TanStack Query. Keep one owner.

When Router/SolidStart query APIs own data:

- define the query at module scope only when its cache semantics are request-safe and documented;
- use stable unique query names and serializable arguments;
- consume through the current documented `createAsync` or route preload pattern;
- place suspense and error boundaries around the subtree that owns recovery;
- use documented revalidation/invalidation after mutations;
- avoid copying results into signals or stores.

When another cache owns remote data, use server functions/API routes as transport and keep cache truth in that library.

## Mutations

A mutation has one server operation and one client transition.

- Parse input and authorize before writing.
- Make consequential retries idempotent according to the domain contract.
- Return typed success/failure data or framework responses at the transport seam.
- Revalidate the authoritative query/cache rather than maintaining duplicate truth.
- Redirect only after the operation’s durable success condition.
- Handle event-handler promise failures at the operation; error boundaries do not own them.

## SSR, streaming, and hydration

- Server and initial client output must be deterministic.
- Place browser globals and layout/storage reads after the client boundary.
- Use suspense/streaming options deliberately; they affect response timing and hydration behavior.
- Avoid request-dependent random IDs or locale/time formatting that differs between server and client.
- Treat serialization configuration as security and CSP behavior, not a cosmetic optimization.
- Verify no server-only module is pulled into a client route through a shared barrel.

## API routes

Use an API route when the caller needs an HTTP contract: external callbacks, webhooks, non-Solid clients, streaming/file responses, or explicit cache/header control. Use a server function for UI-owned calls when its current compiler/runtime contract fits.

Both boundaries still require runtime validation, authorization, meaningful statuses/failures, and bounded output.

## Configuration and deployment

`app.config.ts` and adapter configuration belong to the deployment seam.

- Preserve the accepted SSR mode and platform preset.
- Configure plugins for the correct client/server/server-function build only.
- Access environment bindings through the deployment platform’s accepted API.
- Keep platform secrets out of public environment variables and serialized route data.
- Verify production build output, not only dev mode.

## Proof

Run the repository gates plus real runtime proof for:

- direct SSR request;
- hydrated navigation;
- dynamic/search params;
- server function success and expected failure;
- unauthorized request;
- mutation retry/idempotency where applicable;
- error and suspense fallback;
- browser back/forward;
- production build and target adapter startup/deploy check;
- absence of server-only code/secrets in client output.

If credentials or infrastructure are unavailable, report the deployment proof as blocked rather than substituting a fake provider.
