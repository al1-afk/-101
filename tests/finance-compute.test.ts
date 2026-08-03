/**
 * Tests des calculs financiers (module pur src/lib/finance/compute.ts).
 *
 * Ce qui est vérifié ici correspond aux règles de cohérence du module :
 *   · un revenu augmente le compte, une dépense le diminue ;
 *   · un transfert déplace l'argent sans changer le patrimoine total ;
 *   · un ajustement corrige le solde sans créer de revenu/dépense ;
 *   · une prévision n'impacte JAMAIS le solde réel ;
 *   · le solde prévisionnel est toujours recalculé, jamais saisi.
 *
 *   npm run test:finance
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  computeAccountBalances, computeDisponible, computeSummary, totalPrevisions,
  buildMovements, buildPrevisionEntries, effectiveStatut, isPrevisionActive,
  computeMonthlyHistory, formatDH, round2, num, toISODateLocal,
  type FinanceData,
} from '../src/lib/finance/compute'

/* ── Jeu de données de référence (celui de la spécification) ────────
   3 comptes, soldes initiaux : 3 181 + 49 893,82 + 2 350 = 55 424,82 */
const CIH    = 'aaaaaaaa-0000-0000-0000-000000000001'
const ENTR   = 'aaaaaaaa-0000-0000-0000-000000000002'
const CAISSE = 'aaaaaaaa-0000-0000-0000-000000000003'

function baseData(): FinanceData {
  return {
    accounts: [
      { id: CIH,    nom: 'cih',       solde_initial: 3181,     devise: 'MAD', actif: true },
      { id: ENTR,   nom: 'entr',      solde_initial: 49893.82, devise: 'MAD', actif: true },
      { id: CAISSE, nom: 'la caisse', solde_initial: 2350,     devise: 'MAD', actif: true },
    ],
    revenus: [], depenses: [], paiements: [], transferts: [], ajustements: [], previsions: [],
  }
}

/* ════════════════════════════════════════════════════════════════ */
test('argent disponible = somme des soldes initiaux quand rien ne bouge', () => {
  assert.equal(computeDisponible(baseData()), 55424.82)
})

test('un revenu encaissé augmente le compte de destination', () => {
  const d = baseData()
  d.revenus = [{ id: 'r1', montant: 1000, date_revenu: '2026-08-02', bank_account_id: CIH }]
  const balances = computeAccountBalances(d)
  assert.equal(balances.get(CIH)!.solde, 4181)
  assert.equal(computeDisponible(d), 56424.82)
})

test('une dépense payée diminue le compte source', () => {
  const d = baseData()
  d.depenses = [{ id: 'd1', montant: 181, date_depense: '2026-08-02', bank_account_id: CIH }]
  assert.equal(computeAccountBalances(d).get(CIH)!.solde, 3000)
  assert.equal(computeDisponible(d), 55243.82)
})

test('seuls les paiements encaissés (status=paye) comptent dans le solde', () => {
  const d = baseData()
  d.paiements = [
    { id: 'p1', montant: 500, date: '2026-08-01', status: 'paye',       bank_account_id: CIH },
    { id: 'p2', montant: 900, date: '2026-08-01', status: 'en_attente', bank_account_id: CIH },
  ]
  assert.equal(computeAccountBalances(d).get(CIH)!.solde, 3681)
})

test('un transfert déplace l\'argent sans modifier le patrimoine total', () => {
  const d = baseData()
  d.transferts = [{
    id: 't1', montant: 2000, date_transfert: '2026-08-02',
    compte_source_id: CIH, compte_destination_id: CAISSE,
  }]
  const b = computeAccountBalances(d)
  assert.equal(b.get(CIH)!.solde, 1181)
  assert.equal(b.get(CAISSE)!.solde, 4350)
  assert.equal(computeDisponible(d), 55424.82, 'le total doit être inchangé')
})

test('un ajustement corrige le solde sans être compté en revenu ni en dépense', () => {
  const d = baseData()
  d.ajustements = [{
    id: 'j1', bank_account_id: CIH, difference: -181,
    ancien_solde: 3181, nouveau_solde: 3000,
    date_ajustement: '2026-08-02', motif: 'depenses_non_enregistrees',
  }]
  const b = computeAccountBalances(d)
  assert.equal(b.get(CIH)!.solde, 3000, 'le solde suit l\'ajustement')
  assert.equal(b.get(CIH)!.total_sorties, 0, 'aucune dépense créée')
  assert.equal(b.get(CIH)!.total_entrees, 0, 'aucun revenu créé')

  const s = computeSummary(d, '2026-08')
  assert.equal(s.revenusMois, 0)
  assert.equal(s.depensesMois, 0)
  assert.equal(s.disponible, 55243.82)
})

