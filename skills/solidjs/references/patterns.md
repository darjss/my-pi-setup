# Solid patterns and review traps

Use this reference when designing a state boundary or reviewing code whose behavior is unclear. Each pattern names one owner and one observable lifecycle.

## Derived values stay derived

```ts
const subtotal = () => cart.lines.reduce((sum, line) => sum + line.total, 0)
const total = createMemo(() => priceQuote(subtotal(), discount()))
```

Choose an accessor or memo. An effect that copies `subtotal()` into `setSubtotal` creates two truths, an extra scheduling edge, and an intermediate stale state.

## Editable drafts are explicit

Remote or prop data remains authoritative until the user begins editing. A draft is justified when it has an independent lifecycle: dirty state, validation, reset, submit, or cancellation.

```ts
const [draft, setDraft] = createStore(createDraft(props.value))

const reset = () => setDraft(reconcile(createDraft(props.value)))
```

Define when the draft initializes, whether upstream changes reset it, and what happens while dirty. Do not continuously mirror props/query data into the draft through an effect unless that reset policy is the product behavior.

When a repository uses a form library, that library owns the editable draft and validation lifecycle.

## Context distributes store and actions

Create state once in a provider and pass the stable store/actions value through context.

```ts
const CartContext = createContext<CartContextValue>()

const CartProvider = (props: ParentProps) => {
  const [cart, setCart] = createStore(emptyCart())
  const value = {
    cart,
    add: (line: CartLine) => setCart("lines", (lines) => [...lines, line]),
  }

  return <CartContext.Provider value={value}>{props.children}</CartContext.Provider>
}
```

The context is a distribution seam, not the state model. Keep mutation operations intention-revealing. Throw or return a typed failure when a required provider is absent according to repository error conventions.

Separate Astro islands have separate Solid roots and cannot share this context.

## List identity follows user intent

Use `<For>` when rows represent durable entities that can move. Preserve a domain key in the data even though Solid keys `<For>` by item identity.

Use `<Index>` when the slot is stable and the value within the slot changes, such as a fixed set of primitive inputs.

Review operations, not types:

- insert/reorder/remove while preserving row-local state → `<For>`;
- replace values at fixed positions → `<Index>`;
- static compile-time decoration → ordinary array construction is sufficient.

A wrong choice appears as focus jumping, input state moving to another row, unnecessary remounts, or stale item values.

## Callback props stay current

This setup-time read can become stale:

```ts
const handler = props.onSelect
```

Read the prop when the event occurs:

```tsx
<button onClick={() => props.onSelect?.(props.id)}>Select</button>
```

If callback identity drives an external subscription, track it in an effect and clean up the old subscription before installing the new one.

## Third-party DOM libraries have one lifecycle

```ts
let element: HTMLDivElement | undefined

onMount(() => {
  if (!element) return
  const instance = createWidget(element, options())
  onCleanup(() => instance.destroy())
})
```

If options are reactive, choose one contract:

- update the existing instance in an effect; or
- dispose and recreate it in an effect.

Do not combine both. Keep DOM ownership clear: either Solid owns child DOM or the imperative library does.

## Subscriptions clean up beside acquisition

```ts
createEffect(() => {
  const topic = props.topic
  const unsubscribe = bus.subscribe(topic, setMessage)
  onCleanup(unsubscribe)
})
```

Changing `props.topic` disposes the previous subscription before acquiring the next. The same pattern applies to observers, timers, WebSockets, media queries, and abortable requests.

## Persisted browser state hydrates deliberately

Server output cannot depend on local storage. Start from a deterministic value shared by server and initial client render, then load storage after mount.

```ts
const [preference, setPreference] = createSignal(defaultPreference)

onMount(() => {
  const stored = readPreference()
  if (stored) setPreference(stored)
})
```

If changing after hydration would cause unacceptable layout movement, move the preference to a cookie/server input or render that subtree client-only according to the host architecture.

## Remote state has one cache

Use the repository-selected owner directly in components. Derive view data from its result; do not copy it into signals or stores for convenience.

Mutations follow the owner’s consistency model:

- authoritative invalidation/refetch for server truth;
- optimistic state only when rollback, concurrency, and reconciliation behavior are explicit;
- local draft state only for unsaved edits.

Loading, error, empty, refreshing, and success are different states. Model the ones the product exposes rather than reducing them to one boolean.

## Async work has cancellation and stale-result policy

A component-triggered request needs an owner and a policy for superseded inputs. Prefer a repository cache/resource that already handles this. For manual async work, use an abort controller or request identity and clean it up.

An `async` event handler owns its own failure handling. Error boundaries do not catch detached event-handler promise failures.

## Forms use DOM semantics correctly

- Read text inputs from `event.currentTarget.value` in `onInput` when immediate state is desired.
- Use `checked` for checkbox/radio state.
- Keep labels, names, disabled state, errors, and submission behavior accessible.
- Let the repository’s form owner coordinate validation and submission rather than synchronizing a second signal per field.

## Components preserve owners

Render `<Panel />`; do not call `Panel()` as a helper. Direct invocation bypasses the component boundary and can attach primitives to the wrong owner.

Extract ordinary non-reactive logic into plain functions. Extract reactive/UI behavior into a component or primitive whose owner is clear.

## Props forwarding is reactive

```tsx
const [local, others] = splitProps(props, ["class", "active"])
const classes = () =>
  ["button", local.active ? "active" : "", local.class]
    .filter(Boolean)
    .join(" ")

return <button class={classes()} {...others} />
```

When the complete class string is reactive, calculate that string and omit `classList`. When forwarding, follow the owning design system’s merge order and event/ref composition contract rather than blindly overwriting consumer props.

## Review checklist

For every changed component, account for:

1. **Owner:** where each signal, store, effect, subscription, and async operation is created and disposed.
2. **Tracking:** whether each value that must update is read inside a tracking scope.
3. **Truth:** whether remote data, form drafts, URL state, and structured client state each have one owner.
4. **Identity:** whether list rows preserve the intended entity or position across edits.
5. **Props:** whether setup-time aliases or destructuring froze reactive getters.
6. **Effects:** whether each effect synchronizes externally rather than deriving state.
7. **DOM:** whether Solid and imperative code have non-overlapping ownership and cleanup.
8. **Async:** whether loading, error, stale result, cancellation, and retry behavior are intentional.
9. **Host:** whether browser-only work and hydration output respect SSR/island boundaries.
10. **Proof:** whether the real interaction was exercised under repository policy, including remount/navigation/cleanup when relevant.
