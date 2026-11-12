# Event streams

Some endpoints keep the connection open and send events as they happen: live scores, a chat, a "now playing" feed, a job's progress. These are [server-sent events](https://html.spec.whatwg.org/multipage/server-sent-events.html) (SSE), the `text/event-stream` format a browser reads with `EventSource`. `sghttp.openEventStream` reads them on a Roku, one event at a time, without waiting for the connection to close.

**Event streams need Roku OS 16.0 or later**, which added native SSE support to `roUrlTransfer`. On an older device the stream fails at once with a clear error, so check `sghttp.supportsEventStreams()` first and fall back to polling where it's false.

## Opening a stream

```brightscript
sub watchScores()
    if not sghttp.supportsEventStreams() then
        pollScores()   ' Roku OS before 16.0
        return
    end if
    m.scores = sghttp.openEventStream("/games/{gameId}/live", {
        message: "onScoreEvent"
        error: "onScoreStreamError"
        closed: "onScoreStreamClosed"
    }, { gameId: m.top.gameId })
end sub

sub onScoreEvent(event as object)
    message = event.getData()   ' { type, id, data, retry, lastEventId }
    if message.type = "score" then
        score = parseJson(message.data)
        m.homeScore.text = score.home.toStr()
    end if
end sub

sub onScoreStreamError(event as object)
    error = event.getData()   ' { code, kind, message, willRetry, retryInMs, attempt, lastEventId }
    if not error.willRetry then m.liveBadge.visible = false
end sub

sub onScoreStreamClosed(event as object)
    m.scores = invalid
end sub

' When the screen closes
sghttp.closeEventStream(m.scores)
```

The stream goes through a [client](multiple-servers.md), the default one unless the spec names another, so it gets the client's `baseUrl`, shared headers, base headers and debugging proxy, just as `fetch` does. `{placeholders}` in the url, query and headers are filled from the args, then the scopes.

`openEventStream` returns an `EventStream` node right away; nothing is waited for. The handlers name functions in the calling component, called with the node's field events. Pass them to `openEventStream` rather than observing the fields afterwards: a stream that can't open (an unsupported device, a bad spec) fails during the call, before you could observe anything.

The stream runs on the client's [transport](transport.md) task, beside its requests, but never takes a slot in its pool: `maxConcurrent` requests can still be in flight while streams are open.

## What a stream delivers

| Field | When | Data |
|---|---|---|
| `message` | Each event | `{ type, id, data, retry, lastEventId }` |
| `open` | A connection's first event arrives | `{ attempt, lastEventId }` |
| `error` | A connection fails or ends | `{ code, kind, message, willRetry, retryInMs, attempt, lastEventId }` |
| `closed` | Once, when the stream is over | `{ reason, code, lastEventId }` |

The node also has `readyState` (`"connecting"`, `"open"` or `"closed"`, set before any of the fields above) and `lastEventId`.

A message's fields:

- **`type`** is the event's `event:` field, or `"message"` when the server named none.
- **`data`** is always text. Lines of a multi-line `data:` field are joined with a newline. Decode JSON yourself with `parseJson`.
- **`id`** is the event's own `id:` field, or `""` when it has none. **`lastEventId`** is the id the stream would resume from: the last id received, which an event without one leaves as it was.
- **`retry`** is the event's `retry:` field in milliseconds, or 0.

Comments (lines starting with `:`, often sent as keep-alives) are never delivered; Roku drops them.

A connection is reported `open` when its first event arrives, not when the server answers: Roku reports nothing before that. A server that answers and then sends nothing for a while keeps the stream at `"connecting"` until it does.

## Reconnecting

When the connection drops, or the server ends the stream, sgHttp opens a new one and sends the last event id in the `Last-Event-ID` header, so a server that supports it can send what was missed. Each disconnect sets `error` with `willRetry: true` and `retryInMs`, the wait before the next connection, so the app can show that the stream is catching up. Nothing is retried silently.

- **The wait** is the server's `retry:` interval if it sent one, else `retryMs` (default 3 seconds). While connections keep failing without an event, the wait doubles each time, up to a minute (a longer interval the server asks for stands). A `Retry-After` on a 429 or 503 is honoured.
- **What reconnects:** a dropped connection, no connection at all (offline, DNS, refused), a 429 or 5xx, and a clean end of the stream by the server.
- **What doesn't:** any other status (401, 403, 404...), and an answer that isn't `text/event-stream`. The same request would get the same answer, so the stream fails: `error` with `willRetry: false`, then `closed` with reason `"failed"`.
- **A 204** from the server means "stop": the stream is `closed` with reason `"done"`, without an error.
- **`maxReconnects`** limits reconnects in a row without an event; once they are used up, the stream fails. By default there is no limit.
- **`reconnect: false`** ends the stream at the first disconnect: `closed` with reason `"done"` when the server ended it, or `error` then `closed` with reason `"failed"` when it dropped.

