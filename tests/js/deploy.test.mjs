// scripts/deploy.sh puts the working tree on a Home Assistant without a release, and takes it
// back (see CONTRIBUTING.md, "Trying a version on a real Home Assistant"). The tests deploy to a
// local folder, with a fake `docker` that logs its calls.
import './setup.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, chmodSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, delimiter } from 'node:path';
import { fileURLToPath } from 'node:url';
import { VERSION } from '../../custom_components/chauffage/frontend/chauffage-programme-card.js';

const root = fileURLToPath(new URL('../../', import.meta.url));
const posix = (path) => path.replace(/\\/g, '/');

// A Home Assistant configuration folder with release 0.8.0 of Chauffage and its data.
// container: whether the script may stop and start Home Assistant (PROD_HA_CONTAINER).
function home({ container = true, release = true, env = {} } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'chauffage-deploy-'));
  const config = join(dir, 'config');
  mkdirSync(join(config, 'custom_components'), { recursive: true });
  mkdirSync(join(config, '.storage'));
  writeFileSync(join(config, 'configuration.yaml'), 'default_config:\n');
  if (release) {
    mkdirSync(join(config, 'custom_components', 'chauffage'));
    writeFileSync(join(config, 'custom_components', 'chauffage', 'manifest.json'), '{"version": "0.8.0"}\n');
    writeFileSync(join(config, '.storage', 'chauffage'), 'data of 0.8.0');
  }
  const bin = join(dir, 'bin');
  mkdirSync(bin);
  writeFileSync(join(bin, 'docker'), `#!/usr/bin/env bash\necho "$*" >> "${posix(join(dir, 'docker.log'))}"\n`);
  chmodSync(join(bin, 'docker'), 0o755);
  writeFileSync(join(dir, '.env'), container ? 'PROD_HA_CONTAINER=homeassistant\n' : '');
  // Never the developer's own PROD_* settings: a test must not restart a real Home Assistant
  const clean = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('PROD_')));
  const run = (...args) => execFileSync('bash', ['scripts/deploy.sh', ...args, config], {
    cwd: root,
    env: { ...clean, ENV_FILE: join(dir, '.env'), PATH: `${bin}${delimiter}${process.env.PATH}`, ...env },
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const path = (p) => join(config, p);
  const read = (p) => readFileSync(path(p), 'utf8');
  const write = (p, text) => writeFileSync(path(p), text);
  const installed = () => JSON.parse(read('custom_components/chauffage/manifest.json')).version;
  const docker = () => (existsSync(join(dir, 'docker.log')) ? readFileSync(join(dir, 'docker.log'), 'utf8').trim().split('\n') : []);
  return { dir, config, run, path, read, write, installed, docker };
}

// A copy of the integration's source with another version, for DEPLOY_SOURCE
function source(version) {
  const dir = mkdtempSync(join(tmpdir(), 'chauffage-source-'));
  mkdirSync(join(dir, 'frontend'));
  writeFileSync(join(dir, 'manifest.json'), `{\n  "domain": "chauffage",\n  "version": "${version}"\n}\n`);
  writeFileSync(join(dir, 'frontend', 'chauffage-programme-card.js'), `const VERSION = '${version}';\n`);
  return dir;
}

test('a deployed working tree carries a dev version, the same in the card and the integration', () => {
  const ha = home();
  ha.run();
  const version = ha.installed();
  assert.ok(version.startsWith(`${VERSION}.dev.`) || version.startsWith(`${VERSION}-dev.`), version);
  assert.match(ha.read('custom_components/chauffage/frontend/chauffage-programme-card.js'),
    new RegExp(`^const VERSION = '${version.replace(/\./g, '\\.')}';$`, 'm'));
  assert.equal(existsSync(ha.path('custom_components/chauffage/__pycache__')), false);
  assert.equal(existsSync(ha.path('custom_components/chauffage.new')), false);
  assert.deepEqual(ha.docker(), ['restart homeassistant']);
});

test('a dev version of a pre-release sorts after it', () => {
  const ha = home({ env: { DEPLOY_SOURCE: source('0.9.0-beta.4') } });
  ha.run();
  assert.match(ha.installed(), /^0\.9\.0-beta\.4\.dev\.\d{14}\.g\w+$/);
});

test('a dev version of a release sorts after it, so an open card asks for a reload, not a restart', () => {
  const ha = home({ env: { DEPLOY_SOURCE: source('0.9.0') } });
  ha.run();
  assert.match(ha.installed(), /^0\.9\.1-dev\.\d{14}\.g\w+$/);
});

test('the deployed folder can be read by every user, whoever runs Home Assistant', { skip: process.platform === 'win32' }, () => {
  const ha = home();
  ha.run();
  assert.equal(statSync(ha.path('custom_components/chauffage')).mode & 0o777, 0o755);
});

test('the release installed before the first deploy is kept, and comes back with its data', () => {
  const ha = home();
  ha.run();
  ha.run(); // a second deploy keeps the release, not the first dev version
  ha.write('.storage/chauffage', 'data migrated by the dev version');
  ha.run('--rollback');
  assert.equal(ha.installed(), '0.8.0');
  assert.equal(ha.read('.storage/chauffage'), 'data of 0.8.0');
  assert.equal(existsSync(ha.path('.chauffage-backup')), false);
  assert.deepEqual(ha.docker().slice(-2), ['stop homeassistant', 'start homeassistant']);
});

test('a deploy cut short keeps the saved release', () => {
  const ha = home();
  ha.run();
  rmSync(ha.path('custom_components/chauffage'), { recursive: true }); // the transfer broke half-way
  ha.run();
  ha.run('--rollback');
  assert.equal(ha.installed(), '0.8.0');
});

test('a HACS update between two deploys keeps the release saved first', () => {
  const ha = home();
  ha.run();
  ha.write('.storage/chauffage', 'data migrated by the dev version');
  ha.write('custom_components/chauffage/manifest.json', '{"version": "0.8.1"}\n'); // HACS update
  ha.run();
  ha.run('--rollback');
  assert.equal(ha.installed(), '0.8.0');
  assert.equal(ha.read('.storage/chauffage'), 'data of 0.8.0');
});

test('without a container, the rollback puts back the code, keeps the saved data and does not restart', () => {
  // A restart would start the release on the data of the dev version
  const ha = home({ container: false, env: { PROD_HA_URL: 'http://127.0.0.1:9', PROD_HA_TOKEN: 'token' } });
  ha.run('--no-restart'); // no Home Assistant at that URL
  ha.write('.storage/chauffage', 'data migrated by the dev version');
  const said = ha.run('--rollback');
  assert.equal(ha.installed(), '0.8.0');
  assert.equal(ha.read('.chauffage-backup/storage'), 'data of 0.8.0');
  assert.match(said, /\.chauffage-backup\/storage/);
});

test('without a container, a deploy after the rollback keeps the release data', () => {
  const ha = home({ container: false });
  ha.run();
  ha.write('.storage/chauffage', 'data migrated by the dev version');
  ha.run('--rollback');
  ha.run('--rollback'); // a second rollback changes nothing
  assert.equal(ha.installed(), '0.8.0');
  ha.run();
  assert.equal(ha.read('.chauffage-backup/storage'), 'data of 0.8.0');
});

test('a rollback on a Home Assistant that had no Chauffage removes the dev version', () => {
  const ha = home({ release: false });
  ha.run();
  ha.run('--rollback');
  assert.equal(existsSync(ha.path('custom_components/chauffage')), false);
  assert.equal(existsSync(ha.path('.storage/chauffage')), false);
});

test('a rollback without a deploy changes nothing', () => {
  const ha = home();
  assert.throws(() => ha.run('--rollback'));
  assert.equal(ha.installed(), '0.8.0');
  assert.deepEqual(ha.docker(), []);
});

test('a folder without configuration.yaml is refused', () => {
  const ha = home();
  rmSync(ha.path('configuration.yaml'));
  assert.throws(() => ha.run());
  assert.equal(ha.installed(), '0.8.0');
});

test('over SSH, the remote login shell may be sh', () => {
  const ha = home();
  // ssh -- <host> <command>: the remote login shell runs the command
  writeFileSync(join(ha.dir, 'bin', 'ssh'), '#!/usr/bin/env bash\n[ "$1" = -- ] && shift\nshift\nexec sh -c "$1"\n');
  chmodSync(join(ha.dir, 'bin', 'ssh'), 0o755);
  ha.run('--no-restart', `home-assistant:${posix(ha.config)}`.replace(/^home-assistant:([A-Za-z]):/, 'home-assistant:/$1'));
  assert.match(ha.installed(), /dev\./);
});

test('a folder with a quote in its name is reached as is', () => {
  const ha = home();
  const odd = join(ha.dir, "it's here");
  execFileSync('bash', ['-c', `mv "${posix(ha.config)}" "${posix(odd)}"`]);
  execFileSync('bash', ['scripts/deploy.sh', '--no-restart', odd], {
    cwd: root, env: { ...process.env, ENV_FILE: join(ha.dir, '.env') }, stdio: 'ignore',
  });
  assert.match(JSON.parse(readFileSync(join(odd, 'custom_components/chauffage/manifest.json'), 'utf8')).version, /dev\./);
});
