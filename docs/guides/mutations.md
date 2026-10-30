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

`mutate` resolves with the parsed response (or the decoded body when there's no parser). It rejects if the query is a cached one, so a call site that reads as a write can't quietly cache. `fetch` also runs `cache: false` queries; use it for per-call resources that aren't writes, such as a stream url. For a one-off call that isn't worth a definition, or where you need the status and headers, see [Requests](requests.md).

When a mutation succeeds, sgQuery applies the definition's `expires` and `invalidates` lists. Nothing is applied when it fails.

## Telling the cache what changed

After a write, some cached data is out of date. sgQuery has two ways to handle that.

### Expire

`sgquery.expire(name, args)` keeps the value but marks it out of date:

- `peek` and `{ revalidate: true }` fetches still get the kept value at once.
- A plain fetch **waits for the server**. If that request fails, it resolves with the kept value.
- A disk copy saved before the expiry is not served.
- A request already in flight still answers its own callers, but its answer isn't stored and later fetches don't join it.

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
| One screen to check for new data as it opens | `fetch(name, args, { revalidate: true })` |
| A profile or account switch | `setScope`, which drops that scope's entries for you (see [Scopes](scopes-and-buckets.md#scopes)) |

Neither expiry nor invalidation notifies watchers. Watchers hear about a value only when a later request replaces it with different content (see [Keeping data fresh](keeping-data-fresh.md)).

## Next

[Keeping data fresh](keeping-data-fresh.md)