test('un ajustement positif remonte le solde au montant visé', () => {
  const d = baseData()
  /* Solde réel 3 181, l'utilisateur constate 5 000 → écart +1 819. */
  d.ajustements = [{
    id: 'j1', bank_account_id: CIH, difference: 1819,
    ancien_solde: 3181, nouveau_solde: 5000,
    date_ajustement: '2026-08-02', motif: 'revenus_non_enregistres',
  }]
  assert.equal(computeAccountBalances(d).get(CIH)!.solde, 5000)
})

/* ── Prévisions ─────────────────────────────────────────────────── */
test('plusieurs revenus prévus s\'additionnent (10 000 + 801 + 172 = 10 973)', () => {
  const d = baseData()
  d.previsions = [
    { id: 'v1', sens: 'revenu', montant: 10000, date_prevue: '2026-09-01', statut: 'prevu',   bank_account_id: ENTR },
    { id: 'v2', sens: 'revenu', montant: 801,   date_prevue: '2026-09-05', statut: 'facture', bank_account_id: ENTR },
    { id: 'v3', sens: 'revenu', montant: 172,   date_prevue: '2026-09-10', statut: 'prevu',   bank_account_id: CIH },
  ]
  assert.equal(totalPrevisions(d.previsions, 'revenu'), 10973)
})

test('une prévision ne modifie PAS le solde réel', () => {
  const d = baseData()
  d.previsions = [
    { id: 'v1', sens: 'revenu',  montant: 10000, date_prevue: '2026-09-01', statut: 'prevu', bank_account_id: ENTR },
    { id: 'v2', sens: 'depense', montant: 4000,  date_prevue: '2026-09-02', statut: 'prevu', bank_account_id: ENTR },
  ]
  assert.equal(computeDisponible(d), 55424.82)
  assert.equal(computeAccountBalances(d).get(ENTR)!.solde, 49893.82)
})

test('solde prévisionnel = disponible + revenus prévus − dépenses prévues', () => {
  const d = baseData()
  d.previsions = [
    { id: 'v1', sens: 'revenu',  montant: 10000, date_prevue: '2026-09-01', statut: 'prevu',   bank_account_id: ENTR },
    { id: 'v2', sens: 'revenu',  montant: 801,   date_prevue: '2026-09-05', statut: 'facture', bank_account_id: ENTR },
    { id: 'v3', sens: 'revenu',  montant: 172,   date_prevue: '2026-09-10', statut: 'prevu',   bank_account_id: CIH },
    { id: 'v4', sens: 'depense', montant: 4000,  date_prevue: '2026-09-15', statut: 'prevu',   bank_account_id: ENTR },
  ]
  const s = computeSummary(d, '2026-08')
  assert.equal(s.disponible, 55424.82)
  assert.equal(s.revenusPrevus, 10973)
  assert.equal(s.depensesPrevues, 4000)
  assert.equal(s.soldePrevisionnel, 62397.82)   // exemple exact de la spécification
})

test('les prévisions reçues ou annulées sortent du prévisionnel actif', () => {
  const d = baseData()
  d.previsions = [
    { id: 'v1', sens: 'revenu', montant: 10000, date_prevue: '2026-09-01', statut: 'recu',   bank_account_id: ENTR },
    { id: 'v2', sens: 'revenu', montant: 801,   date_prevue: '2026-09-05', statut: 'annule', bank_account_id: ENTR },
    { id: 'v3', sens: 'revenu', montant: 172,   date_prevue: '2026-09-10', statut: 'prevu',  bank_account_id: CIH },
    { id: 'v4', sens: 'depense', montant: 500,  date_prevue: '2026-09-11', statut: 'paye',   bank_account_id: CIH },
  ]
  assert.equal(totalPrevisions(d.previsions, 'revenu'), 172)
  assert.equal(totalPrevisions(d.previsions, 'depense'), 0)
  assert.equal(computeSummary(d, '2026-08').soldePrevisionnel, round2(55424.82 + 172))
})

