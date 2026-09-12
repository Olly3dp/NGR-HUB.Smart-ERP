// Assinatura de licença RSA (servidor).
// O servidor ngrbot assina a recarga (plano + validUntil + installId) com a
// chave PRIVADA. O ERP valida com a chave PÚBLICA embutida. Como a chave
// privada NUNCA vai para o cliente, ele não consegue forjar/editar a licença.

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// Caminho da chave privada. Prioriza env, senão busca em disco, senão gera.
// A chave é gerada na primeira execução e persiste em LOCAL_PRIVATE_KEY_PATH.
const PRIVATE_KEY_PATH = process.env.LICENCE_PRIVATE_KEY_PATH
  || path.join(__dirname, '..', '..', 'data', 'licence_private.pem');

let _privateKeyPair = null;

function ensureKeyPair() {
  if (_privateKeyPair) return _privateKeyPair;
  try {
    if (fs.existsSync(PRIVATE_KEY_PATH)) {
      const pem = fs.readFileSync(PRIVATE_KEY_PATH, 'utf8');
      _privateKeyPair = crypto.createPrivateKey(pem);
      return _privateKeyPair;
    }
  } catch (e) {
    console.error('[LIC] falha lendo chave privada existente:', e.message);
  }

  // Gera um novo par e persiste a privada (protegida, 0o600)
  try {
    const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
    fs.mkdirSync(path.dirname(PRIVATE_KEY_PATH), { recursive: true });
    fs.writeFileSync(PRIVATE_KEY_PATH, privateKey.export({ type: 'pkcs8', format: 'pem' }), { mode: 0o600 });
    _privateKeyPair = privateKey;
    console.log('[LIC] Nova chave privada RSA gerada em', PRIVATE_KEY_PATH);
    return _privateKeyPair;
  } catch (e) {
    console.error('[LIC] erro gerando chave:', e.message);
    return null;
  }
}

// Assina um payload (objeto) e devolve { payload, signature } em base64.
function signLicence(payload) {
  const key = ensureKeyPair();
  if (!key) return null;
  const payloadB64 = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64');
  const signature = crypto.sign('sha256', Buffer.from(payloadB64, 'utf8'), key);
  return { payload: payloadB64, signature: signature.toString('base64') };
}

module.exports = { signLicence, ensureKeyPair, PRIVATE_KEY_PATH };