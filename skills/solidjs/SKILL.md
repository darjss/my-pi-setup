---
name: solidjs
description: Build and review SolidJS code with correct fine-grained tracking, state ownership, props, stores, control flow, DOM events, async boundaries, SSR, and cleanup. Use whenever editing Solid components or code using Solid primitives; also use for Solid Router or SolidStart work.
metadata:
  version: "2.0.0"
---

# SolidJS

Think in **owners and tracking scopes**. A component is a setup function that runs once per mounted instance. It may mount again; it does not rerun for ordinary state changes. A read during setup is a snapshot. JSX expressions, memos, effects, resources, and explicit callbacks establish the later work that updates.

## Process

### 1. Map ownership

Before editing, identify:

- the host: Astro, SolidStart, a client SPA, or another renderer;
- the owner of remote data, forms, URL state, structured client state, and persisted state;
- the server/client and hydration boundary;
- the nearest accepted component and package entrypoint;
- applicable repository instructions and proof commands.

Repository architecture overrides generic framework options. Do not introduce a second cache, form system, router, or state owner.

**Complete when:** every changed value has one named owner and every changed component has a known host boundary.

### 2. Implement through tracking scopes

Apply the rules below. Preserve current accessors across props and context boundaries; keep derived values derived; keep external synchronization in effects; keep browser work client-only.

**Complete when:** every value that must update is read in a tracking scope, every side effect has an owner, and no state is mirrored without an explicit draft or snapshot requirement.

### 3. Audit the real behavior

Check the affected code for lost tracking, stale prop reads, effect-derived state, list identity mistakes, duplicated remote state, unowned cleanup, and SSR-only/browser-only crossings. Run the repository’s static gates and its required real browser or runtime proof.

**Complete when:** all affected states—including loading, empty, error, remount, navigation, and cleanup where applicable—have evidence, and the worktree is clean or contains only intentional changes.

## Reactivity

- Call signal and memo accessors: `count()`, not `count`.
- Reads that must update belong in JSX, a memo, an effect, a resource source, or another tracking scope.
- Event handlers and commands are intentionally untracked; they may read current signals and props when invoked.
- Use functional setters when the next value depends on the previous value.
- Use a plain derived accessor for cheap single-use computation: `const total = () => price() * quantity()`.
- Use `createMemo` when computation is expensive, reused, or should shield downstream work through equality. Keep the memo pure.
- Use `createEffect` to synchronize with an external system: DOM APIs, storage, subscriptions, analytics, timers, or imperative libraries.
- Represent derived state with an accessor or memo rather than an effect that writes another signal.
- Register `onCleanup` under the owner that acquired the resource. In an effect, cleanup runs before re-execution and disposal; in a component, it runs on unmount.
- Use `on(() => store.value, fn)` when explicit dependencies improve correctness. Passing `store.value` directly captures a setup-time value.
- Use `untrack` only for a deliberate non-dependency and keep that intent local.
- Use `batch` when several updates would otherwise flush independently. Do not add it ritually to already batched scopes.
- Use `{ equals: false }` only for a deliberate trigger signal whose repeated values are meaningful events.
- Create reactive primitives synchronously under a stable owner. Module-scoped mutable state is a deliberate application singleton, never request- or user-specific SSR state.

## Signals and stores

- Use a signal when a value is replaced as one unit.
- Use `createStore` for nested state that benefits from property- or path-level updates.
- Store property reads follow the same tracking rule as props: a setup-time local is a snapshot.
- Prefer path updates such as `setStore("users", 0, "name", "Jane")` for focused changes.
- Use `produce` when one cohesive mutation touches several nested paths and path syntax would obscure the operation.
- Keep server/query data in its remote-state owner. A local store may hold an explicit editable draft, selection, session, Cart, or UI state; name the boundary and reset policy.

## Props and children

