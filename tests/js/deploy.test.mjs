// scripts/deploy.sh puts a commit of the repository on the Home Assistant of PROD_HA_CONFIG, in the
// Docker container PROD_HA_CONTAINER, and takes it back (see CONTRIBUTING.md, "Trying a version on
// a real Home Assistant"). Each test builds a small git repository with the scripts, and deploys
// to a local folder, with a fake `docker` that logs its calls.
import './setup.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import {
  mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, existsSync, chmodSync, copyFileSync,
  renameSync, rmSync, statSync, symlinkSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, delimiter, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { compareVersions } from '../../frontend/src/index.ts';

const root = fileURLToPath(new URL('../../', import.meta.url));
const posix = (path) => path.replace(/\\/g, '/');
const SCRIPTS = ['scripts/deploy.sh', 'scripts/_deploy_remote.sh', 'scripts/_ha.sh'];

// A git repository with the scripts and an integration at `version`, committed on `main`.
function repository(version = '0.9.0-beta.4') {
  const dir = mkdtempSync(join(tmpdir(), 'chauffage-repo-'));
  const git = (...args) => execFileSync('git', ['-c', 'user.name=Test', '-c', 'user.email=test@example.com', ...args], {
    cwd: dir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
  });
  const write = (path, text) => {
    mkdirSync(dirname(join(dir, path)), { recursive: true });
    writeFileSync(join(dir, path), text);
  };
  mkdirSync(join(dir, 'scripts'));
  for (const script of SCRIPTS) {
    copyFileSync(join(root, script), join(dir, script));
  }
  const integration = 'custom_components/chauffage';
  const setVersion = (v) => {
    write(`${integration}/manifest.json`, `{\n  "domain": "chauffage",\n  "version": "${v}"\n}\n`);
    write(`${integration}/frontend/chauffage-programme-card.js`, `const VERSION = '${v}';\n`);
  };
  setVersion(version);
  write(`${integration}/__init__.py`, '"""Chauffage."""\n');
  git('init', '-q', '-b', 'main');
  git('add', '-A');
  git('commit', '-q', '-m', 'Release');
  const commit = (message) => { git('add', '-A'); git('commit', '-q', '-m', message); };
  // A branch with one more commit, and the repository back on main
  const branch = (name, message) => {
    git('switch', '-q', '-c', name);
    write(`${integration}/__init__.py`, `"""${message}."""\n`);
    commit(message);
    git('switch', '-q', 'main');
  };
  return { dir, git, write, setVersion, commit, branch, integration };
}

