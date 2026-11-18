// scripts/deploy.sh puts the working tree on a Home Assistant without a release, and takes it
// back (see CONTRIBUTING.md, "Trying a version on a real Home Assistant"). The tests deploy to a
// local folder, with a fake `docker` that logs its calls.
import './setup.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, existsSync, chmodSync, rmSync, renameSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, delimiter } from 'node:path';
import { fileURLToPath } from 'node:url';
import { VERSION, compareVersions } from '../../custom_components/chauffage/frontend/chauffage-programme-card.js';

const root = fileURLToPath(new URL('../../', import.meta.url));
const posix = (path) => path.replace(/\\/g, '/');

// A Home Assistant configuration folder with release 0.8.0 of Chauffage and its data.
// container: whether the script may stop and start Home Assistant (PROD_HA_CONTAINER).
// dockerFails: the docker command that fails, for example 'start'.
// umask: the developer's umask, for example '077'.
function home({ container = true, release = true, env = {}, dockerFails = '', umask = '022' } = {}) {
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
  writeFileSync(join(bin, 'docker'), `#!/usr/bin/env bash\necho "$*" >> "${posix(join(dir, 'docker.log'))}"\n`
    + (dockerFails ? `[ "$1" = ${dockerFails} ] && exit 1\nexit 0\n` : ''));
  chmodSync(join(bin, 'docker'), 0o755);
  writeFileSync(join(dir, '.env'), container ? 'PROD_HA_CONTAINER=homeassistant\n' : '');
  // Never the developer's own PROD_* settings: a test must not restart a real Home Assistant
  const clean = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('PROD_')));
  const options = {
    cwd: root,
    env: { ...clean, ENV_FILE: join(dir, '.env'), PATH: `${bin}${delimiter}${process.env.PATH}`, ...env },
    encoding: 'utf8',
  };
  const script = ['-c', `umask ${umask} && exec bash scripts/deploy.sh "$@"`, 'deploy.sh'];
  // run: the script must succeed. attempt: its exit status and everything it printed.
  const run = (...args) => execFileSync('bash', [...script, ...args, config], { ...options, stdio: ['ignore', 'pipe', 'pipe'] });
  const attempt = (...args) => {
    const done = spawnSync('bash', [...script, ...args, config], options);
    return { status: done.status, said: done.stdout + done.stderr };
  };
  const path = (p) => join(config, p);
  const read = (p) => readFileSync(path(p), 'utf8');
  const write = (p, text) => writeFileSync(path(p), text);
  const installed = () => JSON.parse(read('custom_components/chauffage/manifest.json')).version;
  const docker = () => (existsSync(join(dir, 'docker.log')) ? readFileSync(join(dir, 'docker.log'), 'utf8').trim().split('\n') : []);
  return { dir, config, bin, clean, run, attempt, path, read, write, installed, docker };
}

// A copy of the integration's source with another version, for DEPLOY_SOURCE
function source(version) {
  const dir = mkdtempSync(join(tmpdir(), 'chauffage-source-'));
  mkdirSync(join(dir, 'frontend'));
  mkdirSync(join(dir, '__pycache__'));
  writeFileSync(join(dir, '__pycache__', 'engine.cpython-313.pyc'), '');
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
  assert.equal(existsSync(ha.path('custom_components/chauffage.new')), false);
  assert.deepEqual(ha.docker(), ['restart homeassistant']);
});

test('a dev version of a pre-release sorts after it', () => {
  const ha = home({ env: { DEPLOY_SOURCE: source('0.9.0-beta.4') } });
  ha.run();
  assert.match(ha.installed(), /^0\.9\.0-beta\.4\.dev\.\d{14}\.g\w+$/);
  assert.ok(compareVersions(ha.installed(), '0.9.0-beta.4') > 0);
  assert.ok(compareVersions(ha.installed(), '0.9.0-beta.5') < 0);
});

test('a dev version of a release sorts after it, so an open card asks for a reload, not a restart', () => {
  const ha = home({ env: { DEPLOY_SOURCE: source('0.9.0') } });
  ha.run();
  assert.match(ha.installed(), /^0\.9\.1-dev\.\d{14}\.g\w+$/);
  assert.ok(compareVersions(ha.installed(), '0.9.0') > 0);
});

test('compiled Python files are not deployed', () => {
  const ha = home({ env: { DEPLOY_SOURCE: source('0.9.0') } });
  ha.run();
  assert.equal(existsSync(ha.path('custom_components/chauffage/__pycache__')), false);
});

