#!/usr/bin/env node
/* Empacotador COMPLETO do NGR Agent.
 *
 * APENAS despacha a compactacao para o comando nativo do Linux via
 * child_process:  zip -r NGR-Agent-Completo.zip .
 * Nenhum arquivo e lido/compactado pelo Node/Bun (evita estourar memoria
 * e Segmentation Fault em sistema grande com models/node_modules).
 *
 * Inclui TODA a pasta atual (models, node_modules, resources/ngrbot,
 * database, assets, backend). Avisos:
 *   - .env* (segredos) SAO incl청dos por padrao; passe --excluir-segredos se
 *     nao quiser enviar as credenciais reais no zip.
 *   - sessoes/cache do WhatsApp sao incl청das por padrao (dados da maquina).
 *
 * Uso:
 *   node scripts/zip-full.js [--out NGR-Agent-Completo.zip] [--excluir-segredos] [--verify]
 */
'use strict';

const { spawn, spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = process.cwd();
const ARGS = process.argv.slice(2);
const EXCLUIR_SEGREDOS = ARGS.includes('--excluir-segredos');
const VERIFY = ARGS.includes('--verify');
const OUT_ARG = (() => {
  const i = ARGS.indexOf('--out');
  return i >= 0 && ARGS[i + 1] ? ARGS[i + 1] : null;
})();
const OUT_NAME = OUT_ARG || 'NGR-Agent-Completo.zip';
const OUT = path.join(ROOT, OUT_NAME);

const C = {
  reset: '\x1b[0m', dim: '\x1b[2m', green: '\x1b[32m', gold: '\x1b[33m', red: '\x1b[31m',
};
function log(m) { console.log(m); }
function ok(m) { log(C.green + '  [OK] ' + m + C.reset); }
function warn(m) { log(C.gold + '  [AVISO] ' + m + C.reset); }
function err(m) { log(C.red + '  [ERRO] ' + m + C.reset); }
function humanSize(n) {
  const mb = n / 1024 / 1024;
  return mb >= 1024 ? (mb / 1024).toFixed(2) + ' GB' : mb.toFixed(1) + ' MB';
}

function hasBinary(name) {
  return spawnSync('sh', ['-c', 'command -v ' + name], { stdio: 'pipe' }).status === 0;
}

/* ─────────────────────── MAIN ─────────────────────── */
if (!hasBinary('zip')) {
  err('Comando "zip" nao encontrado. Instale com: sudo apt install zip');
  process.exit(1);
}
if (!fs.existsSync(path.join(ROOT, 'main.js'))) {
  err('Pasta do NGR Agent nao encontrada (procure main.js). Rode na raiz do projeto.');
  process.exit(1);
}

log(C.dim + 'Empacotando a pasta atual COMPLETA: ' + ROOT + C.reset);
warn('Incluindo TODAS as pastas (models, node_modules, backend, sessoes).');
if (!EXCLUIR_SEGREDOS) warn('.env (segredos) sera INCLUIDO no zip. Use --excluir-segredos para REMOVE-LOS.');
else warn('--excluir-segredos: removendo .env* do zip (o instalador recria os .env no destino).');

fs.rmSync(OUT, { force: true });

// Exclui sempre: o proprio zip e zips anteriores (evita auto-inclusao).
const alwaysExcluded = [OUT_NAME, 'NGR-Agent-*.zip'];
// Com --excluir-segredos: tira qualquer .env* (raiz e subpastas).
const secretExcluded = EXCLUIR_SEGREDOS
  ? ['.env.local', '.env.production', '.env.staging', 'resources/ngrbot/.env', '.env']
  : [];

const args = ['-r', '-q', '-9', OUT_NAME, '.', '-x', ...alwaysExcluded, ...secretExcluded];

log(C.dim + '[zip] despachando: zip ' + args.join(' ') + C.reset);
const t0 = Date.now();
const child = spawn('zip', args, { stdio: 'inherit', cwd: ROOT });

child.on('error', (e) => {
  err('Falha ao iniciar o zip nativo: ' + e.message);
  process.exit(1);
});
child.on('exit', (code) => {
  if (code !== 0) {
    err('zip nativo encerrou com codigo ' + code + '.');
    fs.rmSync(OUT, { force: true });
    process.exit(code);
  }
  const secs = ((Date.now() - t0) / 1000).toFixed(1);
  const size = fs.statSync(OUT).size;
  const count = spawnSync('unzip', ['-l', OUT], { encoding: 'utf8', maxBuffer: 128 * 1024 * 1024 });
  const m = ('' + count.stdout).match(/(\d+) files/);
  ok('zip completo gerado: ' + OUT + ' (' + humanSize(size) + ' | ' + (m ? m[1] + ' arquivos' : '?') + ' | ' + secs + 's)');
  log(C.green + '\nBundle autossuficiente. No Windows: descompacte e use INICIAR-NGR-HUB.bat / NGR-Instalador.exe.' + C.reset);

  if (VERIFY) {
    log(C.dim + '[verify] unzip -t (pode demorar)...' + C.reset);
    const v = spawnSync('unzip', ['-t', OUT], { stdio: 'inherit' });
    if (v.status === 0) ok('verificacao de integridade OK');
    else { err('verificacao falhou (status ' + v.status + ').'); process.exitCode = 1; }
  }
});