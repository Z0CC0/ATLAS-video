// Finds or installs the studio (studio-cli and its window) for `atlas media`. Windows x64 only.
//   node studio-get.mjs where     prints the path of studio-cli; exit 1 when it is not on this machine
//   node studio-get.mjs install   downloads one release file, checks its SHA-256, unpacks it into
//                                 ~/.atlas/studio/<version>/ and prints the path of studio-cli
// `where` downloads nothing. `install` is run only after the person has said yes to the download:
// the size and the address are printed by `node studio-get.mjs about`.
// Found in this order: the environment variable STUDIO_CLI, the PATH, ~/.atlas/studio/.
import { createHash } from 'node:crypto';
import { createWriteStream, existsSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { get as httpGet } from 'node:http';
import { get as httpsGet } from 'node:https';
import { Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';

const VERSION = '0.1.0';
const RELEASE = 'v0.1.2';
const ASSET = `the-studio-${VERSION}-windows-x64.zip`;
const ADDRESS = `https://github.com/Z0CC0/ATLAS-video/releases/download/${RELEASE}/${ASSET}`;
const SIZE_MB = 117;
const SHA256 = '3420303e3b26c7f7302bc30882e55f62270c5699f0b0a3924038c5da94e27edb';
const HOME = join(homedir(), '.atlas', 'studio');
const EXE = 'studio-cli.exe';
// The release file holds one folder; the program is looked for in it and beside it.
const inside = (dir) => [join(dir, EXE), join(dir, ASSET.replace(/\.zip$/, ''), EXE)].find((f) => existsSync(f)) || null;

const answers = (file) => {
  const r = spawnSync(file, ['--version'], { encoding: 'utf8', timeout: 20000, windowsHide: true });
  return r.status === 0 && /studio-cli/.test(r.stdout || '');
};

const find = () => {
  const named = process.env.STUDIO_CLI;
  if (named && existsSync(named) && answers(named)) return named;
  const onPath = spawnSync(process.platform === 'win32' ? 'where' : 'which', ['studio-cli'], { encoding: 'utf8', windowsHide: true });
  const first = (onPath.stdout || '').split(/\r?\n/).find((line) => line.trim());
  if (onPath.status === 0 && first && answers(first.trim())) return first.trim();
  if (!existsSync(HOME)) return null;
  const versions = readdirSync(HOME, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name)
    .sort((a, b) => b.localeCompare(a, undefined, { numeric: true }));
  for (const v of versions) {
    const file = inside(join(HOME, v));
    if (file && answers(file)) return file;
  }
  return null;
};

// One GET that follows redirects, with the plain http modules: the release file is served
// from another host than the one in its address.
const open = (address, hops) => new Promise((done, fail) => {
  const get = address.startsWith('https:') ? httpsGet : httpGet;
  get(address, { headers: { 'user-agent': 'studio-get' } }, (res) => {
    const code = res.statusCode || 0;
    if (code >= 300 && code < 400 && res.headers.location) {
      res.resume();
      if (hops <= 0) return fail(new Error('too many redirects'));
      return open(new URL(res.headers.location, address).href, hops - 1).then(done, fail);
    }
    if (code !== 200) { res.resume(); return fail(new Error(`HTTP ${code}`)); }
    done(res);
  }).on('error', fail);
});

const install = async () => {
  if (process.platform !== 'win32' || process.arch !== 'x64') {
    console.error(`the studio is built for Windows x64 only; this is ${process.platform} ${process.arch}`);
    return 2;
  }
  if (!SHA256) { console.error('this copy of the tool names no release file'); return 2; }
  const dir = join(HOME, VERSION);
  const zip = join(HOME, ASSET);
  mkdirSync(dir, { recursive: true });
  console.error(`downloading ${ADDRESS}`);
  const hash = createHash('sha256');
  try {
    const res = await open(ADDRESS, 5);
    const total = Number(res.headers['content-length']) || 0;
    let got = 0, shown = -1;
    const meter = new Transform({
      transform(chunk, _enc, done) {
        hash.update(chunk); got += chunk.length;
        const tenth = total ? Math.floor((got / total) * 10) : -1;
        if (tenth > shown) { shown = tenth; console.error(`  ${tenth * 10}%`); }
        done(null, chunk);
      },
    });
    await pipeline(res, meter, createWriteStream(zip));
  } catch (e) {
    rmSync(zip, { force: true });
    console.error(`download failed: ${e.message}`);
    return 1;
  }
  const sum = hash.digest('hex');
  if (sum !== SHA256) {
    rmSync(zip, { force: true });
    console.error(`the file is not the one this tool expects (SHA-256 ${sum}); nothing was unpacked`);
    return 1;
  }
  // Windows' own tar reads a zip; the one a Unix-like shell puts first on the PATH does not.
  const winTar = join(process.env.SystemRoot || 'C:/Windows', 'System32', 'tar.exe');
  const un = existsSync(winTar)
    ? spawnSync(winTar, ['-xf', zip, '-C', dir], { encoding: 'utf8', windowsHide: true })
    : spawnSync('powershell', ['-NoProfile', '-Command', 'Expand-Archive -LiteralPath $env:STUDIO_ZIP -DestinationPath $env:STUDIO_DIR -Force'],
      { encoding: 'utf8', windowsHide: true, env: { ...process.env, STUDIO_ZIP: zip, STUDIO_DIR: dir } });
  rmSync(zip, { force: true });
  if (un.status !== 0) { console.error(`unpacking failed: ${(un.stderr || '').trim()}`); return 1; }
  const file = inside(dir);
  if (!file || !answers(file)) { console.error(`unpacked into ${dir}, but ${EXE} does not answer --version`); return 1; }
  console.log(file);
  return 0;
};

const verb = process.argv[2];
if (verb === 'where') {
  const file = find();
  if (file) console.log(file); else console.error('the studio is not on this machine');
  process.exit(file ? 0 : 1);
} else if (verb === 'about') {
  console.log(`the studio ${VERSION}, Windows x64, about ${SIZE_MB} MB, from ${ADDRESS}, unpacked into ${join(HOME, VERSION)}`);
} else if (verb === 'install') {
  process.exit(await install());
} else {
  console.error('usage: node studio-get.mjs where | about | install');
  process.exit(2);
}
