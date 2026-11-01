# Quick start

Part 1 is the HTTP client: set it up, send requests and handle the answers. It works on its own. Part 2 is the query cache: you define a request and call it with `query` so that sgHttp caches its result, then add parsing and persistence to its definition.

The examples talk to `https://api.example.com`, whose `GET /home/{slug}` answers with:

```json
{
    "rows": [
        { "title": "Continue watching", "items": [{ "id": "1", "title": "Pilot", "image": "https://..." }] },
        { "title": "New this week", "items": [] }
    ]
}
```

It assumes sgHttp is [installed](installation.md).

## Part 1: the HTTP client

### 1. Initialize

Once, in the main scene's `init()`:

```brightscript
import "pkg:/source/roku_modules/sghttp/sghttp.brs"

sub init()
    sghttp.initialize({ baseUrl: "https://api.example.com" })
end sub
```

This starts the transport, the Task that sends every request, and nothing else: no disk or parser task runs until a query or setting asks for one. It keeps a pool of `roUrlTransfer` objects and a queue, retries network failures and server errors, applies a timeout, and adds the headers every request shares. To begin with, `baseUrl` is the only setting you need; see [`initialize`](reference/api.md#initialize) for the rest.

### 2. Send a request

From any component that imports `sghttp.brs`:

```brightscript
' components/HomeScreen.bs
import "pkg:/source/roku_modules/sghttp/sghttp.brs"

sub load()
    promises.chain(sghttp.fetch("/home/main"), m).then(function(response as object, m as object) as dynamic
        m.titleLabel.text = response.body.rows[0].title
        return invalid
    end function).catch(function(error as object, m as object) as dynamic
        print "home page failed: "; error.code
        return invalid
    end function)
end sub
```

The request goes out on the transport task, the JSON is decoded there, and the `then` callback runs on the render thread with the whole response: `code`, `headers`, `body`, `url` and `ms`. A relative url is joined to `baseUrl`; a url starting with `http` is sent as is.

### 3. Send data

Give `fetch` a spec instead of a url for anything beyond a `GET`. An associative array body is sent as JSON:

```brightscript
sghttp.fetch({ url: "/favorites", method: "POST", body: { slug: "pilot" } })
```

`{placeholders}` anywhere in the spec are filled from a second argument, so one spec can serve many calls:

```brightscript
sghttp.fetch({ url: "/favorites/{slug}", method: "DELETE" }, { slug: "pilot" })
```

Query strings, headers and raw bodies work the same way; see [Requests](guides/requests.md).

### 4. Sign the user in

Set the headers every request needs, like the auth token, once. sgHttp sends them with every request from then on, except one marked `auth: false`:

```brightscript
sghttp.setHeaders({ Authorization: "Bearer " + token })   ' after sign-in
sghttp.setHeaders({ Authorization: invalid })              ' after sign-out
```

To react when the token expires, observe sgHttp's events from the main scene. Every failed request is reported with its HTTP status, a negative code for a network failure, or `0` when there was no response:

```brightscript
sghttp.observeEvents("onRequestEvent")

sub onRequestEvent(event as object)
    e = event.getData()
    if e.type = "error" and e.code = 401 and e.auth then showSignIn()
end sub
```

### 5. Handle failures

A promise rejects when the status is outside 200–299 or the request couldn't complete. `error.code` is the HTTP status, or negative for a network failure: the curl error code `roUrlTransfer` reports, such as `-28` for a timeout. The transport retries with backoff before the promise settles, so by the time `catch` runs, it has already given up.

**That's the HTTP client.** Nothing in Part 2 changes how it behaves.

## Part 2: the query cache

Part 2 turns the home page request into a query, then adds a parser and persistence to its definition. By the end, the home page is returned from memory when it was fetched recently, its ContentNode tree is built on a task thread, and on the next launch it is returned from disk.

### 6. Define the request and query it

Define the request once, next to `initialize`:

```brightscript
sghttp.define("homePage", {
    request: { url: "/home/{slug}" }   ' {slug} is filled from the query's args
})
```

Then any component can query it by name:

```brightscript
sub load()
    promises.chain(sghttp.query("homePage", { slug: "main" }), m).then(function(page as object, m as object) as dynamic
        m.titleLabel.text = page.rows[0].title
        return invalid
    end function).catch(function(error as object, m as object) as dynamic
        print "home page failed: "; error.code
        return invalid
    end function)
end sub
```

Two things change. `query` resolves with the body alone (the decoded JSON), not the whole response. And the result is **cached**: for the next five minutes (the default), `query("homePage", { slug: "main" })` from any component resolves at once with no request. Components that query it at the same moment share one request. See [Queries and keys](guides/queries.md).

### 7. Say how long it stays fresh

```brightscript
sghttp.define("homePage", {
    request: { url: "/home/{slug}" }
    ttl: 300                            ' fresh for 5 minutes (the default)
})
```

Within `ttl` seconds, a query is returned from memory. After that, the cached value is **stale**: a query still resolves with it at once, and sgHttp checks the server in the background. If the server's response is byte-for-byte the same, nothing else happens. See [Caching and freshness](guides/caching.md).

### 8. Build the screen's content off the render thread

Setting a label is cheap. Building a ContentNode tree for a RowList from a large response is not, and code in `then` runs on the render thread. A **parser** does that work on a task thread instead.

A parser is any class with `parse(body, args)`:

```brightscript
' source/parsers/HomePageParser.bs
class HomePageParser
    function parse(body as dynamic, args as object) as dynamic
        content = createObject("roSGNode", "ContentNode")
        if type(body) <> "roAssociativeArray" or type(body.rows) <> "roArray" then return content
        for each row in body.rows
            rowNode = content.createChild("ContentNode")
            rowNode.title = row.title
            for each item in row.items
                itemNode = rowNode.createChild("ContentNode")
                itemNode.id = item.id
                itemNode.title = item.title
                itemNode.hdPosterUrl = item.image
            end for
        end for
        return content
    end function
end class
```

sgHttp looks parsers up by name on a Task that extends its `ParserTask` (installed as `sghttp_ParserTask`):

```xml
<!-- components/AppParserTask.xml -->
<component name="AppParserTask" extends="sghttp_ParserTask">
    <script type="text/brightscript" uri="AppParserTask.bs" />
</component>
```

```brightscript
' components/AppParserTask.bs
import "pkg:/source/parsers/HomePageParser.bs"

function getParser(name as string) as dynamic
    if name = "HomePageParser" then return new HomePageParser()
    return invalid
end function
```

Tell `initialize` about the task, and the definition about the parser:

```brightscript
sghttp.initialize({
    baseUrl: "https://api.example.com"
    parserTask: "AppParserTask"
})

sghttp.define("homePage", {
    request: { url: "/home/{slug}" }
    parser: "HomePageParser"
    ttl: 300
})
```

`query` now resolves with the parser's tree, and the cache stores that tree, so a cached query costs no parsing either:

```brightscript
promises.chain(sghttp.query("homePage", { slug: "main" }), m).then(function(page as object, m as object) as dynamic
    m.rowList.content = page
    return invalid
end function)
```

`fetch` can use a parser too: add `parser` to its spec when a one-off request needs its body built off the render thread. See [Parsers](guides/parsers.md).

### 9. Keep it for the next launch

```brightscript
sghttp.define("homePage", {
    request: { url: "/home/{slug}" }
    parser: "HomePageParser"
    ttl: 300
    persist: true                       ' the raw response is kept on cachefs:/
})
```

On the next launch, the first query reads the saved body from disk, parses it and resolves before the network answers. If the body is older than `ttl`, sgHttp then refreshes it in the background. See [Persistence](guides/persistence.md).

### 10. Redraw when the data changes

A background refresh that finds different data updates the cache. To hear about it, watch the query while the screen is open:

```brightscript
sub init()
    m.rowList = m.top.findNode("rowList")
    m.homeWatcher = sghttp.watch("homePage", "onHomeChanged", { slug: "main" })
    load()
end sub

sub onHomeChanged(event as object)
    m.rowList.content = event.getData().value
end sub

' when the screen closes
sub teardown()
    sghttp.unwatch(m.homeWatcher)
end sub
```

See [Keeping data fresh](guides/keeping-data-fresh.md).

### Optional: if your app uses sgRouter

sgHttp doesn't need a router; the screen above is the normal way to use it. If your app uses [sgRouter](https://github.com/rokucommunity/sgRouter), the two work together. sgRouter waits for a promise returned from `beforeViewOpen` before it shows the view, so when you return the query's promise, the view appears with its data already drawn:

```brightscript
function beforeViewOpen(params as object) as dynamic
    return promises.chain(sghttp.query("homePage", { slug: "main" }), m).then(function(page as object, m as object) as dynamic
        m.rowList.content = page
        return invalid
    end function).toPromise()
end function
```

## What you have now

- Every request in the app goes through one pooled transport, with retries, a timeout and the user's auth header, and comes back as a promise.
- A 401 from any request sends the app to sign-in.
- When the home screen opens again within five minutes, its query is returned from memory with no request and no parsing, so the screen draws at once.
- After five minutes, the query is still returned at once from the cache, and sgHttp checks the server in the background. If the response is unchanged, nothing is parsed and nothing is redrawn. If it changed, `onHomeChanged` receives the new tree.
- On the next launch, the query is returned from the body saved on `cachefs:/`, so the home screen draws before the network answers. sgHttp then refreshes it if it's older than five minutes.
- A one-off call anywhere in the app is still just `sghttp.fetch(...)`.

## Next

- [Requests](guides/requests.md): everything `fetch` can do
- [Queries and keys](guides/queries.md): urls, query strings, headers and bodies filled from args
- [Mutations, expiry and removal](guides/mutations.md): writing data
- [Query definitions](reference/definition.md): every option `define` takes
