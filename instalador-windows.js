#!/usr/bin/env node
'use strict';
/* ═════════════════════════════════════════════════════════════════
 *  NGR HUB + NGR BOT - INSTALADOR (assistente grafico estilo Inno)
 *
 *  O .exe (gerado por scripts/build-installer.js via @yao-pkg/pkg)
 *  embute os arquivos do projeto como payload e funciona como um
 *  instalador classico do Windows:
 *
 *   1) Escolha do diretorio de destino (instalar em outro HD);
 *   2) Extracao automatica de todos os arquivos/pastas necessarios;
 *   3) Criacao de atalho na Area de Trabalho (opcional);
 *   4) Sistema pronto para abrir com 2 cliques no atalho.
 *
 *  Tambem roda no Linux (script) para quem quer instalar numa pasta
 *  alternativa com --dir.
 *
 *  Uso:
 *    node instalador-windows.js                  instala e abre
 *    node instalador-windows.js --dir D:\NGR     destino alternativo
 *    node instalador-windows.js --check          diagnostico rapido
 *    node instalador-windows.js --no-launch      instala sem abrir
 *    node instalador-windows.js --no-model       nao baixa o modelo
 *    node instalador-windows.js --no-deps        so copia arquivos
 *    node instalador-windows.js --yes            sem confirmacoes
 * ═════════════════════════════════════════════════════════════════ */

const fs = require('fs');
const path = require('path');
const os = require('os');
const https = require('https');
const readline = require('readline');
const { spawn, spawnSync } = require('child_process');
const { downloadModel, MODEL_NAME } = require('./download-model');

const IS_WIN = process.platform === 'win32';
const IS_PKG = !!process.pkg;
const IS_TTY = Boolean(process.stdin.isTTY);

/* ═════════ Arg CLI ═════════ */
const ARGS = process.argv.slice(2);
const DEF = { dir: null };
for (let i = 0; i < ARGS.length; i++) {
  if (ARGS[i] === '--dir') DEF.dir = ARGS[i + 1];
}
const FLAGS = {
  check: ARGS.includes('--check'),
  noLaunch: ARGS.includes('--no-launch'),
  noModel: ARGS.includes('--no-model'),
  noDeps: ARGS.includes('--no-deps'),
  yes: ARGS.includes('--yes'),
  installNode: ARGS.includes('--install-node'),
  skipShortcut: ARGS.includes('--skip-shortcut'),
  printAssets: ARGS.includes('--print-assets'),
};

/* ═════════ Raiz do projeto (script) / payload (exe) ═════════ */
let ROOT = null;      // pasta que possui package.json ngr-hub + resources/ngrbot
let NGRBOT = null;

function projectPackIsValid(dir) {
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'));
    return (
      pkg.name === 'ngr-hub' &&
      fs.existsSync(path.join(dir, 'main.js')) &&
      fs.existsSync(path.join(dir, 'resources', 'ngrbot', 'server.js'))
    );
  } catch (e) {
    return false;
  }
}

