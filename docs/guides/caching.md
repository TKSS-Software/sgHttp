# Caching and freshness

Each cached value is either **fresh** or **stale**. A fresh value is returned from memory without a request. A stale value is also returned from memory, but sgHttp then sends a request to check whether the server has a newer one.

## How long a value is fresh

`ttl` (seconds) sets how long a value stays fresh after it was fetched:

| `ttl` | Fresh for |
|---|---|
| omitted | what the response's `Cache-Control` asks for (see below), else the store default, `initialize({ defaultTtl })`, which is 300 seconds |
| `0` | no time at all: every query after the first sends a request to check the server |
| positive | that many seconds |
| negative | until it is expired, removed, or marked stale by `expireAll` |

A value loaded from disk counts as fetched when it was first saved, not when it was loaded. So a body saved an hour ago is already stale with a `ttl` of 300.

### Freshness from the server

A definition without a `ttl` takes its freshness from the response's `Cache-Control` header, so the server can change it without an app release:

- `max-age=N` keeps the value fresh for N seconds, less the response's `Age` when it has one.
- `no-cache` makes the value stale at once, like `ttl: 0`: it's still returned from memory while the server is checked.
- `no-store` keeps the body off the disk, whatever `persist` says. It's still cached in memory.

A definition's own `ttl` wins over the header. A response with neither gets `defaultTtl`. The `max-age` is saved with a disk copy, so the next launch judges the copy the same way.

For example, a guide whose freshness the server decides, leaving `ttl` out:

```brightscript
sghttp.define("guide", { request: { url: "/guide/{channel}" }, persist: true })
```

If the server answers with

```
Cache-Control: max-age=120
Age: 30
```

the value is fresh for 90 seconds. Queries in that time are returned from memory with no request; after it, a query is still returned from memory and a background request checks the server. A copy saved to disk carries the 90 seconds too, so a launch 10 minutes later checks the server rather than trusting the copy. If the server later answers with `Cache-Control: no-store`, the guide is cached in memory but never written to disk again, and `Cache-Control: no-cache` makes every query after the first check the server. The app's code doesn't change in any of these cases.

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

Its request queues at low [priority](transport.md#priorities), behind the requests screens are waiting on, and is raised when a query joins it. It does nothing when memory already holds a fresh value or a request is already in flight. Otherwise it takes the steps above, disk first. It returns whether it started anything. Use it for data a screen is about to need, for example at launch, or when an item gets focus and is likely to be selected.

## Giving up a query

A query's request can be shared by several callers, and the cache keeps its answer for the next one, so `sghttp.cancel(promise)` doesn't stop it. Instead the caller gives up its claim: when no other caller is waiting on the request, it moves to low [priority](transport.md#priorities), behind the requests that are still wanted. A screen that closes before its data arrives can do that, so the next screen's requests go first:

```brightscript
sub init()
    m.loading = sghttp.query("details", { slug: m.top.slug })
end sub

sub onClose()
    sghttp.cancel(m.loading)
end sub
```

The answer still fills the cache, so reopening the same screen is answered from memory. A caller that joins the request later raises it again, and a precache never counts as a claim. The cancelling caller's own promise still settles.

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

## Eviction

The memory cache holds a limited number of entries, set with `initialize({ maxEntries })` (100 by default). When a new entry takes the cache over that number, the **least recently used** entries are dropped first. A value returned from memory counts as a use; a `peek` does not.

- Entries with a request in flight are never evicted. The cache can briefly go over the cap while many requests run.
- Eviction drops only the memory copy. A persisted body stays on `cachefs:/`, and the next query reads it from there.
- The cap counts entries, not bytes; see [What the cache holds on to](threads-and-memory.md#what-the-cache-holds-on-to) for queries with large results.

## Next

[Mutations, expiry and removal](mutations.md)
