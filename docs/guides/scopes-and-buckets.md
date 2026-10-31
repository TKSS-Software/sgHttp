# Scopes and time buckets

## Scopes

A **scope** is a named value that some queries depend on but that callers shouldn't have to pass every time: the active profile, the signed-in account, a region. You set it once. Every query that lists the scope keeps a separate cache entry for each value, and can use the value in its request.

```brightscript
sghttp.define("continueWatching", {
    request: { url: "/continue-watching", query: { profile_id: "{profile}" } }
    scopes: ["profile"]
})

sghttp.setScope("profile", "p-123")
sghttp.query("continueWatching")   ' GET /continue-watching?profile_id=p-123
```

### Changing a scope

When a scope changes from one value to another, sgHttp drops every entry of every query that lists it, in memory and on disk. After a profile switch, the previous profile's rows are never returned:

```brightscript
sub onProfileSelected(profileId as string)
    sghttp.setScope("profile", profileId)
end sub
```

- Setting a scope for the first time drops nothing.
- Setting it to the value it already has drops nothing.
- `setScope(name, value, { keep: true })` changes the value without dropping anything. Entries for the old value stay cached and are used again if you switch back.
- Setting a scope to `invalid` clears it, and drops its entries like any other change of value. A query parameter filled only by that scope is then left out of the url, which suits values that only some users send.
- `sghttp.invalidateScope(name)` drops a scope's entries without changing its value.

Use strings for scope values. sgHttp compares the old value with the new one, and the comparison expects both to be the same type.

### Scopes in requests

Placeholders are filled from args first, then scopes, so any `{name}` in the url, query, headers or body can come from a scope. A query that uses a scope in its request should also list it in `scopes`, so its cache entries are kept apart per value. If the scope is used only in the request, it isn't part of the key, and after it changes the cache still returns the entry fetched with the old value.

Scopes can also hold app-wide constants that requests need, such as a brand or platform:

```brightscript
sghttp.setScope("platform", "roku")
sghttp.define("homePage", { request: { url: "/home/{slug}", query: { platform: "{platform}" } } })
```

## Time buckets

Some data is only valid for a window of time: "on now" in a guide, a schedule for the current hour. With `bucket` set (in seconds), sgHttp adds `floor(now / bucket)` to the cache key, so the key changes when the window rolls over:

```brightscript
sghttp.define("guide.onNow", {
    request: { url: "/guide/on-now" }
    ttl: 60
    bucket: 1800   ' a new key every 30 minutes
})
```

- Within a window, the query caches and refreshes like any other, following its `ttl`.
- The first query after the window rolls over uses a new, empty key and waits for the server. The previous window's value isn't returned.
- That first query also drops the entries from earlier windows, in memory and on disk, since no query can reach them again. An entry with a request still in flight is dropped at the next rollover instead.

Windows are aligned to the Unix epoch in UTC: `bucket: 3600` rolls over on the hour, and `bucket: 1800` on the hour and half hour.

## Next

[Persistence](persistence.md)
