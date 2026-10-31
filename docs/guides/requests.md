# Requests

`fetch` sends one request and gives you the response. It's the core of sgHttp, and a complete HTTP client on its own: you don't have to define, cache or configure anything beyond, at most, a `baseUrl`. This guide covers every part of a request.

```brightscript
promises.chain(sghttp.fetch("/shows/abc"), m).then(function(response as object, m as object) as dynamic
    print response.code, response.body.title
    return invalid
end function).catch(function(error as object, m as object) as dynamic
    print "failed: "; error.code
    return invalid
end function)
```

## Sending

### A url

A string argument sends a `GET` to that url. A relative url is joined to the client's `baseUrl`; one starting with `http` is sent as is.

```brightscript
sghttp.fetch("/shows/abc")
sghttp.fetch("https://images.example.com/manifest.json")
```

The string can also be the name of a [defined query](queries.md). Its request is sent with the definition's client, headers, parser and settings, filled from the args, but nothing is read from the cache or written to it, and you get the whole response:

```brightscript
sghttp.fetch("homePage", { slug: "main" })
```

Any other string, one that doesn't start with `/` or `http` and names no query, rejects at once instead of sending a request to `baseUrl/<string>`.

### A spec

For anything else, pass an associative array:

```brightscript
sghttp.fetch({
    url: "/shows/{id}/favorite"
    method: "POST"
    headers: { "X-Source": "details" }
    query: { profile_id: "{profile}" }
    body: { note: "{note}" }
}, { id: "abc", profile: "p-1", note: "later" })
```

A spec takes the same keys as a definition's `request` (`url`, `method`, `headers`, `query`, `body`, `parseJson`), plus the [per-request settings](#per-request-settings) below.

## Filling the request

