# Installation

## Requirements

- A SceneGraph channel built with [BrighterScript](https://github.com/rokucommunity/brighterscript).
- [ropm](https://github.com/rokucommunity/ropm) to install the package.
- [promises](https://github.com/rokucommunity/promises), which ropm installs with sgQuery. Every fetch returns one of its promise nodes.

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

## Initialize the store

All of sgQuery's state lives in one node, created by `initialize` and attached to the scene. Call it once, early, from the main scene's `init()`, before any screen fetches. (If your app uses sgRouter, that means before the router starts.)

```brightscript
import "pkg:/source/roku_modules/sgquery/sgquery.brs"

sub init()
    sgquery.initialize({
        baseUrl: "https://api.example.com"
        headers: { "X-Platform": "roku" }
        parserTask: "AppParserTask"
        version: "1"
    })
end sub
```

`initialize` is idempotent: calling it again returns the existing store and ignores the new settings. Every setting is optional; see [`initialize`](reference/api.md#initialize) for the full list.

## Use it from other components

Import the same file into any component that needs data:

```brightscript
import "pkg:/source/roku_modules/sgquery/sgquery.brs"
```

Every component that imports it talks to the same store, so they all share one cache. Call sgQuery from components on the render thread, not from inside Task functions.

## Next

[Quick start](quick-start.md)
