# Solid primitive choice reference

Use this reference when an implementation depends on the exact role of a primitive. Start with ownership; choose the smallest primitive that preserves it.

## Choice table

| Need | Primitive | Key constraint |
|---|---|---|
| Replace one value | `createSignal` | Getter is an accessor; setter accepts a value or updater |
| Derive and cache a value | `createMemo` | Pure computation with equality shielding |
| Synchronize externally | `createEffect` | Side effects only; dependencies are tracked reads |
| Run immediately during render | `createRenderEffect` | Reserve for render-timing requirements |
| Declare exact dependencies | `on` | Pass accessors, including arrows around store properties |
| Suppress dependency tracking | `untrack` | Local, deliberate escape hatch |
| Group independent writes | `batch` | Useful only when the surrounding scope does not already batch |
| Nested path-level state | `createStore` | Proxy-backed reactive property access |
| Cohesive nested mutation | `produce` | Use through a store setter |
| Replace external snapshots | `reconcile` | Preserve keys/identity only when that policy is intended |
| Async value owned by Solid | `createResource` | Source accessor controls refetching |
| Distribute one tree-owned value | `createContext` | Provider does not create state ownership |
| Dispose owned work | `onCleanup` | Register while a reactive owner is current |
| Browser-connected setup | `onMount` | Client-only lifecycle after initial render |

## Owners and tracking

Solid creates an owner for component instances, roots, effects, memos, resources, and control-flow branches. Ownership controls disposal. Tracking controls which computation reruns. They are related but distinct.

- JSX expressions, memos, and effects track reactive reads.
- Component setup and event handlers do not track for later reruns.
- `onCleanup` needs an owner, not necessarily a tracking computation.
- A primitive created from an event handler usually has no durable component owner and is the wrong shape. Create the primitive during setup; let the event update it.
- Request-specific state at module scope crosses SSR requests. Put it under the request/component owner.

## `createSignal`

```ts
const [count, setCount] = createSignal(0)

setCount(4)
setCount((previous) => previous + 1)
```

- The setter treats a function as an updater. To store a function value, wrap it: `setHandler(() => nextHandler)`.
- Default equality is strict equality. A custom `equals` can suppress downstream work.
- `{ equals: false }` turns every set into a notification; use it for intentional event-like triggers, not ordinary state.
- A signal holding an object updates as one unit. Use a store only when nested update granularity is valuable.

## Derived accessors and `createMemo`

A derived accessor recomputes on each read:

```ts
const total = () => price() * quantity()
```

A memo recomputes when dependencies change and caches the result:

```ts
const visibleItems = createMemo(() => filterItems(items(), query()))
```

Choose a memo when the calculation is expensive, read repeatedly, or should prevent downstream updates when its result remains equal. The memo function remains pure: it returns a value and does not write signals, mutate stores, log analytics, or touch the DOM.

## Effects and explicit dependencies

```ts
createEffect(() => {
  const key = props.storageKey
  localStorage.setItem(key, JSON.stringify(draft()))
})
```

An effect is a synchronization boundary, not a derivation mechanism. If the desired result is another reactive value, use an accessor or memo.

Use `on` when incidental reads must not become dependencies:

```ts
createEffect(
  on(
    () => store.selectedId,
    (selectedId, previousId) => synchronizeSelection(selectedId, previousId),
  ),
)
```

The dependency passed to `on` must remain an accessor. `on(store.selectedId, fn)` reads the property during setup and loses tracking.

Use `defer: true` only when the first synchronized run should be skipped by contract.

## Cleanup

```ts
createEffect(() => {
  const controller = new AbortController()
  subscribe(props.topic, controller.signal)
  onCleanup(() => controller.abort())
})
```

In a rerunning computation, cleanup runs before the next execution and again at disposal. Component-level cleanup runs on unmount. Register cleanup beside acquisition so every listener, observer, interval, subscription, abort controller, and imperative instance has one owner.

## Stores

```ts
const [cart, setCart] = createStore({
  lines: [] as CartLine[],
  note: "",
})

setCart("lines", 0, "quantity", (quantity) => quantity + 1)
```

- Store properties are reactive when read in a tracking scope.
- `const note = cart.note` in component setup is a snapshot. Use `() => cart.note` when a local accessor is needed.
- Path syntax expresses focused updates and accepts predicates/ranges where supported.
- `produce` is useful when one domain operation changes multiple nested paths.
- `unwrap` deliberately removes proxy behavior; keep the resulting non-reactive value at serialization or integration boundaries.
- `reconcile` is for applying external snapshots with an explicit identity policy. It is not a reason to mirror a query cache into a store.

## `on`, `untrack`, and `batch`

- `on` documents dependencies and keeps incidental reads out of tracking.
- `untrack(() => value())` reads once without subscribing. Use it around the smallest expression possible.
- `batch` delays downstream execution until grouped writes finish. Some Solid scopes already batch; add it when measurement or semantics show otherwise.

These utilities should make ownership clearer. If they hide where updates originate, simplify.

## Resources

```ts
const [user, controls] = createResource(
  () => props.userId,
  fetchUser,
)
```

- The source accessor controls when fetching runs. Returning `false`, `null`, or `undefined` disables the fetch where supported by the resource contract.
- Read the resource with `user()`.
- `user.state` distinguishes `unresolved`, `pending`, `ready`, `refreshing`, and `errored`.
- `user.loading`, `user.error`, and `user.latest` expose focused state.
- `mutate` changes the local resource value; `refetch` runs the fetcher again.
- Suspense responds when a resource read participates beneath its boundary. Explicit state rendering is also valid.
- Use the repository’s chosen remote-state owner. Do not wrap TanStack Query or Solid Router query data in a second resource.

## Props utilities

- `mergeProps(defaults, props)` preserves getter behavior while applying defaults.
- `splitProps(props, ["class", "children"])` returns reactive subsets and a reactive remainder.
- `children(() => props.children)` resolves children for inspection or repeated access. Direct passthrough needs no helper.

## Control-flow contracts

| Component | Identity | Callback values |
|---|---|---|
| `<For>` | Item/reference | item value, index accessor |
| `<Index>` | Position | item accessor, numeric index |
| `<Show>` | One condition | normal callback receives narrowed accessor; `keyed` receives value |
| `<Switch>/<Match>` | First matching branch | branch children |
| `<Dynamic>` | Component/tag reference | rendered under a Solid owner |

Control flow creates and disposes owners. Put branch-local subscriptions and effects inside the branch component that owns them.

## SSR and hydration

- Effects and `onMount` do not execute during server rendering.
- The client’s initial output must agree with server output for hydration.
- Browser-only values such as storage, media queries, dimensions, and random client IDs enter after the client boundary or through a deterministic server-provided value.
- Module-level mutable state is shared by requests in a long-lived server process.
- Cleanup still matters in client navigation even when the server never ran the effect.
