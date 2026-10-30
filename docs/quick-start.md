# Quick start

This walkthrough builds a home screen whose rows come from `GET https://api.example.com/home/{slug}`, with a response like:

```json
{
    "rows": [
        { "title": "Continue watching", "items": [{ "id": "1", "title": "Pilot", "image": "https://..." }] },
        { "title": "New this week", "items": [] }
    ]
}
```

You will write a parser that turns that JSON into a ContentNode tree, a task that runs it, a query definition, and a screen that fetches and draws it. It assumes sgquery is [installed](installation.md).

## 1. Write a parser

A parser is any object with a `parse(body, args)` method. `body` is the decoded JSON, or the raw text if the response isn't JSON. `args` are the args the fetch was called with. Whatever it returns is what `fetch` resolves with and what the cache stores.

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

Parsers run on a task thread, so building a large tree here never stalls the UI.

## 2. Register it with a parser task

Extend sgquery's `ParserTask` (prefixed `sgquery_ParserTask` after installing) and override `getParser`, which maps a parser name to an instance:

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

## 3. Initialize and define the query

In the main scene:

```brightscript
import "pkg:/source/roku_modules/sgquery/sgquery.brs"

sub init()
    sgquery.initialize({
        baseUrl: "https://api.example.com"
        parserTask: "AppParserTask"
    })

    sgquery.define("homePage", {
        request: { url: "/home/{slug}" }   ' {slug} is filled from the fetch's args
        parser: "HomePageParser"
        ttl: 300                            ' fresh for 5 minutes
        persist: true                       ' kept on cachefs:/ for the next launch
    })
end sub
```

Definitions usually live together in one place, next to `initialize`, so every query is registered before any screen fetches.

## 4. Fetch it from a screen

```brightscript
' components/HomeScreen.bs
import "pkg:/source/roku_modules/sgquery/sgquery.brs"

sub init()
    m.rowList = m.top.findNode("rowList")
    load()
end sub

sub load()
    promises.chain(sgquery.fetch("homePage", { slug: "main" }), m).then(function(page as object, m as object) as dynamic
        m.rowList.content = page
        return invalid
    end function).catch(function(error as object, m as object) as dynamic
        ' error.code is the HTTP status, or negative for a network failure
        print "home page failed: "; error.code
        return invalid
    end function)
end sub
```

`fetch` returns a promise node. It resolves with whatever the parser returned, or rejects with an error object (see [Errors](reference/events-and-stats.md#errors)).

### With sgRouter

sgRouter waits for a promise returned from `beforeViewOpen` before it shows the view, so the screen appears with its data already drawn:

```brightscript
function beforeViewOpen(params as object) as dynamic
    return promises.chain(sgquery.fetch("homePage", { slug: "home-page" }), m).then(function(page as object, m as object) as dynamic
        m.rowList.content = page
        return invalid
    end function).toPromise()
end function
```

## 5. Redraw when the data changes

When a background refresh brings different data, sgquery can hand it to you. Watch the query while the screen is open:

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

## What you get

- Opening the home screen a second time within five minutes draws it immediately, with no request.
- After five minutes, it still draws immediately from the cache, and sgquery checks the server in the background. If the server's response is unchanged, nothing is parsed and nothing is redrawn. If it changed, `onHomeChanged` receives the new tree.
- Two components fetching `homePage` with the same args at the same time share one request.
- On the next launch, the home screen is drawn from the body saved on `cachefs:/`, then refreshed if it's older than five minutes.

## Next

- [Queries and keys](guides/queries.md): urls, query strings, headers and bodies filled from args
- [Mutations, expiry and invalidation](guides/mutations.md): writing data
- [Query definitions](reference/definition.md): every option `define` takes
