#!/usr/bin/env node
// Builds the sgquery ropm package:
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
console.log('sgquery: dist ready');
