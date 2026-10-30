# Quick start

Part 1 is the HTTP client: set it up, send requests, handle the answers. It's complete on its own, and for many apps it's all of sgQuery they ever use. Part 2 is optional: naming a request so sgQuery caches it, and what each further key adds.

The examples talk to `https://api.example.com`, whose `GET /home/{slug}` answers with:

```json
{
    "rows": [
        { "title": "Continue watching", "items": [{ "id": "1", "title": "Pilot", "image": "https://..." }] },
        { "title": "New this week", "items": [] }
    ]
}
```

It assumes sgQuery is [installed](installation.md).

## Part 1: the HTTP client

### 1. Initialize

Once, in the main scene's `init()`:

```brightscript
import "pkg:/source/roku_modules/sgquery/sgquery.brs"

sub init()
    sgquery.initialize({ baseUrl: "https://api.example.com" })
end sub
```

This starts the transport: a Task with a pool of `roUrlTransfer` objects, a queue, retries, a timeout and the headers every request shares. `baseUrl` is the only setting worth giving at first; see [`initialize`](reference/api.md#initialize) for the rest.

### 2. Send a request

From any component that imports `sgquery.brs`:

```brightscript
' components/HomeScreen.bs
import "pkg:/source/roku_modules/sgquery/sgquery.brs"

sub load()
    promises.chain(sgquery.fetch("/home/main"), m).then(function(response as object, m as object) as dynamic
        m.titleLabel.text = response.body.rows[0].title
        return invalid
    end function).catch(function(error as object, m as object) as dynamic
        print "home page failed: "; error.code
        return invalid
    end function)
end sub
```

The request goes out on the transport task, the JSON is decoded there, and the promise resolves on the render thread with the whole response: `code`, `headers`, `body`, `url` and `ms`. A relative url is joined to `baseUrl`; a url starting with `http` is sent as is.

### 3. Send data

Give `fetch` a spec instead of a url for anything beyond a `GET`. An associative array body is sent as JSON:

```brightscript
sgquery.fetch({ url: "/favorites", method: "POST", body: { slug: "pilot" } })
```

`{placeholders}` anywhere in the spec are filled from a second argument, so one spec can serve many calls:

```brightscript
sgquery.fetch({ url: "/favorites/{slug}", method: "DELETE" }, { slug: "pilot" })
```

Query strings, headers and raw bodies work the same way; see [Requests](guides/requests.md).

### 4. Sign the user in

Headers that every request needs, like the auth token, are set once on the client and sent from then on:

```brightscript
sgquery.setHeaders({ Authorization: "Bearer " + token })   ' after sign-in
sgquery.setHeaders({ Authorization: invalid })              ' after sign-out
```

To react when the token expires, observe sgQuery's events from the main scene. Each failed request reports its status:

```brightscript
sgquery.observeEvents("onRequestEvent")

sub onRequestEvent(event as object)
    e = event.getData()
    if e.type = "error" and e.code = 401 and e.auth then showSignIn()
end sub
```

### 5. Handle failures

A promise rejects when the status is outside 200–299 or the request couldn't complete. `error.code` is the HTTP status, or negative for a network failure (`-28` is a timeout). Retries with backoff happen before the promise settles, so by the time `catch` runs, the transport has already given up.

**That's the HTTP client.** Nothing below is needed to use it, and nothing below changes how it behaves.

## Part 2: optional, the query cache

### 6. Give a request a name

A request the app makes from more than one place can be defined once, next to `initialize`:

```brightscript
sgquery.define("homePage", {
    request: { url: "/home/{slug}" }   ' {slug} is filled from the query's args
})
```

and queried by name:

```brightscript
sub load()
    promises.chain(sgquery.query("homePage", { slug: "main" }), m).then(function(page as object, m as object) as dynamic
        m.titleLabel.text = page.rows[0].title
        return invalid
    end function).catch(function(error as object, m as object) as dynamic
        print "home page failed: "; error.code
        return invalid
    end function)
end sub
```

Two things changed. `query` resolves with the body alone (the decoded JSON), since a query is about the data, not the exchange. And the result is **cached**: a second `query("homePage", { slug: "main" })` from any component, within the default five minutes, resolves at once with no request. Two components querying it at the same moment share one request. See [Queries and keys](guides/queries.md).

### 7. Say how long it stays fresh

```brightscript
sgquery.define("homePage", {
    request: { url: "/home/{slug}" }
    ttl: 300                            ' fresh for 5 minutes (the default)
})
```

Within `ttl` seconds, a query is answered from memory. After that the cached value is **stale**: a query still resolves at once with it, and sgQuery checks the server in the background. If the server's response is byte-for-byte the same, nothing else happens. See [Caching and freshness](guides/caching.md).

### 8. Build the screen's content off the render thread

Setting a label is cheap. Building a ContentNode tree for a RowList from a large response is not, and doing it in `then` runs it on the render thread. A **parser** moves that work to a task.

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

Parsers are looked up by name on a Task you extend from sgQuery's `ParserTask` (prefixed `sgquery_ParserTask` after installing):

```xml
<!-- components/AppParserTask.xml -->
<component name="AppParserTask" extends="sgquery_ParserTask">
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
sgquery.initialize({
    baseUrl: "https://api.example.com"
    parserTask: "AppParserTask"
})

sgquery.define("homePage", {
    request: { url: "/home/{slug}" }
    parser: "HomePageParser"
    ttl: 300
})
```

`query` now resolves with the parser's tree, and the cache stores that tree, so a cached query costs no parsing either:

```brightscript
promises.chain(sgquery.query("homePage", { slug: "main" }), m).then(function(page as object, m as object) as dynamic
    m.rowList.content = page
    return invalid
end function)
```

A `fetch` can name a parser too (`parser` in its spec), when a one-off request wants its body built off the render thread. See [Parsers](guides/parsers.md).

### 9. Keep it for the next launch

```brightscript
sgquery.define("homePage", {
    request: { url: "/home/{slug}" }
    parser: "HomePageParser"
    ttl: 300
    persist: true                       ' the raw response is kept on cachefs:/
})
```

On the next launch, the first query reads the saved body from disk, parses it, and resolves before the network answers, then refreshes it in the background if it's older than `ttl`. See [Persistence](guides/persistence.md).

### 10. Redraw when the data changes

A background refresh that finds different data updates the cache. To hear about it, watch the query while the screen is open:

```brightscript
sub init()
    m.rowList = m.top.findNode("rowList")
    m.homeWatcher = sgquery.watch("homePage", "onHomeChanged", { slug: "main" })
    load()
end sub

sub onHomeChanged(event as object)
    m.rowList.content = event.getData().value
end sub

' when the screen closes
sub teardown()
    sgquery.unwatch(m.homeWatcher)
end sub
```

See [Keeping data fresh](guides/keeping-data-fresh.md).

### Optional: if your app uses sgRouter

sgQuery needs no router; the screen above is the normal way to use it. If your app happens to use [sgRouter](https://github.com/rokucommunity/sgRouter), the two fit together: sgRouter waits for a promise returned from `beforeViewOpen` before it shows the view, so you can hand it the query and the screen appears with its data already drawn:

```brightscript
function beforeViewOpen(params as object) as dynamic
    return promises.chain(sgquery.query("homePage", { slug: "home-page" }), m).then(function(page as object, m as object) as dynamic
        m.rowList.content = page
        return invalid
    end function).toPromise()
end function
```

## What you have now

- Every request in the app goes through one pooled transport, with retries, a timeout and the user's auth header, and comes back as a promise.
- A 401 anywhere sends the app to sign-in.
- Opening the home screen a second time within five minutes draws it immediately, with no request and no parsing.
- After five minutes, it still draws immediately from the cache, and sgQuery checks the server in the background. If the response is unchanged, nothing is parsed and nothing is redrawn. If it changed, `onHomeChanged` receives the new tree.
- On the next launch, the home screen is drawn from the body saved on `cachefs:/`, then refreshed if it's older than five minutes.
- A one-off call anywhere in the app is still just `sgquery.fetch(...)`.

## Next

- [Requests](guides/requests.md): everything `fetch` can do
- [Queries and keys](guides/queries.md): urls, query strings, headers and bodies filled from args
- [Mutations, expiry and invalidation](guides/mutations.md): writing data
- [Query definitions](reference/definition.md): every option `define` takes
