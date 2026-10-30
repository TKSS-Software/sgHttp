# Threads and memory

## What runs where

| Work | Where |
|---|---|
| Cache lookups, keys, freshness, bookkeeping | `Store` node, on the render thread |
| HTTP, gzip, JSON decoding, body hashing | `Transport` task, one per client |
| Parsers, parsed-value hashing | Your `ParserTask` subclass |
| Reading, writing and deleting `cachefs:/` files | `Persistence` task |

The store does only bookkeeping, so a fetch costs the render thread very little: a key, a lookup, and a promise. Everything slow happens on tasks, and results come back through promise nodes.

`roFileSystem` can't be created on the render thread. Never add file access to the store.

## One store for the whole app

`initialize` attaches the store to the scene as a field, `__sgquery`, and every sgquery function finds it there. Every component that imports `sgquery.brs` uses the same store, the same cache and the same tasks. There is nothing to pass between components.

Call sgquery from components on the render thread. Task functions shouldn't call it.

## Cached nodes are shared

Values are cached by reference. Every fetch of a key returns the **same** node, not a copy:

- A node has one parent. Attaching a cached tree to a second container moves it out of the first. If two screens show the same data at once, give the second one a copy (`node.clone(true)`) or build its own view of the data.
- Changing a field on a cached node changes it for every later fetch of that key. Treat cached values as read-only. To change data, write to the server and expire the query.

## What the cache holds on to

| Kept | Bounded by |
|---|---|
| Cached values | `maxEntries` (default 100), least recently used evicted first |
| Old time-bucket entries | Dropped at the first fetch after each rollover |
| Expiry records (to skip old disk copies) | About one per expired query, plus one per expired persisted key not yet fetched again |
| Watchers | Until you call `unwatch` |
| Observers from `observeEvents` / `observeChanges` | Until you call `unobserveEvents` / `unobserveChanges` |
| Files on `cachefs:/` | Managed by the OS; removed by `invalidate`, scope changes, and the next app version's startup |

The `maxEntries` cap counts entries, not bytes. A hundred small objects and a hundred trees of a thousand nodes each are both at the cap. For queries with large results:

- keep their `ttl`s short, so their entries are replaced rather than piling up per args,
- pass only the args that identify the data, so one screen doesn't create many keys,
- or lower `maxEntries` for the whole app.

Requests in flight are never evicted, so the cache can briefly exceed the cap while many requests run.

## Cleaning up

Screens and managers that watch or observe should undo it when they go away:

```brightscript
sub onClose()
    sgquery.unwatch(m.recordingsWatcher)
    sgquery.unobserveEvents()
end sub
```

`getStats().watchers` is the quickest way to spot a missing `unwatch`.

`sgquery.destroy()` clears the cache, stops every task and removes the store from the scene, for example when signing out of an app that rebuilds everything on sign-in. It doesn't touch `cachefs:/`; call `invalidate()` first to clear that too.

## Next

[API reference](../reference/api.md)
