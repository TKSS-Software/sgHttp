# Mutations, expiry and invalidation

## Mutations

A **mutation** is a query with `cache: false`. Use one for a request that changes something on the server, or that returns something that must not be reused, like a signed stream url. It runs through the same transport and parser as any other query, but its result is never stored, and two identical mutations are never merged into one request.

```brightscript
sghttp.define("favorites.add", {
    request: { url: "/favorites", method: "POST", body: { slug: "{slug}" } }
    cache: false
    expires: ["favorites"]
})
```

Run it with `mutate`:

```brightscript
promises.chain(sghttp.mutate("favorites.add", { slug: "abc" }), m).then(function(body as dynamic, m as object) as dynamic
    m.favoriteButton.text = "Remove from favorites"
    return invalid
end function).catch(function(error as object, m as object) as dynamic
    m.toast.text = "Couldn't add the favorite"
    return invalid
end function)
```

`mutate` resolves with the parsed response (or the decoded body when there's no parser). It rejects if the query is a cached one, so a call written as a mutation can never cache a result by mistake. `query` runs `cache: false` queries too. Use it for things that are fetched fresh on every call but aren't writes, such as a stream url. For a one-off call that isn't worth a definition, or where you need the status and headers, see [Requests](requests.md).

When a mutation succeeds, sgHttp applies the definition's `expires` and `invalidates` lists, and refreshes the expired entries that have a watcher (see [Refreshing what's on screen](keeping-data-fresh.md#refreshing-whats-on-screen)). Nothing is applied when it fails.

## Showing the change at once

A mutation takes a round trip to the server, and the queries it expires are only refetched after it completes. When the user made the change and is looking at the data it affects, that round trip is a visible delay. sgHttp has two ways to show the change before the server confirms it.

**`set`** writes a value into the cache as if the server had just answered with it. The value is fresh for the definition's `ttl`, and every watcher of that query receives it with `source: "local"`. A request that was already in flight can't overwrite it: its callers still get their answer, but the cache keeps the value you wrote. The disk copy is deleted, since it predates the change. `set` returns the previous value, and `set(name, args, invalid)` removes the entry.

```brightscript
sghttp.set("favorites.check", { model: "show", slug: "abc" }, { favorite: true })
```

**`optimistic` on `mutate`** makes those writes for you before the request is sent, and undoes them if it fails:

```brightscript
promises.chain(sghttp.mutate("favorites.add", { slug: "abc" }, {
    optimistic: [{ name: "favorites.check", args: { model: "show", slug: "abc" }, value: { favorite: true } }]
}), m).catch(function(error as object, m as object) as dynamic
    m.toast.text = "Couldn't add the favorite"   ' the cache already shows it un-favorited again
    return invalid
end function)
```

Every screen watching `favorites.check` for that title shows it as a favorite at once, and shows it as not a favorite again if the server rejects the request. A write is only undone if its value is still the one in the cache; a newer `set`, or a response that arrived since, is left in place. On success, the mutation's `expires` applies as usual, and the refresh it starts brings the server's confirmation to every screen watching those queries.

For a query with pages, `set` replaces the first page. The pages after it are kept if the first page's cursor is unchanged, just as on a refresh (see [Pages](pagination.md)).

## Telling the cache what changed

After a write, some cached data is out of date. sgHttp has two ways to handle that.

### Expire

`sghttp.expire(name, args)` keeps the value but marks it out of date:

- `peek` and `{ revalidate: true }` queries still get the kept value at once.
- A plain query **waits for the server**. If that request fails, it resolves with the kept value.
- A disk copy saved before the expiry is not returned.
- A request already in flight still answers its own callers, but its answer isn't stored, and later queries don't join it.

This is what a mutation's `expires` list does, and it's usually the right choice. A screen that is already open, for example behind a dialog, keeps showing its data, while the next screen that queries the data gets a fresh copy.

### Invalidate

`sghttp.invalidate(name, args)` drops the value from memory **and** disk. Use it when the old value must never be shown again, for example data that belonged to another account.

```brightscript
sghttp.invalidate("homePage", { slug: "main" })   ' one entry
sghttp.invalidate("homePage")                     ' every homePage entry, and homePage.* queries
sghttp.invalidate()                               ' everything, memory and disk
```

### Matching

Both match by name the same way:

| Call | Covers |
|---|---|
| `expire("favorites")` | every entry of `favorites`, `favorites.check`, `favorites.anything` |
| `expire("favorites", { slug: "abc" })` | the one `favorites` entry those args key to now (current scopes and time bucket) |

A mutation's lists take names only, so they cover whole queries and their descendants:

```brightscript
sghttp.define("profile.update", {
    request: { url: "/profile", method: "PATCH", body: "{changes}" }
    cache: false
    expires: ["profile", "homePage"]   ' refetch these when next asked
    invalidates: ["recommendations"]   ' never show these again
})
```

## Choosing

| You want | Use |
|---|---|
| The next screen to get fresh data, but what's on screen now can stay | `expire`, or `expires: [...]` on the mutation |
| The old data gone everywhere, including disk | `invalidate`, or `invalidates: [...]` |
| Everything refreshed after a long time in the background, with cached data shown meanwhile | `expireAll()` then `refresh()` |
| One screen to check for new data as it opens | `query(name, args, { revalidate: true })` |
| The change shown everywhere now, confirmed by the server later | `optimistic` on `mutate`, or `set` |
| The screens showing a query to get the server's latest now | `refresh(name)`, which a mutation's `expires` does for you |
| A profile or account switch | `setScope`, which drops that scope's entries for you (see [Scopes](scopes-and-buckets.md#scopes)) |

Neither expiry nor invalidation notifies watchers by itself. Watchers hear about a value when a later request replaces it with different content, or when `set` writes one (see [Keeping data fresh](keeping-data-fresh.md)). A mutation's `expires` and `refresh` both start that request for the entries being watched.

## Next

[Keeping data fresh](keeping-data-fresh.md)
