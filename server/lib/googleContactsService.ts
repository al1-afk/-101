/**
 *  Service de synchronisation Google Contacts — orchestre la base + People API.
 *  Partagé par la route (`/api/google-contacts/sync`) et le scheduler.
 */
import type { Pool } from 'pg'
import { pool, tenantQuery, tenantQueryOne } from '../db/pool'
import { logger } from './logger'
import { decryptSecret } from './secretBox'
import {
  refreshAccessToken, makePeopleClient, GoogleAuthError,
} from './googlePeople'
import {
  computeSyncPlan, runPlan, type ProspectForSync, type MapRow, type SyncOptions,
} from './googleContactsSync'

export interface GoogleLinkRow {
  id: string
  tenant_id: string
  user_id: string
  google_email: string | null
  refresh_token_enc: string
  contact_group_resource: string | null
  name_suffix: string | null
  include_company: boolean
  auto_sync: boolean
  status: string
}

export interface SyncSummary {
  ok: boolean
  status: string
  counts?: { created: number; updated: number; deleted: number; skipped: number }
  contactsCount?: number
  error?: string
}

/** Synchronise un lien : pousse les prospects du tenant vers ses Google Contacts. */
export async function syncLink(link: GoogleLinkRow): Promise<SyncSummary> {
  const opts: SyncOptions = {
    groupResource: link.contact_group_resource,
    nameSuffix: link.name_suffix ?? '',
    includeCompany: link.include_company !== false,
  }

  let accessToken: string
  try {
    accessToken = await refreshAccessToken(decryptSecret(link.refresh_token_enc))
  } catch (e) {
    if (e instanceof GoogleAuthError) {
      await tenantQuery(link.tenant_id,
        `UPDATE google_contacts_links SET status='needs_reauth', last_error=$2 WHERE id=$1`,
        [link.id, 'Reconnexion Google requise'])
      return { ok: false, status: 'needs_reauth', error: 'Reconnexion Google requise' }
    }
    throw e
  }

  const client = makePeopleClient(accessToken)

  try {
    const prospects = await tenantQuery<ProspectForSync>(link.tenant_id,
      `SELECT id, nom, entreprise, telephone, statut FROM prospects`)
    const mapRows = await tenantQuery<MapRow>(link.tenant_id,
      `SELECT prospect_id, resource_name, etag, content_hash FROM google_contact_map WHERE link_id = $1`,
      [link.id])

    const plan = computeSyncPlan(prospects, mapRows, opts)
    const result = await runPlan(client, plan)

    // Persistance de la correspondance
    for (const c of result.created) {
      await tenantQuery(link.tenant_id,
        `INSERT INTO google_contact_map (tenant_id, link_id, prospect_id, resource_name, etag, content_hash, phone_e164)
         VALUES ($1,$2,$3,$4,$5,$6,$7)
         ON CONFLICT (link_id, prospect_id)
         DO UPDATE SET resource_name=EXCLUDED.resource_name, etag=EXCLUDED.etag,
                       content_hash=EXCLUDED.content_hash, phone_e164=EXCLUDED.phone_e164`,
        [link.tenant_id, link.id, c.prospectId, c.resourceName, c.etag, c.hash, c.e164])
    }
    for (const u of result.updated) {
      await tenantQuery(link.tenant_id,
        `UPDATE google_contact_map SET resource_name=$3, etag=$4, content_hash=$5, phone_e164=$6
           WHERE link_id=$1 AND prospect_id=$2`,
        [link.id, u.prospectId, u.resourceName, u.etag, u.hash, u.e164])
    }
    if (result.deletedProspectIds.length) {
      await tenantQuery(link.tenant_id,
        `DELETE FROM google_contact_map WHERE link_id=$1 AND prospect_id = ANY($2::uuid[])`,
        [link.id, result.deletedProspectIds])
    }

    const cnt = await tenantQueryOne<{ n: number }>(link.tenant_id,
      `SELECT count(*)::int AS n FROM google_contact_map WHERE link_id=$1`, [link.id])
    const contactsCount = cnt?.n ?? 0

    await tenantQuery(link.tenant_id,
      `UPDATE google_contacts_links
          SET last_synced_at=now(), contacts_count=$2, last_error=NULL, status='active'
        WHERE id=$1`,
      [link.id, contactsCount])

    logger.info('[google-contacts:sync]',
      `link=${link.id.slice(0, 8)} created=${result.counts.created} updated=${result.counts.updated} deleted=${result.counts.deleted} skipped=${result.counts.skipped}`)

    return { ok: true, status: 'active', counts: result.counts, contactsCount }
  } catch (e: unknown) {
    const msg = e instanceof GoogleAuthError ? 'Reconnexion Google requise'
      : (e instanceof Error ? e.message : 'Erreur de synchronisation')
    const status = e instanceof GoogleAuthError ? 'needs_reauth' : 'error'
    await tenantQuery(link.tenant_id,
      `UPDATE google_contacts_links SET status=$2, last_error=$3 WHERE id=$1`,
      [link.id, status, msg.slice(0, 500)]).catch(() => {})
    logger.error('[google-contacts:sync] échec', link.id.slice(0, 8), msg)
    return { ok: false, status, error: msg }
  }
}

/** Scheduler : synchronise tous les liens actifs en auto-sync (tous tenants). */
export async function syncAllAutoLinks(p: Pool = pool): Promise<void> {
  let links: GoogleLinkRow[] = []
  try {
    const r = await p.query<GoogleLinkRow>(
      `SELECT id, tenant_id, user_id, google_email, refresh_token_enc,
              contact_group_resource, name_suffix, include_company, auto_sync, status
         FROM public.google_contacts_links
        WHERE auto_sync = TRUE AND status IN ('active','error')`)
    links = r.rows
  } catch (e: unknown) {
    logger.error('[google-contacts:scheduler] liste des liens impossible', e instanceof Error ? e.message : String(e))
    return
  }
  for (const link of links) {
    try { await syncLink(link) } catch (e: unknown) {
      logger.error('[google-contacts:scheduler] lien', link.id.slice(0, 8), e instanceof Error ? e.message : String(e))
    }
  }
  if (links.length) logger.info('[google-contacts:scheduler]', `${links.length} lien(s) synchronisé(s)`)
}
