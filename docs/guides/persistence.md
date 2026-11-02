# Persistence

With `persist: true`, sgHttp writes a query's raw response body to `cachefs:/`. On the next launch, the first query reads that body, parses it and returns it before the network response arrives, so the app can draw its first screen at once.

```brightscript
sghttp.define("homePage", {
    request: { url: "/home/{slug}" }
    parser: "HomePageParser"
    ttl: 300
    persist: true
})
```

## What is stored

The **raw body** is stored, not the parsed value, because ContentNode trees can't be written to a file. A body read from disk goes through the parser again, on the parser task.

Each file starts with one line of JSON holding the time the body was saved, its hash, the freshness its `Cache-Control` asked for, and any `ETag` / `Last-Modified` validators. A response with `Cache-Control: no-store` is not written at all. The body follows, exactly as the server sent it. A later refresh of a disk-loaded value can therefore still detect an unchanged body and send [conditional](keeping-data-fresh.md#conditional-requests-conditional-true) headers.

When a file is written or read, the render thread decodes only that first line; the body stays a string there. A body with a parser goes from the disk to the parser task as text and is decoded there. A body without a parser is decoded on the render thread, where its value is needed anyway.

Files live at:

```
cachefs:/sghttp/<namespace>/<query name>/<prefix>-<digest>.json
```

The prefix stands for the cache `version` and the definition's request, parser and server. The digest stands for the cache key. The namespace is described below.

## One folder per app

On a developer device, every sideloaded app runs as the same "dev" channel, so they can share `cachefs:/`. Two apps that define the same queries could then read each other's stored bodies, including per-user data. To keep them apart, each app stores its bodies in its own folder, named after its channel id, title and version from `roAppInfo`:

```
cachefs:/sghttp/dev_My-Channel-3f9a2c1e_1.4.2/homePage/...
```

- Characters other than letters, digits, `.` and `-` become `-`. The short hash after the title is made from the raw id and title, so two apps whose titles differ only in punctuation (`My App`, `My-App`) still get separate folders.
- Because the app version is part of the name, **each release of the app starts with an empty disk cache**. After the first disk read, the store deletes the folders of the same app's other versions (same id and title), so files from old releases don't accumulate.
- To choose the folder yourself, pass `initialize({ namespace: "my-app" })`. The app's other folders are then left alone, and a new release keeps the previous release's bodies. The cache `version` and the request digest still decide whether each one can be read.

## When the disk copy is used

The disk copy is read only when the **memory** cache has nothing for the key: on a cold start, or after the entry was evicted or dropped. Then:

- A disk copy younger than the query's `ttl` is returned as fresh.
- An older one is returned at once and refreshed in the background (with `staleWhileRevalidate`, the default).
- If the file is missing or unreadable, the request is sent to the server instead.

## When a stored body is ignored

A body on disk is never returned when:

- it was saved before an [`expire`](mutations.md#expire) of its query, a parent query or its key;
- it was stored under a different cache `version`;
- it was stored under a different `request` or `parser` in the definition. Changing a query's url, query string, method, body or parser means its old bodies are no longer read, so a body can't be parsed by a parser written for another shape;
- it was fetched from a different server: another client, or another `baseUrl` for a relative url (an absolute `request.url` ignores `baseUrl`, so its bodies are kept). A build pointed at QA never reads bodies stored against production, and the other way round.

The version, request, parser and server are part of the file's name, so a body stored under different ones is never looked up again, and the [start-up sweep](#the-start-up-sweep) deletes it. Switching a build between QA and production therefore downloads each server's data again.

With the app version in the [folder name](#one-folder-per-app) and the server in the file name prefix, you rarely need `version`. Use it to drop every stored body at once without changing anything else, for example while developing a parser against a response whose shape changed:

```brightscript
sghttp.initialize({ version: "2" })
```

## Deleting stored bodies

- `remove(name, args)` deletes that key's file.
- `remove(name)` deletes the folder of the query and of its dotted descendants, including files for entries no longer in memory.
- `removeAll()` deletes everything in this app's folder. Other apps' folders are never touched.
- Changing a [scope](scopes-and-buckets.md#changing-a-scope) deletes the files of every query that lists it.

### The start-up sweep

Once the first disk read has completed, the store sweeps this app's folder. In the folder of each query defined by then, it deletes every file the query can no longer read: files stored under another cache `version`, request, parser or server, and all the files of a query that no longer has `persist: true`. It decides by file name and never opens a file.

The folders of queries not defined by then are left alone, so a query defined later, by a screen, keeps its bodies. Define every persisted query before the first query, as `registerQueries()` does in the examples, and the sweep covers them all.

## Turning it off

`initialize({ persist: false })` disables persistence for every query: nothing is read or written, and no Persistence task is started. Persistence is on by default, but applies only to queries with `persist: true`. The Persistence task starts, and creates the app's folder on `cachefs:/`, when the first such query is defined, or when `removeAll()` is called, since a sign-out should clear copies stored by an earlier launch too. An app with no such query never starts it otherwise: `remove(name)` and `removeScope` touch memory only until it's running.

## Things to know

- `cachefs:/` is managed by the Roku OS. Files survive app restarts but can be removed when the device needs space, so treat it as a cache, never as storage.
- `persist` has no effect on `cache: false` queries.

## Next

[From an OpenAPI spec](openapi.md)
