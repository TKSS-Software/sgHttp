# Events, stats and errors

## Cache events

Delivered to [`observeEvents`](api.md#observeevents) callbacks as `event.getData()`. The store's `lastEvent` field holds the latest one.

| Field | Type | Meaning |
|---|---|---|
| `type` | string | `hit`, `stale`, `dedupe`, `resolve`, `unchanged` or `error` |
| `name` | string | Query name |
| `key` | string | Cache key; `""` for `cache: false` queries |
| `source` | string | `memory`, `disk` or `network` |
| `ms` | integer | Time from the start of the request to this event; `0` for answers from memory |
| `client` | string | The query's client; `"default"` for the top-level one |
| `code` | integer | Errors only. See [Errors](#errors). |
| `auth` | boolean | Errors only. Whether the request sent the client's shared headers (the definition didn't set `auth: false`). |

| `type` | Emitted when |
|---|---|
| `hit` | A fresh value is served from memory |
| `stale` | A cached value is served and a background refresh starts: a stale value, or any value fetched with `revalidate` |
| `dedupe` | A query joins a request already in flight |
| `resolve` | A value arrives from the network or disk (or a `cache: false` query succeeds) |
| `unchanged` | A response matches the cached value (same body hash, same parsed hash, or `304`) and the entry is renewed |
| `error` | A request or parse fails, including background refreshes and mutations |

A query whose name was never defined rejects without an event.

## Change events

Delivered to [`watch`](api.md#watch) callbacks as `{ name, key, source, value }` and to [`observeChanges`](api.md#observechanges) callbacks as `{ name, key, source }`. Sent when a cached value is replaced by different content. Never sent for a first value, an unchanged response, an expiry or an invalidation.

## Stats

Returned by [`getStats`](api.md#getstats). Counters run from `initialize`.

| Field | Meaning |
|---|---|
| `hits` | Queries answered by a fresh value in memory |
| `staleHits` | Queries answered by a cached value while a background refresh ran |
| `misses` | Queries that had to wait: nothing in memory, a stale value without `staleWhileRevalidate`, an expired value, or `force` |
| `diskHits` | Values served from `cachefs:/` |
| `requests` | Requests sent, including background refreshes and mutations |
| `errors` | Failed requests and parses |
| `unchanged` | Responses that matched the cached value |
| `changes` | Cached values replaced by different content |
| `entries` | Entries in memory now, including ones waiting on a request |
| `watchers` | Live watches |
| `clients.<name>.requests` | Requests sent through that client |
| `clients.<name>.errors` | Errors from that client's queries |
| `clients.<name>.active` | Requests in flight on that client's transport now |

## Errors

A rejected `fetch`, `query` or `mutate` promise carries one of these:

**An HTTP failure** (a status outside `successCodes`), straight from the transport:

```brightscript
{ code: 404, body: "<raw response text>", headers: { ... }, url: "https://...", ms: 120, message: "..." }
```

**A network failure**, also from the transport. `code` is negative: the error `roUrlTransfer` reports, such as `-28` for a timeout, or `-1` when the request couldn't be started.

**A parse failure:**

```brightscript
{ message: "sgquery parser \"ShowParser\" threw: ...", error: <the exception> }
```

**A setup problem**: an unknown parser, a parser with no `parserTask`, a client that doesn't exist, an undefined query, or `mutate` on a cached query. These carry a `message`, and `code: 0` where a code applies.

In error events, `code` is the error's `code`, or `0` when it has none.