// A Home Assistant configuration folder with release 0.8.0 of Chauffage and its data, in the
// container `homeassistant`. The folder is PROD_HA_CONFIG.
// docker: how the fake docker behaves. missing: no such
// container. fails: the docker command that fails, for example 'start'. onStop: a shell line run
// when the container stops, as Home Assistant writes its pending changes.
// umask: the developer's umask, for example '077'.
function home({ repo = repository(), release = true, docker = {}, umask = '022' } = {}) {
  const { missing = false, fails = '', onStop = '' } = docker;
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
  writeFileSync(join(bin, 'docker'), [
    '#!/usr/bin/env bash',
    'if [ "$1" = inspect ]; then',
    `  ${missing ? 'echo "No such object" >&2; exit 1' : 'exit 0'}`,
    'fi',
    `echo "$*" >> "${posix(join(dir, 'docker.log'))}"`,
    fails ? `[ "$1" = ${fails} ] && exit 1` : '',
    onStop ? `if [ "$1" = stop ]; then ${onStop}; fi` : '',
    'exit 0',
  ].join('\n'));
  chmodSync(join(bin, 'docker'), 0o755);
  // The .env of the developer: settings, for example { PROD_HA_CONFIG: 'host:/config' }
  const settings = (values) => writeFileSync(join(dir, '.env'),
    Object.entries(values).map(([k, v]) => `${k}='${v.replace(/'/g, "'\\''")}'\n`).join(''));
  settings({ PROD_HA_CONFIG: config, PROD_HA_CONTAINER: 'homeassistant' });
  // Never the developer's own PROD_* settings: a test must not touch a real Home Assistant
  const clean = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('PROD_')));
  const script = ['-c', `umask ${umask} && exec bash "${posix(join(repo.dir, 'scripts/deploy.sh'))}" "$@"`, 'deploy.sh'];
  // attempt: the script's exit status and all it printed. run: the same, and it must succeed.
  const attempt = (...args) => {
    const done = spawnSync('bash', [...script, ...args], {
      cwd: repo.dir,
      env: { ...clean, ENV_FILE: join(dir, '.env'), PATH: `${bin}${delimiter}${process.env.PATH}` },
      encoding: 'utf8',
    });
    return { status: done.status, said: done.stdout + done.stderr };
  };
  const run = (...args) => {
    const { status, said } = attempt(...args);
    assert.equal(status, 0, said);
    return said;
  };
  // An ssh whose remote login shell is sh: `ssh -- <host> <command>`. through: what the stream
  // goes through on the way, for example `head -c 3072` to cut it.
  const fakeSsh = (through = 'cat') => {
    writeFileSync(join(bin, 'ssh'), `#!/usr/bin/env bash\n[ "$1" = -- ] && shift\nshift\n${through} | sh -c "$1"\n`);
    chmodSync(join(bin, 'ssh'), 0o755);
  };
  // A command that fails when `when` is true, as when a file belongs to another user. heal: the
  // command works again.
  const breakCommand = (name, when) => {
    writeFileSync(join(bin, name), `#!/usr/bin/env bash\n${when} && { echo "${name}: permission denied" >&2; exit 1; }\n`
      + `exec /bin/${name} "$@"\n`);
    chmodSync(join(bin, name), 0o755);
  };
  const heal = (name) => rmSync(join(bin, name));
  // A mv that fails to put anything in place of the integration
  const failingSwap = () => breakCommand('mv', '[ "${@: -1}" = custom_components/chauffage ] && [[ "$1" != *old* ]]');
  const path = (p) => join(config, p);
  const read = (p) => readFileSync(path(p), 'utf8');
  const write = (p, text) => writeFileSync(path(p), text);
  const installed = () => JSON.parse(read('custom_components/chauffage/manifest.json')).version;
  const calls = () => (existsSync(join(dir, 'docker.log')) ? readFileSync(join(dir, 'docker.log'), 'utf8').trim().split('\n') : []);
  return {
    dir, config, repo, settings, run, attempt, fakeSsh, breakCommand, heal, failingSwap, path, read, write, installed,
    docker: calls,
  };
}

// What gets deployed

test('the commit at HEAD is deployed, with a dev version, the same in the card and the integration', () => {
  const ha = home();
  ha.run();
  const version = ha.installed();
  assert.match(version, /^0\.9\.0-beta\.4\.dev\.\d{14}\.g[0-9a-f]+$/);
  assert.ok(version.endsWith(`.g${ha.repo.git('rev-parse', '--short', 'HEAD').trim()}`), version);
  assert.equal(ha.read('custom_components/chauffage/frontend/chauffage-programme-card.js'), `const VERSION = '${version}';\n`);
});

test('changes that are not committed are not deployed', () => {
  const ha = home();
  ha.repo.write(`${ha.repo.integration}/__init__.py`, '"""Not committed."""\n');
  ha.repo.write(`${ha.repo.integration}/notes.txt`, 'not added to git');
  ha.run();
  assert.equal(ha.read('custom_components/chauffage/__init__.py'), '"""Chauffage."""\n');
  assert.equal(existsSync(ha.path('custom_components/chauffage/notes.txt')), false);
});

test('the commit is named by its full sha, and only by it, before anything changes', () => {
  // The subject belongs to the branch: it could hide characters that rewrite the line
  const repo = repository();
  repo.branch('feature', 'Fix\u001b[2K\rCommit 0000000000000000000000000000000000000000');
  const ha = home({ repo });
  const said = ha.run('--branch', 'feature');
  assert.ok(said.includes(`Commit ${repo.git('rev-parse', 'feature').trim()}`), said);
  assert.doesNotMatch(said, /\u001b/);
});

