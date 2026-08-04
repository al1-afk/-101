/**
 *  Moteur de synchronisation prospects → Google Contacts.
 *
 *  - `computeSyncPlan` est PUR (testable sans réseau) : à partir des prospects
 *    et de la correspondance existante, il décide quoi créer / mettre à jour /
 *    supprimer / ignorer (diff par hash de contenu).
 *  - `runPlan` exécute le plan via un PeopleClient (réel ou factice en test)
 *    et renvoie de quoi mettre à jour la table google_contact_map.
 *
 *  Le nom affiché lors d'un appel entrant = prospect.nom (repli entreprise).
 */
import crypto from 'crypto'
import { toE164 } from './phoneE164'
import type { GPerson, PeopleClient, PeopleRef } from './googlePeople'

export interface ProspectForSync {
  id: string
  nom: string | null
  entreprise: string | null
  telephone: string | null
  statut: string | null
}

export interface MapRow {
  prospect_id: string
  resource_name: string
  etag: string | null
  content_hash: string | null
}

export interface SyncOptions {
  groupResource?: string | null
  nameSuffix?: string
  includeCompany?: boolean
}

export interface CreatePlanItem { prospectId: string; person: GPerson; hash: string; e164: string }
export interface UpdatePlanItem extends CreatePlanItem { resourceName: string; etag: string | null }
export interface DeletePlanItem { prospectId: string; resourceName: string }

export interface SyncPlan {
  toCreate: CreatePlanItem[]
  toUpdate: UpdatePlanItem[]
  toDelete: DeletePlanItem[]
  skip: number
}

/** Nom affiché : prospect.nom, sinon entreprise, sinon « Prospect ». + suffixe. */
export function displayName(p: ProspectForSync, suffix = ''): string {
  const base = (p.nom || p.entreprise || 'Prospect').trim()
  const suf = (suffix || '').trim()
  return suf ? `${base} ${suf}` : base
}

/** Construit la fiche People API pour un prospect (sans etag). */
export function buildPerson(p: ProspectForSync, e164: string, opts: SyncOptions): GPerson {
  const name = displayName(p, opts.nameSuffix)
  const person: GPerson = {
    names: [{ givenName: name, unstructuredName: name }],
    phoneNumbers: [{ value: e164, type: 'mobile' }],
  }
  const company = (p.entreprise || '').trim()
  if (opts.includeCompany !== false && company && company !== (p.nom || '').trim()) {
    person.organizations = [{ name: company }]
  }
  const statut = (p.statut || '').trim()
  person.biographies = [{ value: `Prospect NEXT GITAL${statut ? ` — ${statut}` : ''}`, contentType: 'TEXT_PLAIN' }]
  if (opts.groupResource) {
    person.memberships = [{ contactGroupMembership: { contactGroupResourceName: opts.groupResource } }]
  }
  return person
}

/** Hash stable du contenu : tout changement (nom, société, numéro, groupe, statut) → update. */
export function contentHash(p: ProspectForSync, e164: string, opts: SyncOptions): string {
  const parts = [
    displayName(p, opts.nameSuffix),
    opts.includeCompany !== false ? (p.entreprise || '') : '',
    e164,
    (p.statut || ''),
    opts.groupResource || '',
  ].join('|')
  return crypto.createHash('sha256').update(parts).digest('hex').slice(0, 32)
}

/**
 *  Diff pur : décide des opérations à effectuer.
 *  - prospect avec numéro valide, absent de la map → CREATE
 *  - présent mais hash différent → UPDATE
 *  - présent et hash identique → SKIP
 *  - ligne de map dont le prospect n'a plus de numéro valide / n'existe plus → DELETE
 */
export function computeSyncPlan(
  prospects: ProspectForSync[],
  mapRows: MapRow[],
  opts: SyncOptions,
): SyncPlan {
  const mapByProspect = new Map<string, MapRow>()
  for (const m of mapRows) mapByProspect.set(m.prospect_id, m)

  const plan: SyncPlan = { toCreate: [], toUpdate: [], toDelete: [], skip: 0 }
  const liveWithPhone = new Set<string>()

  for (const p of prospects) {
    const e164 = toE164(p.telephone)
    if (!e164) continue                       // pas de numéro exploitable → ignoré
    liveWithPhone.add(p.id)
    const hash = contentHash(p, e164, opts)
    const existing = mapByProspect.get(p.id)
    const person = buildPerson(p, e164, opts)
    if (!existing) {
      plan.toCreate.push({ prospectId: p.id, person, hash, e164 })
    } else if (existing.content_hash !== hash) {
      plan.toUpdate.push({ prospectId: p.id, person, hash, e164, resourceName: existing.resource_name, etag: existing.etag })
    } else {
      plan.skip++
    }
  }

  // Contacts à supprimer : la map référence un prospect qui n'a plus de numéro
  // valide (supprimé, ou téléphone effacé/invalide).
  for (const m of mapRows) {
    if (!liveWithPhone.has(m.prospect_id)) {
      plan.toDelete.push({ prospectId: m.prospect_id, resourceName: m.resource_name })
    }
  }
  return plan
}

export interface RunResult {
  created: { prospectId: string; resourceName: string; etag: string | null; hash: string; e164: string }[]
  updated: { prospectId: string; resourceName: string; etag: string | null; hash: string; e164: string }[]
  deletedProspectIds: string[]
  counts: { created: number; updated: number; deleted: number; skipped: number }
}

const chunk = <T>(arr: T[], size: number): T[][] => {
  const out: T[][] = []
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size))
  return out
}

/** Exécute le plan via le PeopleClient. Renvoie de quoi persister la map. */
export async function runPlan(client: PeopleClient, plan: SyncPlan, batchSize = 180): Promise<RunResult> {
  const res: RunResult = {
    created: [], updated: [], deletedProspectIds: [],
    counts: { created: 0, updated: 0, deleted: 0, skipped: plan.skip },
  }

  // CREATE — l'ordre des réponses batchCreate suit l'ordre des requêtes.
  for (const batch of chunk(plan.toCreate, batchSize)) {
    const refs: PeopleRef[] = await client.batchCreate(batch.map(b => b.person))
    batch.forEach((b, i) => {
      const r = refs[i]
      if (r?.resourceName) {
        res.created.push({ prospectId: b.prospectId, resourceName: r.resourceName, etag: r.etag ?? null, hash: b.hash, e164: b.e164 })
      }
    })
  }
  res.counts.created = res.created.length

  // UPDATE — People exige l'etag courant dans la fiche envoyée.
  for (const batch of chunk(plan.toUpdate, batchSize)) {
    const items = batch.map(b => ({ resourceName: b.resourceName, person: { ...b.person, etag: b.etag ?? undefined } }))
    const refs: PeopleRef[] = await client.batchUpdate(items)
    const byRes = new Map(refs.map(r => [r.resourceName, r]))
    for (const b of batch) {
      const r = byRes.get(b.resourceName)
      res.updated.push({ prospectId: b.prospectId, resourceName: b.resourceName, etag: r?.etag ?? b.etag ?? null, hash: b.hash, e164: b.e164 })
    }
  }
  res.counts.updated = res.updated.length

  // DELETE
  const delNames = plan.toDelete.map(d => d.resourceName)
  for (const batch of chunk(delNames, batchSize)) {
    await client.batchDelete(batch)
  }
  res.deletedProspectIds = plan.toDelete.map(d => d.prospectId)
  res.counts.deleted = res.deletedProspectIds.length

  return res
}
