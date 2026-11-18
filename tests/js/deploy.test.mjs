// scripts/deploy.sh puts the working tree on a Home Assistant without a release, and takes it
// back (see CONTRIBUTING.md, "Trying a version on a real Home Assistant"). The tests deploy to a
// local folder, with a fake `docker` that logs its calls.
import './setup.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, chmodSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, delimiter } from 'node:path';
import { fileURLToPath } from 'node:url';
import { VERSION } from '../../custom_components/chauffage/frontend/chauffage-programme-card.js';

const root = fileURLToPath(new URL('../../', import.meta.url));

function home() {
  const dir = mkdtempSync(join(tmpdir(), 'chauffage-deploy-'));
  const config = join(dir, 'config');
  mkdirSync(join(config, 'custom_components', 'chauffage'), { recursive: true });
  mkdirSync(join(config, '.storage'));
  writeFileSync(join(config, 'configuration.yaml'), 'default_config:\n');
  writeFileSync(join(config, 'custom_components', 'chauffage', 'manifest.json'), '{"version": "0.8.0"}\n');
  writeFileSync(join(config, '.storage', 'chauffage'), 'data of 0.8.0');
  const bin = join(dir, 'bin');
  mkdirSync(bin);
  writeFileSync(join(bin, 'docker'), `#!/usr/bin/env bash\necho "$*" >> "${join(dir, 'docker.log').replace(/\\/g, '/')}"\n`);
  chmodSync(join(bin, 'docker'), 0o755);
  writeFileSync(join(dir, '.env'), 'PROD_HA_CONTAINER=homeassistant\n');
  const run = (...args) => execFileSync('bash', ['scripts/deploy.sh', ...args, config], {
    cwd: root,
    env: { ...process.env, ENV_FILE: join(dir, '.env'), PATH: `${bin}${delimiter}${process.env.PATH}` },
    encoding: 'utf8',
  });
  const read = (path) => readFileSync(join(config, path), 'utf8');
  const installed = () => JSON.parse(read('custom_components/chauffage/manifest.json')).version;
  const docker = () => readFileSync(join(dir, 'docker.log'), 'utf8').trim().split('\n');
  return { config, run, read, installed, docker };
}

test('a deployed working tree carries a dev version, the same in the card and the integration', () => {
  const ha = home();
  ha.run();
  const version = ha.installed();
  assert.ok(version.startsWith(`${VERSION}${VERSION.includes('-') ? '.' : '-'}dev.`), version);
  assert.match(ha.read('custom_components/chauffage/frontend/chauffage-programme-card.js'),
    new RegExp(`^const VERSION = '${version.replace(/\./g, '\\.')}';$`, 'm'));
  assert.equal(existsSync(join(ha.config, 'custom_components/chauffage/__pycache__')), false);
  assert.deepEqual(ha.docker(), ['restart homeassistant']);
});

test('the release installed before the first deploy is kept, and comes back with its data', () => {
  const ha = home();
  ha.run();
  ha.run(); // a second deploy keeps the release, not the first dev version
  writeFileSync(join(ha.config, '.storage', 'chauffage'), 'data migrated by the dev version');
  ha.run('--rollback');
  assert.equal(ha.installed(), '0.8.0');
  assert.equal(ha.read('.storage/chauffage'), 'data of 0.8.0');
  assert.deepEqual(ha.docker().slice(-2), ['stop homeassistant', 'start homeassistant']);
});

test('without a container to stop, the rollback keeps the saved data for you to put back', () => {
  const ha = home();
  writeFileSync(join(ha.config, '..', '.env'), ''); // no PROD_HA_CONTAINER
  ha.run();
  writeFileSync(join(ha.config, '.storage', 'chauffage'), 'data migrated by the dev version');
  ha.run('--rollback');
  assert.equal(ha.installed(), '0.8.0');
  assert.equal(ha.read('.chauffage-backup/storage'), 'data of 0.8.0');
});

test('a folder without configuration.yaml is refused', () => {
  const ha = home();
  writeFileSync(join(ha.config, 'configuration.yaml'), '');
  execFileSync('bash', ['-c', `rm "${join(ha.config, 'configuration.yaml').replace(/\\/g, '/')}"`]);
  assert.throws(() => ha.run());
  assert.equal(ha.installed(), '0.8.0');
});