function findProjectRoot() {
  // script: raiz = pasta do proprio arquivo; .exe: procura ao redor do executavel
  const start = IS_PKG ? path.dirname(process.execPath) : __dirname;
  let dir = start;
  for (let i = 0; i < 6; i++) {
    if (projectPackIsValid(dir)) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

function setRoot(dir) {
  ROOT = dir;
  NGRBOT = dir ? path.join(dir, 'resources', 'ngrbot') : null;
}

/* ═════════ Log ═════════ */
const C = { reset: '\x1b[0m', gold: '\x1b[33m', white: '\x1b[37m', green: '\x1b[32m', red: '\x1b[31m', dim: '\x1b[2m' };
function log() { process.stdout.write([...arguments].join(' ') + '\n'); }
function step(t) { log('\n' + C.white + t + C.reset); }
function ok(t) { log(C.green + '  [OK] ' + t + C.reset); }
function warn(t) { log(C.dim + '  [AVISO] ' + t + C.reset); }
function err(t) { log(C.red + '  [ERRO] ' + t + C.reset); }

function banner() {
  if (IS_WIN) {
    log('   _   _  _____  ____          ____  _     _____  _  _____ ');
    log('  | \\ | ||__  / / ___|    _   | __ )| |   |_   _|| ||_   _|');
    log('  |  \\| |  / /  | |  _   (_)  |  _ \\| |     | |  | |__| |  ');
    log('  | |\\  | / /_  | |_| |  _    | |_) | |___  | |  | |  | |  ');
    log('  |_| \\_|/____|  \\____| (_)   |____/|_____| |_|  |_|  |_|  ');
    log('   NGR HUB + NGR BOT - ASSISTENTE DE INSTALACAO (Win 10/11)');
  } else {
    log('  ▓   ▓  ▓▓▓  ▓▓▓▓     ▓   ▓ ▓   ▓ ▓▓▓▓          ');
    log('  ▓▓  ▓░▓ ░░░ ▓░░░▓    ▓░  ▓░▓░  ▓░▓░░░▓         ');
    log('  ▓░▓ ▓░▓░ ▓▓░▓▓▓▓░░   ▓▓▓▓▓░▓░░ ▓░▓▓▓▓░░        ');
    log('  ▓░░▓▓░▓░░ ▓░▓░░▓░ ░  ▓░░░▓░▓░░ ▓░▓░░░▓ ░       ');
    log('  ▓░░ ▓░░▓▓▓ ░▓░░░▓░   ▓░░░▓░░▓▓▓ ░▓▓▓▓░░        ');
    log('   ░░  ░░ ░░░ ░░░  ░    ░░  ░░ ░░░ ░░░░░ ░       ');
    log('    ░   ░  ░░░  ░   ░    ░   ░  ░░░  ░░░░         ');
    log('   NGR HUB + NGR BOT - INSTALADOR');
  }
  log('=========================================================');
}

/* ═════════ Dialogos nativos (Windows) ═════════ */
function powershell(script, timeoutMs) {
  try {
    const r = spawnSync('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', script], {
      encoding: 'utf8', windowsHide: true, timeout: timeoutMs || 120000, stdio: ['ignore', 'pipe', 'pipe'],
    });
    if (r.status === 0) return { ok: true, out: String(r.stdout || '') };
    return { ok: false, out: String(r.stderr || r.stdout || '') };
  } catch (e) {
    return { ok: false, out: e.message };
  }
}

function pickFolder(title, initial) {
  if (!IS_WIN) return { ok: false, out: 'apenas Windows' };
  const ps =
    'Add-Type -AssemblyName System.Windows.Forms;' +
    '$f = New-Object System.Windows.Forms.FolderBrowserDialog;' +
    '$f.Description = ' + JSON.stringify(title) + ';' +
    '$f.ShowNewFolderButton = $true;' +
    (initial ? '$f.SelectedPath = ' + JSON.stringify(initial) + ';' : '') +
    'if ($f.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) { $f.SelectedPath } else { "" }';
  return powershell(ps, 120000);
}

function msgBox(title, text, icon) {
  if (!IS_WIN) {
    log('');
    log('=========================================================');
    log('  ' + title);
    log('  ' + String(text).replace(/\n/g, '\n  '));
    log('=========================================================');
    return;
  }
  const ps =
    'Add-Type -AssemblyName System.Windows.Forms;' +
    '[System.Windows.Forms.MessageBox]::Show(' +
    JSON.stringify(String(text).replace(/\r?\n/g, '`n')) + ', ' +
    JSON.stringify(title) + ', ' +
    "'OKOnly'" + ', ' +
    JSON.stringify(icon || 'Information') + ')';
  powershell(ps, 30000);
}

/* ═════════ Prompt simples (assincrono) ═════════ */
function confirm(q, defYes) {
  if (FLAGS.yes) return Promise.resolve(true);
  if (!IS_TTY) return Promise.resolve(false);
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(q + ' (s/N) ', (ans) => {
      rl.close();
      const a = String(ans || '').trim().toLowerCase();
      if (defYes && a === '') resolve(true);
      else resolve(a === 's' || a === 'y' || a === 'sim');
    });
  });
}

/* ═════════ Node / env ═════════ */
let nodeDir = null;

function envWithNode() {
  const env = Object.assign({}, process.env);
  if (IS_WIN && nodeDir) {
    const cur = env.PATH || '';
    env.PATH = nodeDir + ';' + cur;
  }
  env.CMAKE_ARGS = '-DLLAMA_AVX=OFF -DLLAMA_AVX2=OFF -DLLAMA_FMA=OFF -DGGML_NATIVE=OFF';
  env.GGML_NATIVE = '0';
  return env;
}