test('« marquer comme reçu » : le revenu créé remplace la prévision dans les totaux', () => {
  const d = baseData()
  /* Avant : prévu 10 000 sur ENTR. */
  d.previsions = [{ id: 'v1', sens: 'revenu', montant: 10000, date_prevue: '2026-08-10', statut: 'prevu', bank_account_id: ENTR }]
  const avant = computeSummary(d, '2026-08')
  assert.equal(avant.disponible, 55424.82)
  assert.equal(avant.revenusPrevus, 10000)
  assert.equal(avant.soldePrevisionnel, 65424.82)

  /* Après l'encaissement : la prévision passe à « recu » et le revenu existe. */
  d.previsions = [{
    id: 'v1', sens: 'revenu', montant: 10000, date_prevue: '2026-08-10', statut: 'recu',
    bank_account_id: ENTR, montant_realise: 10000, date_realisation: '2026-08-12',
  }]
  d.revenus = [{ id: 'r1', montant: 10000, date_revenu: '2026-08-12', bank_account_id: ENTR, prevision_id: 'v1' } as any]

  const apres = computeSummary(d, '2026-08')
  assert.equal(apres.disponible, 65424.82, 'l\'argent est maintenant réellement disponible')
  assert.equal(apres.revenusPrevus, 0, 'la prévision ne compte plus')
  assert.equal(apres.soldePrevisionnel, 65424.82, 'pas de double comptage')
  assert.equal(apres.revenusMois, 10000)
})

test('statut « en retard » déduit de la date, sans écraser le statut stocké', () => {
  const p = { id: 'v1', sens: 'revenu' as const, montant: 100, date_prevue: '2026-07-01', statut: 'prevu' as const, bank_account_id: null }
  assert.equal(effectiveStatut(p, '2026-08-02'), 'en_retard')
  assert.equal(effectiveStatut({ ...p, date_prevue: '2026-09-01' }, '2026-08-02'), 'prevu')
  assert.equal(effectiveStatut({ ...p, statut: 'recu' }, '2026-08-02'), 'recu', 'une prévision soldée n\'est jamais en retard')
  assert.equal(isPrevisionActive({ ...p, statut: 'annule' }), false)
})

/* ── Synthèse mensuelle ─────────────────────────────────────────── */
test('revenus/dépenses du mois : le mois précédent est exclu', () => {
  const d = baseData()
  d.revenus = [
    { id: 'r1', montant: 1000, date_revenu: '2026-08-02', bank_account_id: CIH },
    { id: 'r2', montant: 500,  date_revenu: '2026-07-31', bank_account_id: CIH },
  ]
  d.paiements = [{ id: 'p1', montant: 250, date: '2026-08-03', status: 'paye', bank_account_id: CIH }]
  d.depenses = [
    { id: 'd1', montant: 300, date_depense: '2026-08-04', bank_account_id: CIH },
    { id: 'd2', montant: 900, date_depense: '2026-07-04', bank_account_id: CIH },
  ]
  const s = computeSummary(d, '2026-08')
  assert.equal(s.revenusMois, 1250)
  assert.equal(s.depensesMois, 300)
  assert.equal(s.resultatNet, 950)
})

/* ── Historique ─────────────────────────────────────────────────── */
test('l\'historique reconstitue le solde après chaque mouvement', () => {
  const d = baseData()
  d.revenus  = [{ id: 'r1', montant: 1000, date_revenu: '2026-08-02', bank_account_id: CIH, description: 'Client A' }]
  d.depenses = [{ id: 'd1', montant: 200,  date_depense: '2026-08-03', bank_account_id: CIH, description: 'Essence' }]
  d.transferts = [{ id: 't1', montant: 500, date_transfert: '2026-08-04', compte_source_id: CIH, compte_destination_id: CAISSE }]

  const mouvements = buildMovements(d, CIH)
  assert.equal(mouvements.length, 3)
  /* Ordre : du plus récent au plus ancien. */
  assert.deepEqual(mouvements.map(m => m.date), ['2026-08-04', '2026-08-03', '2026-08-02'])
  assert.deepEqual(mouvements.map(m => m.solde), [3481, 3981, 4181])
  assert.equal(mouvements[0].type, 'transfert_sortant')
  assert.equal(mouvements[2].label, 'Client A')
  /* Le solde final du journal = solde calculé du compte. */
  assert.equal(mouvements[0].solde, computeAccountBalances(d).get(CIH)!.solde)
})

