# Testing your app

You can test code that asks sgHttp for data without a network. Give the store a fake transport, and the spec decides what each request returns, and when.

## A fake transport

Any node with a `makeRequest` function can be the transport (see [Replacing the transport](transport.md#replacing-the-transport)). This one holds every request until the spec answers it:

```xml
<!-- tests/components/FakeTransport.xml -->
<component name="FakeTransport" extends="Node">
    <interface>
        <field id="requestCount" type="integer" value="0" />
        <field id="headers" type="assocarray" />
        <function name="makeRequest" />
        <function name="answer" />
        <function name="fail" />
        <function name="requestAt" />
    </interface>
</component>
```

```brightscript
' tests/components/FakeTransport.bs
import "pkg:/source/roku_modules/promises/promises.brs"

sub init()
    m.requests = []
end sub

function makeRequest(spec as object) as object
    pending = promises.create()
    m.requests.push({ spec: spec, promise: pending })
    m.top.requestCount = m.requests.count()
    return pending
end function

' Answers request index (0 = the first) with a 200. The body doubles as its hash,
' so answering the same body twice counts as unchanged.
function answer(index as integer, body as dynamic) as boolean
    request = m.requests[index]
    if request = invalid then return false
    promises.resolve({ code: 200, body: body, bodyHash: formatJson(body), headers: {}, url: "", ms: 0 }, request.promise)
    return true
end function

function fail(index as integer, code = 500 as integer) as boolean
    request = m.requests[index]
    if request = invalid then return false
    promises.reject({ code: code, message: "fake failure" }, request.promise)
    return true
end function

function requestAt(index as integer) as dynamic
    request = m.requests[index]
    if request = invalid then return invalid
    return request.spec
end function
```

sgHttp's own specs use the same approach; see [`tests/components/FakeTransport.bs`](../../tests/components/FakeTransport.bs).

## Setting up a spec

Initialize with the fake transport and persistence off, then define the same queries the app uses. Destroy the store after each spec so the next one starts empty. The suite has to run in a node, because `initialize` finds the scene through `m.top`; sgHttp's own suite is annotated `@SGNode("Node")` for that reason:

```brightscript
@beforeEach
function setUp()
    m.fake = createObject("roSGNode", "FakeTransport")
    sghttp.initialize({ transport: m.fake, persist: false })
    registerQueries()   ' the app's own define calls
end function

@afterEach
function tearDown()
    sghttp.destroy()
end function
```

Then query, answer, and check the result:

```brightscript
@async
@it("loads the home rows")
function _()
    promises.chain(sghttp.query("homePage", { slug: "main" }), m).then(function(page as dynamic, suite as object) as dynamic
        ' No parserTask in this setup, so the value is the decoded JSON
        suite.assertEqual(page.rows.count(), 2)
        suite.done()
        return invalid
    end function)
    m.assertEqual(m.fake.callFunc("requestAt", 0).url, "/home/main")
    m.fake.callFunc("answer", 0, { rows: [{ title: "A", items: [] }, { title: "B", items: [] }] })
end function
```

Because the spec answers each request itself, it controls the order responses arrive in. That makes races testable, for example a slow refresh answering after a mutation.

## Things to know

- **Requests can start late.** A `persist: true` query reads the disk before it makes its request, so the request doesn't exist yet right after `query` returns. Turn persistence off in specs, or have the fake answer requests as they arrive.
- **Specs that persist should share one persistence task.** Each store starts its own `Persistence` task, and file operations are ordered only within a task, so a destroyed store's last write can race the next store's clear of the same folder. Create one `Persistence` node for the whole run and pass it as `initialize({ persistence: node })`. Every store's operations then queue in order, and `destroy` leaves the node running.
- **Parsers need a parser task.** Pass `parserTask` to `initialize` in specs that test parsing. Or test parser classes directly: `new HomePageParser().parse(json, {})` needs no task.
- **`spec.url` has no base url or query string.** It's the filled url as the definition wrote it. Check `spec.query` for parameters.
- **Destroy between specs.** `initialize` returns the existing store if there is one, so without `destroy` one spec's cache and definitions leak into the next.

## Next

[Threads and memory](threads-and-memory.md)
