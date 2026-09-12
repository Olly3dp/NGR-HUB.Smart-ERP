#!/usr/bin/env node
/* Empacotador de distribuicao: gera um .zip limpo do projeto NGR Agent
 * pronto para o Google Drive / Windows.
 *
 *  - Duplica a pasta do projeto para um staging temporario (sem node_modules,
 *    modelos, caches de sessao/whatsapp, bancos runtime, .env e lixo).
 *  - Inclui o instalador NGR-Instalador.exe (padrao) e opcionalmente o binario
 *    Linux (--linux).
 *  - Compacta tudo em um unico .zip (deflate, nomes UTF-8, sem dependencias).
 *
 * Uso:
 *   node scripts/zip-dist.js [--linux] [--out caminho.zip] [--keep]
 */
'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const zlib = require('zlib');

const ROOT = path.resolve(__dirname, '..');
const STAGING = path.join(ROOT, '.build-tools', 'dist-staging');

const ARGS = process.argv.slice(2);
const WITH_LINUX = ARGS.includes('--linux');
const KEEP = ARGS.includes('--keep');
const OUT_ARG = (() => {
  const i = ARGS.indexOf('--out');
  return i >= 0 && ARGS[i + 1] ? ARGS[i + 1] : null;
})();
const OUT = OUT_ARG ? path.resolve(ROOT, OUT_ARG) : path.join(ROOT, 'NGR-Agent-win.zip');
const ZIP_ROOT = 'NGR Agent'; // pasta raiz dentro do .zip

const C = {
  reset: '\x1b[0m', dim: '\x1b[2m', green: '\x1b[32m', gold: '\x1b[33m', red: '\x1b[31m',
};
function log(m) { console.log(m); }
function ok(m) { log(C.green + '  [OK] ' + m + C.reset); }
function warn(m) { log(C.gold + '  [AVISO] ' + m + C.reset); }
function err(m) { log(C.red + '  [ERRO] ' + m + C.reset); }

/* Diretorios excluidos (grandes artefatos / binarios por plataforma / caches).
 * O instalador recria node_modules, modelos e binarios corretos no Windows. */
const EXCL_DIRS = new Set([
  'node_modules', 'models', '.git', '.build-tools', 'dist', 'sessions',
  '.wwebjs_auth', '.wwebjs_cache', '.cache', '.npm', 'nul',
]);
/* Arquivos excluidos: segredos (.env), runtime state, lixo, e o proprio pacote. */
const EXCL_FILES = new Set([
  '.env', '.env.local', '.env.production', '.env.staging',
  'package-lock.json', 'nul',
  'NGR-Instalador.exe', 'NGR-Instalador-linux', 'NGR-payload.tar',
  'NGR-Agent-win.zip',
]);
function isExcludedFile(name) {
  return EXCL_FILES.has(name) || /\.(tmp|bak|part|sqlite|sqlite3|db|db-wal|db-shm|swp)$/i.test(name) || name.endsWith('~');
}

function collectFiles() {
  const files = [];
  (function walk(dir, rel) {
    let entries = [];
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch (e) { return; }
    for (const ent of entries) {
      if (EXCL_DIRS.has(ent.name)) continue;
      const full = path.join(dir, ent.name);
      const childRel = rel ? rel + '/' + ent.name : ent.name;
      if (ent.isDirectory()) walk(full, childRel);
      else if (!isExcludedFile(ent.name)) files.push({ rel: childRel, full, mode: fs.statSync(full).mode });
    }
  })(ROOT, '');
  return files.sort((a, b) => (a.rel < b.rel ? -1 : 1));
}

