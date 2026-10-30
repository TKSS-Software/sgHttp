# Queries and keys

A **query** is a named description of a request: where it goes, how its response is parsed, and how long the result stays fresh. You register it once with `define`, then fetch it by name with args.

```brightscript
sgquery.define("episodes", {
    request: {
        url: "/shows/{showId}/seasons/{season}/episodes"
        query: { page: "{page}", limit: "50" }
    }
    parser: "EpisodesParser"
    ttl: 600
})

sgquery.fetch("episodes", { showId: "abc", season: 2, page: 1 })
' GET https://api.example.com/shows/abc/seasons/2/episodes?page=1&limit=50
```

## Naming queries

Query names are plain strings, and dots in them mean something. Every function that matches by name (`invalidate`, `expire`, a mutation's `expires` and `invalidates`) covers the name **and its dotted descendants**. `"favorites"` also covers `"favorites.check"` and `"favorites.add"`.

Use that to group related queries:

```brightscript
sgquery.define("favorites", { request: { url: "/favorites" } })
sgquery.define("favorites.check", { request: { url: "/favorites/{slug}" } })
sgquery.define("favorites.add", { request: { url: "/favorites", method: "POST", body: { slug: "{slug}" } }, cache: false, expires: ["favorites"] })

sgquery.expire("favorites")   ' expires favorites and favorites.check entries
```

Defining a name a second time replaces the first definition and prints a warning to the console.

## Filling the request from args

`{name}` placeholders anywhere in the request are filled from the fetch's args first, then from the current [scopes](scopes-and-buckets.md). Strings, numbers and booleans fill a placeholder. Arrays, associative arrays and nodes don't.

### Url

```brightscript
request: { url: "/shows/{showId}" }
```

A relative url is prefixed with the client's `baseUrl`. A url starting with `http` is used as is. If a placeholder in the url is left unfilled, sgQuery still sends the request (it usually reaches some other route) and prints a warning: `[sgquery] "show" url has an unfilled placeholder: /shows/{showId}`.

### Query string

```brightscript
request: {
    url: "/search"
    query: { q: "{term}", profile_id: "{profile}", sort: "relevance", genre: "{genres}" }
}
```

- A parameter whose value is a `{placeholder}` is **dropped** when no arg or scope fills it, or when it fills to an empty string. This is how optional parameters work: `profile_id` above disappears when no profile scope is set.
- Literal values in the definition (`sort: "relevance"`) are always sent.
- An array value repeats the parameter: `?genre=drama&genre=comedy`. That happens either with an array literal in the definition, or with a value of exactly `"{name}"` whose arg is an array. An empty array drops the parameter.
- Names and values are url-escaped by the transport.

### Headers

```brightscript
request: { url: "/stream/{id}", headers: { "X-Device-Id": "{deviceId}" } }
```

Header values are filled the same way. Headers shared by every request (auth tokens) belong on the client instead; see [`setHeaders`](../reference/api.md#setheaders).

### Body

```brightscript
' An associative array: its string values are filled, then it is sent as JSON
request: { url: "/favorites", method: "POST", body: { slug: "{slug}", source: "home" } }

' A string of exactly "{name}" passes that arg through untouched, objects and arrays included
request: { url: "/progress", method: "PUT", body: "{progress}" }

' Any other string is filled as text
request: { url: "/search", method: "POST", body: "q={term}" }
```

An associative array or array body is sent as JSON, with `Content-Type: application/json` unless the request sets its own. Only the top-level string values of an associative array body are filled; nested objects are sent as they are.

### Method and decoding

`method` defaults to `GET`. `GET` and `HEAD` are sent as such. Any other method (`POST`, `PUT`, `PATCH`, `DELETE`) is sent with the body, or an empty body if there isn't one.

Successful responses are JSON-decoded on the transport task. A body that isn't JSON stays a string. Set `parseJson: false` in the request to always get the raw text.

## Cache keys

Every fetch of a cached query is stored under a **key** made of:

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
