/**
 * Medical-notes crypto, client side (M22).
 *
 * A byte-for-byte reimplementation of `backend/Services/crypto_service.py`. That file produced
 * every ciphertext already in the database, so it is the reference and this is the side that has
 * to agree — which is why no parameter here is a choice to revisit. The agreement is enforced by
 * `backend/Tests/fixtures/medical_crypto_vectors.json`, which both test suites assert against.
 *
 *   Key derivation  PBKDF2-HMAC-SHA256, 600,000 iterations, 32-byte key, 16-byte salt
 *   Symmetric       AES-GCM, 12-byte nonce, no additional authenticated data
 *   Asymmetric      X25519 ECDH -> HKDF-SHA256 (no salt, info "float-plan-medical") -> AES-GCM
 *   Encoding        base64 for every stored value
 *
 * `@noble/*` rather than `crypto.subtle` for the curve and the cipher, because the same code has
 * to run in React Native (M9), which has no WebCrypto and where a native module would mean two
 * implementations to keep in agreement instead of one.
 *
 * PBKDF2 is the exception: 600k iterations in pure JS costs seconds, and `crypto.subtle` does it
 * natively. Where the platform offers it we use it, and fall back to `@noble/hashes` where it does
 * not. Both produce identical output — that is what the vector tests check — so this is purely a
 * speed choice, not a behavioural one.
 */

import { gcm } from "@noble/ciphers/aes.js"
import { x25519 } from "@noble/curves/ed25519.js"
import { hkdf } from "@noble/hashes/hkdf.js"
import { pbkdf2Async } from "@noble/hashes/pbkdf2.js"
import { sha256 } from "@noble/hashes/sha2.js"

const PBKDF2_ITERATIONS = 600_000
const KEY_LENGTH = 32
const SALT_LENGTH = 16
const NONCE_LENGTH = 12

/**
 * Load-bearing and not derived from anything: a changed value silently produces a different key
 * and every existing leader-shared note becomes unreadable, with no error anywhere.
 */
const ECIES_INFO = "float-plan-medical"

const encoder = new TextEncoder()
const decoder = new TextDecoder()

function toBase64(bytes: Uint8Array): string {
  let binary = ""
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
}

function fromBase64(value: string): Uint8Array<ArrayBuffer> {
  const binary = atob(value)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i)
  return bytes
}

function randomBytes(length: number): Uint8Array<ArrayBuffer> {
  return crypto.getRandomValues(new Uint8Array(length))
}

// `Uint8Array<ArrayBuffer>` rather than a bare `Uint8Array`: WebCrypto's `BufferSource` excludes
// `SharedArrayBuffer`-backed views, which the default generic parameter allows.
async function deriveKeyBytes(
  password: string,
  salt: Uint8Array<ArrayBuffer>,
): Promise<Uint8Array<ArrayBuffer>> {
  // `crypto.subtle` is absent in React Native and in some non-secure browser contexts; the
  // @noble fallback is correct in both, just slower.
  if (typeof crypto !== "undefined" && crypto.subtle) {
    const material = await crypto.subtle.importKey(
      "raw",
      encoder.encode(password),
      "PBKDF2",
      false,
      ["deriveBits"],
    )
    const bits = await crypto.subtle.deriveBits(
      { name: "PBKDF2", salt, iterations: PBKDF2_ITERATIONS, hash: "SHA-256" },
      material,
      KEY_LENGTH * 8,
    )
    return new Uint8Array(bits)
  }
  return pbkdf2Async(sha256, encoder.encode(password), salt, {
    c: PBKDF2_ITERATIONS,
    dkLen: KEY_LENGTH,
  })
}

/** Exported for the vector tests: the derived key is the thing both implementations must match. */
export async function deriveKey(password: string, saltB64: string): Promise<string> {
  return toBase64(await deriveKeyBytes(password, fromBase64(saltB64)))
}

export interface SealedValue {
  ciphertext: string
  nonce: string
  salt: string
}

