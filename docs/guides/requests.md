# Requests

`fetch` sends one request and gives you the response. It's the primary thing sgQuery does, and on its own it's a complete HTTP client: nothing has to be defined, cached or configured beyond a `baseUrl`. This guide covers everything a request can be.

```brightscript
promises.chain(sgquery.fetch("/shows/abc"), m).then(function(response as object, m as object) as dynamic
    print response.code, response.body.title
    return invalid
end function).catch(function(error as object, m as object) as dynamic
    print "failed: "; error.code
    return invalid
end function)
```

## Sending

### A url

A string is a `GET`. A relative url is joined to the client's `baseUrl`; one starting with `http` is sent as is.

```brightscript
sgquery.fetch("/shows/abc")
sgquery.fetch("https://images.example.com/manifest.json")
```

The string has to look like a url, starting with `/` or `http`. A query name passed by mistake, `fetch("homePage")`, rejects at once with a message pointing at `query`, instead of quietly asking the server for `/homePage`.

### A spec

For anything else, pass an associative array:

```brightscript
sgquery.fetch({
    url: "/shows/{id}/favorite"
    method: "POST"
    headers: { "X-Source": "details" }
    query: { profile_id: "{profile}" }
    body: { note: "{note}" }
}, { id: "abc", profile: "p-1", note: "later" })
```

A spec takes the same keys as a definition's `request` (`url`, `method`, `headers`, `query`, `body`, `parseJson`), plus the [per-request settings](#per-request-settings) below.

## Filling the request

`{name}` placeholders anywhere in the url, query, headers or body are filled from the second argument, then from the current [scopes](scopes-and-buckets.md#scopes), so one spec can serve many calls. Strings, numbers and booleans fill a placeholder. Arrays, associative arrays and nodes don't. The rules are the same for `fetch` and for a definition's `request`, whose placeholders are filled from the query's args.

### Url

```brightscript
request: { url: "/shows/{showId}" }
```

If a placeholder in the url is left unfilled, sgQuery still sends the request (it usually reaches some other route) and prints a warning: `[sgquery] "show" url has an unfilled placeholder: /shows/{showId}`.

### Query string

```brightscript
request: {
    url: "/search"
    query: { q: "{term}", profile_id: "{profile}", sort: "relevance", genre: "{genres}" }
}
```

- A parameter whose value is a `{placeholder}` is **dropped** when no arg or scope fills it, or when it fills to an empty string. This is how optional parameters work: `profile_id` above disappears when no profile scope is set.
- Literal values (`sort: "relevance"`) are always sent.
- An array value repeats the parameter: `?genre=drama&genre=comedy`. That happens either with an array literal in the definition, or with a value of exactly `"{name}"` whose arg is an array. An empty array drops the parameter.
- Numbers and booleans, literal or from args, are sent as their text: `{ page: 2, hd: true }` becomes `?page=2&hd=true`.
- Names and values are url-escaped by the transport.

### Headers

```brightscript
request: { url: "/stream/{id}", headers: { "X-Device-Id": "{deviceId}" } }
```

Header values are filled the same way, and added to the client's shared headers for this request. Headers every request needs (auth tokens) belong on the client instead; see [Auth](#auth-headers-on-every-request).

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

Successful responses are JSON-decoded on the transport task. A body that isn't JSON stays a string. `parseJson: false` always leaves the raw text.


## Auth: headers on every request

Headers every request needs, like the auth token, are set once on the client:

```brightscript
sgquery.setHeaders({ Authorization: "Bearer " + token })   ' after sign-in
sgquery.setHeaders({ Authorization: invalid })              ' after sign-out: removes it
```

`setHeaders` merges, so other shared headers stay. `initialize({ headers })` sets the first ones. A request that must *not* carry them (a public endpoint, a token refresh) passes `auth: false`:

```brightscript
sgquery.fetch({ url: "/auth/refresh", method: "POST", body: { refreshToken: "{token}" }, auth: false }, { token: refresh })
```

`initialize({ baseHeaders })` are sent with every request without exception, even where `auth` is false: device ids, platform tags.

## The response

The promise resolves with the transport's whole response:

```brightscript
{ code: 200, headers: { ... }, body: <decoded JSON, or the raw text>, url: "https://...", ms: 84 }
```

`body` is JSON-decoded when the text parses as JSON, the raw string otherwise, or a parser's result when the spec names one (see below). `ms` is the time from sending to the answer.

## Building the body off the render thread

Whatever you do with `response.body` in `then` runs on the render thread. For a small body that's fine. For a large one that becomes a ContentNode tree, name a **parser** in the spec, and the body is turned into the value on a task thread before the promise resolves:

```brightscript
promises.chain(sgquery.fetch({ url: "/home/main", parser: "HomePageParser" }), m).then(function(response as object, m as object) as dynamic
    m.rowList.content = response.body   ' the parser's ContentNode tree, not the JSON
    return invalid
end function)
```

Writing the parser and the task it runs on is covered in [Parsers](parsers.md).

## Failures

The promise rejects with the same shape plus `message` when the status is outside `successCodes` (default 200–299) or the request couldn't complete. `code` is the HTTP status, or negative for a network failure: the error `roUrlTransfer` reports, such as `-28` for a timeout. Failure bodies are left as raw text. See [Errors](../reference/events-and-stats.md#errors).

Before a promise rejects, the transport has already retried network failures and `5xx` answers. When it retries, and how to change that, is in [The transport](transport.md).

### Reacting to a 401 everywhere

Every request emits an event, so one observer in the main scene can send the app to sign-in when a token expires, whichever screen made the request:

```brightscript
sgquery.observeEvents("onRequestEvent")

sub onRequestEvent(event as object)
    e = event.getData()
    if e.type = "error" and e.code = 401 and e.auth then showSignIn()
end sub
```

`e.auth` says whether the request carried the shared headers, so a public endpoint's 401 isn't mistaken for an expired token. Every event field is in [Events](../reference/events-and-stats.md#events).

## More than one server

Each server is a **client** with its own base url, shared headers and transport pool. `initialize` sets up the default one from its top-level settings and any others under `clients`; a spec picks one by name:

```brightscript
sgquery.fetch({ url: "/entitlements", client: "billing" })
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

A request is never cached, never de-duplicated, never persisted. Two identical calls send two requests, and the second knows nothing about the first. That's the right behaviour for most calls, and for the rest, the ones made from several places or shown on several screens, there's the [query cache](queries.md). If the app uses it, a `fetch` that changes data on the server should say so: `sgquery.expire("favorites")`.

## Next

[More than one server](multiple-servers.md)
