/**
 * Envoi manuel d'un document (facture, devis, reçu) au client par email.
 *
 * Le PDF est généré côté client (jsPDF), converti en base64, puis uploadé
 * au serveur qui l'attache via Resend. Le déclencheur est toujours un
 * clic explicite de l'utilisateur — jamais automatique.
 */
import { api } from './api'

export type DocKind = 'facture' | 'devis' | 'recu'

interface SendDocumentPayload {
  to:         string
  kind:       DocKind
  numero:     string
  clientNom?: string
  message?:   string
  filename:   string
  pdf:        Blob
}

/** Convertit un Blob en chaîne base64 (sans le préfixe "data:xxx;base64,"). */
async function blobToBase64(blob: Blob): Promise<string> {
  const buf = await blob.arrayBuffer()
  const bytes = new Uint8Array(buf)
  /* On chunk pour éviter "Maximum call stack size exceeded" sur gros fichiers */
  const CHUNK = 0x8000
  let binary = ''
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode.apply(
      null,
      Array.from(bytes.subarray(i, i + CHUNK)),
    )
  }
  return btoa(binary)
}

export async function sendDocumentEmail(p: SendDocumentPayload): Promise<void> {
  const pdfBase64 = await blobToBase64(p.pdf)
  await api.post('/api/send-document', {
    to:        p.to,
    kind:      p.kind,
    numero:    p.numero,
    clientNom: p.clientNom,
    message:   p.message,
    filename:  p.filename,
    pdfBase64,
  })
}