function detectNode() {
  if (IS_WIN) {
    const cands = [
      path.join(process.env.ProgramFiles || 'C:\\Program Files', 'nodejs', 'node.exe'),
      path.join(process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)', 'nodejs', 'node.exe'),
      path.join(process.env.LOCALAPPDATA || process.env.APPDATA || '', 'Programs', 'nodejs', 'node.exe'),
    ];
    for (const c of cands) if (fs.existsSync(c)) { nodeDir = path.dirname(c); return c; }
    const r = spawnSync('where.exe', ['node'], { encoding: 'utf8', env: envWithNode(), windowsHide: true });
    if (r.status === 0 && r.stdout) {
      const line = String(r.stdout).split(/\r?\n/)[0].trim();
      if (line) { nodeDir = path.dirname(line); return line; }
    }
    return null;
  }
  const r = spawnSync('which', ['node'], { encoding: 'utf8' });
  return r.status === 0 && r.stdout ? String(r.stdout).trim() : null;
}

function nodeVersion(nodePath) {
  const r = spawnSync(nodePath, ['-v'], { encoding: 'utf8', windowsHide: true });
  if (r.status !== 0) return null;
  return String(r.stdout || '').trim().replace(/^v/, '');
}

/* ═════════ Executor de subprocesso ═════════ */
function run(cmd, args, opts) {
  opts = opts || {};
  return new Promise((resolve) => {
    log('  > ' + [cmd].concat(args || []).join(' '));
    const child = spawn(cmd, args || [], {
      stdio: 'inherit',
      env: envWithNode(),
      cwd: opts.cwd || ROOT,
      windowsHide: true,
    });
    child.on('exit', (code) => resolve(code === undefined ? -1 : code));
    child.on('error', (e) => { warn('nao foi possivel executar "' + cmd + '": ' + e.message); resolve(-1); });
  });
}

function runCapture(cmd, args) {
  const r = spawnSync(cmd, args, { encoding: 'utf8', env: envWithNode(), windowsHide: true });
  return r.status === 0 ? String(r.stdout || '') : null;
}

/* ═════════ HTTPS util ═════════ */
function httpString(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'NGR-Instalador/1.0' } }, (res) => {
      let data = '';
      res.on('data', (c) => (data += c));
      res.on('end', () => resolve({ status: res.statusCode, body: data }));
      res.on('error', reject);
    }).on('error', reject).setTimeout(15000, function () {
      this.destroy(new Error('Timeout'));
    });
  });
}

function downloadFile(url, dest) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'NGR-Instalador/1.0' } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        return downloadFile(new URL(res.headers.location, url).toString(), dest).then(resolve, reject);
      }
      if (res.statusCode !== 200) { res.resume(); return reject(new Error('HTTP ' + res.statusCode)); }
      const out = fs.createWriteStream(dest);
      res.pipe(out);
      out.on('finish', () => { out.close(); resolve(); });
      out.on('error', reject);
      res.on('error', reject);
    }).on('error', reject).setTimeout(20000, function () {
      this.destroy(new Error('Timeout'));
    });
  });
}

function latestNodeMsiUrl() {
  return httpString('https://nodejs.org/dist/latest-v22.x/')
    .then((r) => {
      if (r.status !== 200) throw new Error('HTTP ' + r.status);
      const m = String(r.body).match(/node-v(\d+\.\d+\.\d+)-x64\.msi/);
      if (!m) throw new Error('versao LTS nao encontrada');
      return { version: m[1], url: 'https://nodejs.org/dist/latest-v22.x/node-v' + m[1] + '-x64.msi' };
    });
}