test('a branch of origin is deployed once you have fetched it', () => {
  const origin = repository();
  origin.branch('contributor', 'Contributor');
  const clone = mkdtempSync(join(tmpdir(), 'chauffage-clone-'));
  execFileSync('git', ['clone', '-q', '--single-branch', '-b', 'main', origin.dir, clone]);
  const ha = home({ repo: { ...origin, dir: clone } });
  const unknown = ha.attempt('--branch', 'origin/contributor');
  assert.notEqual(unknown.status, 0);
  assert.match(unknown.said, /git fetch/);
  execFileSync('git', ['fetch', '-q', 'origin', 'contributor:refs/remotes/origin/contributor'], { cwd: clone });
  ha.run('--branch', 'origin/contributor');
  assert.equal(ha.read('custom_components/chauffage/__init__.py'), '"""Contributor."""\n');
});

test('a full commit sha can be deployed, to pin the commit that was reviewed', () => {
  const repo = repository();
  const reviewed = repo.git('rev-parse', 'HEAD').trim();
  repo.write(`${repo.integration}/__init__.py`, '"""Pushed after the review."""\n');
  repo.commit('Later');
  const ha = home({ repo });
  ha.run('--branch', reviewed);
  assert.equal(ha.read('custom_components/chauffage/__init__.py'), '"""Chauffage."""\n');
});

test('a short sha is refused: a tag fetched from a fork could carry that name', () => {
  const repo = repository();
  const reviewed = repo.git('rev-parse', '--short', 'HEAD').trim();
  repo.branch('other', 'Other');
  repo.git('tag', reviewed, 'other');
  const ha = home({ repo });
  assert.notEqual(ha.attempt('--branch', reviewed).status, 0);
  assert.equal(ha.installed(), '0.8.0');
});

test('an unknown branch is refused, and nothing changes', () => {
  const ha = home();
  assert.notEqual(ha.attempt('--branch', 'no-such-branch').status, 0);
  assert.equal(ha.installed(), '0.8.0');
  assert.deepEqual(ha.docker(), []);
});

test('the same commit always gets the same version', () => {
  const ha = home();
  ha.run();
  const first = ha.installed();
  ha.run();
  assert.equal(ha.installed(), first);
});

test('for the card, a dev version of a pre-release sorts after it, and before the next one', () => {
  const ha = home();
  ha.run();
  assert.ok(compareVersions(ha.installed(), '0.9.0-beta.4') > 0);
  assert.ok(compareVersions(ha.installed(), '0.9.0-beta.5') < 0);
});

test('for the card, a dev version of a release sorts after it, so an open card asks for a reload', () => {
  const ha = home({ repo: repository('0.9.0') });
  ha.run();
  assert.match(ha.installed(), /^0\.9\.1-dev\.\d{14}\.g[0-9a-f]+$/);
  assert.ok(compareVersions(ha.installed(), '0.9.0') > 0);
});

test('a manifest version that is not a semantic version is refused, and nothing runs', () => {
  // bash arithmetic would run the command: $(( PATH[$(…)] + 1 ))
  const marker = join(mkdtempSync(join(tmpdir(), 'chauffagemarker') /* no '-': not read as a pre-release */), 'ran');
  const repo = repository();
  repo.setVersion(`1.2.PATH[$(touch ${posix(marker)})]`);
  repo.commit('Odd version');
  const ha = home({ repo });
  assert.notEqual(ha.attempt().status, 0);
  assert.equal(existsSync(marker), false);
  assert.equal(ha.installed(), '0.8.0');
});

