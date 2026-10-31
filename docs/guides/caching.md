# Caching and freshness

Each cached value is either **fresh** or **stale**. A fresh value is returned from memory without a request. A stale value is also returned from memory, but sgHttp then sends a request to check whether the server has a newer one.

## How long a value is fresh

`ttl` (seconds) sets how long a value stays fresh after it was fetched:

| `ttl` | Fresh for |
|---|---|
| omitted | the store default, `initialize({ defaultTtl })`, which is 300 seconds |
| `0` | no time at all: every query after the first sends a request to check the server |
| positive | that many seconds |
| negative | until it is expired, invalidated, or marked stale by `expireAll` |

A value loaded from disk counts as fetched when it was first saved, not when it was loaded. So a body saved an hour ago is already stale with a `ttl` of 300.

## What a query does

`sghttp.query(name, args)` works out the key (see [Cache keys](queries.md#cache-keys)), then takes the first step that applies:

1. **Fresh in memory.** It resolves immediately with the cached value, and no request is sent.
2. **Stale in memory.** With `staleWhileRevalidate` (the default), it resolves immediately with the cached value and starts a background refresh, unless one is already running. Without it, the query waits for the server.
3. **In flight.** A request for this key is already running, and memory has no value it is allowed to return now. The query returns that request's promise, so every caller shares one request.
4. **On disk.** For a `persist: true` query with nothing in memory, the body saved on `cachefs:/` is read on a task thread, parsed on a task thread when the query has a parser, then returned. If it's stale and `staleWhileRevalidate` is on, a background refresh starts. See [Persistence](persistence.md).
5. **Otherwise.** The request goes out. sgHttp parses the response, saves it to disk if `persist` is set, caches it and resolves the promise.

An [expired](mutations.md#expire) value skips steps 1 and 2. A plain query then waits for the server, and if that request fails, it falls back to the kept value.

## Query options

The third argument to `query` changes the steps above:

```brightscript
sghttp.query("homePage", args, { revalidate: true })
sghttp.query("homePage", args, { force: true })
```

- **`revalidate: true`** resolves at once with the cached value, whether it's fresh, stale or expired, and checks the server in the background. If the server's answer is different, [watchers](keeping-data-fresh.md#watching-a-query) hear about it. Use it when a screen opens and you want to show the cached data right away, while also checking the server for a newer version. With nothing cached, it behaves like a normal query.
- **`force: true`** skips the memory and disk copies and waits for a request. If the server's answer is unchanged, it resolves with the cached value. A request already in flight for the key is shared rather than duplicated.

## Asking ahead

`sghttp.precache(name, args)` starts a query without waiting for its result. When a screen queries the same data later, the request is either already in flight or already finished, so the screen gets its data sooner:

```brightscript
sub init()
    sghttp.initialize({ baseUrl: "https://api.example.com", parserTask: "AppParserTask" })
    registerQueries()
    sghttp.precache("menu")                         ' wanted by the first screen, after sign-in checks
    sghttp.precache("homePage", { slug: "main" })
end sub
```

It does nothing when memory already holds a fresh value or a request is already in flight. Otherwise it takes the steps above, disk first. It returns whether it started anything. Use it for data a screen is about to need, for example at launch, or when an item gets focus and is likely to be selected.

## Failures

- When a request fails and its entry has no value yet, the entry is dropped and the promise rejects, so the next query tries again.
- When a **background** refresh fails, the cached value is kept and is still returned. The failure is reported as an `error` [event](../reference/events-and-stats.md#events).
- If an entry is dropped or expired while its request is in flight, the request still answers its callers, but the cache doesn't store the answer. This prevents a response from before the change from overwriting data that came after it.

## Reading the cache directly

`sghttp.peek(name, args)` returns the cached value synchronously, or `invalid` if there's nothing in memory. It returns stale and expired values too. It never makes a request, never reads the disk, and doesn't count as a use for eviction.

```brightscript
cached = sghttp.peek("homePage", { slug: "main" })
if cached <> invalid then m.rowList.content = cached
```

## Marking everything stale

`sghttp.expireAll()` marks every cached value stale without dropping any. The next query of each one is returned from the cache and, with `staleWhileRevalidate`, a background refresh is started. Call it when the app comes back after a long time in the background, and follow it with `refresh()` so the screens already open update too (see [Refreshing what's on screen](keeping-data-fresh.md#refreshing-whats-on-screen)):

```brightscript
sub onResume()
    sghttp.expireAll()
    sghttp.refresh()
end sub
```

`expireAll` doesn't affect disk copies. Each disk copy records its own save time, and that decides whether it is fresh.

## Eviction

The memory cache holds a limited number of entries, set with `initialize({ maxEntries })` (100 by default). When a new entry takes the cache over that number, the **least recently used** entries are dropped first. A value returned from memory counts as a use; a `peek` does not.

- Entries with a request in flight are never evicted. The cache can briefly go over the cap while many requests run.
- Eviction drops only the memory copy. A persisted body stays on `cachefs:/`, and the next query reads it from there.
- The cap counts entries, not bytes; see [What the cache holds on to](threads-and-memory.md#what-the-cache-holds-on-to) for queries with large results.

## Next

[Mutations, expiry and invalidation](mutations.md)
