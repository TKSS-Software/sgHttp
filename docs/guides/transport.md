# The transport

The transport sends the requests. Each client has its own, and the store starts it once the client's settings are set.

## The built-in transport

The default `Transport` is a Task with:

- **A bounded pool** of `roUrlTransfer` objects (`maxConcurrent`, default 4). Requests beyond that wait in a first-in, first-out queue.
- **gzip and HTTPS**, using the Roku's certificate bundle.
- **JSON decoding** of successful responses on the task thread. A body that will go to a [parser](parsers.md) is left as text, and the parser task decodes it.
- **Body hashing** (MD5) of responses to cached queries, so the cache can [tell when a payload hasn't changed](keeping-data-fresh.md).
- **Retries** on network failures and `429` and 5xx responses. If the answer has a `Retry-After` header (seconds or an HTTP date), the transport waits that long; otherwise it backs off exponentially (1 s, 2 s, 4 s, ...). If `Retry-After` asks for more than 60 seconds, the request fails at once rather than keep its callers waiting. A `POST` answered with `502` is never retried, because the gateway may have passed it on, and repeating it could apply the change twice. A `429` is retried for any method, because the server rejected the request before handling it.
- **A hard timeout** per request (`timeout`, default 30 seconds). A request with no complete answer in that time fails, and is retried if it has retries left.
- **HTTP/2** when asked for (`httpVersion: "http2"`), on firmware that supports it. Other firmware ignores the setting.

### Settings

Set these at the top level of `initialize` for the default client, or per client under `clients`:

| Setting | Default | Meaning |
|---|---|---|
| `baseUrl` | none | Prefix for request urls that don't start with `http` |
| `headers` | `{}` | Shared headers, sent unless a definition sets `auth: false`. Change them later with `setHeaders`. |
| `baseHeaders` | `{}` | Headers sent with every request, even one with `auth: false`. Read when the transport starts. |
| `maxConcurrent` | 4 | How many requests can be in flight at once |
| `timeout` | 30 | Seconds before a request is given up |
| `retries` | 1 | Retries for network failures, 429 and 5xx responses |
| `httpVersion` | `""` | `"http2"` to request HTTP/2 |
| `proxy` | `""` | A debugging proxy as `host:port`; see [Debugging](debugging.md#routing-traffic-through-a-proxy) |

Per query, `timeout` and `request.retries` override the client's values, and `successCodes` changes which statuses count as success (by default 200 to 299).

## Replacing the transport

Any node can be a transport if its interface has a `makeRequest` function that takes a request spec and returns a [promise](https://github.com/rokucommunity/promises) node:

```brightscript
sghttp.initialize({ transport: myTransport })                      ' the default client
sghttp.initialize({ clients: { partner: { transport: partnerTransport } } })
```

The store calls `makeRequest(spec)` on the render thread. The spec is:

| Field | Meaning |
|---|---|
| `url` | Filled url, relative or absolute. The query string is not yet appended. |
| `method` | `GET`, `POST`, ... |
| `headers` | The request's own headers, filled. Shared headers are not included; see below. |
| `body` | Filled body: a string, associative array, array or `invalid` |
| `query` | Filled query parameters, `{ name: value or array }` |
| `parseJson` | Whether to JSON-decode a successful body |
| `successCodes` | Array of success statuses, or `invalid` for 200 to 299 |
| `retries` | Retries for this request, or `invalid` for the transport's own |
| `timeoutSeconds` | Timeout for this request, or `invalid` |
| `includeSharedHeaders` | `false` when the definition sets `auth: false` |
| `useProxy` | `false` when the definition sets `proxy: false` |
| `hashBody` | `true` when the store wants `bodyHash` back |
| `allowNotModified` | `true` when the request carries conditional headers |
| `keepRawBody` | `true` when the store will write the body to disk |

Resolve the promise with `{ code, body, headers, url, ms }` for a success, or reject it with at least `{ code, message }` for a failure. To keep the cache's change detection working:

- Set `bodyHash` (any stable hash of the raw body) when `spec.hashBody` is true. Without it, every refresh counts as a change.
- Set `rawBody` to the body's text when `spec.keepRawBody` is true. Without it, the store encodes the decoded body again before writing it.
- Resolve a `304` with `{ notModified: true }` when `spec.allowNotModified` is true.

The store sets `baseUrl`, `headers`, `baseHeaders`, `proxy`, `maxConcurrent`, `timeoutSeconds`, `retries` and `httpVersion` on a replacement only where it has a field with that name. Shared headers reach the transport through its `headers` field, at `initialize` and on every `setHeaders`. If it has no such field, it never receives them. If a replacement has an `activeRequests` integer field, `getStats().clients` reports it.

The store doesn't start a replacement. If it's a Task, start it yourself.

## Next

[Debugging](debugging.md)