/* ═════════ Passo 0: garantir Node.js ═════════ */
async function ensureNode() {
  const nodePath = detectNode();
  if (nodePath) {
    const v = nodeVersion(nodePath);
    ok('Node.js ' + v + ' detectado (' + nodePath + ')');
    if (v && parseInt(String(v).split('.')[0], 10) < 18) {
      warn('Versao muito antiga. Recomendado Node.js 18+ (LTS).');
    }
    return nodePath;
  }

  if (IS_WIN) {
    log('');
    log(C.white + 'Node.js nao encontrado. O instalador vai baixar e instalar o Node.js 22 LTS.' + C.reset);
    const doInstall = FLAGS.installNode || (await confirm('Deseja instalar o Node.js 22 LTS agora?', true));
    if (!doInstall) {
      err('Sem Node.js o sistema nao roda. Baixe em https://nodejs.org (LTS 64-bit) e rode novamente.');
      process.exit(1);
    }
    const w = spawnSync('winget', ['install', '-e', '-h', '--accept-source-agreements', '--accept-package-agreements', '--id', 'OpenJS.NodeJS.LTS'], {
      stdio: 'inherit', windowsHide: true, timeout: 240000,
    });
    if (w.status === 0 || fs.existsSync(path.join(process.env.ProgramFiles || 'C:\\Program Files', 'nodejs', 'node.exe'))) {
      ok('Node.js instalado via winget.');
    } else {
      log('  winget indisponivel. Baixando instalador oficial do nodejs.org...');
      try {
        const meta = await latestNodeMsiUrl();
        const msi = path.join(os.tmpdir(), 'node-lts-' + meta.version + '-x64.msi');
        await downloadFile(meta.url, msi);
        msgBox('Node.js', 'Instalando o Node.js. Confirme o aviso do Windows (UAC) quando aparecer.');
        spawnSync('msiexec', ['/i', msi, '/qn', '/norestart'], { windowsHide: true, stdio: 'inherit', timeout: 120000 });
        const pgm = path.join(process.env.ProgramFiles || 'C:\\Program Files', 'nodejs', 'node.exe');
        for (let i = 0; i < 60 && !fs.existsSync(pgm); i++) await new Promise((r) => setTimeout(r, 2000));
        if (fs.existsSync(pgm)) ok('Node.js ' + nodeVersion(pgm) + ' instalado.');
      } catch (e) {
        err('Falha ao instalar Node.js: ' + e.message);
      }
    }
  } else {
    err('Node.js nao encontrado. Instale em https://nodejs.org e rode novamente.');
    process.exit(1);
  }

  const again = detectNode();
  if (!again) {
    err('Nao foi possivel confirmar o Node.js. Instale em https://nodejs.org e rode novamente.');
    process.exit(1);
  }
  ok('Node.js ' + nodeVersion(again) + ' confirmado.');
  return again;
}

/* ═════════ Extracao do payload (assistente) ═════════ */
const EXCL_DIRS = new Set([
  'node_modules', 'models', '.git', '.build-tools', 'dist', 'sessions',
  '.wwebjs_auth', '.wwebjs_cache', '.cache', '.npm',
]);

function shouldSkipFile(name) {
  if (name === '.env' || name === '.env.local' || name === '.env.production') return true;
  if (name === 'nul') return true;
  if (name.endsWith('.sqlite') || name.endsWith('.db') || name.endsWith('.part')) return true;
  if (name.startsWith('NGR-Instalador') || name === 'instalador-windows.js' || name === 'package-lock.json') return true;
  return false;
}

function copyAll(src, destDir, stats) {
  fs.mkdirSync(destDir, { recursive: true });
  let entries = [];
  try { entries = fs.readdirSync(src, { withFileTypes: true }); } catch (e) { return; }
  for (const ent of entries) {
    const name = ent.name;
    if (ent.isDirectory()) {
      if (EXCL_DIRS.has(name)) continue;
      copyAll(path.join(src, name), path.join(destDir, name), stats);
    } else {
      if (shouldSkipFile(name)) continue;
      try {
        fs.copyFileSync(path.join(src, name), path.join(destDir, name));
        if (stats) { stats.files++; stats.bytes += fs.statSync(path.join(src, name)).size; }
      } catch (e) {
        warn('arquivo nao copiado: ' + name + ' (' + e.message + ')');
      }
    }
  }
}

/* Extrai o payload tar embutido no executavel (assistente). */
function untar(buf, dest) {
  fs.mkdirSync(dest, { recursive: true });
  let off = 0;
  let count = 0;
  while (off + 512 <= buf.length) {
    const header = buf.subarray(off, off + 512);
    const name = header.subarray(0, 100).toString('utf8').replace(/\0.*$/, '');
    if (!name) break; // fim do tar
    const sizeStr = header.subarray(124, 136).toString('utf8').split('\0')[0].replace(/\s/g, '');
    const size = parseInt(sizeStr || '0', 8) || 0;
    const type = header.toString('utf8', 156, 157);
    off += 512;
    const data = buf.subarray(off, off + size);
    off += Math.ceil(size / 512) * 512;
    const safe = name.replace(/^\/+/, '');
    if (!safe) continue;
    const destFile = path.join(dest, safe);
    if (type === '5' || name.endsWith('/')) {
      fs.mkdirSync(destFile.replace(/[\\\/]$/, ''), { recursive: true });
      continue;
    }
    const base = path.dirname(destFile);
    if (base && !fs.existsSync(base)) fs.mkdirSync(base, { recursive: true });
    fs.writeFileSync(destFile, data);
    count++;
  }
  return count;
}

