# Persistence

With `persist: true`, a query's raw response body is written to `cachefs:/`. On the next launch, the first query reads it, parses it and serves it before the network answers, so the first screen can draw at once.

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

Each file starts with one line of JSON holding the time the body was saved, its hash, and any `ETag` / `Last-Modified` validators. The body follows, exactly as the server sent it. A later refresh of a disk-loaded value can therefore still detect an unchanged body and send [conditional](keeping-data-fresh.md#conditional-requests-conditional-true) headers.

Writing and reading a file costs the render thread only that first line. A body with a parser goes from the disk to the parser task as text and is decoded there. A body without a parser is decoded on the render thread, as its value has to be.

Files live at:

```
cachefs:/sgquery/<namespace>/<query name>/<digest>.json
```

The digest covers the cache `version`, the definition's request and parser, and the cache key. The namespace is described below.

## One folder per app

On a developer device, every sideloaded app runs as the same "dev" channel, so they can share `cachefs:/`. Two apps that define the same queries could then read each other's stored bodies, including per-user data. To keep them apart, each app stores its bodies in its own folder, named by its channel id, title and version from `roAppInfo`:

```
cachefs:/sgquery/dev_My-Channel-3f9a2c1e_1.4.2/homePage/...
```

- Characters other than letters, digits, `.` and `-` become `-`. The short hash after the title is of the raw id and title, so two apps whose titles differ only in punctuation (`My App`, `My-App`) still get separate folders.
- Because the app version is part of the name, **each release of the app starts with an empty disk cache**. When the store starts, it deletes the folders of the same app's other versions (same id and title), so old releases don't leave files behind.
- To choose the folder yourself, pass `initialize({ namespace: "my-app" })`. The app's other folders are then left alone, and a new release keeps the previous one's bodies, which the cache `version` and the request digest still guard.

## When the disk copy is used

The disk copy is read only when the **memory** cache has nothing for the key: on a cold start, or after the entry was evicted. Then:

- A disk copy younger than the query's `ttl` is served as fresh.
- An older one is served at once and refreshed in the background (with `staleWhileRevalidate`, the default).
- A missing or unreadable file falls through to the network.

## When a stored body is ignored

A body on disk is never served when:

- it was saved before an [`expire`](mutations.md#expire) of its query, a parent query or its key;
- it was stored under a different cache `version`;
- it was stored under a different `request` or `parser` in the definition. Changing a query's url, query string, method, body or parser retires its old bodies automatically, so a body can't be parsed by a parser written for another shape;
- it was fetched from a different server: another client, or another `baseUrl` (for relative urls; an absolute `request.url` ignores `baseUrl`, so its bodies are kept). A build pointed at QA never reads bodies stored against production, and the other way round.

The version, request, parser and server are part of the file's digest, so a body stored under different ones is simply never looked up again. Those files stay on disk until `invalidate()` clears the cache or the OS reclaims the space.

With the app version in the [folder name](#one-folder-per-app) and the server in the digest, you rarely need `version`. It is there to drop every stored body at once without changing anything else, for example while developing a parser against a response whose shape changed:

```brightscript
sgquery.initialize({ version: "2" })
```

## Deleting stored bodies

- `invalidate(name, args)` deletes that key's file.
- `invalidate(name)` deletes the folder of the query and of its dotted descendants, including files for entries no longer in memory.
- `invalidate()` deletes everything in this app's folder. Other apps' folders are never touched.
- Changing a [scope](scopes-and-buckets.md#changing-a-scope) deletes the files of every query that lists it.

## Turning it off

`initialize({ persist: false })` disables persistence for every query: nothing is read or written, and no Persistence task is started. Persistence is on by default, but applies only to queries with `persist: true`.

## Things to know

- `cachefs:/` is managed by the Roku OS. Files survive app restarts but can be removed when the device needs space, so treat it as a cache, never as storage.
- Before the per-app folders, bodies were stored directly under `cachefs:/sgquery/<query name>/`. Those folders are deleted at start-up, once the first disk read has answered, as are the same app's other version folders. Clean-up never delays a cold start.
- `persist` has no effect on `cache: false` queries.

## Next

[Parsers](parsers.md)
