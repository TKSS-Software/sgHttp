# Installation

## Requirements

- A SceneGraph channel built with [BrighterScript](https://github.com/rokucommunity/brighterscript).
- [ropm](https://github.com/rokucommunity/ropm) to install the package.
- [promises](https://github.com/rokucommunity/promises), which ropm installs with sgQuery. Every `fetch` and `query` returns one of its promise nodes.

## Install with ropm

sgQuery isn't published to npm. Build it from a checkout, then install it from the folder:

```sh
git clone https://github.com/TKSS-Software/sgQuery.git
cd sgQuery
npm run build          # installs its own tools on the first run, then compiles to dist/
```

Then, in your channel:

```sh
npx ropm install sgquery@file:../sgQuery
```

ropm copies the package into your channel's `roku_modules` folders and prefixes its names with `sgquery_`: the `Store` component becomes `sgquery_Store`, the `ParserTask` component becomes `sgquery_ParserTask`, and so on.

After changing sgQuery itself, rebuild it (`npm run build`), then run `npx ropm copy` in the channel to pick up the new build.

## Initialize

Call `initialize` once, early, from the main scene's `init()`, before any component sends a request. (If your app uses sgRouter, that means before the router starts.) It creates one node on the scene that owns the transport, the shared headers and, if you use them, the cache.

```brightscript
import "pkg:/source/roku_modules/sgquery/sgquery.brs"

sub init()
    sgquery.initialize({ baseUrl: "https://api.example.com" })
end sub
```

That's enough to send requests. Every setting is optional, `baseUrl` included; the ones you're most likely to add are `headers` (sent with every request), `timeout`, `retries` and `maxConcurrent` for the transport, `clients` for more servers, and `parserTask` if you use parsers. See [`initialize`](reference/api.md#initialize) for the full list.

`initialize` is idempotent: calling it again returns the existing store and ignores the new settings.

## Use it from other components

Import the same file into any component that sends requests:

```brightscript
import "pkg:/source/roku_modules/sgquery/sgquery.brs"
```

Every component that imports it talks to the same store: one transport pool, one set of shared headers, one cache. Call sgQuery from components on the render thread, not from inside Task functions.

## Next

[Quick start](quick-start.md)
