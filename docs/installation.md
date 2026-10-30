# Installation

## Requirements

- A SceneGraph channel built with [BrighterScript](https://github.com/rokucommunity/brighterscript). Plain BrightScript works too; see [Calling from plain BrightScript](#calling-from-plain-brightscript).
- [ropm](https://github.com/rokucommunity/ropm) to install the package.
- [promises](https://github.com/rokucommunity/promises), which ropm installs with sgquery. Every fetch returns one of its promise nodes.

## Install with ropm

sgquery isn't published to npm. Build it from a checkout, then install it from the folder:

```sh
git clone https://github.com/TKSS-Software/sgQueury.git
cd sgQueury
npm run build          # installs its own tools on the first run, then compiles to dist/
```

Then, in your channel:

```sh
npx ropm install sgquery@file:../sgQueury
```

ropm copies the package into your channel's `roku_modules` folders and prefixes its names with `sgquery_`: the `Store` component becomes `sgquery_Store`, the `ParserTask` component becomes `sgquery_ParserTask`, and so on.

After changing sgquery itself, rebuild it (`npm run build`), then run `npx ropm copy` in the channel to pick up the new build.

## Initialize the store

All of sgquery's state lives in one node, created by `initialize` and attached to the scene. Call it once, early, from the main scene's `init()`. If you use sgRouter, call it before the router starts, so the first view can fetch:

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

Every component that imports it talks to the same store, so they all share one cache. Call sgquery from components on the render thread, not from inside Task functions.

## Calling from plain BrightScript

In BrighterScript the functions are a namespace, `sgquery.fetch(...)`, because ropm wraps the package's type definitions in `namespace sgquery`. Underneath, they are plain functions named `sgquery_fetch(...)`, `sgquery_define(...)` and so on, which is what you call from a `.brs` file.

Plain BrightScript has no `import`, so the component's XML has to list every file the API needs. That means the promises library and the three files ropm puts in `source/roku_modules/sgquery/`:

```xml
<script type="text/brightscript" uri="pkg:/source/roku_modules/promises/promises.brs" />
<script type="text/brightscript" uri="pkg:/source/roku_modules/sgquery/bslib.brs" />
<script type="text/brightscript" uri="pkg:/source/roku_modules/sgquery/keys.brs" />
<script type="text/brightscript" uri="pkg:/source/roku_modules/sgquery/sgquery.brs" />
```

## Next

[Quick start](quick-start.md)
