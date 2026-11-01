# Keeping data fresh

Data can change on the server, or be changed from another device, while a screen is showing a cached copy. sgHttp checks for such changes with background refreshes, and keeps each check cheap. A refresh that finds nothing new costs one request and nothing more. A refresh that finds new data notifies the screens watching that query, so they can redraw without querying again.

## Unchanged payloads cost a request, not a parse

The transport takes an MD5 hash of the raw body of every cached query's response, on its task thread. When a refresh returns a body with the same hash as the cached value:

- the entry is renewed, and its `ttl` starts again
- nothing is parsed, nothing is written to disk, and no watcher is notified
- the [event](../reference/events-and-stats.md#events) is `unchanged`

Because of this, a short `ttl` is affordable for data that changes often. A check every 30 seconds costs one request, and only parses and redraws when the data has changed.

## Responses with volatile fields: `compare: "parsed"`

Some APIs include a value that's different in every response (a request id, a server timestamp), so the bytes never match even when the data does. If your parser drops that field, set `compare: "parsed"`:

```brightscript
sghttp.define("guide.now", {
    request: { url: "/guide/now" }
    parser: "NowParser"
    ttl: 60
    compare: "parsed"
})
```

When the body hash differs, the parser runs as usual, then the parser task hashes the parsed value's JSON. If that matches the cached value's hash, the entry is renewed silently, and the new body hash is remembered, so the next identical response skips the parser.

The cost is one `formatJson` call for each response whose bytes differ. A parsed value that can't be turned into JSON, such as one that holds nodes, always counts as changed. Use it with parsers that return associative arrays and arrays.

## Conditional requests: `conditional: true`

If the server sends `ETag` or `Last-Modified` headers, `conditional: true` sends them back as `If-None-Match` and `If-Modified-Since`. A `304 Not Modified` renews the entry just as an unchanged body would, without the server sending the body at all.

```brightscript
sghttp.define("catalog", { request: { url: "/catalog" }, ttl: 120, conditional: true, persist: true })
```

The validators are saved with persisted bodies, so a cold start can send them too. It only helps if the server sends validators; without them, it does nothing.

## Watching a query

When a refresh replaces a cached value with **different** content, sgHttp notifies that query's watchers with the new value:

```brightscript
sub init()
    m.recordingsWatcher = sghttp.watch("recordings", "onRecordingsChanged", { packageSlug: "value" })
end sub

sub onRecordingsChanged(event as object)
    data = event.getData()   ' { name, key, source, value }
    drawRows(data.value)
end sub

sub onClose()
    sghttp.unwatch(m.recordingsWatcher)
end sub
```

- **With args**, a watcher hears only the entry those args key to at the moment of the change, using the current scopes and time bucket.
- **Without args**, it hears every entry of the query.
- A **first** value from a request or disk never notifies watchers; the query that asked for it receives it. Neither do expiries, removals or unchanged refreshes.
- The callback runs in the component that called `watch`. Call `unwatch` when that component goes away, because the store holds on to every watcher until you do.

### Every change, from one place

`observeChanges` reports every change in the store, without the value. Pair it with `isChange` to filter:

```brightscript
sghttp.observeChanges("onCacheChanged")

sub onCacheChanged(event as object)
    change = event.getData()   ' { name, key, source }
    if sghttp.isChange(change, "favorites") then refreshFavoriteBadges()
end sub
```

Stop with `sghttp.unobserveChanges()`.

## Checking when a screen opens

To show cached data immediately and still pick up anything new, query with `revalidate`:

```brightscript
promises.chain(sghttp.query("recordings", args, { revalidate: true }), m).then(function(value as dynamic, m as object) as dynamic
    drawRows(value)   ' the cached value, right away
    return invalid
end function)
' if the server's copy differs, the watcher above receives it
```

`revalidate` and a watcher are usually used together. The query returns the cached data so the screen can draw now, and the watcher receives the new data if the check finds a change, so the screen can redraw.

## Refreshing what's on screen

Expiring a value does not send a request by itself. The request is sent only when something queries the data again. So a screen that is already open and watching a query would keep showing the old value until it was reopened. `refresh` sends that request for the screens that are open:

```brightscript
sghttp.refresh("favorites")            ' every watched entry of favorites and favorites.*
sghttp.refresh("favorites", { model: "show" })  ' that one, if watched
sghttp.refresh()                        ' everything watched, e.g. on resume
```

It sends a new request right away for every matching entry that has a watcher. Each entry keeps serving its current value in the meantime, and if the answer is different, the watchers receive it. Entries without a watcher are not refreshed, since nothing would receive the result. To check one of those, query it with `revalidate`. `refresh` returns a promise that resolves once all the refreshes have settled, with the number it started.

A mutation's `expires` list calls `refresh` for the queries it expires, so the screens watching them receive the new data without querying again.

## Next

[Pages](pagination.md)