/* ──────────────── ZIP (somente Node: deflate + CRC32 + UTF-8) ──────────────── */
function crc32(buf) {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}
function dosTime(d) {
  const time = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1);
  const date = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
  return { time: time & 0xffff, date: date & 0xffff };
}
class ZipWriter {
  constructor() { this.central = []; this.lhOffsets = 0; this.bufs = []; }
  _push(b) { this.bufs.push(b); }
  add(name, data, mode, isDir) {
    if (isDir) { data = Buffer.alloc(0); }
    const crc = crc32(data);
    const def = zlib.deflateRawSync(data);
    const { time, date } = dosTime(new Date());
    const nameBuf = Buffer.from(name, 'utf8');
    const lNameLen = nameBuf.length;
    const lh = Buffer.alloc(30);
    lh.writeUInt32LE(0x04034b50, 0);
    lh.writeUInt16LE(20, 4);            // versao minima
    lh.writeUInt16LE(0x0800, 6);        // flag UTF-8
    lh.writeUInt16LE(8, 8);             // deflate
    lh.writeUInt16LE(time, 10);
    lh.writeUInt16LE(date, 12);
    lh.writeUInt32LE(crc, 14);
    lh.writeUInt32LE(def.length, 18);
    lh.writeUInt32LE(data.length, 22);
    lh.writeUInt16LE(lNameLen, 26);
    lh.writeUInt16LE(0, 28);            // extra len
    const localOff = this.lhOffsets;
    this._push(lh); this._push(nameBuf); this._push(def);
    this.lhOffsets += 30 + lNameLen + def.length;
    const hdr = Buffer.alloc(46);
    hdr.writeUInt32LE(0x02014b50, 0);
    hdr.writeUInt16LE(0x031e, 4);       // feito por: unix, versao 30
    hdr.writeUInt16LE(20, 6);
    hdr.writeUInt16LE(0x0800, 8);
    hdr.writeUInt16LE(8, 10);
    hdr.writeUInt16LE(time, 12);
    hdr.writeUInt16LE(date, 14);
    hdr.writeUInt32LE(crc, 16);
    hdr.writeUInt32LE(def.length, 20);
    hdr.writeUInt32LE(data.length, 24);
    hdr.writeUInt16LE(lNameLen, 28);
    hdr.writeUInt16LE(0, 30);
    hdr.writeUInt16LE(0, 32);
    hdr.writeUInt16LE(0, 34);
    hdr.writeUInt16LE(0, 36);
    const unixMode = isDir ? 0o40755 : (mode & 0o111) !== 0 ? 0o100755 : 0o100644;
    hdr.writeUInt32LE(((unixMode * 0x10000) | (isDir ? 0x10 : 0x20)) >>> 0, 38);
    hdr.writeUInt32LE(localOff, 42);
    this.central.push({ b: hdr, n: nameBuf });
    return this;
  }
  finalize() {
    const cdStart = this.lhOffsets;
    let cdSize = 0;
    for (const e of this.central) { this._push(e.b); this._push(e.n); cdSize += e.b.length + e.n.length; }
    const cdEntries = this.central.length;
    const eocd = Buffer.alloc(22);
    eocd.writeUInt32LE(0x06054b50, 0);
    eocd.writeUInt16LE(0, 4);
    eocd.writeUInt16LE(0, 6);
    eocd.writeUInt16LE(cdEntries, 8);
    eocd.writeUInt16LE(cdEntries, 10);
    eocd.writeUInt32LE(cdSize, 12);
    eocd.writeUInt32LE(cdStart, 16);
    eocd.writeUInt16LE(0, 20);
    this._push(eocd);
    return Buffer.concat(this.bufs);
  }
}

