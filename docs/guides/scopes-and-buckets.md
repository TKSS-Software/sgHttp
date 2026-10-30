# Scopes and time buckets

## Scopes

A **scope** is a named value that some queries depend on but that callers shouldn't have to pass every time: the active profile, the signed-in account, a region. Set it once; every query that lists it gets a separate cache entry per value, and can use it in its request.

```brightscript
sgquery.define("continueWatching", {
    request: { url: "/continue-watching", query: { profile_id: "{profile}" } }
    scopes: ["profile"]
})

sgquery.setScope("profile", "p-123")
sgquery.fetch("continueWatching")   ' GET /continue-watching?profile_id=p-123
```

### Changing a scope

When a scope changes from one value to another, every entry of every query that lists it is dropped, from memory and disk. A profile switch can never show the previous profile's rows:

```brightscript
sub onProfileSelected(profileId as string)
    sgquery.setScope("profile", profileId)
end sub
```

- Setting a scope for the first time drops nothing.
- Setting it to the value it already has drops nothing.
- `setScope(name, value, { keep: true })` changes the value without dropping anything. Entries for the old value stay cached and are used again if you switch back.
- Setting a scope to `invalid` clears it. A query parameter filled only by that scope is then dropped from the url (see [Query string](queries.md#query-string)), which suits values that only some users send.
- `sgquery.invalidateScope(name)` drops a scope's entries without changing its value.

Use strings for scope values. The comparison between the old and new value expects the same type.

### Scopes in requests

Placeholders are filled from args first, then scopes, so any `{name}` in the url, query, headers or body can come from a scope. A query that uses a scope in its request should also list it in `scopes`, so its cache entries are kept apart per value. A scope used only in the request isn't part of the key: after the scope changes, the cache would still serve the entry fetched with the old value.

Scopes can also hold app-wide constants that requests need, such as a brand or platform:

```brightscript
sgquery.setScope("platform", "roku")
sgquery.define("homePage", { request: { url: "/home/{slug}", query: { platform: "{platform}" } } })
```

## Time buckets

Some data is only valid for a window of time: "on now" in a guide, a schedule for the current hour. Setting `bucket` (seconds) adds `floor(now / bucket)` to the cache key, so the key changes when the window rolls over:

```brightscript
sgquery.define("guide.onNow", {
    request: { url: "/guide/on-now" }
    ttl: 60
    bucket: 1800   ' a new key every 30 minutes
})
```

- Within a window, the query caches and refreshes like any other, following its `ttl`.
- The first fetch after the window rolls over finds a new, empty key and waits for the server. The previous window's value isn't served.
- At that first fetch, the query's entries from earlier windows are dropped, in memory and on disk, since no fetch can reach them again. Entries with a request still in flight are dropped at the next rollover instead.

Windows are aligned to the Unix epoch in UTC: `bucket: 3600` rolls over on the hour, and `bucket: 1800` on the hour and half hour.

## Next

[Persistence](persistence.md)
