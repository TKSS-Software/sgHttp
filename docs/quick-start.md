# Quick start

This walkthrough builds a home screen from `GET https://api.example.com/home/{slug}`, which answers with:

```json
{
    "rows": [
        { "title": "Continue watching", "items": [{ "id": "1", "title": "Pilot", "image": "https://..." }] },
        { "title": "New this week", "items": [] }
    ]
}
```

It starts with one request and adds a feature per step: a name and a cache, a parser, a disk copy, a watcher. Each step is one more key; none of them changes the code before it. It assumes sgQuery is [installed](installation.md).

## 1. Initialize

Once, in the main scene's `init()`, before any screen asks for data:

```brightscript
import "pkg:/source/roku_modules/sgquery/sgquery.brs"

sub init()
    sgquery.initialize({ baseUrl: "https://api.example.com" })
end sub
```

This creates the store and the default client: a Task with a pool of `roUrlTransfer` objects, retries, a timeout and the headers every request shares. Every setting is optional; see [`initialize`](reference/api.md#initialize).

## 2. Make a request

From any component that imports `sgquery.brs`:

```brightscript
' components/HomeScreen.bs
import "pkg:/source/roku_modules/sgquery/sgquery.brs"

sub load()
    promises.chain(sgquery.fetch("/home/main"), m).then(function(response as object, m as object) as dynamic
        m.titleLabel.text = response.body.rows[0].title
        return invalid
    end function).catch(function(error as object, m as object) as dynamic
        ' error.code is the HTTP status, or negative for a network failure
        print "home page failed: "; error.code
        return invalid
    end function)
end sub
```

The request goes out on the transport task, the JSON is decoded there, and the promise resolves on the render thread with the whole response: `code`, `headers`, `body`, `url` and `ms`. Nothing is remembered. Open the screen twice and the request is sent twice. That's the base of sgQuery, and for a one-off call it's all you need. `fetch` also takes a spec with a `method`, `headers` and `body`; see [Requests](guides/requests.md).

## 3. Give it a name

A request the app makes more than once deserves a name. Define it next to `initialize`:

```brightscript
sgquery.define("homePage", {
    request: { url: "/home/{slug}" }   ' {slug} is filled from the query's args
})
```

and query it by name:

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

Two things changed. `query` resolves with the body alone (the decoded JSON), since a query is about the data, not the exchange. And the result is **cached**: a second `query("homePage", { slug: "main" })` from any component, within the default five minutes, resolves at once with no request. Two components querying it at the same moment share one request. The request is also where the url, query string, headers and body get filled from args; see [Queries and keys](guides/queries.md).

## 4. Say how long it stays fresh

```brightscript
sgquery.define("homePage", {
    request: { url: "/home/{slug}" }
    ttl: 300                            ' fresh for 5 minutes (the default)
})
```

Within `ttl` seconds, a query is answered from memory. After that the cached value is **stale**: a query still resolves at once with it, and sgQuery checks the server in the background. If the server's response is byte-for-byte the same, nothing else happens. See [Caching and freshness](guides/caching.md) for every case.

## 5. Build the screen's content off the render thread

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

See [Parsers](guides/parsers.md).

## 6. Keep it for the next launch

```brightscript
sgquery.define("homePage", {
    request: { url: "/home/{slug}" }
    parser: "HomePageParser"
    ttl: 300
    persist: true                       ' the raw response is kept on cachefs:/
})
```

On the next launch, the first query reads the saved body from disk, parses it, and resolves before the network answers, then refreshes it in the background if it's older than `ttl`. See [Persistence](guides/persistence.md).

## 7. Redraw when the data changes

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

- Opening the home screen a second time within five minutes draws it immediately, with no request and no parsing.
- After five minutes, it still draws immediately from the cache, and sgQuery checks the server in the background. If the response is unchanged, nothing is parsed and nothing is redrawn. If it changed, `onHomeChanged` receives the new tree.
- Two components querying `homePage` with the same args at the same time share one request.
- On the next launch, the home screen is drawn from the body saved on `cachefs:/`, then refreshed if it's older than five minutes.
- A one-off call anywhere in the app is still just `sgquery.fetch(...)`.

## Next

- [Requests](guides/requests.md): the spec, the response, and what a plain request doesn't do
- [Queries and keys](guides/queries.md): urls, query strings, headers and bodies filled from args
- [Mutations, expiry and invalidation](guides/mutations.md): writing data
- [Query definitions](reference/definition.md): every option `define` takes