function extractPayload(dest) {
  fs.mkdirSync(dest, { recursive: true });
  if (IS_PKG) {
    const tarPath = path.join(__dirname, 'NGR-payload.tar');
    if (!fs.existsSync(tarPath)) throw new Error('Payload embutido nao encontrado no executavel.');
    const buf = fs.readFileSync(tarPath);
    return untar(buf, dest);
  }
  const stats = { files: 0, bytes: 0 };
  copyAll(ROOT, dest, stats);
  return stats.files;
}

function printPayloadStats() {
  if (IS_PKG) {
    const tarPath = path.join(__dirname, 'NGR-payload.tar');
    if (fs.existsSync(tarPath)) {
      const size = Math.round(fs.statSync(tarPath).size / 1024 / 1024);
      log('  Payload embutido: NGR-payload.tar (' + size + ' MB)');
      return;
    }
    log('  Payload embutido: ausente');
    return;
  }
  const stats = { files: 0, bytes: 0 };
  copyAll(ROOT, path.join(os.tmpdir(), 'ngr-payload-stat-' + Date.now()), stats);
  log('  Conteudo do projeto: ' + stats.files + ' arquivos, ' + Math.round(stats.bytes / 1024 / 1024) + ' MB');
}

/* ═════════ Passo 1: dependencias do ERP ═════════ */
async function installEirpDeps() {
  step('[1/5] Dependencias do ERP (NGR HUB)...');
  if (fs.existsSync(path.join(ROOT, 'node_modules'))) {
    ok('node_modules ja presentes.');
  } else {
    await run('npm', ['install', '--ignore-scripts', '--no-audit', '--no-fund', '--loglevel=error'], { cwd: ROOT });
  }

  const electronExe = IS_WIN
    ? path.join(ROOT, 'node_modules', 'electron', 'dist', 'electron.exe')
    : path.join(ROOT, 'node_modules', 'electron', 'dist', 'electron');
  if (!fs.existsSync(electronExe)) {
    log('  Baixando binario do Electron para a plataforma...');
    await run('node', [path.join(ROOT, 'node_modules', 'electron', 'install.js')], { cwd: ROOT });
  }
  ok('Electron pronto.');

  const plat = llamaPlatform();
  const llamaDir = path.join(ROOT, 'node_modules', '@node-llama-cpp', plat, 'bins', plat);
  let hasLlama = false;
  try { hasLlama = fs.existsSync(llamaDir) && fs.readdirSync(llamaDir).length > 0; } catch (e) { /* ausente */ }
  if (!hasLlama) {
    let ver = null;
    try {
      ver = JSON.parse(fs.readFileSync(path.join(ROOT, 'node_modules', 'node-llama-cpp', 'package.json'), 'utf8')).version;
    } catch (e) { /* versao ausente */ }
    const pkgName = '@node-llama-cpp/' + plat;
    log('  Instalando binario nativo do LLM (' + plat + ')...');
    await run('npm', ['install', '--no-save', '--no-audit', '--no-fund', '--omit=dev', ver ? pkgName + '@' + ver : pkgName], { cwd: ROOT });
  }
  try {
    hasLlama = fs.existsSync(llamaDir) && fs.readdirSync(llamaDir).length > 0;
  } catch (e) { hasLlama = false; }
  if (hasLlama) ok('Binario do LLM pronto (' + plat + ').');
  else warn('Binario do LLM ausente. A IA embarcada podera nao funcionar.');
}

/* ═════════ Passo 2: dependencias do NGR BOT ═════════ */
async function installNgrbotDeps() {
  step('[2/5] Dependencias do NGR BOT (WhatsApp)...');
  if (fs.existsSync(path.join(NGRBOT, 'node_modules'))) {
    ok('node_modules ja presentes.');
  } else {
    await run('npm', ['install', '--no-audit', '--no-fund', '--loglevel=error'], { cwd: NGRBOT });
  }

  const chromeCache = path.join(os.homedir(), '.cache', 'puppeteer', 'chrome');
  let hasChrome = false;
  try { hasChrome = fs.existsSync(chromeCache) && fs.readdirSync(chromeCache).length > 0; } catch (e) { /* ausente */ }
  if (!hasChrome) {
    log('  Baixando o Chrome (usado pelo modulo WhatsApp, ~150MB)...');
    await run('node', [path.join(NGRBOT, 'node_modules', 'puppeteer', 'lib', 'cjs', 'puppeteer', 'node', 'cli.js'), 'browsers', 'install', 'chrome@stable'], { cwd: NGRBOT });
  }
  try { hasChrome = fs.existsSync(chromeCache) && fs.readdirSync(chromeCache).length > 0; } catch (e) { hasChrome = false; }
  if (hasChrome) ok('Chrome pronto para o WhatsApp.');
  else warn('Chrome nao foi baixado. O WhatsApp precisara da rede ao conectar o numero.');

  const sqliteNode = path.join(NGRBOT, 'node_modules', 'sqlite3', 'build', 'Release', 'node_sqlite3.node');
  if (!fs.existsSync(sqliteNode)) {
    log('  Instalando binario nativo do sqlite3...');
    await run('npm', ['exec', '--yes', 'prebuild-install', '--', '-r', 'napi'], { cwd: NGRBOT });
  }
  if (fs.existsSync(sqliteNode)) ok('sqlite3 nativo pronto.');
  else warn('sqlite3 nativo ausente. O painel/bot poderao apresentar erros.');
}

