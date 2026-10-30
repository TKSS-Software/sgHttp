# Contributing

## Layout

| Path | What |
|---|---|
| `src/source/sgquery.bs` | The public API: thin wrappers that `callFunc` into the store |
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

On the first run this installs the package's own tools. It then copies the `promises` dependency into `src/` for compilation, compiles `src/` to `dist/` (`.brs` plus `.d.bs` type definitions), and strips the dependency copies and source maps from `dist/`. The consuming app's ropm install supplies those itself.

ropm installs the package from `dist/`. After a change, build, then run `npx ropm copy` in the app to pick it up.

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

This builds the package, compiles the test app (`bsconfig-test.json`), deploys it, and prints the Rooibos report. The device's debug console (port 8085) must be free. A VS Code debug session or BrightScript console attached to the device makes the run fail with `SocketConnectionInUseError`.

The specs live in `tests/components/sgqueryStore.spec.bs`. They drive a real store through `FakeTransport`, which holds each request until the spec answers it with `answer(index, body)` or `fail(index, code)`, so a spec decides the order responses arrive in. For requests that start later, after a disk read for a `persist: true` query, `answerNext(body)` queues an answer for the next request made.

## Documentation

User documentation lives in `docs/`, linked from the README. A change to behaviour should update the guide that describes it and the [API](reference/api.md) or [definition](reference/definition.md) reference.
