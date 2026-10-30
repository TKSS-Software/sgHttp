# Caching and freshness

Each cached value is either **fresh** or **stale**. A fresh value is served from memory without a request. A stale value is still served, but sgquery checks the server for a newer one.

## How long a value is fresh

`ttl` (seconds) sets how long a value stays fresh after it was fetched:

| `ttl` | Fresh for |
|---|---|
| omitted | the store default, `initialize({ defaultTtl })`, which is 300 seconds |
| `0` | no time: every fetch after the first checks the server |
| positive | that many seconds |
| negative | until it is expired, invalidated, or marked stale by `expireAll` |

A value loaded from disk counts as fetched when it was first saved, not when it was loaded. A body saved an hour ago is already stale with a `ttl` of 300.

## What a fetch does

`sgquery.fetch(name, args)` works out the key (see [Cache keys](queries.md#cache-keys)), then takes the first step that applies:

1. **In flight.** A request for this key is already running. The fetch returns the same promise, so every caller shares one request.
2. **Fresh in memory.** It resolves immediately with the cached value. No request.
3. **Stale in memory.** With `staleWhileRevalidate` (the default), it resolves immediately with the cached value and starts a background refresh. Without it, the fetch waits for the server.
4. **On disk.** For a `persist: true` query with nothing in memory, the body saved on `cachefs:/` is read and parsed on task threads, then served. If it's stale, a background refresh starts. See [Persistence](persistence.md).
5. **Otherwise.** The request goes out. The response is parsed, saved to disk if `persist` is set, cached, and the promise resolves.

An [expired](mutations.md#expire) value skips step 2: a plain fetch waits for the server, and falls back to the kept value if that request fails.

## Fetch options

The third argument to `fetch` changes the steps above:

```brightscript
sgquery.fetch("homePage", args, { revalidate: true })
sgquery.fetch("homePage", args, { force: true })
```

- **`revalidate: true`** resolves with the cached value at once, fresh, stale or expired, and checks the server in the background. A different answer reaches [watchers](keeping-data-fresh.md#watching-a-query). Use it when a screen opens and you want its data now, plus a check. With nothing cached, it behaves like a normal fetch.
- **`force: true`** skips the memory and disk copies and waits for a request. If the server's answer is unchanged, it resolves with the cached value. A request already in flight for the key is shared rather than duplicated.

## Failures

- When the request for an entry with no value fails, the entry is dropped and the promise rejects, so the next fetch tries again.
- When a **background** refresh fails, the cached value stays and keeps being served. The failure is reported as an `error` [event](debugging.md#cache-events).
- A request still answers its callers when its entry is dropped or expired while it's in flight, but the cache doesn't store the answer. That way a response from before a change never replaces one from after it.

## Reading without fetching

`sgquery.peek(name, args)` returns the cached value synchronously, or `invalid` if there's nothing in memory. It returns stale and expired values too. It never makes a request, never reads the disk, and doesn't count as a use for eviction.

```brightscript
cached = sgquery.peek("homePage", { slug: "main" })
if cached <> invalid then m.rowList.content = cached
```

## Marking everything stale

`sgquery.expireAll()` marks every cached value stale without dropping any. The next fetch of each one is served from the cache and refreshed in the background. Call it when the app comes back after a long time in the background:

```brightscript
sub onResume()
    sgquery.expireAll()
end sub
```

`expireAll` doesn't affect disk copies; they carry their own save time.

## Eviction

Memory is bounded by entry count: `initialize({ maxEntries })`, 100 by default. When a new entry takes the cache over that number, the **least recently used** entries are dropped first. A value served from memory counts as a use; `peek` doesn't.

- Entries with a request in flight are never evicted. The cache can briefly go over the cap while many requests run.
- Eviction drops only the memory copy. A persisted body stays on `cachefs:/` and is served from there by the next fetch.
- The cap counts entries, not bytes. An entry can be a small object or a tree of hundreds of nodes. See [Threads and memory](threads-and-memory.md).

## Next

[Mutations, expiry and invalidation](mutations.md)