/* ═════════ Passo 3: modelo GGUF ═════════ */
async function ensureModel() {
  step('[3/5] Modelo de IA (GGUF)...');
  const file = path.join(ROOT, 'models', MODEL_NAME);
  if (fs.existsSync(file)) {
    const mb = (fs.statSync(file).size / 1024 / 1024).toFixed(0);
    ok('Modelo presente: ' + MODEL_NAME + ' (' + mb + ' MB).');
    return;
  }
  if (FLAGS.noModel) {
    warn('Modelo nao encontrado. Depois use: node download-model.js');
    return;
  }
  const yes = await confirm('Modelo ~1.1GB nao encontrado. Baixar agora?', true);
  if (!yes) {
    warn('Sera preciso baixar manualmente: node download-model.js');
    return;
  }
  try {
    await downloadModel({
      modelsDir: path.join(ROOT, 'models'),
      onMessage: (m) => log(m),
    });
  } catch (e) {
    err('Falha ao baixar modelo: ' + e.message);
  }
}

/* ═════════ Passo 4: porta 3000 ═════════ */
function portIsOpen() {
  const r = spawnSync('node', ['-e', "const h=require('http');h.get({host:'127.0.0.1',port:3000,timeout:2500},r=>process.exit(r.statusCode?0:1)).on('error',()=>process.exit(1))"], {
    encoding: 'utf8', windowsHide: true, timeout: 5000,
  });
  return r.status === 0;
}

function checkServer() {
  step('[4/5] Servidor NGR BOT (porta 3000)...');
  if (portIsOpen()) ok('NGR BOT ja esta ativo em http://localhost:3000');
  else ok('Sera iniciado junto com o ERP (o main.js sobe o servidor).');
}

/* ═════════ Passo 5: ambiente, atalho e abertura ═════════ */
function ensureEnvFiles() {
  const pairs = [
    [path.join(ROOT, '.env.example'), path.join(ROOT, '.env')],
    [path.join(NGRBOT, '.env.example'), path.join(NGRBOT, '.env')],
  ];
  for (const [src, dst] of pairs) {
    if (!fs.existsSync(dst) && fs.existsSync(src)) {
      fs.copyFileSync(src, dst);
      warn('Criado ' + path.relative(ROOT, dst) + ' a partir do modelo. Preencha as credenciais reais.');
    }
  }
}

function writeLauncherBat() {
  const batPath = path.join(ROOT, 'INICIAR-NGR-HUB.bat');
  const lines = [
    '@echo off',
    'title NGR HUB + NGR BOT',
    'cd /d "%~dp0"',
    'node "%~dp0node_modules\\electron\\cli.js" .',
    'if errorlevel 1 (',
    '  echo.',
    '  echo Nao foi possivel iniciar o NGR HUB. Confira se o Node.js esta instalado.',
    '  pause',
    ')',
  ];
  fs.writeFileSync(batPath, lines.join('\r\n') + '\r\n');
  return batPath;
}

function powershellPs(script) {
  try {
    const r = spawnSync('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', script], {
      encoding: 'utf8', windowsHide: true, timeout: 90000, stdio: 'inherit',
    });
    return r.status === 0;
  } catch (e) {
    return false;
  }
}