test('le journal global couvre tous les comptes et les deux sens d\'un transfert', () => {
  const d = baseData()
  d.transferts = [{ id: 't1', montant: 500, date_transfert: '2026-08-04', compte_source_id: CIH, compte_destination_id: CAISSE }]
  const all = buildMovements(d)
  assert.equal(all.length, 2, 'un transfert = une sortie + une entrée')
  assert.equal(all.filter(m => m.type === 'transfert_entrant').length, 1)
  assert.equal(all.filter(m => m.type === 'transfert_sortant').length, 1)
})

test('un mouvement rattaché à un compte supprimé n\'invente pas de solde', () => {
  const d = baseData()
  d.revenus = [{ id: 'r1', montant: 1000, date_revenu: '2026-08-02', bank_account_id: null }]
  assert.equal(computeDisponible(d), 55424.82, 'il n\'entre dans aucun solde')

  /* Il reste visible dans le journal — mais sans solde reconstitué depuis
     zéro, qui afficherait « 1 000 DH » sur un compte inexistant. */
  const orphelin = buildMovements(d).find(m => m.id === 'r1')!
  assert.equal(orphelin.entree, 1000)
  assert.equal(orphelin.solde, null)
})

test('les lignes prévisionnelles du journal sont informatives et actives seulement', () => {
  const d = baseData()
  d.previsions = [
    { id: 'v1', sens: 'revenu',  montant: 10000, date_prevue: '2026-09-01', statut: 'prevu',  bank_account_id: ENTR },
    { id: 'v2', sens: 'depense', montant: 4000,  date_prevue: '2026-09-02', statut: 'annule', bank_account_id: ENTR },
  ]
  const entries = buildPrevisionEntries(d.previsions, null, '2026-08-02')
  assert.equal(entries.length, 1)
  assert.equal(entries[0].type, 'revenu_prevu')
  assert.equal(entries[0].statut, 'prevu')
})

test('historique mensuel : le dernier point vaut le solde courant', () => {
  const d = baseData()
  const now = new Date(2026, 7, 15)                       // 15 août 2026 (local)
  d.revenus = [{ id: 'r1', montant: 1000, date_revenu: '2026-08-31', bank_account_id: CIH }]
  const history = computeMonthlyHistory(d, CIH, 3, now)
  assert.equal(history.length, 3)
  /* Un mouvement daté du 31 août doit être inclus dans le point d'août :
     c'est ce que cassait la conversion UTC. */
  assert.equal(history[history.length - 1].solde, 4181)
  assert.equal(history[0].solde, 3181)
})

/* ── Formatage & arrondis ───────────────────────────────────────── */
test('formatage des montants en DH', () => {
  assert.equal(formatDH(55424.82).replace(/ | /g, ' '), '55 424,82 DH')
  assert.equal(formatDH(10000).replace(/ | /g, ' '), '10 000 DH')
  assert.equal(formatDH(801), '801 DH')
  assert.equal(formatDH(172), '172 DH')
  assert.equal(formatDH(100, 'EUR'), '100 EUR')
})

test('les centimes ne dérivent pas (arrondi comptable)', () => {
  const d = baseData()
  d.revenus = [
    { id: 'r1', montant: 0.1, date_revenu: '2026-08-01', bank_account_id: CIH },
    { id: 'r2', montant: 0.2, date_revenu: '2026-08-01', bank_account_id: CIH },
  ]
  assert.equal(computeAccountBalances(d).get(CIH)!.solde, 3181.3)
  assert.equal(round2(0.1 + 0.2), 0.3)
})

test('les NUMERIC renvoyés en chaîne par Postgres sont bien interprétés', () => {
  const d = baseData()
  d.accounts = [{ id: CIH, nom: 'cih', solde_initial: '3181.00' as any }]
  d.revenus = [{ id: 'r1', montant: '1000.50' as any, date_revenu: '2026-08-01', bank_account_id: CIH }]
  assert.equal(computeAccountBalances(d).get(CIH)!.solde, 4181.5)
  assert.equal(num('12.5'), 12.5)
  assert.equal(num(null), 0)
  assert.equal(num('abc'), 0)
})

test('date locale : pas de décalage UTC sur le dernier jour du mois', () => {
  assert.equal(toISODateLocal(new Date(2026, 7, 31)), '2026-08-31')
  assert.equal(toISODateLocal(new Date(2026, 0, 1)), '2026-01-01')
})
