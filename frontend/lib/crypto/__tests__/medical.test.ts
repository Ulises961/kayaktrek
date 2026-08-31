import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, it, expect } from "vitest"
import {
  deriveKey,
  deriveEciesKey,
  encrypt,
  decrypt,
  generateKeypair,
  publicKeyFor,
  encryptForRecipient,
  decryptAsRecipient,
} from "../medical"

// This file is slow — around 70 seconds — and that is not a defect to optimise away. Every
// assertion runs a real 600,000-iteration PBKDF2, which is the point of a deliberately expensive
// KDF. It runs slower here than in a browser because jsdom has no `crypto.subtle`, so it takes
// the pure-JS fallback — which happens to be exactly the path React Native will use, making this
// the closest thing to a mobile measurement the web suite can offer.
//
// The fixture lives in the backend workspace on purpose: it is generated from
// Services/crypto_service.py, which produced every ciphertext already in the database, so
// Python is the reference and this implementation is the one that has to agree. Reaching
// across workspaces is the point — a copy on this side could drift without anything failing,
// and the failure mode of drift is health data nobody can read.
const VECTORS = JSON.parse(
  readFileSync(
    join(__dirname, "../../../../backend/Tests/fixtures/medical_crypto_vectors.json"),
    "utf8",
  ),
) as {
  kdf: { iterations: number; key_length: number }
  ecies: { hkdf_info: string }
  symmetric: {
    password: string
    salt: string
    nonce: string
    plaintext: string
    ciphertext: string
    derived_key: string
  }[]
  ecies_vector: {
    recipient_private_key: string
    recipient_public_key: string
    ephemeral_public_key: string
    nonce: string
    plaintext: string
    ciphertext: string
    derived_key: string
  }
}

describe("medical crypto — agreement with the Python reference", () => {
  describe.each(VECTORS.symmetric)("vector %#", (vector) => {
    it("derives the same key from the same password and salt", async () => {
      const derived = await deriveKey(vector.password, vector.salt)
      expect(derived).toBe(vector.derived_key)
    })

    it("produces byte-identical ciphertext for the same key and nonce", async () => {
      const produced = await encrypt(vector.plaintext, vector.password, {
        salt: vector.salt,
        nonce: vector.nonce,
      })
      expect(produced.ciphertext).toBe(vector.ciphertext)
    })

    it("reads a ciphertext produced by the Python implementation", async () => {
      const recovered = await decrypt(vector.ciphertext, vector.nonce, vector.salt, vector.password)
      expect(recovered).toBe(vector.plaintext)
    })
  })

  it("derives the same ECIES key as the Python reference", async () => {
    const { recipient_private_key, ephemeral_public_key, derived_key } = VECTORS.ecies_vector
    const derived = deriveEciesKey(recipient_private_key, ephemeral_public_key)
    expect(derived).toBe(derived_key)
  })

  it("reads an ECIES ciphertext produced by the Python implementation", async () => {
    const v = VECTORS.ecies_vector
    const recovered = await decryptAsRecipient(
      v.ciphertext,
      v.nonce,
      v.ephemeral_public_key,
      v.recipient_private_key,
    )
    expect(recovered).toBe(v.plaintext)
  })

  it("derives the public key the fixture pairs with the private one", () => {
    const v = VECTORS.ecies_vector
    expect(publicKeyFor(v.recipient_private_key)).toBe(v.recipient_public_key)
  })
})

describe("medical crypto — round trips", () => {
  it("round-trips symmetric encryption with fresh randomness", async () => {
    const sealed = await encrypt("Nut allergy — EpiPen in PFD", "hunter2")
    const recovered = await decrypt(sealed.ciphertext, sealed.nonce, sealed.salt, "hunter2")
    expect(recovered).toBe("Nut allergy — EpiPen in PFD")
  })

  it("rejects a wrong password rather than returning garbage", async () => {
    const sealed = await encrypt("Penicillin allergy", "hunter2")
    await expect(decrypt(sealed.ciphertext, sealed.nonce, sealed.salt, "wrong")).rejects.toThrow()
  })

  it("generates a keypair whose wrapped private key unwraps with its password", async () => {
    const keypair = await generateKeypair("hunter2")
    const unwrapped = await decrypt(
      keypair.privateKeyCiphertext,
      keypair.privateKeyNonce,
      keypair.privateKeySalt,
      "hunter2",
    )
    expect(publicKeyFor(unwrapped)).toBe(keypair.publicKey)
  })

  it("round-trips ECIES to a recipient's public key", async () => {
    const v = VECTORS.ecies_vector
    const sealed = await encryptForRecipient("Epileptic — see crew brief", v.recipient_public_key)
    const recovered = await decryptAsRecipient(
      sealed.ciphertext,
      sealed.nonce,
      sealed.ephemeralPublicKey,
      v.recipient_private_key,
    )
    expect(recovered).toBe("Epileptic — see crew brief")
  })

  it("produces a different ephemeral key each time, so ciphertexts never repeat", async () => {
    const v = VECTORS.ecies_vector
    const first = await encryptForRecipient("same text", v.recipient_public_key)
    const second = await encryptForRecipient("same text", v.recipient_public_key)
    expect(first.ephemeralPublicKey).not.toBe(second.ephemeralPublicKey)
    expect(first.ciphertext).not.toBe(second.ciphertext)
  })
})
