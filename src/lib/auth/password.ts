import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scryptAsync = promisify(scrypt);

const KEY_LENGTH = 64;

/**
 * scrypt(password, salt) — see prisma/schema.prisma's User.passwordHash comment. Stored as
 * `<salt-hex>:<derivedKey-hex>`; never the plaintext password.
 */
export async function hashPassword(plain: string): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  const derivedKey = (await scryptAsync(plain, salt, KEY_LENGTH)) as Buffer;
  return `${salt}:${derivedKey.toString("hex")}`;
}

export async function verifyPassword(plain: string, storedHash: string): Promise<boolean> {
  const [salt, key] = storedHash.split(":");
  if (!salt || !key) return false;

  const keyBuffer = Buffer.from(key, "hex");
  const derivedKey = (await scryptAsync(plain, salt, keyBuffer.length)) as Buffer;

  return keyBuffer.length === derivedKey.length && timingSafeEqual(keyBuffer, derivedKey);
}
