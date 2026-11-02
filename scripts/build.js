#!/usr/bin/env node
// Builds the sghttp ropm package:
//   1. installs the package's own ropm dependencies (promises) into src/*/roku_modules for compilation
//   2. compiles BrighterScript -> dist (brs + d.bs)
//   3. strips the dependency copies and maps from dist, since the consuming app's ropm install
//      supplies those and rewrites the pkg:/ paths
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const pkgDir = path.resolve(__dirname, '..');
const localBin = path.join(pkgDir, 'node_modules', '.bin');
const bin = (name) => path.join(localBin, process.platform === 'win32' ? `${name}.cmd` : name);

function run(cmd, cwd) {
    execSync(cmd, { cwd, stdio: 'inherit' });
}

// The package's own dependencies (promises) and tools (bsc, ropm), installed on first build
if (!fs.existsSync(path.join(pkgDir, 'node_modules', 'promises')) || !fs.existsSync(bin('bsc')) || !fs.existsSync(bin('ropm'))) {
    run('npm install --no-audit --no-fund --silent', pkgDir);
}
run(`"${bin('ropm')}" copy`, pkgDir);

fs.rmSync(path.join(pkgDir, 'dist'), { recursive: true, force: true });
run(`"${bin('bsc')}" --project bsconfig.json`, pkgDir);

for (const sub of ['source', 'components']) {
    fs.rmSync(path.join(pkgDir, 'dist', sub, 'roku_modules'), { recursive: true, force: true });
}
const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(p);
        else if (p.endsWith('.map')) fs.rmSync(p);
    }
};
walk(path.join(pkgDir, 'dist'));

// ropm renames a class's method declarations and the references to them differently when it
// installs the package (__sghttp_X_method_new vs sghttp___X_method_new), so a class compiles here
// and fails in the app. Plain functions install correctly.
for (const sub of ['source', 'components']) {
    for (const file of fs.readdirSync(path.join(pkgDir, 'dist', sub))) {
        if (!file.endsWith('.brs')) continue;
        const text = fs.readFileSync(path.join(pkgDir, 'dist', sub, file), 'utf8');
        const builder = text.match(/^\s*function (__\w+_builder)\(/m);
        if (builder) throw new Error(`sghttp: dist/${sub}/${file} has a class (${builder[1]}), which ropm cannot install; use plain functions`);
    }
}

// Stamp the build (Store.bs BUILD_STAMP) so the device log says which sghttp a sideload carries:
// commit, "+changes" when the working tree differs from it, and the build time
let commit = 'no-git';
try {
    commit = execSync('git rev-parse --short HEAD', { cwd: pkgDir }).toString().trim();
    if (execSync('git status --porcelain -- src scripts package.json bsconfig.json', { cwd: pkgDir }).toString().trim() !== '') commit += '+changes';
} catch {}
const pad = (n) => String(n).padStart(2, '0');
const now = new Date();
const stamp = `${commit} built ${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
const storeFile = path.join(pkgDir, 'dist', 'components', 'Store.brs');
const compiled = fs.readFileSync(storeFile, 'utf8');
if (!compiled.includes('unstamped (compiled from source)')) throw new Error('sghttp: build stamp placeholder not found in dist/components/Store.brs');
fs.writeFileSync(storeFile, compiled.split('unstamped (compiled from source)').join(stamp));
console.log(`sghttp: dist ready, build ${stamp}`);

// tests/source/testServer.brs, which the specs import, names the machine the transport specs
// talk to (scripts/test-server.js); written here too so a fresh checkout compiles the tests
// before its first npm test
require('./test-server').writeHost();