sgHttp fills `{name}` placeholders in the url, query, headers and body from the second argument, then from the current [scopes](scopes-and-buckets.md#scopes), so one spec can serve many calls. Strings, numbers and booleans can fill a placeholder; arrays, associative arrays and nodes can't. The same rules apply to a definition's `request`, whose placeholders are filled from the query's args.

### Url

```brightscript
request: { url: "/shows/{showId}" }
```

If a url placeholder is left unfilled, sgHttp still sends the request, which usually reaches some other route, and prints a warning: `[sghttp] "show" url has an unfilled placeholder: /shows/{showId}`.

### Query string

```brightscript
request: {
    url: "/search"
    query: { q: "{term}", profile_id: "{profile}", sort: "relevance", genre: "{genres}" }
}
```

- A parameter whose value is a `{placeholder}` is **dropped** when no arg or scope fills it, or when it fills to an empty string. This is how optional parameters work: `profile_id` above disappears when no profile scope is set.
- Literal values (`sort: "relevance"`) are always sent.
- An array value repeats the parameter, as in `?genre=drama&genre=comedy`. The array can be a literal in the definition, or the arg of a value that is exactly `"{name}"`. An empty array drops the parameter.
- Numbers and booleans, literal or from args, are sent as their text: `{ page: 2, hd: true }` becomes `?page=2&hd=true`.
- The transport url-escapes names and values.

### Headers

```brightscript
request: { url: "/stream/{id}", headers: { "X-Device-Id": "{deviceId}" } }
```

Header values are filled the same way and sent along with the client's shared headers. Headers that every request needs, such as an auth token, belong on the client instead; see [Auth](#auth-headers-on-every-request).

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

`method` defaults to `GET`. `GET` and `HEAD` are sent without a body. Any other method (`POST`, `PUT`, `PATCH`, `DELETE`) is sent with the body, or with an empty body if there is none.

The transport task decodes successful responses as JSON. A body that isn't JSON stays a string, and `parseJson: false` always keeps the raw text.

## Auth: headers on every request

Headers every request needs, like the auth token, are set once on the client:

```brightscript
sghttp.setHeaders({ Authorization: "Bearer " + token })   ' after sign-in
sghttp.setHeaders({ Authorization: invalid })              ' after sign-out: removes it
```

`setHeaders` merges, so other shared headers stay. `initialize({ headers })` sets the first ones. A request that must *not* carry them (a public endpoint, a token refresh) passes `auth: false`:

```brightscript
sghttp.fetch({ url: "/auth/refresh", method: "POST", body: { refreshToken: "{token}" }, auth: false }, { token: refresh })
```

Headers in `initialize({ baseHeaders })`, such as device ids and platform tags, are sent with every request, even one with `auth: false`.

## The response

The promise resolves with the transport's whole response:

```brightscript
{ code: 200, headers: { ... }, body: <decoded JSON, or the raw text>, url: "https://...", ms: 84 }
```

`body` is the decoded JSON when the text parses as JSON, and the raw string otherwise. When the spec names a parser, it's the parser's result (see below). `ms` is the time taken by the attempt that answered; retries and their waits aren't included.

## Building the body off the render thread

Whatever you do with `response.body` in `then` runs on the render thread. That's fine for a small body. For a large body that becomes a ContentNode tree, name a **parser** in the spec. sgHttp runs it on a task thread and resolves the promise with its result:

```brightscript
promises.chain(sghttp.fetch({ url: "/home/main", parser: "HomePageParser" }), m).then(function(response as object, m as object) as dynamic
    m.rowList.content = response.body   ' the parser's ContentNode tree, not the JSON
    return invalid
end function)
```

Writing the parser and the task it runs on is covered in [Parsers](parsers.md).

## Failures

The promise rejects when the status is outside `successCodes` (200–299 by default) or the request couldn't complete. It rejects with the same shape as a response, plus a `message`. `code` is the HTTP status or, for a network failure, the negative error `roUrlTransfer` reports, such as `-28` for a timeout. The body of a failed request is left as raw text. See [Errors](../reference/events-and-stats.md#errors).

Before a promise rejects, the transport has already retried network failures and `429` and `5xx` answers. [The transport](transport.md) covers when it retries and how to change that.

### Reacting to a 401 everywhere

Every request emits an event, so one observer in the main scene can send the app to sign-in when a token expires, whichever screen made the request:

```brightscript
sghttp.observeEvents("onRequestEvent")

sub onRequestEvent(event as object)
    e = event.getData()
    if e.type = "error" and e.code = 401 and e.auth then showSignIn()
end sub
```

`e.auth` tells you whether the request carried the shared headers, so a 401 from a public endpoint isn't mistaken for an expired token. Every event field is in [Events](../reference/events-and-stats.md#events).

A `fetch` can give its events a `name`, so one observer can tell calls apart. Without one, the events say `"fetch"`:

```brightscript
sghttp.fetch({ url: "/streams/{id}/start", method: "POST", name: "stream.start" }, { id: streamId })

sub onRequestEvent(event as object)
    e = event.getData()
    if e.type = "error" and e.name = "stream.start" then showPlaybackError(e.code)
end sub
```

The name only labels the events. A named `fetch` is still not registered, cached or shared; for that, see [Queries and keys](queries.md).

## More than one server

Each server is a **client** with its own base url, shared headers and transport pool. `initialize` sets up the default client from its top-level settings, and any others from `clients`. A spec picks one by name:

```brightscript
sghttp.fetch({ url: "/entitlements", client: "billing" })
```

See [More than one server](multiple-servers.md).

## Per-request settings

| Key | Meaning |
|---|---|
| `client` | The client to send through. Default: the default client. |
| `auth: false` | Leave out the client's shared headers. |
| `proxy: false` | Send directly, even when a debugging proxy is set (see [Debugging](debugging.md#routing-traffic-through-a-proxy)). |
| `timeout` | Seconds before the request is given up and retried. Default: the transport's (30). |
| `retries` | Attempts after the first. Default: the transport's. |
| `successCodes` | Statuses treated as success. Default: 200–299. |
| `parser` | A parser name to run the body through on the parser task. |
| `name` | A name for the [events](../reference/events-and-stats.md#events) this request emits. Default: `"fetch"`. |

## What fetch doesn't do

sgHttp never caches, de-duplicates or persists a `fetch`. Two identical calls send two requests, and the second isn't affected by the first. That's the right behaviour for most calls. For data that several components ask for, or that several screens show, use the [query cache](queries.md). If the app uses it, a `fetch` that changes data on the server should expire the queries it affects: `sghttp.expire("favorites")`.

## Next

[More than one server](multiple-servers.md)