function makeZip(stagingDir, outPath) {
  log(C.dim + '[zip] Gerando ' + outPath + ' ...' + C.reset);
  const zw = new ZipWriter();
  const emitted = new Set([ZIP_ROOT + '/']);
  zw.add(ZIP_ROOT + '/', Buffer.alloc(0), 0o755, true);

  function emitDirs(rel) {
    const parts = rel.split('/');
    parts.pop();
    let acc = '';
    for (const p of parts) {
      acc += (acc ? '/' : '') + p;
      const key = acc + '/';
      if (!emitted.has(key)) { zw.add(key, Buffer.alloc(0), 0o755, true); emitted.add(key); }
    }
  }

  const files = [];
  (function walk(dir, rel) {
    let entries = [];
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch (e) { return; }
    for (const ent of entries) {
      const full = path.join(dir, ent.name);
      const childRel = rel ? rel + '/' + ent.name : ent.name;
      if (ent.isDirectory()) { emitted.add(childRel + '/'); walk(full, childRel); }
      else files.push({ full, rel: childRel, mode: fs.statSync(full).mode });
    }
  })(stagingDir, '');
  for (const f of files.sort((a, b) => (a.rel < b.rel ? -1 : 1))) {
    emitDirs(f.rel);
    try {
      const data = fs.readFileSync(f.full);
      zw.add(f.rel, data, f.mode, false);
    } catch (e) {
      warn('nao consegui ler ' + f.rel + ' (' + e.message + ')');
    }
  }
  emitted.clear();

  fs.writeFileSync(outPath, zw.finalize());
}

function humanSize(n) {
  const mb = n / 1024 / 1024;
  return mb >= 1 ? mb.toFixed(1) + ' MB' : (n / 1024).toFixed(0) + ' KB';
}

/* ──────────────── Pipeline ──────────────── */
function main() {
  log(C.dim + 'Empacotando NGR Agent -> ' + OUT + C.reset);

  if (!fs.existsSync(path.join(ROOT, 'instalador-windows.js'))) {
    err('Pasta do projeto nao encontrada. Rode na raiz do NGR Agent.');
    process.exit(1);
  }

  // 1) duplica a pasta atual para o staging (sem node_modules/caches)
  fs.rmSync(STAGING, { recursive: true, force: true });
  fs.mkdirSync(STAGING, { recursive: true });
  const files = collectFiles();
  const target = path.join(STAGING, ZIP_ROOT);
  for (const f of files) {
    const out = path.join(target, f.rel);
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.copyFileSync(f.full, out);
    fs.chmodSync(out, f.mode & 0o777);
  }
  ok('pasta duplicada: ' + files.length + ' arquivos (sem node_modules, modelos e caches)');

  // 2) inclui o instalador compilado
  const exe = path.join(ROOT, 'NGR-Instalador.exe');
  if (fs.existsSync(exe)) {
    fs.copyFileSync(exe, path.join(target, 'NGR-Instalador.exe'));
    ok('NGR-Instalador.exe incluido (' + humanSize(fs.statSync(exe).size) + ')');
  } else {
    warn('NGR-Instalador.exe nao encontrado. Gere antes com: npm run installer:build-win');
  }
  const lin = path.join(ROOT, 'NGR-Instalador-linux');
  if (WITH_LINUX && fs.existsSync(lin)) {
    fs.copyFileSync(lin, path.join(target, 'NGR-Instalador-linux'));
    fs.chmodSync(path.join(target, 'NGR-Instalador-linux'), 0o755);
    ok('NGR-Instalador-linux incluido (' + humanSize(fs.statSync(lin).size) + ')');
  }

  // 3) compacta em .zip (o staging ja tem a pasta raiz "NGR Agent")
  makeZip(STAGING, OUT);
  const size = fs.statSync(OUT).size;
  ok('zip gerado: ' + OUT + ' (' + humanSize(size) + ')');
  log(C.green + '\nPronto para enviar ao Google Drive e descompactar no Windows.' + C.reset);
  log(C.dim + 'No Windows: descompacte e rode NGR-Instalador.exe.' + C.reset);

  // 4) limpa o staging
  if (!KEEP) {
    fs.rmSync(STAGING, { recursive: true, force: true });
    log(C.dim + 'staging temporario removido.' + C.reset);
  } else {
    log(C.dim + 'staging mantido (--keep): ' + STAGING + C.reset);
  }
}

main();