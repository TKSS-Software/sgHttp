# Queries and keys

A **query** is a [request](requests.md) with a name: where it goes, how its response is parsed, and how long the result stays fresh. You register it once with `define`, then query it by name with args. Where `fetch` gives you the whole response and forgets it, `query` gives you the value and keeps it.

```brightscript
sghttp.define("episodes", {
    request: {
        url: "/shows/{showId}/seasons/{season}/episodes"
        query: { page: "{page}", limit: "50" }
    }
    parser: "EpisodesParser"
    ttl: 600
})

sghttp.query("episodes", { showId: "abc", season: 2, page: 1 })
' GET https://api.example.com/shows/abc/seasons/2/episodes?page=1&limit=50
```

## Naming queries

Query names are plain strings, and dots in them mean something. Every function that matches by name (`invalidate`, `expire`, a mutation's `expires` and `invalidates`) covers the name **and its dotted descendants**. `"favorites"` also covers `"favorites.check"` and `"favorites.add"`.

Use that to group related queries:

```brightscript
sghttp.define("favorites", { request: { url: "/favorites" } })
sghttp.define("favorites.check", { request: { url: "/favorites/{slug}" } })
sghttp.define("favorites.add", { request: { url: "/favorites", method: "POST", body: { slug: "{slug}" } }, cache: false, expires: ["favorites"] })

sghttp.expire("favorites")   ' expires favorites and favorites.check entries
```

Defining a name a second time replaces the first definition and prints a warning to the console.

## Filling the request from args

`{name}` placeholders in the request are filled from the query's args, then from the current scopes, by the same rules as `fetch`: see [Filling the request](requests.md#filling-the-request). Every arg is also part of the cache key, below.

## Cache keys

Every query of a cached query is stored under a **key** made of:

```
name | scope=value ... | bucket=N | args
```

- **name**: the query name.
- **scopes**: the current value of each scope the definition lists (see [Scopes](scopes-and-buckets.md#scopes)).
- **bucket**: the current time bucket, for definitions with `bucket` (see [Time buckets](scopes-and-buckets.md#time-buckets)).
- **args**: the args, serialized with associative array keys sorted, so `{ a: 1, b: 2 }` and `{ b: 2, a: 1 }` are the same key. A node in the args is keyed by its `id`.

Every arg is part of the key, including args the request doesn't use. Passing `{ showId: "abc", from: "home" }` and `{ showId: "abc" }` creates two entries, even though they send the same request. Only pass the args that identify the data.

## Next

[Caching and freshness](caching.md)
