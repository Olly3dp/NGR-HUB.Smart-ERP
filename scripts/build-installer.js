#!/usr/bin/env node
'use strict';
/* ═════════════════════════════════════════════════════════════════
 *  NGR - Compilador do instalador (.exe para Windows / binario Linux)
 *
 *  Gera o instalador unico autocontido usando @yao-pkg/pkg:
 *   - Windows 10/11 ......... NGR-Instalador.exe
 *   - Linux ................. NGR-Instalador-linux
 *   (o instalador embute o runtime Node 22; nao precisa de Node na maquina-alvo)
 *
 *  O pkg exige Node >= 20 para rodar. Se a maquina de build tiver Node 18
 *  (comum), este script baixa automaticamente um Node portatil 22 para
 *  .build-tools/ e usa ele.
 *
 *  Uso:
 *    node scripts/build-installer.js            (gera ambos os SO)
 *    node scripts/build-installer.js --win      (apenas .exe)
 *    node scripts/build-installer.js --linux    (apenas linux)
 *
 *  npm run installer:build
 * ═════════════════════════════════════════════════════════════════ */

const fs = require('fs');
const path = require('path');
const os = require('os');
const https = require('https');
const { spawnSync, spawn } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const TOOLS = path.join(ROOT, '.build-tools');
const PKG_VER = '6.22.0';
const STAGING = path.join(TOOLS, 'instalador-staging');
const PAYLOAD_NAME = 'NGR-payload.tar';

const ONLY_WIN = process.argv.includes('--win');
const ONLY_LIN = process.argv.includes('--linux');

const C = { reset: '\x1b[0m', gold: '\x1b[33m', green: '\x1b[32m', red: '\x1b[31m', dim: '\x1b[2m' };
const log = (m) => process.stdout.write(m + '\n');

function userAgent() {
  return 'NGR-Build/1.0';
}

function httpGet(url, headers) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: Object.assign({ 'User-Agent': userAgent() }, headers || {}) }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        return httpGet(new URL(res.headers.location, url).toString(), headers).then(resolve, reject);
      }
      if (res.statusCode !== 200) {
        res.resume();
        return reject(new Error('HTTP ' + res.statusCode + ' -> ' + url));
      }
      resolve(res);
    }).on('error', reject).setTimeout(20000, function () {
      this.destroy(new Error('Timeout'));
    });
  });
}

function httpString(url) {
  return httpGet(url).then((res) => {
    let d = '';
    res.on('data', (c) => (d += c));
    return new Promise((resolve, reject) => {
      res.on('end', () => resolve(d));
      res.on('error', reject);
    });
  });
}

function downloadFile(url, dest) {
  return httpGet(url).then((res) => new Promise((resolve, reject) => {
    const out = fs.createWriteStream(dest);
    res.pipe(out);
    out.on('finish', () => { out.close(); resolve(); });
    out.on('error', reject);
    res.on('error', reject);
  }));
}

function latestNodeUrl(major) {
  // major: 'v22' -> latest-v22.x (LTS estavel, compativel Win10/11)
  const dir = 'latest-' + major + '.x';
  return httpString('https://nodejs.org/dist/' + dir + '/').then((html) => {
    const m = String(html).match(new RegExp('node-v(\\d+\\.\\d+\\.\\d+)-(' + (process.platform === 'win32' ? 'win-x64\\.zip' : 'linux-x64\\.tar\\.xz') + ')'));
    if (!m) throw new Error('versao de Node nao encontrada para ' + dir);
    return { version: m[1], file: 'node-v' + m[1] + '-' + (process.platform === 'win32' ? 'win-x64.zip' : 'linux-x64.tar.xz') };
  });
}