test('a version that is not a version is refused, and runs nothing', () => {
  // bash arithmetic would run the command: $(( PATH[$(…)] + 1 ))
  const marker = join(mkdtempSync(join(tmpdir(), 'chauffagemarker') /* no '-': not read as a pre-release */), 'ran');
  const ha = home({ env: { DEPLOY_SOURCE: source(`1.2.PATH[$(touch ${posix(marker)})]`) } });
  const tried = ha.attempt();
  assert.notEqual(tried.status, 0);
  assert.equal(existsSync(marker), false);
  assert.equal(ha.installed(), '0.8.0');
});

test('the deployed files can be read by every user, whatever the umask', { skip: process.platform === 'win32' }, () => {
  const ha = home({ umask: '077' });
  ha.run();
  assert.equal(statSync(ha.path('custom_components/chauffage')).mode & 0o777, 0o755);
  assert.equal(statSync(ha.path('custom_components/chauffage/frontend')).mode & 0o777, 0o755);
  assert.equal(statSync(ha.path('custom_components/chauffage/manifest.json')).mode & 0o777, 0o644);
});

const hasGit = spawnSync('git', ['--version']).status === 0;

test('the files git does not ignore are deployed, whatever their name, and the new ones are listed', { skip: !hasGit }, () => {
  const src = source('0.9.0');
  mkdirSync(join(src, 'translations'));
  writeFileSync(join(src, 'translations', 'é.json'), '{}');
  writeFileSync(join(src, '.gitignore'), '*.log\n');
  writeFileSync(join(src, 'debug.log'), 'ignored');
  execFileSync('git', ['init', '-q'], { cwd: src });
  execFileSync('git', ['add', 'manifest.json', 'frontend', 'translations', '.gitignore'], { cwd: src });
  writeFileSync(join(src, 'notes.txt'), 'not added yet');
  const ha = home({ env: { DEPLOY_SOURCE: src } });
  const { status, said } = ha.attempt();
  assert.equal(status, 0, said);
  assert.equal(ha.read('custom_components/chauffage/translations/é.json'), '{}');
  assert.equal(ha.read('custom_components/chauffage/notes.txt'), 'not added yet');
  assert.equal(existsSync(ha.path('custom_components/chauffage/debug.log')), false);
  assert.match(said, /notes\.txt/);
});

test('a failed restart through the API says to restart by hand, and the deploy stands', () => {
  const ha = home({ container: false, env: { PROD_HA_URL: 'http://127.0.0.1:9', PROD_HA_TOKEN: 'token' } });
  const { status, said } = ha.attempt();
  assert.equal(status, 0, said);
  assert.match(said, /by hand/);
  assert.match(ha.installed(), /dev\./);
});

test('a token about to go unencrypted to another host is warned about', () => {
  const ha = home({ container: false, env: { PROD_HA_URL: 'http://ha.invalid:9', PROD_HA_TOKEN: 'token' } });
  assert.match(ha.attempt().said, /unencrypted/);
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

test('the rollback keeps the data of the dev version aside, and says where', () => {
  const ha = home();
  ha.run();
  ha.write('.storage/chauffage', 'data migrated by the dev version');
  const said = ha.run('--rollback');
  const [kept] = readdirSync(ha.config).filter((name) => name.startsWith('.chauffage-dev-data-'));
  assert.ok(kept, 'no copy of the dev data');
  assert.equal(ha.read(kept), 'data migrated by the dev version');
  assert.ok(said.includes(kept), said);
});

test('a rollback whose start fails does not say Home Assistant started', () => {
  const ha = home({ dockerFails: 'start' });
  ha.run();
  const { status, said } = ha.attempt('--rollback');
  assert.notEqual(status, 0);
  assert.doesNotMatch(said, /started/);
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

test('over SSH, a folder with a quote in its name is reached as is, even when the login shell is sh', () => {
  const ha = home();
  // ssh -- <host> <command>: the remote login shell runs the command
  writeFileSync(join(ha.bin, 'ssh'), '#!/usr/bin/env bash\n[ "$1" = -- ] && shift\nshift\nexec sh -c "$1"\n');
  chmodSync(join(ha.bin, 'ssh'), 0o755);
  const odd = join(ha.dir, "it's $HOME here");
  renameSync(ha.config, odd);
  execFileSync('bash', ['scripts/deploy.sh', '--no-restart', `home-assistant:${posix(odd)}`], {
    cwd: root,
    env: { ...ha.clean, ENV_FILE: join(ha.dir, '.env'), PATH: `${ha.bin}${delimiter}${process.env.PATH}` },
    stdio: 'ignore',
  });
  assert.match(JSON.parse(readFileSync(join(odd, 'custom_components/chauffage/manifest.json'), 'utf8')).version, /dev\./);
});