/**
 * `fixed` exists only so the vector tests can pin the salt and nonce. Real callers omit it and
 * get fresh randomness, which is the only safe way to use AES-GCM.
 */
export async function encrypt(
  plaintext: string,
  password: string,
  fixed?: { salt: string; nonce: string },
): Promise<SealedValue> {
  const salt = fixed ? fromBase64(fixed.salt) : randomBytes(SALT_LENGTH)
  const nonce = fixed ? fromBase64(fixed.nonce) : randomBytes(NONCE_LENGTH)
  const key = await deriveKeyBytes(password, salt)
  const ciphertext = gcm(key, nonce).encrypt(encoder.encode(plaintext))
  return { ciphertext: toBase64(ciphertext), nonce: toBase64(nonce), salt: toBase64(salt) }
}

/** Throws if the password is wrong or the ciphertext was tampered with — AES-GCM is authenticated. */
export async function decrypt(
  ciphertextB64: string,
  nonceB64: string,
  saltB64: string,
  password: string,
): Promise<string> {
  const key = await deriveKeyBytes(password, fromBase64(saltB64))
  const plaintext = gcm(key, fromBase64(nonceB64)).decrypt(fromBase64(ciphertextB64))
  return decoder.decode(plaintext)
}

export interface GeneratedKeypair {
  publicKey: string
  privateKeyCiphertext: string
  privateKeyNonce: string
  privateKeySalt: string
}

/**
 * The private key is stored as base64 *of the base64* of the raw key — the Python original wraps
 * `private_key_b64`, not the raw bytes, and matching that is what lets an existing wrapped key
 * unwrap here without any migration.
 */
export async function generateKeypair(password: string): Promise<GeneratedKeypair> {
  const privateKey = x25519.utils.randomSecretKey()
  const publicKey = x25519.getPublicKey(privateKey)
  const wrapped = await encrypt(toBase64(privateKey), password)
  return {
    publicKey: toBase64(publicKey),
    privateKeyCiphertext: wrapped.ciphertext,
    privateKeyNonce: wrapped.nonce,
    privateKeySalt: wrapped.salt,
  }
}

export function publicKeyFor(privateKeyB64: string): string {
  return toBase64(x25519.getPublicKey(fromBase64(privateKeyB64)))
}

/** Exported for the vector tests: pins the HKDF parameters, which nothing else would catch. */
export function deriveEciesKey(privateKeyB64: string, peerPublicKeyB64: string): string {
  const shared = x25519.getSharedSecret(fromBase64(privateKeyB64), fromBase64(peerPublicKeyB64))
  return toBase64(hkdf(sha256, shared, undefined, encoder.encode(ECIES_INFO), KEY_LENGTH))
}

export interface SealedForRecipient {
  ciphertext: string
  nonce: string
  ephemeralPublicKey: string
}

export function encryptForRecipient(
  plaintext: string,
  recipientPublicKeyB64: string,
): SealedForRecipient {
  const ephemeralPrivate = x25519.utils.randomSecretKey()
  const key = fromBase64(deriveEciesKey(toBase64(ephemeralPrivate), recipientPublicKeyB64))
  const nonce = randomBytes(NONCE_LENGTH)
  const ciphertext = gcm(key, nonce).encrypt(encoder.encode(plaintext))
  return {
    ciphertext: toBase64(ciphertext),
    nonce: toBase64(nonce),
    ephemeralPublicKey: toBase64(x25519.getPublicKey(ephemeralPrivate)),
  }
}

export function decryptAsRecipient(
  ciphertextB64: string,
  nonceB64: string,
  ephemeralPublicKeyB64: string,
  recipientPrivateKeyB64: string,
): string {
  const key = fromBase64(deriveEciesKey(recipientPrivateKeyB64, ephemeralPublicKeyB64))
  const plaintext = gcm(key, fromBase64(nonceB64)).decrypt(fromBase64(ciphertextB64))
  return decoder.decode(plaintext)
}
