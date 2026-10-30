# Query definitions

The object passed to [`define`](api.md#define). Only `request` is required.

```brightscript
sgquery.define("episodes", {
    request: {
        url: "/shows/{showId}/episodes"
        query: { season: "{season}", profile_id: "{profile}" }
    }
    parser: "EpisodesParser"
    ttl: 600
    persist: true
    scopes: ["profile"]
})
```

## Request

| Key | Default | Meaning |
|---|---|---|
| `request.url` | none | Relative to the client's `baseUrl`, or absolute when it starts with `http`. `{placeholders}` are filled from args, then scopes. |
| `request.method` | `"GET"` | Any HTTP method |
| `request.query` | none | Query parameters. A `{placeholder}` value with nothing to fill it is dropped; arrays repeat the parameter. |
| `request.headers` | none | Headers for this query, filled like the url |
| `request.body` | none | An associative array or array (sent as JSON), or a string. `"{name}"` alone passes an arg through as is. |
| `request.parseJson` | `true` | `false` keeps the raw response text |
| `request.retries` | the client's | Retries for network failures and 5xx |

See [Filling the request from args](../guides/queries.md#filling-the-request-from-args) for the exact rules.

## Caching

| Key | Default | Meaning |
|---|---|---|
| `cache` | `true` | `false` for mutations and per-call resources: the request runs and parses, but is never stored or shared |
| `ttl` | `initialize`'s `defaultTtl` (300) | Seconds a value stays fresh. Negative: until expired, invalidated or `expireAll`. |
| `staleWhileRevalidate` | `true` | Serve a stale value at once and refresh in the background. `false`: a query of a stale value waits for the server. |
| `scopes` | `[]` | Scope names that join the cache key. See [Scopes](../guides/scopes-and-buckets.md#scopes). |
| `bucket` | none | Seconds. `floor(now / bucket)` joins the key; earlier buckets are dropped when it rolls over. See [Time buckets](../guides/scopes-and-buckets.md#time-buckets). |
| `persist` | `false` | Save the raw body to `cachefs:/` and serve it when memory has nothing. See [Persistence](../guides/persistence.md). |

## Parsing and change detection

| Key | Default | Meaning |
|---|---|---|
| `parser` | none | Name passed to your parser task's `getParser`. Without one, the value is the decoded body. |
| `compare` | `"body"` | `"parsed"` also compares the parsed value when the body differs, for responses with volatile fields. See [`compare: "parsed"`](../guides/keeping-data-fresh.md#responses-with-volatile-fields-compare-parsed). |
| `conditional` | `false` | Send the cached `ETag` / `Last-Modified` back; a `304` renews the entry |

## Mutations

| Key | Default | Meaning |
|---|---|---|
| `expires` | `[]` | Query names [expired](../guides/mutations.md#expire) after a `cache: false` request succeeds. Each covers its dotted descendants. |
| `invalidates` | `[]` | Query names [invalidated](../guides/mutations.md#invalidate) (memory and disk) after a `cache: false` request succeeds |

## Transport

| Key | Default | Meaning |
|---|---|---|
| `client` | the default client | Name of a client from `initialize({ clients })`. See [More than one server](../guides/multiple-servers.md). |
| `auth` | `true` | `false` leaves the client's shared headers out of this query's requests. `baseHeaders` are still sent. |
| `proxy` | `true` | `false` sends this query's requests directly, even when a debugging proxy is set |
| `timeout` | the client's (30) | Seconds before a request with no answer is given up, and retried if it has retries left |
| `successCodes` | 200 to 299 | Array of HTTP statuses that count as success |
