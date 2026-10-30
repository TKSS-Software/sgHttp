# Requests

Everything sgQuery does starts as a request: a url, a method, maybe headers and a body, sent from a task thread and answered with a promise. `request` sends one on its own, with no definition, no cache key and no freshness policy. It's the layer every query is built on, and for a one-off call to an endpoint, a probe of the server, or a request whose shape is only known at runtime, it's all you need.

```brightscript
promises.chain(sgquery.request({ url: "/heartbeat", method: "POST", body: { position: "{position}" } }, { position: 1230 }), m)
    .then(function(response as object, m as object) as dynamic
        print response.code, response.headers["X-Session"]
        return invalid
    end function).catch(function(error as object, m as object) as dynamic
        print "heartbeat failed: "; error.code
        return invalid
    end function)
```

Used this way, sgQuery is an HTTP client: a pooled, queued `roUrlTransfer` task with retries, timeouts, shared headers and JSON decoding, with promises back on the render thread. The query cache is there when you want it, and out of the way when you don't.

## The spec

The first argument is the request, in the same shape as a definition's `request` (see [Queries and keys](queries.md#filling-the-request-from-args)): `url`, `method`, `headers`, `body`, `query`, `parseJson` and `retries`. `{name}` placeholders are filled from the second argument, then from the current [scopes](scopes-and-buckets.md#scopes). A relative url is prefixed with the client's `baseUrl`.

The spec also takes the per-request settings a definition has:

| Key | Meaning |
|---|---|
| `client` | The client to send through, from `initialize({ clients })`. Default: the default client. |
| `auth: false` | Leave out the client's shared headers (see [`setHeaders`](../reference/api.md#setheaders)). |
| `proxy: false` | Send directly, even when a debugging proxy is set. |
| `timeout` | Seconds before the request is given up and retried. Default: the transport's. |
| `successCodes` | Statuses treated as success. Default: 200–299. |
| `parser` | A parser name to run the body through on the parser task. |
| `name` | A name for the [events](../reference/events-and-stats.md#events) this request emits. Default: `"request"`. |

## The response

The promise resolves with the transport's whole response, not just the body:

```brightscript
{ code: 200, headers: { ... }, body: <decoded JSON, or the raw text>, url: "https://...", ms: 84 }
```

`body` is JSON-decoded when the text parses as JSON, the raw string otherwise, or the parser's result when the spec names one. Set `parseJson: false` to always get the text.

On a status outside `successCodes` or a network failure, the promise rejects with the same shape, plus `message`: `code` is the HTTP status, or negative for a network error (see [Errors](../reference/events-and-stats.md#errors)). Retries and backoff happen before either, as for any query.

## What it doesn't do

A plain request is never cached, never de-duplicated, never persisted, and applies no `expires` or `invalidates`. Two identical calls send two requests. If something on the server changed as a result, say so yourself: `sgquery.expire("favorites")`.

If you find yourself calling `request` with the same spec from several places, that's a query: `define` it and `fetch` it, or make it a [mutation](mutations.md) if it writes. The next guide starts there.

## Next

[Queries and keys](queries.md)
