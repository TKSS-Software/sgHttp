# The transport

The transport sends requests. Each client gets its own, started by the store once its settings are in.

## The built-in transport

The default `Transport` is a Task with:

- **A bounded pool** of `roUrlTransfer` objects (`maxConcurrent`, default 4). Requests beyond that wait in a first-in, first-out queue.
- **gzip** and HTTPS using the Roku's certificate bundle.
- **JSON decoding** of successful responses, on the task thread. A body bound for a [parser](parsers.md) is left as text for the parser task to decode.
- **Body hashing** (MD5) of cached queries' responses, for [unchanged-payload detection](keeping-data-fresh.md).
- **Retries** on network failures, `429` and 5xx responses, after the wait the answer's `Retry-After` header asks for (seconds or an HTTP date), else with exponential backoff (1 s, 2 s, 4 s, ...). A `Retry-After` of more than 60 seconds fails the request at once instead of holding its callers. A `POST` answered with `502` is never retried, because the gateway may have passed it on and repeating it could apply the change twice. A `429` is retried for any method: the server turned it away before handling it.
- **A hard timeout** per request (`timeout`, default 30 seconds). A request with no complete answer in that time fails, and is retried if it has retries left.
- **Optional HTTP/2** (`httpVersion: "http2"`) where the firmware supports it. It's ignored on firmware that doesn't.

### Settings

Set these at the top level of `initialize` for the default client, or per client under `clients`:

| Setting | Default | Meaning |
|---|---|---|
| `baseUrl` | none | Prefix for request urls that don't start with `http` |
| `headers` | `{}` | Shared headers, sent unless a definition sets `auth: false`. Change them later with `setHeaders`. |
| `baseHeaders` | `{}` | Headers sent with every request without exception. Read when the transport starts. |
| `maxConcurrent` | 4 | Requests in flight at once |
| `timeout` | 30 | Seconds before a request is given up |
| `retries` | 1 | Retries for network failures, 429 and 5xx responses |
| `httpVersion` | `""` | `"http2"` to request HTTP/2 |
| `proxy` | `""` | A debugging proxy as `host:port`; see [Debugging](debugging.md#routing-traffic-through-a-proxy) |

Per query, `timeout` and `request.retries` override the client's values, and `successCodes` changes which statuses count as success (by default 200 to 299).

## Replacing the transport

Any node can be the transport if it has a `makeRequest` function on its interface that takes a request spec and returns a [promise](https://github.com/rokucommunity/promises) node:

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

Resolve the promise with `{ code, body, headers, url, ms }` for a success, or reject it with at least `{ code, message }` for a failure. To keep the cache's change detection:

- Set `bodyHash` (any stable hash of the raw body) when `spec.hashBody` is true. Without it, every refresh counts as a change.
- Resolve a `304` with `{ notModified: true }` when `spec.allowNotModified` is true.

The store sets `baseUrl`, `headers`, `baseHeaders`, `proxy`, `maxConcurrent`, `timeoutSeconds`, `retries` and `httpVersion` on a replacement only if it has fields with those names. Shared headers reach the transport through its `headers` field, both at `initialize` and on every `setHeaders`. If it has no such field, it never sees them. A replacement that also has an `activeRequests` integer field has it reported in `getStats().clients`.

A replacement isn't started by the store. If it's a Task, start it yourself.

## Next

[Debugging](debugging.md)
