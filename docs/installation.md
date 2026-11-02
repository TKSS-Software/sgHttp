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

## Editor support

The package ships a typedef, `sghttp.d.bs`, which ropm installs beside `sghttp.brs`. In an editor with the BrighterScript extension, every `sghttp.*` function shows its documentation on hover and in completions. So do the shapes the functions take and return: `sghttp.Definition`, `sghttp.Request`, `sghttp.FetchSpec`, `sghttp.Response`, `sghttp.PagedValue`, `sghttp.InitializeParams`, `sghttp.QueryOptions`, `sghttp.MutateOptions`, `sghttp.Event` and `sghttp.Change`. They describe the keys but enforce nothing: any associative array with the right keys works. Annotate your own code with them to get the same help there:

```brightscript
function homePageDefinition() as sghttp.Definition
    return { request: { url: "/home/{slug}" }, parser: "HomePageParser", ttl: 300 }
end function
```

## Next

[Quick start](quick-start.md)