async function ensureBuildNode() {
  // Node do proprio builder: usa o atual se >=20, senao baixa um portatil 22
  const myVer = parseInt(process.versions.node.split('.')[0], 10);
  if (myVer >= 20 && !process.pkg) {
    log(C.green + '[build] Usando Node ' + process.versions.node + ' (local)' + C.reset);
    return process.execPath;
  }

  const dirName = process.platform === 'win32' ? 'node-win64' : 'node-linux64';
  const nodeDir = path.join(TOOLS, dirName);
  const nodeBin = process.platform === 'win32'
    ? path.join(nodeDir, 'node.exe')
    : path.join(nodeDir, 'bin', 'node');

  if (fs.existsSync(nodeBin)) {
    log(C.green + '[build] Usando Node portatil em .build-tools' + C.reset);
    return nodeBin;
  }

  log(C.dim + '[build] Node local e antigo. Baixando Node 22 portatil...' + C.reset);
  const archive = path.join(TOOLS, 'node-dl.' + (process.platform === 'win32' ? 'zip' : 'tar.xz'));
  fs.mkdirSync(TOOLS, { recursive: true });
  const meta = await latestNodeUrl('v22');
  await downloadFile('https://nodejs.org/dist/latest-v22.x/' + meta.file, archive);
  log(C.dim + '[build] Extraindo...' + C.reset);
  spawnSync('tar', ['-xf', archive, '-C', TOOLS], { stdio: 'inherit' });
  // move pasta node-vX -> pasta padrao do build
  const extra = path.join(TOOLS, 'node-v' + meta.version + '-' + (process.platform === 'win32' ? 'win-x64' : 'linux-x64'));
  if (fs.existsSync(extra) && !fs.existsSync(nodeDir)) fs.renameSync(extra, nodeDir);
  fs.rmSync(extra, { recursive: true, force: true });
  fs.rmSync(archive, { force: true });
  if (!fs.existsSync(nodeBin)) {
    throw new Error('Falha ao preparar Node portatil.');
  }
  log(C.green + '[build] Node portatil pronto: ' + path.dirname(nodeBin) + C.reset);
  return nodeBin;
}

function ensurePkg() {
  const bin = path.join(TOOLS, 'node_modules', '@yao-pkg', 'pkg', 'lib-es5', 'bin.js');
  if (fs.existsSync(bin)) return bin;
  log(C.dim + '[build] Instalando @yao-pkg/pkg@' + PKG_VER + ' (ferramenta de build)...' + C.reset);
  fs.mkdirSync(TOOLS, { recursive: true });
  // pkg tool fica em .build-tools (nao polui o projeto)
  fs.writeFileSync(path.join(TOOLS, 'package.json'), JSON.stringify({ name: 'ngr-build-tools', private: true, version: '1.0.0' }));
  const r = spawnSync('npm', ['install', '--prefix', TOOLS, '--no-audit', '--no-fund', '@yao-pkg/pkg@' + PKG_VER], { stdio: 'inherit', env: Object.assign({}, process.env, { npm_config_only_feature_flags: undefined }) });
  if (r.status !== 0 || !fs.existsSync(bin)) throw new Error('Falha ao instalar o pkg.');
  return bin;
}

function runBuild(buildNode, pkgBin, entry, target, out) {
  log('');
  log(C.gold + '[build] Alvo: ' + target + ' -> ' + out + C.reset);
  const r = spawnSync(buildNode, [pkgBin, entry, '--targets', target, '--output', out], { stdio: 'inherit' });
  if (r.status !== 0) throw new Error('Falha ao compilar ' + target);
  const size = fs.existsSync(out) ? Math.round(fs.statSync(out).size / 1024 / 1024) + ' MB' : '?';
  log(C.green + '[build] OK: ' + out + ' (' + size + ')' + C.reset);
}

/* ═════════ Tar (sem compressao - suporta arquivos ate 100 chars no caminho) ═════════ */
const EXCL_DIRS = new Set([
  'node_modules', 'models', '.git', '.build-tools', 'dist', 'sessions',
  '.wwebjs_auth', '.wwebjs_cache', '.cache', 'nul',
]);
const EXCL_FILES = new Set(['.env', '.env.local', '.env.production', 'nul', 'package-lock.json']);
function isExcludedFile(name) {
  return EXCL_FILES.has(name) || name.startsWith('NGR-Instalador.');
}

function tarHeader(name, size) {
  const h = Buffer.alloc(512);
  const n = name.replace(/\\/g, '/');
  if (Buffer.byteLength(n, 'utf8') > 100) {
    throw new Error('caminho longo demais para tar: ' + n);
  }
  h.write(n, 0, 100, 'ascii');
  h.write('0000644\0', 100, 8, 'ascii');
  h.write('0000000\0', 108, 8, 'ascii');
  h.write('0000000\0', 116, 8, 'ascii');
  h.write(size.toString(8).padStart(11, '0') + '\0', 124, 12, 'ascii');
  h.write('00000000000\0', 136, 12, 'ascii');
  h.write('0', 156, 1, 'ascii');
  h.write('ustar\0', 257, 6, 'ascii');
  h.write('00', 263, 2, 'ascii');
  h.write('root', 265, 32, 'ascii');
  h.write('root', 297, 32, 'ascii');
  const sum = h.reduce((a, b) => a + b, 0);
  h.write(sum.toString(8).padStart(6, '0') + '\0 ', 148, 8, 'ascii');
  return h;
}

