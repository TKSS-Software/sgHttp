# Mutations, expiry and invalidation

## Mutations

A **mutation** is a query with `cache: false`: a request that changes something on the server, or returns something that must not be reused, like a signed stream url. It runs through the same transport and parser as any other query, but its result is never stored, and two identical mutations are never merged into one request.

```brightscript
sgquery.define("favorites.add", {
    request: { url: "/favorites", method: "POST", body: { slug: "{slug}" } }
    cache: false
    expires: ["favorites"]
})
```

Run it with `mutate`:

```brightscript
promises.chain(sgquery.mutate("favorites.add", { slug: "abc" }), m).then(function(body as dynamic, m as object) as dynamic
    m.favoriteButton.text = "Remove from favorites"
    return invalid
end function).catch(function(error as object, m as object) as dynamic
    m.toast.text = "Couldn't add the favorite"
    return invalid
end function)
```

`mutate` resolves with the parsed response (or the decoded body when there's no parser). It rejects if the query is a cached one, so a call site that reads as a write can't quietly cache. `query` also runs `cache: false` queries; use it for per-call resources that aren't writes, such as a stream url. For a one-off call that isn't worth a definition, or where you need the status and headers, see [Requests](requests.md).

When a mutation succeeds, sgQuery applies the definition's `expires` and `invalidates` lists, and refreshes the expired entries that have a watcher (see [Refreshing what's on screen](keeping-data-fresh.md#refreshing-whats-on-screen)). Nothing is applied when it fails.

## Showing the change at once

A mutation takes a round trip, and the queries it expires are only refetched afterwards. For a change the user made and can see, that's a visible delay. Two tools close it.

**`set`** writes a value into the cache as if the server had just answered with it: fresh for the definition's `ttl`, delivered to every watcher of that query with `source: "local"`, and safe from any request that was already in flight (its callers still get their answer, but it doesn't overwrite the write). The disk copy is deleted, since it predates the change. `set` returns the previous value, and `set(name, args, invalid)` removes the entry.

```brightscript
sgquery.set("favorites.check", { model: "show", slug: "abc" }, { favorite: true })
```

**`optimistic` on `mutate`** does the writes for you, before the request, and undoes them if it fails:

```brightscript
promises.chain(sgquery.mutate("favorites.add", { slug: "abc" }, {
    optimistic: [{ name: "favorites.check", args: { model: "show", slug: "abc" }, value: { favorite: true } }]
}), m).catch(function(error as object, m as object) as dynamic
    m.toast.text = "Couldn't add the favorite"   ' the cache already shows it un-favorited again
    return invalid
end function)
```

Every screen watching `favorites.check` for that title flips at once; if the server says no, they flip back. A write is only undone if its value is still the one in the cache: a newer `set`, or a response that landed since, stays. On success the mutation's `expires` applies as usual, and the refresh it starts brings the server's confirmation to every screen watching those queries.

For a query with pages, `set` replaces the first page; the pages after it are kept when the first page's cursor is unchanged, as for a refresh (see [Pages](pagination.md)).

## Telling the cache what changed

After a write, some cached data is out of date. sgQuery has two ways to handle that.

### Expire

`sgquery.expire(name, args)` keeps the value but marks it out of date:

- `peek` and `{ revalidate: true }` queries still get the kept value at once.
- A plain query **waits for the server**. If that request fails, it resolves with the kept value.
- A disk copy saved before the expiry is not served.
- A request already in flight still answers its own callers, but its answer isn't stored and later queries don't join it.

This is what a mutation's `expires` list does, and it's usually the right choice. The screen behind a dialog can keep showing its data while the next screen that asks gets fresh data.

### Invalidate

`sgquery.invalidate(name, args)` drops the value from memory **and** disk. Use it when the old value must never be shown again, for example data that belonged to another account.

```brightscript
sgquery.invalidate("homePage", { slug: "main" })   ' one entry
sgquery.invalidate("homePage")                     ' every homePage entry, and homePage.* queries
sgquery.invalidate()                               ' everything, memory and disk
```

### Matching

Both match by name the same way:

| Call | Covers |
|---|---|
| `expire("favorites")` | every entry of `favorites`, `favorites.check`, `favorites.anything` |
| `expire("favorites", { slug: "abc" })` | the one `favorites` entry those args key to now (current scopes and time bucket) |

A mutation's lists take names only, so they cover whole queries and their descendants:

```brightscript
sgquery.define("profile.update", {
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
| Everything refreshed after a long time in the background, served from cache meanwhile | `expireAll()` |
| One screen to check for new data as it opens | `query(name, args, { revalidate: true })` |
| The change shown everywhere now, confirmed by the server later | `optimistic` on `mutate`, or `set` |
| The screens showing a query to get the server's latest now | `refresh(name)`, which a mutation's `expires` does for you |
| A profile or account switch | `setScope`, which drops that scope's entries for you (see [Scopes](scopes-and-buckets.md#scopes)) |

Neither expiry nor invalidation notifies watchers by itself. Watchers hear about a value only when a later request replaces it with different content (see [Keeping data fresh](keeping-data-fresh.md)); a mutation's `expires`, and `refresh`, start that request for the entries being watched.

## Next

[Keeping data fresh](keeping-data-fresh.md)
