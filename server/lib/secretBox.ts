/**
 *  secretBox — chiffrement symétrique réversible pour secrets stockés en base
 *  (ex. refresh_token OAuth Google). AES-256-GCM (authentifié).
 *
 *  La clé dérive de SECRET_ENC_KEY si présent, sinon de JWT_SECRET (dérivation
 *  SHA-256 → 32 octets). ⚠️ Si JWT_SECRET change et qu'aucun SECRET_ENC_KEY
 *  dédié n'est défini, les secrets existants deviennent indéchiffrables (les
 *  liens Google devront être re-reliés). En production : définir SECRET_ENC_KEY.
 *
 *  Format : "v1.<iv_b64>.<tag_b64>.<cipher_b64>". Jamais loggé.
 */
import crypto from 'crypto'

function key(): Buffer {
  const raw = process.env.SECRET_ENC_KEY || process.env.JWT_SECRET || 'dev-secretBox-fallback'
  return crypto.createHash('sha256').update(String(raw)).digest() // 32 octets
}

export function encryptSecret(plain: string): string {
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv('aes-256-gcm', key(), iv)
  const enc = Buffer.concat([cipher.update(String(plain), 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return `v1.${iv.toString('base64')}.${tag.toString('base64')}.${enc.toString('base64')}`
}

export function decryptSecret(blob: string): string {
  const parts = String(blob).split('.')
  if (parts.length !== 4 || parts[0] !== 'v1') throw new Error('secretBox: format invalide')
  const iv  = Buffer.from(parts[1], 'base64')
  const tag = Buffer.from(parts[2], 'base64')
  const enc = Buffer.from(parts[3], 'base64')
  const d = crypto.createDecipheriv('aes-256-gcm', key(), iv)
  d.setAuthTag(tag)
  return Buffer.concat([d.update(enc), d.final()]).toString('utf8')
}

/** true si la valeur ressemble à un secret chiffré par ce module. */
export function isEncrypted(v: unknown): boolean {
  return typeof v === 'string' && v.startsWith('v1.') && v.split('.').length === 4
}
