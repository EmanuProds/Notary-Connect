// crypto-polyfill.js
const crypto = require('crypto');

if (!globalThis.crypto) {
  globalThis.crypto = {};
}

if (!globalThis.crypto.subtle) {
  // Basic implementation of required subtle crypto methods
  globalThis.crypto.subtle = {
    digest: async (algorithm, data) => {
      return new Promise((resolve) => {
        const hash = crypto.createHash(algorithm.toLowerCase().replace('-', ''));
        hash.update(Buffer.from(data));
        resolve(hash.digest());
      });
    }
  };
}

// Add getRandomValues if it doesn't exist
if (!globalThis.crypto.getRandomValues) {
  globalThis.crypto.getRandomValues = (array) => {
    const bytes = crypto.randomBytes(array.length);
    array.set(bytes);
    return array;
  };
}