async function createShortcut(batPath) {
  if (FLAGS.skipShortcut || !IS_WIN) return;
  const iconIco = path.join(ROOT, 'frontend', 'assets', 'icon.ico');
  const iconTxt = fs.existsSync(iconIco) ? iconIco : path.join(ROOT);
  const desk = path.join(os.homedir(), 'Desktop');
  const startMenu = path.join(process.env.APPDATA || '', 'Microsoft', 'Windows', 'Start Menu', 'Programs');
  const places = [];
  if (fs.existsSync(desk)) places.push(path.join(desk, 'NGR HUB.lnk'));
  if (fs.existsSync(startMenu)) places.push(path.join(startMenu, 'NGR HUB.lnk'));
  if (!places.length) return;

  const yes = FLAGS.yes || (await confirm('Criar atalho na Area de Trabalho e no Menu Iniciar?', true));
  if (!yes) return;

  for (const lnkPath of places) {
    const ps =
      '$T=' + JSON.stringify(batPath) + ';' +
      '$D=' + JSON.stringify(ROOT) + ';' +
      '$I=' + JSON.stringify(iconTxt) + ';' +
      '$L=' + JSON.stringify(lnkPath) + ';' +
      '$w=New-Object -ComObject WScript.Shell;' +
      '$c=$w.CreateShortcut($L);' +
      '$c.TargetPath=$T;$c.WorkingDirectory=$D;$c.IconLocation=$I;$c.Description="NGR HUB + NGR BOT";' +
      '$c.Save()';
    powershellPs(ps);
  }
  ok('Atalho criado na Area de Trabalho e no Menu Iniciar.');
}

async function optionalFirewall() {
  if (!IS_WIN || FLAGS.yes) return;
  const yes = await confirm('Abrir a porta 3000 no Firewall do Windows? (so se acessar de outro PC)', false);
  if (!yes) return;
  const isAdmin = runCapture('net', ['session']) !== null;
  if (isAdmin) {
    spawnSync('netsh', ['advfirewall', 'firewall', 'add', 'rule', 'name="NGR BOT 3000"', 'dir=in', 'action=allow', 'protocol=TCP', 'localport=3000'], { windowsHide: true });
    ok('Regra de firewall criada.');
  } else {
    powershellPs('Start-Process netsh -ArgumentList \'advfirewall firewall add rule name="NGR BOT 3000" dir=in action=allow protocol=TCP localport=3000\' -Verb RunAs -Wait');
    warn('Se apareceu o controle de acesso (UAC), confirme para a regra valer.');
  }
}

async function launchApp() {
  const cli = path.join(ROOT, 'node_modules', 'electron', 'cli.js');
  if (!fs.existsSync(cli)) {
    err('Electron nao instalado. Abra manualmente com: npm install');
    return;
  }
  if (FLAGS.noLaunch) {
    log(C.dim + '  (pulando abertura por --no-launch) — abrir com: ' + (IS_WIN ? 'INICIAR-NGR-HUB.bat' : './instalacao.sh') + C.reset);
    return;
  }
  const yes = FLAGS.yes || (await confirm('Iniciar o NGR HUB agora?', true));
  if (!yes) return;
  log(C.gold + '  Abrindo NGR HUB...' + C.reset);
  await run('node', [cli, '.'], { cwd: ROOT });
}

/* ═════════ Plataforma node-llama-cpp ═════════ */
function llamaPlatform() {
  const p = os.platform();
  const a = os.arch();
  if (p === 'win32') return a === 'arm64' ? 'win-arm64' : 'win-x64';
  if (p === 'linux') return a === 'arm64' ? 'linux-arm64' : 'linux-x64';
  if (p === 'darwin') return a === 'arm64' ? 'mac-arm64' : 'mac-x64';
  return 'linux-x64';
}

/* ═════════ Diagnostico ═════════ */
function diag() {
  log('');
  log('  Plataforma      : ' + process.platform + ' / ' + process.arch);
  log('  Modo .exe (pkg) : ' + (IS_PKG ? 'sim (payload embutido)' : 'nao (script)'));
  const n = detectNode();
  log('  Node.js         : ' + (n ? nodeVersion(n) : 'NAO ENCONTRADO'));
  log('  Raiz atual      : ' + (ROOT || '-'));
  for (const check of [
    ['main.js', 'main.js'],
    ['frontend/index.html', path.join('frontend', 'index.html')],
    ['resources/ngrbot/server.js', path.join('resources', 'ngrbot', 'server.js')],
    ['node_modules (ERP)', 'node_modules'],
    ['electron/dist', path.join('node_modules', 'electron', 'dist')],
    ['node_modules (ngrbot)', path.join('resources', 'ngrbot', 'node_modules')],
    ['modelo GGUF', path.join('models', MODEL_NAME)],
  ]) {
    log('  ' + (ROOT && fs.existsSync(path.join(ROOT, check[1])) ? '[x] ' : '[ ] ') + check[0]);
  }
  log('');
  ok('Diagnostico concluido.');
}

