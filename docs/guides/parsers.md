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
- `args` are the args passed to `fetch` or `mutate`, or `{}`.
- The return value is what `fetch` resolves with and what the cache stores. Return anything: a node, an associative array, a string.
- If `parse` throws, the fetch rejects with `{ message: "sgquery parser \"ShowParser\" threw: ...", error }`.

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

Pass the component name to `initialize`, and name a parser in each definition that needs one:

```brightscript
sgquery.initialize({ parserTask: "AppParserTask" })
sgquery.define("show", { request: { url: "/shows/{id}" }, parser: "ShowParser" })
```

- `getParser` is called for every response, so each parse gets a new instance. Don't rely on state kept between parses.
- An unknown name (`getParser` returns `invalid`) rejects the fetch with `sgquery parser: unknown parser "..."`.
- A definition naming a parser when no `parserTask` was configured rejects with a message saying so.
- Queries without a `parser` resolve with the decoded body itself.

## Nodes come back by reference

ContentNode trees built in the parser are handed to the render thread by reference, not copied. The cache stores that same tree, and every fetch of the key returns it. See [Threads and memory](threads-and-memory.md#cached-nodes-are-shared) for what that means when you attach it to the screen.

## One parser task, one thread

All parses run on the same task, one at a time, in the order the responses arrive. A slow parser delays the parses behind it, but never the UI. Keep parsers to building the value; do any further work where the value is used.

## Next

[More than one server](multiple-servers.md)
