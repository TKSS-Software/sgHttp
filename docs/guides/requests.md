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

- **`method`** defaults to `GET`. `GET` and `HEAD` are sent as such. Any other method (`POST`, `PUT`, `PATCH`, `DELETE`) is sent with the body, or an empty body if there isn't one.
- **`body`**: an associative array or array is sent as JSON, with `Content-Type: application/json` unless the spec sets its own. A string is sent as text.
- **`query`**: appended as a query string, url-escaped. Numbers and booleans become their text (`?page=2&hd=true`). An array value repeats the parameter (`?genre=drama&genre=comedy`).
- **`headers`**: added to the client's shared headers for this request.
- **`parseJson: false`** leaves the response body as text instead of decoding it.

### Placeholders

`{name}` anywhere in the url, query, headers or body is filled from the second argument, so one spec can serve many calls. A query-string parameter whose placeholder has nothing to fill it is dropped, which is how optional parameters work. A body of exactly `"{name}"` passes that arg through untouched, objects and arrays included. The full rules are in [Queries and keys](queries.md#filling-the-request-from-args); they're the same for `fetch` and for definitions.

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

Decoding JSON happens on the transport task, but whatever you do with `response.body` in `then` runs on the render thread. For a small body that's fine. For a large one that becomes a ContentNode tree, name a **parser** in the spec, and the body is turned into the value on a task thread before the promise resolves:

```brightscript
promises.chain(sgquery.fetch({ url: "/home/main", parser: "HomePageParser" }), m).then(function(response as object, m as object) as dynamic
    m.rowList.content = response.body   ' the parser's ContentNode tree, not the JSON
    return invalid
end function)
```

A parser is any class with `parse(body, args)`; `args` are the second argument to `fetch`. Parsers live on a Task component of the app's, named once in `initialize({ parserTask: "AppParserTask" })`, whose `getParser(name)` maps names to instances. sgQuery runs two copies of it so one large body doesn't hold up the rest. A `fetch` picks a parser by name; it doesn't pick the task. The body reaches the parser task as text and is decoded there, so a large body is never copied through the render thread as a decoded tree. If no `parserTask` was configured, a spec that names a parser rejects with a message saying so. Writing the parser and the task is covered in [Parsers](parsers.md).

## Failures

The promise rejects with the same shape plus `message` when the status is outside `successCodes` (default 200–299) or the request couldn't complete. `code` is the HTTP status, or negative for a network failure: the error `roUrlTransfer` reports, such as `-28` for a timeout. Failure bodies are left as raw text. See [Errors](../reference/events-and-stats.md#errors).

Before a promise rejects, the transport has already retried with backoff (1 s, 2 s, 4 s) on network failures and `5xx` answers, within the per-request `timeout`. A `POST` answered with `502` is never retried, because the gateway may have passed it on. The defaults and how to change them are in [The transport](transport.md).

### Reacting to a 401 everywhere

Every request emits an event, so one observer in the main scene can send the app to sign-in when a token expires, whichever screen made the request:

```brightscript
sgquery.observeEvents("onRequestEvent")

sub onRequestEvent(event as object)
    e = event.getData()
    if e.type = "error" and e.code = 401 and e.auth then showSignIn()
end sub
```

`e.auth` says whether the request carried the shared headers, so a public endpoint's 401 isn't mistaken for an expired token. See [Debugging](debugging.md#events).

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
