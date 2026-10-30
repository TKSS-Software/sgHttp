# Overview

sgQuery manages **server state** in Roku SceneGraph apps: the data your channel fetches from its APIs. You describe each endpoint once, then ask for it by name. sgQuery makes the request on a task thread, parses the response off the render thread, caches the result for every component to share, saves it to disk for the next launch, and refreshes it in the background when it goes out of date.

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

sgQuery handles these for you. A typical screen asks for its data and draws it; the cache, threads, disk and refresh policy are configured once, when the query is defined.

Underneath the cache is an ordinary HTTP client: a pooled `roUrlTransfer` task with retries, timeouts, shared headers and JSON decoding. It's there on its own too, as [`request`](guides/requests.md), for the calls that don't need a cache.

## Enough talk, show me some code

Set the library up once, in the main scene:

```brightscript
import "pkg:/source/roku_modules/sgquery/sgquery.brs"

sub init()
    sgquery.initialize({
        baseUrl: "https://api.example.com"
        parserTask: "AppParserTask"
    })

    sgquery.define("homePage", {
        request: { url: "/home/{slug}" }
        parser: "HomePageParser"
        ttl: 300
        persist: true
    })
end sub
```

Then fetch from any component that imports `sgquery.brs`:

```brightscript
sub showHome()
    promises.chain(sgquery.fetch("homePage", { slug: "main" }), m).then(function(page as object, m as object) as dynamic
        m.rowList.content = page
        return invalid
    end function).catch(function(error as object, m as object) as dynamic
        m.errorLabel.text = "Couldn't load the home page"
        return invalid
    end function)
end sub
```

What happens on the first call:

1. sgQuery builds the url `https://api.example.com/home/main` and checks the cache. It is empty.
2. Since `persist` is on, it checks `cachefs:/` for a body saved by an earlier launch. On a first install there isn't one.
3. The request goes out on the transport task. The JSON is decoded there, and the `HomePageParser` builds a ContentNode tree on the parser task.
4. The tree is cached, the raw body is written to disk, and the promise resolves.

Within the next five minutes, a fetch with the same args from any component resolves at once from memory. After that, it still resolves at once with the cached tree, and sgQuery refreshes it in the background. If the server's answer is byte-for-byte the same, the refresh doesn't parse anything and no watcher is notified.

## What next

- Install it: [Installation](installation.md)
- Build a screen with it: [Quick start](quick-start.md)
- Learn how a fetch decides what to do: [Caching and freshness](guides/caching.md)
- Look something up: [API reference](reference/api.md)
