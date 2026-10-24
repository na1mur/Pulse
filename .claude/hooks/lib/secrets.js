// The one definition of "secret or signing material" for Pulse's guards.
// guards.test.js checks that the Read deny rules in .claude/settings.json cover every sample here.
'use strict';

const path = require('path');

const TEMPLATE_SUFFIX = /\.(example|sample|template)$/;
const SECRET_EXTENSIONS = /\.(jks|keystore|p12|pfx|pem|key|p8|asc|gpg)$/;
const SECRET_NAMES = new Set([
  'key.properties', 'keystore.properties', 'signing.properties',
  'id_rsa', 'id_dsa', 'id_ecdsa', 'id_ed25519',
]);

// One file name per rule above, used by the tests.
const SAMPLES = [
  '.env', '.env.local', 'release.jks', 'upload.keystore', 'cert.p12', 'signing.pfx', 'server.pem',
  'updater.key', 'AuthKey.p8', 'private.asc', 'secring.gpg', 'key.properties', 'keystore.properties',
  'signing.properties', 'id_rsa', 'id_dsa', 'id_ecdsa', 'id_ed25519', 'secrets/token.txt',
];

function isSecret(filePath) {
  const base = path.basename(filePath).toLowerCase();
  if (/^\.env(\..+)?$/.test(base) && !TEMPLATE_SUFFIX.test(base)) return true;
  if (SECRET_EXTENSIONS.test(base) || SECRET_NAMES.has(base)) return true;
  return filePath.split(/[\\/]/).some((part) => part.toLowerCase() === 'secrets');
}

module.exports = { isSecret, SAMPLES };
