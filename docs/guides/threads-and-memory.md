# Threads and memory

## What runs where

| Work | Where |
|---|---|
| Cache lookups, keys, freshness, bookkeeping | `Store` node, on the render thread |
| HTTP, gzip, body hashing, JSON decoding of network bodies without a parser (a disk copy without a parser is decoded on the render thread) | `Transport` task, one per client |
| JSON decoding of bodies with a parser, parsers, parsed-value hashing | Your `ParserTask` subclass, two of them by default |
| Reading, writing and deleting `cachefs:/` files | `Persistence` task |

The store does only bookkeeping, so a query costs the render thread very little: it builds a key, looks it up and creates a promise. Everything slow runs on tasks, and results come back through promise nodes.

When a decoded body crosses from one thread to another, it's copied field by field, and the copy costs time on the render thread. So a body bound for a parser travels as the text the server sent, which is a single string, and the parser task decodes it. Only the parser's result reaches the render thread, and ContentNodes in it aren't copied.

## One store for the whole app

`initialize` attaches the store to the scene as a field, `__sghttp`, where every sgHttp function finds it. Every component that imports `sghttp.brs` therefore uses the same store, cache and tasks, with nothing to pass between them.

Call sgHttp from components on the render thread. Task functions shouldn't call it.

## Cached nodes are shared

Nodes are cached by reference. Every query of a key whose value is a ContentNode tree returns the **same** nodes, not a copy, while a value that is an associative array is copied when it is handed back:

- A node has one parent. Attaching a cached tree to a second container moves it out of the first. If two screens show the same data at once, give the second one a copy (`node.clone(true)`) or build its own view of the data.
- Changing a field on a cached node changes it for every later query of that key. Treat cached values as read-only. To change data, write to the server and expire the query.

## What the cache holds on to

| Kept | Bounded by |
|---|---|
| Cached values | `maxEntries` (default 100), least recently used evicted first |
| Old time-bucket entries | Dropped at the first query after each rollover |
| Expiry records (to skip old disk copies) | About one per expired query, plus one per expired persisted key not yet fetched again |
| Watchers | Until you call `unwatch` |
| Observers from `observeEvents` / `observeChanges` | Until you call `unobserveEvents` / `unobserveChanges` |
| Files on `cachefs:/` | Managed by the OS; removed by `invalidate`, scope changes, the next app version's start-up, and the start-up [sweep](persistence.md#the-start-up-sweep) of files the store can no longer read |

The `maxEntries` cap counts entries, not bytes. A hundred small objects and a hundred trees of a thousand nodes each are both at the cap. For queries with large results:

- pass only the args that identify the data, so one screen doesn't create many keys,
- or lower `maxEntries` for the whole app.

## Cleaning up

Screens and managers that watch or observe should undo it when they go away:

```brightscript
sub onClose()
    sghttp.unwatch(m.recordingsWatcher)
    sghttp.unobserveEvents()
end sub
```

`sghttp.destroy()` clears the cache, stops every task and removes the store from the scene. Use it, for example, when the user signs out of an app that rebuilds everything on sign-in. It doesn't touch `cachefs:/`; call `invalidate()` first to clear that too.

## Next

[API reference](../reference/api.md)
