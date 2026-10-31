# Installation

## Requirements

- A SceneGraph channel built with [BrighterScript](https://github.com/rokucommunity/brighterscript).
- [ropm](https://github.com/rokucommunity/ropm) to install the package.
- [promises](https://github.com/rokucommunity/promises), which ropm installs with sgHttp. Every `fetch` and `query` returns one of its promise nodes.

## Install with ropm

sgHttp isn't published to npm. Build it from a checkout, then install it from the folder:

```sh
git clone https://github.com/TKSS-Software/sgHttp.git
cd sgHttp
npm run build          # installs its own tools on the first run, then compiles to dist/
```

Then, in your channel:

```sh
npx ropm install sghttp@file:../sgHttp
```

ropm copies the package into your channel's `roku_modules` folders and prefixes its names with `sghttp_`: the `Store` component becomes `sghttp_Store`, the `ParserTask` component becomes `sghttp_ParserTask`, and so on.

After changing sgHttp itself, rebuild it (`npm run build`), then run `npx ropm copy` in the channel to pick up the new build.

## Initialize

Call `initialize` once, early, from the main scene's `init()`, before any component sends a request. It creates one node on the scene that owns the transport, the shared headers and the cache.

```brightscript
import "pkg:/source/roku_modules/sghttp/sghttp.brs"

sub init()
    sghttp.initialize({ baseUrl: "https://api.example.com" })
end sub
```

That's enough to send requests. Every setting is optional, `baseUrl` included. The ones you're most likely to add are:

- `headers`, sent with every request
- `timeout`, `retries` and `maxConcurrent`, for the transport
- `clients`, for more servers
- `parserTask`, when you use parsers

See [`initialize`](reference/api.md#initialize) for the full list.

Calling `initialize` again does nothing: it returns the existing store and ignores the new settings.

## Use it from other components

Import the same file into any component that sends requests:

```brightscript
import "pkg:/source/roku_modules/sghttp/sghttp.brs"
```

Every component that imports it talks to the same store: one transport pool, one set of shared headers, one cache.

## Editor support

The package ships a typedef, `sghttp.d.bs`, which ropm installs beside `sghttp.brs`. In an editor with the BrighterScript extension, every `sghttp.*` function shows its documentation on hover and in completions. So do the shapes the functions take and return: `sghttp.Definition`, `sghttp.Request`, `sghttp.FetchSpec`, `sghttp.Response`, `sghttp.PagedValue`, `sghttp.InitializeParams`, `sghttp.QueryOptions`, `sghttp.MutateOptions`, `sghttp.Event` and `sghttp.Change`. They describe the keys but enforce nothing: any associative array with the right keys works. Annotate your own code with them to get the same help there:

```brightscript
function homePageDefinition() as sghttp.Definition
    return { request: { url: "/home/{slug}" }, parser: "HomePageParser", ttl: 300 }
end function
```

## Next

[Quick start](quick-start.md)
