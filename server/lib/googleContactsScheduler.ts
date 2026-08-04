/**
 * Scheduler de synchronisation Google Contacts.
 *
 * Tourne 60 s après le démarrage, puis toutes les N minutes (10 par défaut) :
 * pousse les nouveaux prospects / mises à jour vers les Google Contacts des
 * utilisateurs reliés en auto-sync → le nom apparaît à l'appel sans action
 * manuelle. Le diff par hash évite les écritures inutiles.
 */
import type { Pool } from 'pg'
import { syncAllAutoLinks } from './googleContactsService'
import { logger } from './logger'

export function startGoogleContactsScheduler(pool: Pool): void {
  if ((process.env.GOOGLE_CONTACTS_ENABLED ?? 'true').toLowerCase() === 'false') return
  const intervalMs = Number(process.env.GOOGLE_CONTACTS_SYNC_INTERVAL_MS) || 10 * 60_000
  setTimeout(() => { void syncAllAutoLinks(pool) }, 60_000)
  setInterval(() => { void syncAllAutoLinks(pool) }, intervalMs)
  logger.info('[google-contacts:scheduler] démarré', `(intervalle ${Math.round(intervalMs / 60_000)} min)`)
}
