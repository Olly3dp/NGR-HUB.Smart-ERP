#!/usr/bin/env node
'use strict';
/* NGR - Download do modelo GGUF (cross-platform)
 * Mesma funcao do download-model.sh, mas roda em Windows/Linux/macOS
 * sem depender de bash/curl. Suporta redirecionamento HTTPS, progresso
 * e retomada de download (Range) se a conexao cair (~1.1GB).
 *
 * Uso direto:
 *   node download-model.js
 * Como modulo (usado pelo instalador):
 *   const { downloadModel } = require('./download-model');
 */

const fs = require('fs');
const path = require('path');
const https = require('https');

const MODEL_URL =
  'https://huggingface.co/mradermacher/Qwen2.5-1.5B-Instruct-uncensored-GGUF/resolve/main/Qwen2.5-1.5B-Instruct-uncensored.Q4_K_M.gguf';
const MODEL_NAME = 'Qwen2.5-1.5B-Instruct-uncensored-Q4_K_M.gguf';
const PROG_STEP = 0.05; // loga progresso a cada 5%

function projectRoot() {
  // Instalado como .exe (pkg) => procura a partir do executavel;
  // rodado como script => usa a propria pasta do projeto.
  const start = process.pkg ? path.dirname(process.execPath) : __dirname;
  let dir = start;
  for (let i = 0; i < 6; i++) {
    try {
      const pkg = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'));
      if (pkg.name === 'ngr-hub' && fs.existsSync(path.join(dir, 'main.js'))) {
        return dir;
      }
    } catch (e) {
      /* ainda nao e a raiz */
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return start;
}

async function followTo(url, maxRedirects) {
  const limit = maxRedirects || 5;
  let current = url;
  for (let i = 0; i <= limit; i++) {
    const res = await new Promise((resolve, reject) => {
      https
        .get(current, { headers: {} }, resolve)
        .on('error', reject)
        .setTimeout(15000, function () {
          this.destroy(new Error('Timeout de conexao'));
        });
    });
    if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
      res.resume();
      current = new URL(res.headers.location, current).toString();
      continue;
    }
    return res;
  }
  throw new Error('Redirecionamento demais em ' + url);
}

function formatMB(bytes) {
  return (bytes / 1024 / 1024).toFixed(1) + ' MB';
}

async function downloadFile(url, dest) {
  const part = dest + '.part';
  let offset = 0;
  if (fs.existsSync(dest)) return; // ja completo
  if (fs.existsSync(part)) offset = fs.statSync(part).size;

  fs.mkdirSync(path.dirname(dest), { recursive: true });

  const headers = offset > 0 ? { Range: 'bytes=' + offset + '-' } : {};
  const res = await followTo(url, 5);
  // Se o servidor nao aceitou Range e retornou 200, recomeca do zero.
  const realRes = res.statusCode !== 206 && offset > 0 && res.statusCode !== 200 ? null : res;
  if (!realRes) throw new Error('Resposta inesperada'); // motivo: nao deveria acontecer
  if (res.statusCode !== 200 && res.statusCode !== 206) {
    const msg = 'HTTP ' + res.statusCode;
    res.resume();
    throw new Error(msg);
  }

  const total = offset + parseInt(res.headers['content-length'] || '0', 10);
  let downloaded = offset;
  let lastLog = -1;

  const stream = fs.createWriteStream(part, { flags: offset > 0 ? 'a' : 'w' });
  res.pipe(stream);

  res.on('data', (chunk) => {
    downloaded += chunk.length;
    const pct = total > 0 ? downloaded / total : 0;
    if (pct - lastLog >= PROG_STEP || pct >= 1) {
      lastLog = pct;
      process.stderr.write(
        '\r  [modelo] ' + String((pct * 100).toFixed(0)).padStart(3) + '%  (' + formatMB(downloaded) + ' / ' +
          (total > 0 ? formatMB(total) : '?') + ')'
      );
    }
  });

  await new Promise((resolve, reject) => {
    stream.on('finish', resolve);
    stream.on('error', reject);
    res.on('error', reject);
  });

  process.stderr.write('\n');
  fs.renameSync(part, dest);
}

function prettySize(file) {
  try {
    return formatMB(fs.statSync(file).size);
  } catch (e) {
    return '?';
  }
}

async function downloadModel(opts) {
  opts = opts || {};
  const url = opts.url || MODEL_URL;
  const dir = opts.modelsDir || path.join(projectRoot(), 'models');
  const finalDest = path.join(dir, opts.name || MODEL_NAME);

  if (fs.existsSync(finalDest)) {
    const msg = '[modelo] Ja presente: ' + path.basename(finalDest) + ' (' + prettySize(finalDest) + ')';
    if (opts.onMessage) opts.onMessage(msg);
    return { skipped: true, file: finalDest };
  }

  if (opts.onMessage) opts.onMessage('[modelo] Baixando ~1.1GB (pode levar alguns minutos)...');
  await downloadFile(url, finalDest);
  if (opts.onMessage) opts.onMessage('[modelo] Concluido: ' + path.basename(finalDest) + ' (' + prettySize(finalDest) + ')');
  return { skipped: false, file: finalDest };
}

module.exports = { downloadModel, MODEL_URL, MODEL_NAME };

// ── Execucao direta ──────────────────────────────────────────────
if (require.main === module) {
  downloadModel({
    onMessage: (m) => process.stdout.write(m + '\n'),
  }).catch((err) => {
    process.stderr.write('\n[modelo] Falha no download: ' + (err && err.message) + '\n');
    process.exitCode = 1;
  });
}