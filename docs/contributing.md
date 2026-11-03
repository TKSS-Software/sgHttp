# Contributing

## Layout

| Path | What |
|---|---|
| `src/source/sghttp.bs` | The public API: thin wrappers that `callFunc` into the store |
| `src/source/keys.bs` | Cache keys, url templates and small helpers shared by the API and the store |
| `src/components/Store.bs` | The cache: definitions, entries, freshness, expiry, scopes, watchers, events |
| `src/components/Transport.bs` | The default HTTP task |
| `src/components/ParserTask.bs` | The parser task apps extend |
| `src/components/Persistence.bs` | `cachefs:/` file access |
| `tests/` | A small test app that `src/` is compiled into, with the Rooibos specs |
| `scripts/build.js` | The package build |

The store runs on the render thread and only does bookkeeping. Network, parsing and file work belong on the tasks. `roFileSystem` can't be created on the render thread, so never add file access to the store.

## Build

```sh
npm run build
```

On the first run, this installs the package's own tools. It then copies the `promises` dependency into `src/` for compilation, compiles `src/` to `dist/` (`.brs` plus `.d.bs` type definitions), and strips the dependency copies and source maps from `dist/`. The consuming app's ropm install supplies those itself.

ropm installs the package from `dist/`; [Installation](installation.md#install-with-ropm) covers picking up a new build in the app.

## Test

The specs run on a real Roku in developer mode. Copy `.env.example` to `.env` and fill in the device:

```sh
ROKU_IP=192.168.1.10
ROKU_PASSWORD=yourpassword
```

Then:

```sh
npm test
```

This builds the package, compiles the test app (`bsconfig-test.json`), deploys it, and prints the Rooibos report. The deploy goes through `scripts/rooibos.js`, which runs the Rooibos CLI but replaces the dev channel instead of deleting it first. Deleting it would wipe the registry that every sideloaded app shares, signing you out of the app you sideload next. The specs' disk cache lives in the test app's own `cachefs:/` folder, so clearing it never touches another sideloaded app's folder. The device's debug console (port 8085) must be free. A VS Code debug session or BrightScript console attached to the device makes the run fail with `SocketConnectionInUseError`.

The transport specs (`tests/components/sghttpTransport.spec.bs`) send real requests to a small server, `scripts/test-server.js`, which `npm test` starts on this machine on port 8099 and the Roku must be able to reach. Its address is written to `tests/source/testServer.brs` (ignored by git) by `npm run build` and `npm test`, so build once before compiling the tests in an editor.

The cache specs live in `tests/components/sghttpStore.spec.bs`. They drive a real store through `FakeTransport`, which holds each request until the spec answers it with `answer(index, body)` or `fail(index, code)`, so a spec decides the order responses arrive in. A `persist: true` query reads the disk before its request starts. For requests that start late like that, `answerNext(body)` queues an answer for the next request made.

## Release candidates

sgHttp isn't on npm yet. A build is attached to a GitHub release instead, and an app installs it from that file's url, with no clone:

```sh
ropm install sghttp@https://github.com/TKSS-Software/sgHttp/releases/download/v0.1.0-rc.3/sghttp-0.1.0-rc.3.tgz
```

The app's package.json records the url, as it would a version. When sgHttp reaches npm, the line becomes `ropm install sghttp`.

- **A release candidate:** run the *Release candidate* workflow from the Actions tab, on `main`. It builds the package, tags the commit `v<version>`, creates a prerelease with the `.tgz` attached and the install line in its notes, and pushes one commit that points the README's and the Installation page's install line at it (`scripts/point-install-docs.js`). Left empty, the version is the next `rc` of package.json's version (`0.1.0-rc.1`, `0.1.0-rc.2`, …); type one in to choose. `main`'s package.json is never changed; the tags are the record.
- **A package from a pull request:** add the `create-package` label. Every push then builds `<version>-<branch>.<timestamp>`, attaches it to the catch-all `v0.0.0-packages` release, and comments the install line on the pull request.
- **Locally:** `node scripts/release-tree.js 0.1.0-rc.9` builds the package into `build/release/`, with a package.json that has no scripts, so installing it runs nothing; `cd build/release && npm pack` makes the `.tgz`.

## Documentation

User documentation lives in `docs/`, linked from the README. A change to behaviour should update the guide that describes it and the [API](reference/api.md) or [definition](reference/definition.md) reference.
