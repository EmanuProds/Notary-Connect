// enhanced-crypto-polyfill.js
const { Crypto } = require('node-webcrypto-ossl');

if (!globalThis.crypto || !globalThis.crypto.subtle) {
  const crypto = new Crypto();
  globalThis.crypto = crypto;
  console.log('Enhanced Web Crypto API polyfill loaded');
}