#!/usr/bin/env node
// Points the install instructions at a release candidate:
//
//   node scripts/point-install-docs.js 0.1.0-rc.3
//
// rewrites every .../releases/download/v<old>/sghttp-<old>.tgz url in README.md and
// docs/installation.md to the version given. Run by .github/workflows/release-candidate.yml
// after the release exists, which then commits the result when anything changed. Exits 1 when
// no url was found at all, so a missing one is noticed rather than silently left stale.
const fs = require('fs');
const path = require('path');

const version = process.argv[2];
if (!version || !/^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/.test(version)) {
    console.error('usage: node scripts/point-install-docs.js <version>   e.g. 0.1.0-rc.3');
    process.exit(1);
}

const pkgDir = path.resolve(__dirname, '..');
const pattern = /releases\/download\/v[0-9A-Za-z.-]+\/sghttp-[0-9A-Za-z.-]+\.tgz/g;
let found = 0;
for (const file of ['README.md', 'docs/installation.md']) {
    const full = path.join(pkgDir, file);
    const before = fs.readFileSync(full, 'utf8');
    const matches = (before.match(pattern) || []).length;
    found += matches;
    const after = before.replace(pattern, `releases/download/v${version}/sghttp-${version}.tgz`);
    if (after !== before) {
        fs.writeFileSync(full, after);
        console.log(`point-install-docs: ${file} now installs v${version}`);
    } else if (matches > 0) {
        console.log(`point-install-docs: ${file} already installs v${version}`);
    }
}
if (found === 0) {
    console.error('point-install-docs: no install url found to update');
    process.exit(1);
}
