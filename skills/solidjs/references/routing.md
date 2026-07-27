# Solid Router branch

Load this reference only when the task actually uses `@solidjs/router`.

Solid Router evolves independently from Solid. Before changing route or data APIs:

1. inspect the installed `@solidjs/router` version and existing router composition;
2. retrieve the matching current official docs at <https://docs.solidjs.com/solid-router> for any API not already used locally;
3. preserve the repository’s URL, data-cache, auth, and host ownership.

**Complete when:** deep links, navigation, back/forward behavior, and shareable URL state work in a real browser without introducing a second router or cache.

## Route ownership

The host decides where the router begins. A client SPA may own all routes; an Astro application may own page routes while a Solid router owns only an island subtree such as `/admin/*`.

- Keep one router for one navigation domain.
- Render route components through `component={Page}` or the project’s established route form.
- Use nested routes for shared layout ownership, not to recreate a server host’s route tree in the browser.
- A client route guard improves navigation UX; server/API authorization remains authoritative.
- A catch-all route handles unknown paths within the router’s own domain only.

## Reactive route values

`useParams`, `useLocation`, and `useSearchParams` expose reactive objects. Read properties at the point of use.

```ts
const params = useParams<{ orderId: string }>()
const orderId = () => params.orderId
```

Setup-time destructuring freezes the current value. The same rule applies to `location.pathname` and search-param properties.

Validate URL values before using them as domain input. Router types describe shape; they do not validate runtime strings.

## Navigation

- Use links for navigation users can open, copy, or operate with standard browser behavior.
- Use `useNavigate` for operation-driven navigation such as completion, cancellation, or redirect.
- Use `replace: true` only when the previous history entry should not remain meaningful.
- Preserve back/forward behavior; do not replace every transition.
- Keep transient UI state out of navigation `state` when the URL should be shareable or reloadable.

## Search parameters

URLs own shareable filtering, pagination, tab, sort, and selection state when the product contract says those states survive reload/share.

```ts
const [searchParams, setSearchParams] = useSearchParams()
const page = () => parsePage(searchParams.page)
```

- Parse and bound every value.
- Update related parameters together.
- Remove defaults from the URL when canonicalization requires it.
- Decide whether changes push or replace history from user intent.
- Avoid a second signal mirroring the same parameter. An editable text draft may be local, with an explicit commit-to-URL action.

## Route data and cache ownership

Solid Router offers `query`, `createAsync`, and related data APIs. Other repositories choose TanStack Query or server-provided data. Use one owner.

When Router data APIs are the accepted owner:

- give queries stable unique names;
- use serializable, stable arguments;
- call them through the current documented `createAsync`/route preload pattern;
- let suspense/error boundaries represent the configured async contract;
- use the documented cache invalidation/revalidation API rather than a second store.

When TanStack Query owns remote state, route params/search params form the query key/input; do not wrap the result in Router query or `createResource`.

## Route boundaries and authorization

- Parse route and search input before issuing remote requests.
- Server operations reload identity and resource authority; route visibility is not authorization.
- Redirects after mutations follow the mutation’s typed success/failure contract.
- Preserve return URLs only after validating they remain within the accepted origin/path boundary.
- Keep sensitive values out of query strings, history state, logs, and analytics.

## SPA under Astro

When Astro owns the outer route and a Solid SPA owns a subtree:

- Astro mounts one SPA entrypoint at the accepted path;
- the Solid router uses the host-provided base/root configuration already established by the project;
- server redirects, canonical origins, and direct deep-link requests still terminate at an Astro/Worker route that can serve the SPA shell;
- context exists only inside that SPA root;
- storefront Astro islands do not inherit Admin router or context state.

Do not migrate Astro routing into Solid Router merely because the package is installed.

## Browser proof

Exercise at least the affected paths:

- direct deep link and reload;
- link navigation;
- programmatic success/cancel redirect;
- browser back and forward;
- search-param edit and canonicalization;
- invalid/missing parameter;
- unauthorized route and authoritative API rejection;
- not-found behavior within the router domain;
- remount cleanup for route-owned subscriptions.

Confirm the console is clean and the URL represents the intended shareable state.