function collectPayloadFiles() {
  const files = [];
  (function walk(dir, rel) {
    let entries = [];
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch (e) { return; }
    for (const ent of entries) {
      if (rel === '' && ent.name === '.' + 'git') continue; // .git
      if (EXCL_DIRS.has(ent.name)) continue;
      const full = path.join(dir, ent.name);
      const childRel = rel ? rel + '/' + ent.name : ent.name;
      if (ent.isDirectory()) walk(full, childRel);
      else if (!isExcludedFile(ent.name) && ent.name !== PAYLOAD_NAME) files.push(childRel);
    }
  })(ROOT, '');
  return files.sort();
}

function buildPayloadTar(stageDir) {
  const files = collectPayloadFiles();
  log(C.dim + '[build] Montando payload (projeto sem node_modules/modelos)...' + C.reset);
  const blocks = [];
  let total = 0;
  for (const rel of files) {
    const full = path.join(ROOT, rel);
    try {
      const data = fs.readFileSync(full);
      blocks.push(tarHeader(rel, data.length));
      blocks.push(data);
      if (data.length % 512) blocks.push(Buffer.alloc(512 - (data.length % 512)));
      total += data.length;
    } catch (e) {
      log(C.dim + '  [build] pulando arquivo com problema: ' + rel + ' (' + e.message + ')' + C.reset);
    }
  }
  blocks.push(Buffer.alloc(1024)); // marcador de fim do tar
  const out = path.join(stageDir, PAYLOAD_NAME);
  fs.writeFileSync(out, Buffer.concat(blocks));
  const mb = fs.statSync(out).size / 1024 / 1024;
  log(C.green + '[build] Payload: ' + files.length + ' arquivos, ' + mb.toFixed(1) + ' MB' + C.reset);
}

async function main() {
  log(C.gold + '┌─────────────────────────────────────────────┐' + C.reset);
  log(C.gold + '│  NGR - Compilacao do instalador             │' + C.reset);
  log(C.gold + '└─────────────────────────────────────────────┘' + C.reset);

  if (!fs.existsSync(path.join(ROOT, 'instalador-windows.js'))) {
    throw new Error('instalador-windows.js nao encontrado na raiz.');
  }

  const buildNode = await ensureBuildNode();
  const pkgBin = ensurePkg();

  // Diretorio isolado de build: SEM dependencias, para o pkg embutir
  // so o instalador + o payload (sem puxar node_modules do projeto).
  fs.rmSync(STAGING, { recursive: true, force: true });
  fs.mkdirSync(STAGING, { recursive: true });
  buildPayloadTar(STAGING);
  fs.copyFileSync(path.join(ROOT, 'instalador-windows.js'), path.join(STAGING, 'instalador-windows.js'));
  fs.copyFileSync(path.join(ROOT, 'download-model.js'), path.join(STAGING, 'download-model.js'));
  fs.writeFileSync(
    path.join(STAGING, 'package.json'),
    JSON.stringify(
      {
        name: 'ngr-installer',
        version: '1.0.0',
        private: true,
        main: 'instalador-windows.js',
        pkg: {
          files: ['instalador-windows.js', 'download-model.js'],
          assets: [PAYLOAD_NAME],
        },
      },
      null,
      2
    )
  );

  const entry = path.join(STAGING, 'instalador-windows.js');
  const targets = [];
  if (!ONLY_LIN) targets.push({ t: 'node22-win-x64', out: path.join(ROOT, 'NGR-Instalador.exe') });
  if (!ONLY_WIN) targets.push({ t: 'node22-linux-x64', out: path.join(ROOT, 'NGR-Instalador-linux') });

  for (const tg of targets) runBuild(buildNode, pkgBin, entry, tg.t, tg.out);

  fs.rmSync(STAGING, { recursive: true, force: true });
  log(C.dim + '[build] arquivos temporarios removidos.' + C.reset);

  log('');
  log(C.green + 'Concluido!' + C.reset);
  log('  - Windows: NGR-Instalador.exe (copie para dentro da pasta do projeto do cliente)');
  log('  - Linux  : NGR-Instalador-linux (chmod +x e rode)');
  log(C.dim + '  Dica: o instalador nao precisa de Node na maquina do cliente.' + C.reset);
}

main().catch((e) => {
  log(C.red + '[build] ERRO: ' + (e && e.message ? e.message : e) + C.reset);
  process.exitCode = 1;
});