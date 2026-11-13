# Threads and memory

## What runs where

| Work | Where |
|---|---|
| Cache lookups, keys, freshness, bookkeeping, and JSON decoding of bodies without a parser | `Store` node, on the render thread |
| HTTP, gzip, body hashing | `Transport` task, one per client |
| JSON decoding of bodies with a parser, parsers, parsed-value hashing | Your `ParserTask` subclass, two of them by default |
| Reading, writing and deleting `cachefs:/` files | `Persistence` task, started when the first query with `persist: true` is defined |

The store does only bookkeeping, so a query costs the render thread very little: it builds a key, looks it up and creates a promise. Everything slow runs on tasks, and results come back through promise nodes. The store observes those promises itself, and handles a request's, a disk read's or a parse's answer as its settle event is dispatched: a wait through the promises library costs about a frame on a busy render thread, and a cold start from disk with a parser would otherwise pay for two of them before the caller's own. The exception is decoding a body that has no parser: a query or fetch without one leaves that to the render thread, by choice. Give a large response a parser to keep it on a task.

A task that reads or writes a field of a node the render thread owns waits for the render thread to service it (a rendezvous). sgHttp keeps those to a minimum: a request or a parse costs two, the two writes that settle its promise; a disk read costs one, the write of its answer, which the render thread settles the promise from; and the data a task needs travels with the job it is handed. A task's write to a render-thread node can also fail to land, with the task none the wiser (about once in 250 reads on a Roku Express 4K running OS 16), so a disk read unanswered after a second is sent again rather than left hanging. The Transport reads its settings once, as it starts; the count of requests in flight is kept on the render thread.

When a decoded body crosses from one thread to another, it's copied field by field, and the copy runs on the render thread. That costs more than decoding the text there: in the benchmark (`npm run bench`, Roku Express 4K), a 300 KB body without a parser reached its caller in 84 ms decoded on the render thread, against 211.5 ms decoded on the transport task and copied across. So every body crosses as the text the server sent, which is a single string. A body for a parser is decoded on the parser task, and only the parser's result reaches the render thread; ContentNodes in it aren't copied. Any other body is decoded on the render thread.

## One store for the whole app

`initialize` attaches the store to the scene as a field, `__sghttp`, where every sgHttp function finds it. Every component that imports `sghttp.brs` therefore uses the same store, cache and tasks, with nothing to pass between them.

Call sgHttp from components on the render thread. Task functions shouldn't call it.

## Cached nodes are shared

Nodes are cached by reference. Every query of a key whose value is a ContentNode tree returns the **same** nodes, not a copy, while a value that is an associative array is copied when it is handed back:

- A node has one parent. Attaching a cached tree to a second container moves it out of the first. If two screens show the same data at once, give the second one a copy (`node.clone(true)`) or build its own view of the data.
- Changing a field on a cached node changes it for every later query of that key. Treat cached values as read-only. To change data, write to the server and expire the query.
- The copy of an associative array is made on the render thread, on every hit. It is cheap for a small value and not for a large one: in the benchmark, a memory hit of a 300 KB decoded body costs about 40 ms on a Roku Express 4K, 22 to 26 ms of it with the render thread blocked, where a hit of the same body parsed into ContentNodes costs 2 ms. A parser that builds nodes avoids the copy; so does a parser that keeps only the fields the screen shows.

## What the cache holds on to

| Kept | Bounded by |
|---|---|
| Cached values | `maxEntries` (default 100), least recently used evicted first |
| Old time-bucket entries | Dropped at the first query after each rollover |
| Expiry records (to skip old disk copies) | About one per expired query, plus one per expired persisted key not yet fetched again |
| Watchers | Until you call `unwatch` |
| Observers from `observeEvents` / `observeChanges` | Until you call `unobserveEvents` / `unobserveChanges` |
| Files on `cachefs:/` | Capped at `maxDiskBytes` (default 10 MB), least recently used trimmed first; removed by `remove`, scope changes, the next app version's start-up, and the start-up [sweep](persistence.md#the-start-up-sweep) of files the store can no longer read |

The `maxEntries` cap counts entries, not bytes. A hundred small objects and a hundred trees of a thousand nodes each are both at the cap. For queries with large results:

- pass only the args that identify the data, so one screen doesn't create many keys,
- or lower `maxEntries` for the whole app.

## Memory warnings

sgHttp doesn't subscribe to the OS's memory warnings itself. Roku doesn't document whether two subscriptions in one app both get every warning, so the app keeps the only monitor (Roku's certification requires one from October 1, 2026) and hands each warning to sgHttp with `reportMemoryWarning`. Pass the event's `getInfo()` as it is:

```brightscript
if type(msg) = "roAppMemoryNotificationEvent" then
    sghttp.reportMemoryWarning(msg.getInfo())      ' { memoryUsagePercent }
else if type(msg) = "roDeviceInfoEvent" and msg.getInfo().generalMemoryLevel <> invalid then
    sghttp.reportMemoryWarning(msg.getInfo())      ' { generalMemoryLevel }, where roAppMemoryMonitor isn't available
end if
```

Forward the warnings in both directions: on Roku OS 15.2 and later, `roAppMemoryMonitor` reports as usage crosses 80, 85, 90 and 95% of the app's limit going up and going down, and the report below 80% is what lets the cache grow again.

On a warning, the cache releases its least recently used values, more the closer the app is to its limit:

| App's usage of its limit | Values kept, of those cached when the warning began |
|---|---|
| 80% | 75% |
| 85%, or level `low` | 50% |
| 90% | 25% |
| 95%, or level `critical` | only the newest, and those with a request in flight |

- The lower cap stays in place, so new values push out old ones instead of growing the cache again. It lifts on a report below 80% (or level `normal`), or after a minute without another warning.
- A warning no worse than the one in effect releases nothing more, so forwarding the same warning twice is harmless.
- Only memory copies go. A persisted body stays on `cachefs:/`, and a released value is fetched again the next time it's queried. A value the app still holds, such as a ContentNode on screen, stays alive; the cache only drops its own reference.

`reportMemoryWarning` returns how many values it released. `getStats()` counts warnings in `memoryWarnings` and released values in `memoryReleased`.

**Where the monitor runs.** From a component, `sghttp.reportMemoryWarning(info)` finds the store through the scene. In `main.brs`, or in a task, where the scene may not be reachable, pass the store node as a second argument: `getStore()` taken on the render thread and handed to the task in a field, or `scene.__sghttp` in `main.brs`. From a task, each call crosses to the render thread once; warnings are throttled by the OS, so that's cheap.

## Cleaning up

Screens and managers that watch or observe should undo it when they go away:

```brightscript
sub onClose()
    sghttp.unwatch(m.recordingsWatcher)
    sghttp.unobserveEvents()
end sub
```

[`sghttp.destroy()`](../reference/api.md#destroy) takes the store down, for an app that rebuilds everything on sign-in. It doesn't touch `cachefs:/`; call `removeAll()` first to clear that too.

## Next

[API reference](../reference/api.md)
