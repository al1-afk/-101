import { test } from 'node:test'
import assert from 'node:assert/strict'
import { toE164, isValidPhone } from './phoneE164'
import { encryptSecret, decryptSecret, isEncrypted } from './secretBox'
import {
  computeSyncPlan, runPlan, buildPerson, contentHash, displayName,
  type ProspectForSync, type MapRow, type SyncOptions,
} from './googleContactsSync'
import type { PeopleClient, GPerson, PeopleRef } from './googlePeople'

/* ─── E.164 (téléphone) ────────────────────────────────────────── */
test('toE164 : variantes marocaines → +212…', () => {
  assert.equal(toE164('0661091900'), '+212661091900')
  assert.equal(toE164('+212 6 61-09-19-00'), '+212661091900')
  assert.equal(toE164('00212661091900'), '+212661091900')
  assert.equal(toE164('212661091900'), '+212661091900')
  assert.equal(toE164('661091900'), '+212661091900')       // mobile national nu
  assert.equal(toE164('  06 61 09 19 00 '), '+212661091900')
})

test('toE164 : étrangers gardent leur indicatif', () => {
  assert.equal(toE164('+33 6 24 84 86 59'), '+33624848659')
  assert.equal(toE164('0033624848659'), '+33624848659')
  assert.equal(toE164('+33 (0)6 24 84 86 59'), '+33624848659')
})

test('toE164 : saisies invalides → null', () => {
  assert.equal(toE164(''), null)
  assert.equal(toE164(null), null)
  assert.equal(toE164('12'), null)
  assert.equal(toE164('abc'), null)
  assert.equal(isValidPhone('0661091900'), true)
  assert.equal(isValidPhone('xx'), false)
})

/* ─── Chiffrement des secrets ──────────────────────────────────── */
test('secretBox : aller-retour + détection de format', () => {
  const raw = '1//refresh-token-google-abc.DEF_123'
  const enc = encryptSecret(raw)
  assert.ok(isEncrypted(enc))
  assert.notEqual(enc, raw)
  assert.equal(decryptSecret(enc), raw)
})

test('secretBox : altération → échec (AES-GCM authentifié)', () => {
  const enc = encryptSecret('secret')
  const parts = enc.split('.')
  parts[3] = Buffer.from('zzzz').toString('base64')  // corrompt le ciphertext
  assert.throws(() => decryptSecret(parts.join('.')))
})

/* ─── Fiche People + hash ──────────────────────────────────────── */
const P = (over: Partial<ProspectForSync>): ProspectForSync => ({
  id: 'p1', nom: 'Med', entreprise: 'PACH', telephone: '0661091900', statut: 'qualifie', ...over,
})
const OPTS: SyncOptions = { groupResource: 'contactGroups/xyz', nameSuffix: '', includeCompany: true }

test('buildPerson : nom + téléphone E.164 + société + groupe', () => {
  const person = buildPerson(P({}), '+212661091900', OPTS)
  assert.equal(person.names?.[0].givenName, 'Med')
  assert.equal(person.phoneNumbers?.[0].value, '+212661091900')
  assert.equal(person.organizations?.[0].name, 'PACH')
  assert.equal(person.memberships?.[0].contactGroupMembership.contactGroupResourceName, 'contactGroups/xyz')
})

test('displayName : repli entreprise puis « Prospect », + suffixe', () => {
  assert.equal(displayName(P({ nom: null }), ''), 'PACH')
  assert.equal(displayName(P({ nom: null, entreprise: null }), ''), 'Prospect')
  assert.equal(displayName(P({}), '·Prospect'), 'Med ·Prospect')
})

test('contentHash change si le nom, le numéro ou le statut change', () => {
  const h = contentHash(P({}), '+212661091900', OPTS)
  assert.equal(h, contentHash(P({}), '+212661091900', OPTS))                 // stable
  assert.notEqual(h, contentHash(P({ nom: 'Ahmed' }), '+212661091900', OPTS))
  assert.notEqual(h, contentHash(P({}), '+212600000000', OPTS))
  assert.notEqual(h, contentHash(P({ statut: 'gagne' }), '+212661091900', OPTS))
})

