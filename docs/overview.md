# Overview

sgQuery is an HTTP client for Roku SceneGraph apps with a query cache on top. At its base, it sends a request from a task thread and hands you the response as a promise. Give a request a name and it becomes a **query**: sgQuery caches the result for every component to share, parses it off the render thread, saves it to disk for the next launch, and refreshes it in the background when it goes out of date. Each of those is one more key on the definition, added when you need it.

## Motivation

SceneGraph gives you the pieces for talking to a server (`roUrlTransfer`, Task nodes, message ports) but no opinion on how to combine them. Most channels end up with a task per endpoint or one generic "API task", and every screen re-implements loading, caching and error handling around it.

Server state is not like the state your app owns:

- It lives on a server you don't control and is changed by other people and other devices.
- Getting it is slow and asynchronous, and on Roku it has to happen off the render thread.
- The copy you are showing can quietly go out of date.

Handling that well means solving the same set of problems in every channel:

- **Caching.** Two screens that show the same rail should not make two requests, and going back to a screen should not show a spinner again.
- **De-duplication.** When three components ask for the same data at the same moment, one request should answer all three.
- **Staying off the render thread.** Network I/O, JSON decoding, building ContentNode trees and file access all stall rendering if they run in the wrong place. `roFileSystem` cannot be created on the render thread at all.
- **Knowing when data is stale,** and refreshing it without making the user wait for data they already have.
- **Cold starts.** The first screen after launch shouldn't wait for the network when the app showed the same data an hour ago.
- **Writes.** After the user adds a favorite, every screen showing favorites needs the new list.
- **Per-user data.** Switching profile must never show the previous profile's data.
- **Memory.** A Roku has little of it, so the cache needs a bound.

sgQuery handles these for you, but only as far as you ask. A one-off call stays a plain request. A screen's data becomes a query, and the cache, threads, disk and refresh policy for it are configured once, when it's defined.

## Enough talk, show me some code

Set the library up once, in the main scene:

```brightscript
import "pkg:/source/roku_modules/sgquery/sgquery.brs"

sub init()
    sgquery.initialize({ baseUrl: "https://api.example.com" })
end sub
```

That's an HTTP client. From any component that imports `sgquery.brs`:

```brightscript
promises.chain(sgquery.fetch("/home/main"), m).then(function(response as object, m as object) as dynamic
    m.titleLabel.text = response.body.rows[0].title
    return invalid
end function)
```

The request is sent from a pooled task thread, with retries and a timeout, and the JSON is decoded there. The promise resolves on the render thread with the whole response. Nothing is remembered.

Now give the request a name:

```brightscript
sgquery.define("homePage", { request: { url: "/home/{slug}" }, ttl: 300 })
```

and query it instead:

```brightscript
promises.chain(sgquery.query("homePage", { slug: "main" }), m).then(function(page as object, m as object) as dynamic
    m.titleLabel.text = page.rows[0].title
    return invalid
end function)
```

What happens on the first call:

1. sgQuery builds the url `https://api.example.com/home/main` and checks the cache. It is empty.
2. The request goes out on the transport task, where the JSON is decoded.
3. The body is cached under the query's name and args, and the promise resolves with it.

Within the next five minutes, a query with the same args from any component resolves at once from memory, and two components querying at the same moment share one request. After five minutes, a query still resolves at once with the cached value, and sgQuery refreshes it in the background. If the server's answer is byte-for-byte the same, nothing changes and no one is told.

From here, each need is one more key on the definition. `parser: "HomePageParser"` builds a ContentNode tree on a task thread, and the cache stores the tree. `persist: true` keeps the body on `cachefs:/`, so the next launch draws the screen before the network answers. `scopes: ["profile"]` keeps one profile's data from reaching another. A mutation lists the queries it `expires`. The [quick start](quick-start.md) adds them in that order.

## What next

- Install it: [Installation](installation.md)
- Build a screen with it, one step at a time: [Quick start](quick-start.md)
- Learn how a query decides what to do: [Caching and freshness](guides/caching.md)
- Look something up: [API reference](reference/api.md)
