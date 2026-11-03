# Installation

## Requirements

- A SceneGraph channel built with [BrighterScript](https://github.com/rokucommunity/brighterscript).
- [ropm](https://github.com/rokucommunity/ropm) to install the package.
- [promises](https://github.com/rokucommunity/promises), which ropm installs with sgHttp. Every `fetch` and `query` returns one of its promise nodes.

## Install with ropm

sgHttp isn't on npm yet. Each release candidate is a GitHub release with the package attached, and ropm installs it from that file's url. In your channel:

```sh
npx ropm install sghttp@https://github.com/TKSS-Software/sgHttp/releases/download/v0.1.0-rc.3/sghttp-0.1.0-rc.3.tgz
```

That line always names the latest candidate; every candidate is listed under [Releases](https://github.com/TKSS-Software/sgHttp/releases) with its own. Your package.json records the url, as it would a version, and `npx ropm install` on another machine installs the same build. When sgHttp reaches npm, the line becomes `npx ropm install sghttp`.

ropm copies the package into your channel's `roku_modules` folders and prefixes its names with `sghttp_`: the `Store` component becomes `sghttp_Store`, the `ParserTask` component becomes `sghttp_ParserTask`, and so on.

### From a checkout

To work on sgHttp itself, or try a change before it's a candidate, build it from a checkout and install it from the folder:

```sh
git clone https://github.com/TKSS-Software/sgHttp.git
cd sgHttp
npm run build          # installs its own tools on the first run, then compiles to dist/
```

Then, in your channel:

```sh
npx ropm install sghttp@file:../sgHttp
```

After changing sgHttp, rebuild it (`npm run build`), then run `npx ropm copy` in the channel to pick up the new build.

## Editor support

The package ships a typedef, `sghttp.d.bs`, which ropm installs beside `sghttp.brs`. In an editor with the BrighterScript extension, every `sghttp.*` function shows its documentation on hover and in completions. So do the shapes the functions take and return: `sghttp.Definition`, `sghttp.Request`, `sghttp.FetchSpec`, `sghttp.Response`, `sghttp.PagedValue`, `sghttp.InitializeParams`, `sghttp.QueryOptions`, `sghttp.MutateOptions`, `sghttp.Event` and `sghttp.Change`. They describe the keys but enforce nothing: any associative array with the right keys works. Annotate your own code with them to get the same help there:

```brightscript
function homePageDefinition() as sghttp.Definition
    return { request: { url: "/home/{slug}" }, parser: "HomePageParser", ttl: 300 }
end function
```

## Next

[Quick start](quick-start.md)
