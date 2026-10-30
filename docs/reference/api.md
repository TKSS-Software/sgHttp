# API reference

Every function is in the `sgquery` namespace. Call them from render-thread components that import `pkg:/source/roku_modules/sgquery/sgquery.brs`.

`initialize`, `fetch` and `setHeaders` are the HTTP client, and are all an app has to use. Everything under Queries, Cache control and Changes applies only to queries the app defines.

The shapes the functions take and return (`sgquery.Definition`, `sgquery.FetchSpec`, `sgquery.Response`, `sgquery.PagedValue`, and so on) are declared as interfaces in the package's typedef, for completion and hover; see [Editor support](../installation.md#editor-support).

Promise-returning functions return a [promises](https://github.com/rokucommunity/promises) node. Consume it with `promises.chain`, `promises.onThen` or `promises.onCatch`.

- Setup: [`initialize`](#initialize), [`getStore`](#getstore), [`destroy`](#destroy)
- Requests: [`fetch`](#fetch)
- Queries: [`define`](#define), [`query`](#query), [`nextPage`](#nextpage), [`peek`](#peek), [`mutate`](#mutate), [`set`](#set)
- Cache control: [`expire`](#expire), [`invalidate`](#invalidate), [`expireAll`](#expireall), [`refresh`](#refresh), [`setScope`](#setscope), [`invalidateScope`](#invalidatescope), [`setHeaders`](#setheaders)
- Changes: [`watch`](#watch), [`unwatch`](#unwatch), [`observeChanges`](#observechanges), [`unobserveChanges`](#unobservechanges), [`isChange`](#ischange)
- Instrumentation: [`observeEvents`](#observeevents), [`unobserveEvents`](#unobserveevents), [`getStats`](#getstats)

---

## initialize

```brightscript
sgquery.initialize(params = {} as object) as object
```

Creates the store, attaches it to the scene and returns it. If a store already exists, returns that store and ignores `params`.

| Param | Default | Meaning |
|---|---|---|
| `baseUrl` | none | Prefix for relative request urls (default client) |
| `headers` | `{}` | Shared headers sent with every request except `auth: false` ones (default client) |
| `baseHeaders` | `{}` | Headers sent with every request without exception (default client) |
| `proxy` | none | Debugging proxy as `"host:port"` (default client). See [Debugging](../guides/debugging.md#routing-traffic-through-a-proxy). |
| `maxConcurrent` | 4 | Requests in flight at once (default client) |
| `timeout` | 30 | Seconds before a request is given up (default client) |
| `retries` | 1 | Retries for network failures and 5xx (default client) |
| `httpVersion` | `""` | `"http2"` to request HTTP/2 (default client) |
| `transport` | a new `Transport` task | A node with `makeRequest(spec)` (default client). See [The transport](../guides/transport.md#replacing-the-transport). |
| `clients` | none | More servers: `{ <name>: { baseUrl, headers, baseHeaders, proxy, maxConcurrent, timeout, retries, httpVersion, transport } }`. See [More than one server](../guides/multiple-servers.md). |
| `parserTask` | none | Component name of your `ParserTask` subclass. See [Parsers](../guides/parsers.md). |
| `parserThreads` | 2 | How many of `parserTask` to run. Each parse goes to the one with the fewest parses waiting. See [Parsers](../guides/parsers.md#parser-threads). |
| `persist` | `true` | `false` turns persistence off for every query |
| `version` | `"1"` | Cache version; change it to stop every body on disk from being read. Rarely needed: app releases, servers and definition changes already keep bodies apart. |
| `namespace` | `<id>_<title>-<hash>_<app version>` from `roAppInfo` | This app's folder under `cachefs:/sgquery/`. See [One folder per app](../guides/persistence.md#one-folder-per-app). |
| `maxEntries` | 100 | In-memory entry cap |
| `defaultTtl` | 300 | Seconds, for definitions without a `ttl` |
| `debug` | `false` | Print every event and change to the console with its cache key, as `[sgquery] <type> <name> via <source> (<ms>ms) <key>`. See [Debugging](../guides/debugging.md#printing-every-event). |
| `store` | none | An existing `Store` node to attach instead of creating one (tests) |
| `persistence` | none | An existing `Persistence` node to run file operations on, left running by `destroy` (tests; see [Testing](../guides/testing.md#things-to-know)) |
| `appInfo` | `roAppInfo` | `{ id, title, version }` to name the namespace with instead of `roAppInfo` (tests) |

Returns the store node.

## fetch

```brightscript
sgquery.fetch(spec as dynamic, args = {} as object) as object
```

Sends one request with no definition and returns a promise for the whole response, `{ code, headers, body, url, ms }`. Nothing is cached, de-duplicated or persisted. `spec` is a url, or a definition's `request` (`url`, `method`, `headers`, `body`, `query`, `parseJson`, `retries`) with `{name}` placeholders filled from `args` and the current scopes, plus `client`, `auth`, `proxy`, `timeout`, `successCodes`, `parser` and a `name` for events. Rejects with the response plus `message` on a failing status or a network error. Rejects with `{ message, code: 0 }` without sending anything when the spec has no url, when the client doesn't exist, or when the string isn't a url (doesn't start with `/` or `http`), which is what a query name passed here by mistake looks like: the message says to call [`query`](#query). See [Requests](../guides/requests.md).

## define

```brightscript
sgquery.define(name as string, definition as object)
```

Registers a query. Defining a name again replaces the definition, with a console warning. See [Query definitions](definition.md) for every key.

```brightscript
sgquery.define("show", { request: { url: "/shows/{id}" }, parser: "ShowParser", ttl: 600, persist: true })
```

## query

```brightscript
sgquery.query(name as string, args = {} as object, options = {} as object) as object
```

Returns a promise that resolves with the query's value (the parser's result, or the decoded body), or with `{ pages, hasNext }` for a query defined with `pages` (see [`nextPage`](#nextpage)). See [Caching and freshness](../guides/caching.md#what-a-query-does) for how it decides between memory, disk and network.

| Option | Meaning |
|---|---|
| `revalidate: true` | Resolve with the cached value at once (fresh, stale or expired) and check the server in the background. With nothing cached, a normal query. |
| `force: true` | Skip the memory and disk copies and wait for a request. Shares a request already in flight. |

Rejects with an [error](events-and-stats.md#errors) when the request or parse fails, or with `{ message }` when no query has that name. For a `cache: false` query, runs it like [`mutate`](#mutate), without the cached-query check.

## nextPage

```brightscript
sgquery.nextPage(name as string, args = {} as object) as object
```

For a query defined with `pages`: loads the page after the last one loaded for these args and returns a promise for every page so far, `{ pages, hasNext }`, the shape `query` resolves with for such a query. With nothing loaded it loads the first page. On the last page (`hasNext` false) it resolves at once without a request. A load already running for these args is shared. Rejects for a query without `pages`. See [Pages](../guides/pagination.md).

## peek

```brightscript
sgquery.peek(name as string, args = {} as object) as dynamic
```

Returns the value cached in memory for those args (fresh, stale or expired), or `invalid`. Synchronous. Never makes a request or reads the disk.

## mutate

```brightscript
sgquery.mutate(name as string, args = {} as object, options = {} as object) as object
```

Runs a `cache: false` query and returns a promise for its parsed response. On success, applies the definition's `expires` and `invalidates`. Rejects without sending anything if the query is a cached one. See [Mutations](../guides/mutations.md).

| Option | Meaning |
|---|---|
| `optimistic: [{ name, args, value }]` | Values to [`set`](#set) before the request goes out, put back if it fails unless a newer `set` or a response has replaced them. See [Showing the change at once](../guides/mutations.md#showing-the-change-at-once). |

## set

```brightscript
sgquery.set(name as string, args = {} as object, value = invalid as dynamic) as dynamic
```

Puts `value` in the cache for a query and args as if the server had just answered with it: fresh for the definition's `ttl`, delivered to watchers with `source: "local"`, with a `set` event. A response to a request that started before the call doesn't replace it (its callers still get it). The disk copy is deleted. `invalid` removes the entry. Returns the previous value, or `invalid`. For a query with pages, sets the first page. Prints a warning and returns `invalid` for an unknown or `cache: false` query.

## expire

```brightscript
sgquery.expire(name as string, args = invalid as dynamic)
```

Marks values out of date without dropping them. `peek` and `revalidate` queries still get them. A plain query waits for the server and falls back to the kept value on failure. Disk copies saved before now aren't served.

- Name only: every entry of the query and its dotted descendants.
- Name and args: the one entry those args key to now.

Doesn't notify watchers.

## invalidate

```brightscript
sgquery.invalidate(name = invalid as dynamic, args = invalid as dynamic)
```

Drops values from memory and disk.

- No arguments: everything, including every file in this app's folder under `cachefs:/sgquery/`.
- Name only: every entry of the query and its dotted descendants, and their files.
- Name and args: the one entry those args key to now, and its file.

A request in flight for a dropped entry still answers its callers, but isn't stored. Doesn't notify watchers.

## expireAll

```brightscript
sgquery.expireAll()
```

Marks every cached value stale. Each is served from the cache on its next query and refreshed in the background. For coming back from the background; follow it with [`refresh`](#refresh) to update the open screens too.

## refresh

```brightscript
sgquery.refresh(name = invalid as dynamic, args = invalid as dynamic) as object
```

Sends the request again, now, for every entry of the query and its dotted descendants that has a [watcher](#watch); with `args`, that one entry when watched; with no name, every watched entry. Each keeps serving its value meanwhile, and a different answer reaches its watchers. Entries nobody watches are left alone (use [`query`](#query) with `revalidate` for one of those), as are entries with a request already in flight. For a query with pages, refreshes the first page. A mutation's `expires` calls this for the queries it expires. Returns a promise that resolves, with the number of refreshes started, once they have all settled. See [Refreshing what's on screen](../guides/mutations.md#refreshing-whats-on-screen).

## setScope

```brightscript
sgquery.setScope(scopeName as string, value as dynamic, options = {} as object)
```

Sets a scope value. When it changes from one value to another, every entry of every query listing the scope is dropped, from memory and disk, unless `options.keep` is `true`. `invalid` clears the scope. See [Scopes](../guides/scopes-and-buckets.md#scopes).

## invalidateScope

```brightscript
sgquery.invalidateScope(scopeName as string)
```

Drops every entry, and every stored body, of every query that lists the scope. The scope's value is unchanged.

## setHeaders

```brightscript
sgquery.setHeaders(headers as object, client = "" as string)
```

Merges headers into a client's shared headers: the default client's when `client` is omitted. A header set to `invalid` is removed. Takes effect for requests sent from then on. Prints a warning for an unknown client.

```brightscript
sgquery.setHeaders({ Authorization: "Bearer " + token })   ' sign in
sgquery.setHeaders({ Authorization: invalid })              ' sign out
```

## watch

```brightscript
sgquery.watch(name as string, functionName as string, args = invalid as dynamic) as object
```

Calls `functionName(event)` in the calling component when a value of the query is replaced by different content. `event.getData()` is `{ name, key, source, value }`.

- With `args`: only the entry those args key to at the time of the change.
- Without: every entry of the query.

Not called for a first value, an unchanged refresh, an expiry or an invalidation. Returns a watcher node; keep it for `unwatch`. See [Watching a query](../guides/keeping-data-fresh.md#watching-a-query).

## unwatch

```brightscript
sgquery.unwatch(watcher as dynamic)
```

Stops a watch. Ignores anything that isn't a watcher node.

## observeChanges

```brightscript
sgquery.observeChanges(functionName as string)
```

Calls `functionName(event)` in the calling component whenever any cached value is replaced by different content. `event.getData()` is `{ name, key, source }`, without the value. Filter with [`isChange`](#ischange).

## unobserveChanges

```brightscript
sgquery.unobserveChanges()
```

Removes the calling component's `observeChanges` observer.

## isChange

```brightscript
sgquery.isChange(change as dynamic, name as string, args = invalid as dynamic) as boolean
```

Whether a change event's data is for this query, and for these args when given (using the current scopes and time bucket).

## observeEvents

```brightscript
sgquery.observeEvents(functionName as string)
```

Calls `functionName(event)` in the calling component for every event: each request, cache hit, miss and error. `event.getData()` is `{ type, name, key, source, ms, client }`, plus `code` and `auth` on errors. See [Cache events](events-and-stats.md#events).

## unobserveEvents

```brightscript
sgquery.unobserveEvents()
```

Removes the calling component's `observeEvents` observer.

## getStats

```brightscript
sgquery.getStats() as object
```

Returns counters and gauges. See [Stats](events-and-stats.md#stats).

## getStore

```brightscript
sgquery.getStore() as object
```

Returns the store node, or `invalid` before `initialize`.

## destroy

```brightscript
sgquery.destroy()
```

Clears the in-memory cache, watchers and expiry records, stops the parser and persistence tasks and every transport (a replacement transport only if it has a `shutdown` field), and removes the store from the scene. Files on `cachefs:/` stay; call `invalidate()` first to remove them. A later `initialize` creates a fresh store.
