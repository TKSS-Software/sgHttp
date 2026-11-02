# Requests from a task

**Use `sghttp.fetch` from your components; that's the recommended way to use sgHttp.** It needs no Task of your own, its requests share one pool with the query cache's, and it has everything on the render thread: shared headers with `setHeaders`, token renewal with `onUnauthorized`, events, stats and parsers.

This page is for the exception: code that **already runs in a Task of yours**, such as a background sync or a task that builds a whole screen's data, and needs to make HTTP requests from there. Calling `sghttp.fetch` from a task would cross to the render thread and back for every request. Instead, the task can make its own **HTTP client** with `sghttp.createHttpClient`. It's the engine the [built-in transport](transport.md) runs on, with the same pool, priorities, retries, timeouts, downloads and failure `kind`s, and it takes the same requests as `fetch`. Nothing crosses to another thread: each request is sent, answered and decoded in your task.

Don't create a Task only to use this. If you don't already have a task, use `sghttp.fetch`.

## Setting it up

A task makes the client once, on its own message port, and runs a loop that hands the client every message. Promises work in a task through the [promises library's task support](https://github.com/rokucommunity/promises#promises-in-tasks): register the port with `promises.setMessagePort`, and wait with `promises.wait2` instead of `wait`.

```brightscript
' components/SyncTask.bs
import "pkg:/source/roku_modules/promises/promises.brs"
import "pkg:/source/roku_modules/sghttp/client.brs"

sub init()
    m.top.functionName = "runTask"
end sub

sub runTask()
    port = createObject("roMessagePort")
    promises.setMessagePort(port)
    m.client = sghttp.createHttpClient({ baseUrl: "https://api.example.com", headers: m.top.headers }, port)

    promises.chain(m.client.fetch("/home/main"), m).then(function(response as object, m as object) as dynamic
        m.top.result = response.body
        return invalid
    end function).catch(function(error as object, m as object) as dynamic
        print "home failed: "; error.code; " "; error.kind
        return invalid
    end function)

    while true
        message = promises.wait2(m.client.nextWait(), port)
        m.client.handle(message)
    end while
end sub
```

- **`handle(message)`** must see every message, including `invalid` when the wait times out: that's when a retry that's due is sent. It returns whether the message was one of the client's, so the loop can deal with its own messages too, such as field changes it observes.
- **`nextWait()`** is how long the wait may last: until the next retry is due, or `0` (no limit) when none is waiting.
- The client creates `roUrlTransfer` objects as requests need them, up to `maxConcurrent`. A client that's made but never used costs nothing.

## Settings

`sghttp.createHttpClient(settings, port)` takes the same settings as a [client](multiple-servers.md), minus `transport`:

| Setting | Default | Meaning |
|---|---|---|
| `baseUrl` | none | Prefix for request urls that don't start with `http` |
| `headers` | `{}` | Shared headers, sent unless a request sets `auth: false` |
| `baseHeaders` | `{}` | Headers sent with every request |
| `maxConcurrent` | 4 | Requests in flight at once |
| `timeout` | 30 | Seconds before a request is given up |
| `retries` | 1 | Retries for network failures, 429 and 5xx (a `POST` or `PATCH` as described under [Retries](transport.md#the-built-in-transport)) |
| `httpVersion` | `""` | `"http2"` to request HTTP/2 |
| `proxy` | `""` | A debugging proxy as `host:port` |

`port` is the port your loop waits on. Without one, the client makes its own, returned by `getPort()`.

To change the shared headers later, for a new token, set them on the client: `m.client.headers = { Authorization: "Bearer " + token }`.

## Sending

`fetch(spec, args)` takes what [`sghttp.fetch`](requests.md) takes, and returns a promise for the same response:

```brightscript
m.client.fetch("/shows/abc")
m.client.fetch({ url: "/shows/{id}/favorite", method: "POST", body: { note: "{note}" } }, { id: "abc", note: "later" })
m.client.fetch({ url: "/graphql", graphql: { query: SHOW_QUERY, variables: { id: "{id}" } } }, { id: "pilot" })
m.client.fetch({ url: "{fontUrl}", toFile: "cachefs:/font.ttf", auth: false }, { fontUrl: fontUrl })
```

Placeholders, query strings, form bodies, `auth`, `proxy`, `timeout`, `retries`, `successCodes`, `priority`, GraphQL and `toFile` all work as described in [Requests](requests.md). The response, and the error a failure rejects with, are the same too: `{ code, headers, body, url, ms }`, plus `message` and `kind` on a failure, `errors` for GraphQL, and `path` for a download.

Three things work differently, because they belong to the render thread:

- **No scopes.** Placeholders are filled from `args` only.
- **No parser.** The body is already in your task, so parse it there. A spec with `parser` rejects.
- **No query names.** `fetch("homePage")` sends a defined query on the render thread only.

## Cancelling and priorities

Both take the promise `fetch` returned:

```brightscript
search = m.client.fetch({ url: "/search", query: { q: "{q}" }, priority: "low" }, { q: term })
m.client.promote(search, "high")    ' a waiting request moves up
m.client.cancel(search)             ' dropped if waiting, aborted if in flight
```

A cancelled request rejects with `{ cancelled: true, kind: "cancelled" }`, as with [`sghttp.cancel`](requests.md#cancelling-a-request). Unlike `sghttp.cancel`, the client's `cancel` aborts a request in flight whatever its method. For a write the server may already have acted on, pass `true` as the second argument: `cancel(promise, true)` only drops a request that's still waiting.

## What it doesn't do

The client is the HTTP layer only. These stay on the render thread, in the store:

- **The query cache:** `define`, `query`, persistence and watchers.
- **Events and stats:** a task client's requests don't reach `observeEvents` or `getStats`.
- **`setHeaders` and `onUnauthorized`:** the client's headers are its own. Pass the current token in when the task starts, and set `headers` when it changes.

Each task client has its own pool, separate from the transport's. A task's requests don't wait behind the screens' requests, and the screens' requests don't wait behind the task's.

## Next

[Debugging](debugging.md)
