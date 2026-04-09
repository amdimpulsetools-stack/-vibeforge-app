import { createCipheriv, createDecipheriv, randomBytes } from "crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;
const ENCODING = "base64" as const;

/**
 * Returns the encryption key from environment variable.
 * Must be a 32-byte (64 hex chars) key for AES-256.
 * Returns null if not configured (dev fallback to plain text).
 */
function getKey(): Buffer | null {
  const keyHex = process.env.ENCRYPTION_KEY;
  if (!keyHex) return null;
  return Buffer.from(keyHex, "hex");
}

/**
 * Checks whether a string looks like an encrypted value
 * (iv:authTag:ciphertext in base64, colon-separated).
 */
export function isEncrypted(text: string): boolean {
  const parts = text.split(":");
  return parts.length === 3 && parts.every((p) => p.length > 0);
}

/**
 * Encrypts a plaintext string using AES-256-GCM.
 * Returns format: `iv:authTag:ciphertext` (all base64-encoded).
 * Falls back to returning plain text if ENCRYPTION_KEY is not set.
 */
export function encrypt(text: string): string {
  const key = getKey();
  if (!key) return text;

  // Don't double-encrypt
  if (isEncrypted(text)) return text;

  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv, {
    authTagLength: AUTH_TAG_LENGTH,
  });

  const encrypted = Buffer.concat([
    cipher.update(text, "utf8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();

  return [
    iv.toString(ENCODING),
    authTag.toString(ENCODING),
    encrypted.toString(ENCODING),
  ].join(":");
}

/**
 * Decrypts a ciphertext string produced by `encrypt`.
 * Falls back to returning the input as-is if ENCRYPTION_KEY is not set
 * or the value does not look encrypted.
 */
export function decrypt(ciphertext: string): string {
  const key = getKey();
  if (!key) return ciphertext;

  // If it doesn't look encrypted, return as-is (plain text from before encryption was enabled)
  if (!isEncrypted(ciphertext)) return ciphertext;

  try {
    const [ivB64, authTagB64, encryptedB64] = ciphertext.split(":");
    const iv = Buffer.from(ivB64, ENCODING);
    const authTag = Buffer.from(authTagB64, ENCODING);
    const encrypted = Buffer.from(encryptedB64, ENCODING);

    const decipher = createDecipheriv(ALGORITHM, key, iv, {
      authTagLength: AUTH_TAG_LENGTH,
    });
    decipher.setAuthTag(authTag);

    const decrypted = Buffer.concat([
      decipher.update(encrypted),
      decipher.final(),
    ]);

    return decrypted.toString("utf8");
  } catch {
    // If decryption fails, return as-is (could be plain text from before encryption)
    return ciphertext;
  }
}
