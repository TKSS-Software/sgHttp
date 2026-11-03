#!/usr/bin/env node
// Builds the package and lays out what an installed copy of it needs, as one folder:
//
//   node scripts/release-tree.js 0.1.0-rc.3          -> build/release/
//
// package.json there carries the version given and no scripts or devDependencies, so the .tgz
// that `npm pack` makes of it installs by copying files and running nothing. Building first and
// writing the version afterwards keeps the build stamp from reading "+changes".
// See .github/workflows/release-candidate.yml.
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const version = process.argv[2];
if (!version || !/^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/.test(version)) {
    console.error('usage: node scripts/release-tree.js <version>   e.g. 0.1.0-rc.3');
    process.exit(1);
}

const pkgDir = path.resolve(__dirname, '..');
const out = path.join(pkgDir, 'build', 'release');

execSync('node scripts/build.js', { cwd: pkgDir, stdio: 'inherit' });

fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });
fs.cpSync(path.join(pkgDir, 'dist'), path.join(out, 'dist'), { recursive: true });
for (const file of ['README.md', 'LICENSE']) fs.copyFileSync(path.join(pkgDir, file), path.join(out, file));

const pkg = JSON.parse(fs.readFileSync(path.join(pkgDir, 'package.json'), 'utf8'));
delete pkg.scripts;
delete pkg.devDependencies;
pkg.version = version;
fs.writeFileSync(path.join(out, 'package.json'), JSON.stringify(pkg, null, 2) + '\n');

console.log(`sghttp: release tree for ${version} in build/release`);