/* ─── Diff (computeSyncPlan) ───────────────────────────────────── */
test('computeSyncPlan : create / update / skip / delete', () => {
  const prospects = [
    P({ id: 'a', nom: 'A', telephone: '0661000001' }),   // nouveau → create
    P({ id: 'b', nom: 'B-modifié', telephone: '0661000002' }), // hash différent → update
    P({ id: 'c', nom: 'C', telephone: '0661000003' }),   // inchangé → skip
    P({ id: 'd', nom: 'D', telephone: null }),           // sans numéro → ignoré + delete map
  ]
  const hashC = contentHash(P({ id: 'c', nom: 'C', telephone: '0661000003' }), '+212661000003', OPTS)
  const map: MapRow[] = [
    { prospect_id: 'b', resource_name: 'people/b', etag: 'eb', content_hash: 'ancien' },
    { prospect_id: 'c', resource_name: 'people/c', etag: 'ec', content_hash: hashC },
    { prospect_id: 'd', resource_name: 'people/d', etag: 'ed', content_hash: 'x' },  // a perdu son numéro
    { prospect_id: 'z', resource_name: 'people/z', etag: 'ez', content_hash: 'x' },  // prospect supprimé
  ]
  const plan = computeSyncPlan(prospects, map, OPTS)
  assert.deepEqual(plan.toCreate.map(x => x.prospectId), ['a'])
  assert.deepEqual(plan.toUpdate.map(x => x.prospectId), ['b'])
  assert.equal(plan.skip, 1)
  assert.deepEqual(plan.toDelete.map(x => x.resourceName).sort(), ['people/d', 'people/z'])
})

/* ─── Exécution (runPlan) avec un faux client People ───────────── */
class FakePeople implements PeopleClient {
  created: GPerson[] = []; deleted: string[] = []; updated: string[] = []
  async batchCreate(persons: GPerson[]): Promise<PeopleRef[]> {
    this.created.push(...persons)
    return persons.map((_, i) => ({ resourceName: `people/new${this.created.length - persons.length + i}`, etag: `et${i}` }))
  }
  async batchUpdate(items: { resourceName: string; person: GPerson }[]): Promise<PeopleRef[]> {
    this.updated.push(...items.map(i => i.resourceName))
    return items.map(i => ({ resourceName: i.resourceName, etag: 'newEtag' }))
  }
  async batchDelete(resourceNames: string[]): Promise<void> { this.deleted.push(...resourceNames) }
}

test('runPlan : exécute create/update/delete et renvoie les résultats à persister', async () => {
  const prospects = [
    P({ id: 'a', nom: 'A', telephone: '0661000001' }),
    P({ id: 'b', nom: 'B2', telephone: '0661000002' }),
  ]
  const map: MapRow[] = [
    { prospect_id: 'b', resource_name: 'people/b', etag: 'eb', content_hash: 'ancien' },
    { prospect_id: 'gone', resource_name: 'people/gone', etag: 'eg', content_hash: 'x' },
  ]
  const plan = computeSyncPlan(prospects, map, OPTS)
  const client = new FakePeople()
  const r = await runPlan(client, plan, 180)

  assert.equal(r.counts.created, 1)
  assert.equal(r.counts.updated, 1)
  assert.equal(r.counts.deleted, 1)
  assert.equal(client.created.length, 1)
  assert.deepEqual(client.updated, ['people/b'])
  assert.deepEqual(client.deleted, ['people/gone'])
  // l'etag mis à jour est propagé
  assert.equal(r.updated[0].etag, 'newEtag')
  assert.equal(r.created[0].prospectId, 'a')
  assert.equal(r.deletedProspectIds[0], 'gone')
  // l'update envoie bien l'etag courant dans la fiche
  // (vérifié indirectement : batchUpdate a reçu people/b)
})
