# Keeping data fresh

Data changes behind the app's back, on another device or on the server, while the screen shows a cached copy. sgQuery keeps checking cheap: a refresh that finds nothing new costs a request and nothing more, and a refresh that finds something new can redraw the screen without it asking.

## Unchanged payloads cost a request, not a parse

The transport hashes (MD5) the raw body of every cached query's response, on its task thread. When a refresh returns the same hash as the cached value:

- the entry is renewed, and its `ttl` starts again
- nothing is parsed, nothing is written to disk, and no watcher is notified
- the [event](debugging.md#events) is `unchanged`

That makes short `ttl`s on volatile queries affordable: a check every 30 seconds costs a request, not a parse and a redraw.

## Responses with volatile fields: `compare: "parsed"`

Some APIs put a value in every response that changes every time (a request id, a server timestamp), so the bytes never match even when the data does. If your parser drops that field, set `compare: "parsed"`:

```brightscript
sgquery.define("guide.now", {
    request: { url: "/guide/now" }
    parser: "NowParser"
    ttl: 60
    compare: "parsed"
})
```

When the body hash differs, the parser runs as usual, then the parser task hashes the parsed value's JSON. If that matches the cached value's hash, the entry is renewed silently, and the new body hash is remembered, so the next identical response skips the parser.

It costs one `formatJson` per differing response. A parsed value that can't be turned into JSON, such as one that holds nodes, always counts as changed. Use it with parsers that return associative arrays and arrays.

## Conditional requests: `conditional: true`

If the server sends `ETag` or `Last-Modified` headers, `conditional: true` sends them back as `If-None-Match` and `If-Modified-Since`. A `304 Not Modified` renews the entry just as an unchanged body would, without the server sending the body at all.

```brightscript
sgquery.define("catalog", { request: { url: "/catalog" }, ttl: 120, conditional: true, persist: true })
```

The validators are saved with persisted bodies, so a cold start can send them too. It only helps where the server sends validators. Without them it does nothing.

## Watching a query

When a refresh replaces a cached value with **different** content, sgQuery notifies that query's watchers with the new value:

```brightscript
sub init()
    m.recordingsWatcher = sgquery.watch("recordings", "onRecordingsChanged", { packageSlug: "value" })
end sub

sub onRecordingsChanged(event as object)
    data = event.getData()   ' { name, key, source, value }
    drawRows(data.value)
end sub

sub onClose()
    sgquery.unwatch(m.recordingsWatcher)
end sub
```

- **With args**, a watcher hears only the entry those args key to at the moment of the change, using the current scopes and time bucket.
- **Without args**, it hears every entry of the query.
- A **first** value never notifies; the query that asked for it receives it. Neither do expiries, invalidations or unchanged refreshes.
- The callback runs in the component that called `watch`. Call `unwatch` when that component goes away, because the store holds on to every watcher until you do. `getStats().watchers` counts the live ones.

### Every change, from one place

`observeChanges` reports every change in the store, without the value. Pair it with `isChange` to filter:

```brightscript
sgquery.observeChanges("onCacheChanged")

sub onCacheChanged(event as object)
    change = event.getData()   ' { name, key, source }
    if sgquery.isChange(change, "favorites") then refreshFavoriteBadges()
end sub
```

Stop with `sgquery.unobserveChanges()`.

## Checking when a screen opens

To show cached data immediately and still pick up anything new, query with `revalidate`:

```brightscript
promises.chain(sgquery.query("recordings", args, { revalidate: true }), m).then(function(value as dynamic, m as object) as dynamic
    drawRows(value)   ' the cached value, right away
    return invalid
end function)
' if the server's copy differs, the watcher above receives it
```

`revalidate` plus a watcher is the usual pair: the query draws the screen now, and the watcher redraws it if the check finds something.

## Coming back from the background

`sgquery.expireAll()` marks every cached value stale. Each one is served from the cache on its next query and refreshed in the background. See [Caching and freshness](caching.md#marking-everything-stale).

## Next

[Scopes and time buckets](scopes-and-buckets.md)
