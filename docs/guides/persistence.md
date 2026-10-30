# Persistence

With `persist: true`, a query's raw response body is written to `cachefs:/`. On the next launch, the first fetch reads it, parses it and serves it before the network answers, so the first screen can draw at once.

```brightscript
sgquery.define("homePage", {
    request: { url: "/home/{slug}" }
    parser: "HomePageParser"
    ttl: 300
    persist: true
})
```

## What is stored

The **raw body** is stored, not the parsed value, because ContentNode trees can't be written to a file. A body read from disk goes through the parser again, on the parser task.

Each file is a small JSON envelope holding the body, the time it was saved, the body's hash, and any `ETag` / `Last-Modified` validators. A later refresh of a disk-loaded value can therefore still detect an unchanged body and send [conditional](keeping-data-fresh.md#conditional-requests-conditional-true) headers.

Files live at:

```
cachefs:/sgquery/<query name>/<digest>.json
```

The digest covers the cache `version`, the definition's request and parser, and the cache key.

## When the disk copy is used

The disk copy is read only when the **memory** cache has nothing for the key: on a cold start, or after the entry was evicted. Then:

- A disk copy younger than the query's `ttl` is served as fresh.
- An older one is served at once and refreshed in the background (with `staleWhileRevalidate`, the default).
- A missing or unreadable file falls through to the network.

## When a stored body is ignored

A body on disk is never served when:

- it was saved before an [`expire`](mutations.md#expire) of its query, a parent query or its key;
- it was stored under a different cache `version`;
- it was stored under a different `request` or `parser` in the definition. Changing a query's url, query string, method, body or parser retires its old bodies automatically, so a body can't be parsed by a parser written for another shape.

The version, request and parser are part of the file's digest, so a body stored under different ones is simply never looked up again. Those files stay on disk until `invalidate()` clears the cache or the OS reclaims the space. To retire every stored body at once, after a change to the response format for example, bump the version:

```brightscript
sgquery.initialize({ version: "2" })
```

## Deleting stored bodies

- `invalidate(name, args)` deletes that key's file.
- `invalidate(name)` deletes the folder of the query and of its dotted descendants, including files for entries no longer in memory.
- `invalidate()` deletes everything under `cachefs:/sgquery/`.
- Changing a [scope](scopes-and-buckets.md#changing-a-scope) deletes the files of every query that lists it.

Eviction from memory doesn't delete files. The next fetch reads the file back.

## Turning it off

`initialize({ persist: false })` disables persistence for every query: nothing is read or written, and no Persistence task is started. Persistence is on by default, but applies only to queries with `persist: true`.

## Things to know

- `cachefs:/` is managed by the Roku OS. Files survive app restarts but can be removed when the device needs space, so treat it as a cache, never as storage.
- All file access runs on the `Persistence` task. `roFileSystem` can't be created on the render thread.
- `persist` has no effect on `cache: false` queries.

## Next

[Parsers](parsers.md)