A 401 fails the stream; it isn't held for [`onUnauthorized`](requests.md) as a request is. Renew the token with `setHeaders`, then open the stream again with the `lastEventId` it closed with. Every reconnect does send the client's current shared headers, so a token renewed while the stream is open is used from its next connection.

### Resuming later

A new stream sends no `Last-Event-ID`. To resume where an earlier one left off, say after the app restarts, keep the stream's `lastEventId` and pass it back:

```brightscript
m.feed = sghttp.openEventStream({ url: "/feed", lastEventId: m.savedFeedId }, { message: "onFeedEvent" })
```

### Silent connections

Roku never times out an event stream, and never reports the keep-alive comments a server sends, so a connection that has gone quiet looks the same as one that is waiting for news. To drop a connection after a quiet spell and reconnect, set `idleTimeout` in seconds. Set it well above the server's longest gap between real events, since keep-alives don't count; it's off by default.

## Closing

`sghttp.closeEventStream(stream)` cancels the connection and stops any reconnect. `closed` is set with reason `"closed"` during the call, and nothing is delivered after it, even an event already on its way. It returns whether the stream was still open. Close a screen's streams when the screen closes: a stream nobody closes stays open, and `sghttp.destroy` closes every stream still open.

## Settings

`openEventStream(spec, handlers, args)`. The spec is a url, or:

| Key | Default | Meaning |
|---|---|---|
| `url` | required | Relative to the client's `baseUrl`, or absolute |
| `headers` | `{}` | Added to the client's headers for this stream. `Accept: text/event-stream` is sent unless you set `Accept` |
| `query` | none | Query string parameters, as a request's |
| `client` | the default client | The client to connect through |
| `auth` | `true` | `false` leaves out the client's shared headers |
| `proxy` | `true` | `false` connects directly even when a debugging proxy is set |
| `lastEventId` | none | Sent as `Last-Event-ID` on the first connection |
| `reconnect` | `true` | `false` ends the stream at the first disconnect |
| `retryMs` | `3000` | Milliseconds before reconnecting, until the server sends a `retry:` |
| `maxReconnects` | no limit | Reconnects in a row without an event before the stream fails |
| `idleTimeout` | `0` (off) | Seconds without an event before the connection is dropped and reconnected |

`handlers` is `{ message, open, error, closed }`, each a function name in the calling component, and all optional.

## Errors

An `error`'s `kind` says what went wrong:

| `kind` | Meaning | `willRetry` |
|---|---|---|
| `offline`, `dns`, `tls`, `connection`, `network` | No answer: as for a [request](requests.md); `code` is negative | yes |
| `timeout` | No event for `idleTimeout` seconds | yes |
| `ended` | The server ended the stream (`code` 200) | yes |
| `http` | A status: a 429 or 5xx is retried, any other isn't | for 429 and 5xx |
| `notEventStream` | The server answered with something other than `text/event-stream` | no |
| `unsupported` | Roku OS before 16.0, or a transport without event streams | no |
| `invalid` | A spec that can't be sent: no url, a method other than `GET`, an unknown client | no |

With `maxReconnects` or `reconnect: false`, the last error of a stream is `willRetry: false` whatever its kind.

## Limits

- **GET only.** Roku documents its native support for `GET`; a spec with any other `method` fails with kind `invalid`. (A `POST` happened to stream on OS 16.0.4, but that isn't documented, so sgHttp doesn't rely on it.)
- **Not cached.** Events aren't stored or de-duplicated; a stream is separate from `fetch` and queries. To put an event's data in the cache, call [`set`](../reference/api.md#set) with it.
- **One rendezvous per update.** Each event is handed to the render thread in one call, as a request's answer is. A server sending hundreds of events a second keeps the render thread busy; such a feed is better batched by the server.
- **A replacement transport** has no event streams unless it has `openStream` and `closeStream` fields that do what the built-in one's do; without them, a stream on that client fails with kind `unsupported`.

## From a task

A Task of your own that already has an [HTTP client](tasks.md) can open streams on it, with an associative array that hears the updates:

```brightscript
listener = {
    onMessage: function(message as object)
        print "event "; message.type; ": "; message.data
    end function
    onError: function(error as object)
        print "stream error "; error.kind; " retry: "; error.willRetry
    end function
    onClosed: function(info as object)
        print "stream closed: "; info.reason
    end function
}
streamId = m.client.openEventStream("/feed", listener)
' ... later
m.client.closeEventStream(streamId)
```

The listener's `onOpen`, `onMessage`, `onError` and `onClosed` are each optional, and run in the task with the listener as `m`. They run from `client.handle`, so the task's loop must keep handing the client its messages; reconnects and idle timeouts are due when `client.nextWait()` says. A stream that can't open calls `onError` and `onClosed` during `openEventStream`, and `closeEventStream` calls `onClosed` before it returns. `m.client.eventStreamsSupported()` tells whether the device has native streams.

## Next

[Requests from a task](tasks.md)