/* ═════════ Escolha do diretorio de destino ═════════ */
function guessDefaultDir() {
  if (IS_WIN) {
    // Padrao fora de Program Files: nao exige administrador
    return 'C:\\NGR HUB';
  }
  return path.join(os.homedir(), 'NGR');
}

async function chooseDestination() {
  if (DEF.dir) return path.resolve(DEF.dir);
  if (IS_PKG && IS_WIN) {
    log(C.white + 'Escolha onde instalar o sistema (pode ser outro HD/pasta).' + C.reset);
    msgBox('NGR HUB', 'Bem-vindo ao assistente de instalacao.\n\nAgora escolha a pasta de destino\n(voce pode instalar em outro HD).');
    const pick = pickFolder('Escolha a pasta onde o NGR HUB sera instalado', guessDefaultDir());
    const sel = pick.ok ? String(pick.out || '').split(/\r?\n/)[0].trim() : '';
    if (!sel) {
      log(C.dim + '  Nenhuma pasta escolhida. Usando a padrao: ' + guessDefaultDir() + C.reset);
      return path.resolve(guessDefaultDir());
    }
    log(C.green + '  Destino escolhido: ' + sel + C.reset);
    return path.resolve(sel);
  }
  if (ROOT) return ROOT;
  throw new Error('Diretorio de destino nao definido');
}

/* ═════════ MAIN ═════════ */
async function main() {
  banner();

  if (FLAGS.printAssets) {
    printPayloadStats();
    return;
  }

  // Em modo .exe o payload esta embutido (nao depende da pasta de origem).
  if (IS_PKG) {
    // destino vem do FolderBrowserDialog/request no Windows
  } else {
    ROOT = findProjectRoot();
    if (!ROOT) {
      err('Pasta do projeto (package.json "ngr-hub" + resources/ngrbot) nao encontrada.');
      err('Rode este script dentro da pasta do projeto.');
      process.exit(1);
    }
    setRoot(ROOT);
  }

  const dest = await chooseDestination();
  const needExtract = IS_PKG || (dest !== ROOT);

  if (needExtract) {
    if (IS_PKG) step('[EXT] Extraindo arquivos do sistema para o destino...');
    else log(C.dim + '  Copiando projetos para o destino: ' + dest + C.reset);
    try {
      const nfiles = extractPayload(dest);
      if (projectPackIsValid(dest)) {
        setRoot(dest);
        ok('Arquivos instalados (' + nfiles + ') em: ' + dest);
      } else if (ROOT) {
        warn('O destino nao ficou valido; continuando na pasta do projeto.');
      } else {
        err('Nao foi possivel instalar o projeto no destino escolhido.');
        if (IS_TTY) await confirm('Sair', false);
        process.exit(1);
      }
    } catch (e) {
      err('Falha ao extrair os arquivos: ' + e.message);
      if (IS_TTY) await confirm('Sair', false);
      process.exit(1);
    }
  }

  log(C.green + 'Diretorio do projeto: ' + ROOT + C.reset);

  if (FLAGS.check) {
    diag();
    return;
  }

  if (!FLAGS.noDeps) {
    await ensureNode();
    await installEirpDeps();
    await installNgrbotDeps();
  } else {
    warn('--no-deps: pulando instalacao de dependencias e Node.js.');
  }

  await ensureModel();
  checkServer();

  step('[5/5] Preparando ambiente...');
  ensureEnvFiles();
  const bat = writeLauncherBat();
  if (IS_WIN) ok('Atalho de execucao criado: ' + path.relative(ROOT, bat));
  await createShortcut(bat);
  await optionalFirewall();

  log('');
  log(C.gold + '=========================================================' + C.reset);
  log(C.gold + '   Instalacao OK. O modulo WhatsApp fica no menu lateral.' + C.reset);
  log(C.gold + '   Abra o sistema com 2 cliques no atalho "NGR HUB".     ' + C.reset);
  log(C.gold + '=========================================================' + C.reset);

  if (IS_PKG && IS_WIN) {
    msgBox('Instalacao concluida', 'O NGR HUB foi instalado em:\n\n' + ROOT + '\n\nUm atalho "NGR HUB" foi criado na Area de Trabalho.\nDobre-clique nele para abrir o sistema.');
  }

  await launchApp();
}

main().catch((e) => {
  err('Erro inesperado: ' + (e && e.stack ? e.stack : e));
  process.exitCode = 1;
});