test('a commit with a symbolic link in the integration is refused', { skip: process.platform === 'win32' }, () => {
  // The link would deploy a file of the developer's machine, for example an SSH key
  const repo = repository();
  writeFileSync(join(repo.dir, 'secret'), 'PROD_HA_TOKEN=secret');
  symlinkSync('../../secret', join(repo.dir, repo.integration, 'strings_extra.json'));
  repo.commit('Link');
  const ha = home({ repo });
  const { status, said } = ha.attempt();
  assert.notEqual(status, 0);
  assert.match(said, /symbolic link/);
  assert.equal(ha.installed(), '0.8.0');
});

test('files with accents in their names are deployed', () => {
  const repo = repository();
  repo.write(`${repo.integration}/translations/é.json`, '{}');
  repo.commit('Accent');
  const ha = home({ repo });
  ha.run();
  assert.equal(ha.read('custom_components/chauffage/translations/é.json'), '{}');
});

test('the deployed files can be read by every user, whatever the umask', { skip: process.platform === 'win32' }, () => {
  const ha = home({ umask: '077' });
  ha.run();
  assert.equal(statSync(ha.path('custom_components/chauffage')).mode & 0o777, 0o755);
  assert.equal(statSync(ha.path('custom_components/chauffage/frontend')).mode & 0o777, 0o755);
  assert.equal(statSync(ha.path('custom_components/chauffage/manifest.json')).mode & 0o777, 0o644);
});

// A deploy that fails

test('a deploy that cannot put the new code in place leaves the release whole, and Home Assistant running', () => {
  const ha = home();
  ha.failingSwap();
  const { status, said } = ha.attempt();
  assert.notEqual(status, 0);
  assert.equal(ha.installed(), '0.8.0');
  assert.deepEqual(readdirSync(ha.path('custom_components')), ['chauffage']);
  assert.deepEqual(readdirSync(ha.config).filter((name) => /new|old/.test(name)), []);
  assert.equal(ha.docker().at(-1), 'start homeassistant');
  assert.match(said, /unchanged/);
});

test('a Home Assistant without custom_components gets one', () => {
  const ha = home({ release: false });
  rmSync(ha.path('custom_components'), { recursive: true });
  ha.run();
  assert.match(ha.installed(), /dev\./);
});

test('a transfer cut short changes nothing', () => {
  const ha = home();
  // The stream ends on a boundary between two files: tar sees no error
  ha.fakeSsh('head -c 3072');
  ha.settings({ PROD_HA_CONFIG: `home-assistant:${posix(ha.config)}`, PROD_HA_CONTAINER: 'homeassistant' });
  assert.notEqual(ha.attempt().status, 0);
  assert.equal(ha.installed(), '0.8.0');
});

test('an unknown container is refused before anything changes', () => {
  const ha = home({ docker: { missing: true } });
  const { status, said } = ha.attempt();
  assert.notEqual(status, 0);
  assert.match(said, /homeassistant/);
  assert.equal(ha.installed(), '0.8.0');
  assert.equal(existsSync(ha.path('.chauffage-backup')), false);
});

// The backup and the rollback

test('the first deploy saves the data once Home Assistant has stopped and written its last changes', () => {
  const ha = home({ docker: { onStop: 'echo "written when stopping" > .storage/chauffage' } });
  ha.run();
  assert.deepEqual(ha.docker(), ['stop -t 120 homeassistant', 'start homeassistant']);
  assert.equal(ha.read('.chauffage-backup/storage'), 'written when stopping\n');
});

test('Home Assistant starts again when its stop fails half-way', () => {
  // docker stop can fail after the stop signal, for example on Ctrl-C
  const ha = home({ docker: { fails: 'stop' } });
  assert.notEqual(ha.attempt().status, 0);
  assert.equal(ha.docker().at(-1), 'start homeassistant');
  assert.equal(ha.installed(), '0.8.0');
});