- Read reactive props through `props.title` at the point of use.
- Use `const title = () => props.title` when a local accessor improves readability.
- Use `splitProps` for local versus pass-through props and `mergeProps` for reactive defaults.
- Pass `props.children` through directly when it is rendered once.
- Use `children(() => props.children)` when children must be resolved, inspected, transformed, or read repeatedly.
- Preserve a changing callback prop by reading it at event time: `onClick={() => props.onClick?.()}`.
- Component-setup destructuring and setup-time aliases freeze reactive getters. Use reactive subsets or accessors instead.

## Control flow

- Use `<For>` when item identity should survive insertion, removal, and reordering. The item is a value; the index is an accessor.
- Use `<Index>` when position is the identity. The item is an accessor; the index is a number.
- Choose identity versus position from update behavior, not merely object versus primitive type.
- Render reactive lists with `<For>` or `<Index>`; reserve `.map()` for static construction outside reactive list reconciliation.
- Use `<Show>` for one conditional branch and `<Switch>/<Match>` for mutually exclusive states.
- The normal `<Show>` callback receives an accessor to the narrowed value. With `keyed`, it receives the value.
- Use `<Suspense>` when a participating async primitive suspends under that boundary. Explicit loading UI with `<Show>` or `<Switch>` remains valid, especially when a repository-owned query library exposes states directly.
- Use `<ErrorBoundary>` for errors from rendering and reactive descendants. Handle event-handler, timer, and detached promise failures at their owning operation.
- Render dynamic component references with `<Dynamic>` rather than calling component functions directly.

## Async state

- Follow the repository’s remote-state owner. TanStack Query, Solid Router queries, and `createResource` are alternatives, not layers to stack.
- When `createResource` is the accepted owner, read its accessor and use `state`, `loading`, `error`, and `latest` deliberately.
- A reactive resource source is an accessor, such as `() => props.userId`; a setup-time value will not refetch when the prop changes.
- Pair suspenseful reads with an error boundary where failure needs local recovery.
- Keep mutations authoritative: invalidate or refetch through the owning cache unless the product contract explicitly defines an optimistic projection.

## JSX and DOM

- Use `class`. Combine a static `class="button"` with reactive `classList={{ active: active() }}`.
- When the complete class string is reactive, compute `class={classes()}` and omit `classList` on that element.
- Use Solid’s supported `onClick`/`onInput` form for delegated events. Use `on:event` for element-level native, unsupported, or custom events.
- Use the documented capture form for capture. For passive/once/listener options, attach a native listener under a ref or directive and remove it with `onCleanup`.
- Read `event.currentTarget` synchronously; do not depend on a later callback retaining event context.
- Refs are assigned during element creation. Read connected layout or call focus APIs in `onMount`, an effect, or a ref callback; type optional refs and guard them when repository rules forbid assertions.
- A directive acquires and cleans up DOM behavior under its owner. Register `onCleanup` inside the directive for listeners, observers, and subscriptions.
- Use a style object for genuinely dynamic inline values, including CSS custom properties. Prefer classes for stable presentation.
- Keep browser globals, storage, observers, and layout reads out of SSR setup. Move them to client lifecycle or guard the platform boundary.

## Components, context, and hosts

- Render components through JSX so Solid establishes the correct owner.
- Context distributes an existing value through one Solid owner tree; it is not a replacement for choosing a state owner.
- Separate island roots do not share context. In Astro, cross-island state needs an explicit browser-owned seam rather than an assumed provider tree.
- Hydration requires deterministic server and initial client output. Defer browser-dependent divergence until client lifecycle.
- Effects do not run during server rendering; they run on the client after the render/hydration phase.
- Follow repository conventions for exports, component typing, icons, styling, forms, and package boundaries. Solid does not require a `Component` type alias or a particular function syntax.

## Conditional references

- Read [`references/api_reference.md`](references/api_reference.md) when choosing between primitives or checking exact ownership, equality, cleanup, and resource semantics.
- Read [`references/patterns.md`](references/patterns.md) when designing or reviewing state boundaries, editable drafts, context, lists, persistence, or third-party DOM integration.
- Read [`references/routing.md`](references/routing.md) only when the task uses `@solidjs/router`.
- Read [`references/solidstart.md`](references/solidstart.md) only for an actual SolidStart application. Astro-hosted Solid islands are not SolidStart.
