import * as ExpoCrypto from 'expo-crypto';

/** Hermes lacks Web Crypto. Keep PKCE on secure randomness + S256, never plain. */
export function installAuthCrypto() {
  const nativeCrypto = globalThis.crypto ?? ({} as Crypto);
  if (!nativeCrypto.getRandomValues) {
    Object.defineProperty(nativeCrypto, 'getRandomValues', {
      value: ExpoCrypto.getRandomValues, configurable: true,
    });
  }
  if (!nativeCrypto.subtle) {
    // Digest-only adapter, not a JWT verifier. Unsupported crypto operations
    // must fail closed; this app validates users through Supabase.getUser().
    Object.defineProperty(nativeCrypto, 'subtle', {
      value: {
        digest(algorithm: AlgorithmIdentifier, data: BufferSource) {
          const name = typeof algorithm === 'string' ? algorithm : algorithm.name;
          if (name.toUpperCase() !== 'SHA-256') {
            return Promise.reject(new Error('Unsupported auth digest'));
          }
          return ExpoCrypto.digest(ExpoCrypto.CryptoDigestAlgorithm.SHA256, data);
        },
      }, configurable: true,
    });
  }
  if (!globalThis.crypto) {
    Object.defineProperty(globalThis, 'crypto', { value: nativeCrypto, configurable: true });
  }
}