test('the release installed before the first deploy comes back with its data', () => {
  const ha = home();
  ha.run();
  ha.run(); // a second deploy keeps the release, not the first dev version
  ha.write('.storage/chauffage', 'data migrated by the dev version');
  ha.run('--rollback');
  assert.equal(ha.installed(), '0.8.0');
  assert.equal(ha.read('.storage/chauffage'), 'data of 0.8.0');
  assert.equal(existsSync(ha.path('.chauffage-backup')), false);
  assert.deepEqual(ha.docker().slice(-2), ['stop -t 120 homeassistant', 'start homeassistant']);
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

test('a later deploy keeps the backup, and says which release it holds', () => {
  const ha = home();
  ha.run();
  ha.write('.storage/chauffage', 'data migrated by the dev version');
  const said = ha.run();
  assert.match(said, /backup kept: 0\.8\.0$/m);
  ha.run('--rollback');
  assert.equal(ha.installed(), '0.8.0');
  assert.equal(ha.read('.storage/chauffage'), 'data of 0.8.0');
});

// The version is kept: it is released, and Home Assistant updates to it
function keptAndUpdated() {
  const ha = home();
  ha.run();
  ha.write('.storage/chauffage', 'data changed during the test');
  // The HACS update to the release: a new folder, the data as it is
  rmSync(ha.path('custom_components/chauffage'), { recursive: true });
  mkdirSync(ha.path('custom_components/chauffage'));
  ha.write('custom_components/chauffage/manifest.json', '{"version": "0.9.1"}\n');
  return ha;
}

test('after an update to a release, the next deploy saves that release, not the one before the test', () => {
  const ha = keptAndUpdated();
  assert.match(ha.run(), /backup made: 0\.9\.1/);
  ha.write('.storage/chauffage', 'data of the next test');
  ha.run('--rollback');
  assert.equal(ha.installed(), '0.9.1');
  assert.equal(ha.read('.storage/chauffage'), 'data changed during the test');
});

test('after an update to a release, a rollback has nothing to undo, and drops the backup', () => {
  const ha = keptAndUpdated();
  assert.match(ha.run('--rollback'), /Nothing to roll back: 0\.9\.1 is installed/);
  assert.equal(ha.installed(), '0.9.1');
  assert.equal(ha.read('.storage/chauffage'), 'data changed during the test');
  assert.equal(existsSync(ha.path('.chauffage-backup')), false);
  assert.deepEqual(ha.docker(), ['stop -t 120 homeassistant', 'start homeassistant']); // the deploy's
});

test('after the release was installed again, a rollback keeps the data of the weeks since', () => {
  // You undo a deploy by installing the same release again from HACS, and use it for weeks
  const ha = home();
  ha.run();
  ha.write('custom_components/chauffage/manifest.json', '{"version": "0.8.0"}\n');
  ha.write('.storage/chauffage', 'data of the weeks since');
  ha.run('--rollback');
  assert.equal(ha.read('.storage/chauffage'), 'data of the weeks since');
  ha.run();
  ha.run('--rollback');
  assert.equal(ha.installed(), '0.8.0');
  assert.equal(ha.read('.storage/chauffage'), 'data of the weeks since');
});

test('with the integration folder gone, a deploy keeps the saved release', () => {
  const ha = home();
  ha.run();
  rmSync(ha.path('custom_components/chauffage'), { recursive: true }); // deleted by hand
  ha.run();
  ha.run('--rollback');
  assert.equal(ha.installed(), '0.8.0');
});

test('a rollback on a Home Assistant that had no Chauffage removes the dev version', () => {
  const ha = home({ release: false });
  ha.run();
  ha.run('--rollback');
  assert.equal(existsSync(ha.path('custom_components/chauffage')), false);
  assert.equal(existsSync(ha.path('.storage/chauffage')), false);
});

test('a rollback that cannot put the release code in place keeps the dev code, says so, and can be run again', () => {
  const ha = home();
  ha.run();
  const deployed = ha.installed();
  ha.write('.storage/chauffage', 'data migrated by the dev version');
  ha.failingSwap();
  const { status, said } = ha.attempt('--rollback');
  assert.notEqual(status, 0);
  assert.equal(ha.installed(), deployed);
  assert.equal(ha.read('.storage/chauffage'), 'data of 0.8.0'); // the dev code reads the release data
  assert.match(said, /run the rollback again/);
  assert.deepEqual(readdirSync(ha.path('custom_components')), ['chauffage']);
  assert.equal(ha.docker().at(-1), 'start homeassistant');
  ha.heal('mv');
  ha.run('--rollback');
  assert.equal(ha.installed(), '0.8.0');
});

test('a rollback cut short after the release is back can be run again, and keeps the release', () => {
  const ha = home();
  ha.run();
  ha.breakCommand('rm', '[[ " $* " == *" .chauffage-backup "* ]]'); // the backup cannot be deleted
  assert.notEqual(ha.attempt('--rollback').status, 0);
  assert.equal(ha.installed(), '0.8.0');
  ha.heal('rm');
  ha.run('--rollback');
  assert.equal(ha.installed(), '0.8.0');
  assert.equal(ha.read('.storage/chauffage'), 'data of 0.8.0');
  assert.equal(existsSync(ha.path('.chauffage-backup')), false);
});

test('a rollback whose start fails does not say Home Assistant started', () => {
  const ha = home({ docker: { fails: 'start' } });
  ha.attempt();
  const { status, said } = ha.attempt('--rollback');
  assert.notEqual(status, 0);
  assert.doesNotMatch(said, /started/);
});

test('a rollback without a deploy changes nothing', () => {
  const ha = home();
  assert.notEqual(ha.attempt('--rollback').status, 0);
  assert.equal(ha.installed(), '0.8.0');
  assert.deepEqual(ha.docker(), []);
});

test('the end of a deploy says how to roll back', () => {
  assert.match(home().run(), /Roll back with: scripts\/deploy\.sh --rollback$/m);
});

// The settings

test('without PROD_HA_CONTAINER, the script refuses and changes nothing', () => {
  const ha = home();
  ha.settings({ PROD_HA_CONFIG: ha.config });
  const { status, said } = ha.attempt();
  assert.notEqual(status, 0);
  assert.match(said, /PROD_HA_CONTAINER/);
  assert.equal(ha.installed(), '0.8.0');
});

test('without PROD_HA_CONFIG, the script refuses', () => {
  const ha = home();
  ha.settings({ PROD_HA_CONTAINER: 'homeassistant' });
  const { status, said } = ha.attempt();
  assert.notEqual(status, 0);
  assert.match(said, /PROD_HA_CONFIG/);
});

test('an argument other than an option is refused, so a rollback is never taken for a deploy', () => {
  const ha = home();
  assert.notEqual(ha.attempt(ha.config, '--rollback').status, 0);
  assert.notEqual(ha.attempt('--rollback', ha.config).status, 0);
  assert.equal(ha.installed(), '0.8.0');
  assert.deepEqual(ha.docker(), []);
});

test('a folder without configuration.yaml is refused', () => {
  const ha = home();
  rmSync(ha.path('configuration.yaml'));
  assert.notEqual(ha.attempt().status, 0);
  assert.equal(ha.installed(), '0.8.0');
});

test('over SSH, a folder with a quote in its name is reached as is, even when the login shell is sh', () => {
  const ha = home();
  ha.fakeSsh();
  const odd = join(ha.dir, "it's $HOME here");
  renameSync(ha.config, odd);
  ha.settings({ PROD_HA_CONFIG: `home-assistant:${posix(odd)}`, PROD_HA_CONTAINER: 'homeassistant' });
  ha.run();
  assert.match(JSON.parse(readFileSync(join(odd, 'custom_components/chauffage/manifest.json'), 'utf8')).version, /dev\./);
});

test('an SSH target without an absolute folder is refused', () => {
  const ha = home();
  ha.fakeSsh();
  for (const target of ['home-assistant:', 'home-assistant:config']) {
    ha.settings({ PROD_HA_CONFIG: target, PROD_HA_CONTAINER: 'homeassistant' });
    assert.notEqual(ha.attempt().status, 0, target);
  }
  assert.equal(ha.installed(), '0.8.0');
});
