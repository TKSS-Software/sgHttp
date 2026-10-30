# Parsers

A parser turns a response body into the value your screens use, usually a ContentNode tree. Parsers run on a task thread, so building large trees never stalls the UI.

## Writing a parser

Any object with a `parse(body, args)` method is a parser:

```brightscript
class ShowParser
    function parse(body as dynamic, args as object) as dynamic
        show = createObject("roSGNode", "ContentNode")
        show.id = body.id
        show.title = body.title
        show.description = body.synopsis
        return show
    end function
end class
```

- `body` is the decoded JSON (an associative array or array), or the raw string when the response wasn't JSON or the request set `parseJson: false`.
- `args` are the args passed to `fetch`, `query` or `mutate`, or `{}`.
- The return value is what `query` resolves with (and what the cache stores), or what a `fetch` resolves with as `response.body`. Return anything: a node, an associative array, a string.
- If `parse` throws, the promise rejects with `{ message: "sgquery parser \"ShowParser\" threw: ...", error }`.

## The parser task

Parsers are looked up by name on a Task that extends sgQuery's `ParserTask`. Override `getParser` to map names to instances:

```xml
<component name="AppParserTask" extends="sgquery_ParserTask">
    <script type="text/brightscript" uri="AppParserTask.bs" />
</component>
```

```brightscript
import "pkg:/source/parsers/ShowParser.bs"
import "pkg:/source/parsers/HomePageParser.bs"

function getParser(name as string) as dynamic
    if name = "ShowParser" then return new ShowParser()
    if name = "HomePageParser" then return new HomePageParser()
    return invalid
end function
```

Pass the component name to `initialize`, then name a parser wherever a body should go through one: in a definition, or in a `fetch` spec.

```brightscript
sgquery.initialize({ parserTask: "AppParserTask" })

' Every query of "show" is parsed
sgquery.define("show", { request: { url: "/shows/{id}" }, parser: "ShowParser" })

' This one request is parsed; response.body is the ShowParser's node
sgquery.fetch({ url: "/shows/{id}", parser: "ShowParser" }, { id: "abc" })
```

- `getParser` is called for every response, so each parse gets a new instance. Don't rely on state kept between parses.
- An unknown name (`getParser` returns `invalid`) rejects with `sgquery parser: unknown parser "..."`.
- Naming a parser when no `parserTask` was configured rejects with a message saying so.
- A request names a parser, not a task: any of the app's parser tasks can run it.
- The parser gets the decoded body, as before. The text is decoded on the parser task, so a large body never passes through the render thread as a decoded tree.
- Without a `parser`, a query resolves with the decoded body itself, and a `fetch`'s `response.body` is the decoded body.

## Nodes come back by reference

ContentNode trees built in the parser are handed to the render thread by reference, not copied. The cache stores that same tree, and every query of the key returns it. See [Threads and memory](threads-and-memory.md#cached-nodes-are-shared) for what that means when you attach it to the screen.

## Parser threads

`initialize` starts two copies of `parserTask`, each on its own thread. Each parse goes to the copy with the fewest parses waiting, so a small body, like a menu, isn't held behind a large page of rows. Each copy parses one body at a time, in the order they reach it. A slow parser delays only the parses behind it on its own task, and never the UI.

```brightscript
sgquery.initialize({ parserTask: "AppParserTask", parserThreads: 3 })
```

Each copy calls `getParser` for itself, so parsers must not share state through the task. Keep parsers to building the value; do any further work where the value is used.

## Next

[Testing your app](testing.md)
