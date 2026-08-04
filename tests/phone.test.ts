/**
 * Tests de la normalisation des numéros (module pur src/lib/phone.ts).
 *
 * Enjeu métier : un même client saisi deux fois — via le formulaire du site,
 * un import, ou un appel entrant — ne l'est jamais à l'identique. Si la
 * normalisation rate, on rappelle le client une seconde fois.
 *
 *   npm run test:phone
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { canonicalPhone, samePhone, groupByPhone } from '../src/lib/phone'

test('les écritures marocaines d’un même numéro convergent', () => {
  const attendu = '661091900'
  for (const saisie of [
    '0661091900',
    '0661 09 19 00',
    '+212661091900',
    '+212 661-091900',
    '00212661091900',
    '212661091900',
    '  0661-09-19-00  ',
    /* Indicatif ET zéro national cumulés — saisie très courante (formulaires
       web, exports WhatsApp). Les deux règles doivent s'enchaîner. */
    '+212 0661091900',
    '+212(0)661091900',
    '+212 (0) 661 09 19 00',
    '00212 0661 09 19 00',
    '2120661091900',
  ]) {
    assert.equal(canonicalPhone(saisie), attendu, `échec sur « ${saisie} »`)
  }
})

test('le zéro de courtoisie entre parenthèses est retiré, même à l’étranger', () => {
  assert.equal(canonicalPhone('+33 (0)6 24 84 86 59'), '33624848659')
  assert.equal(samePhone('+33 (0)6 24 84 86 59', '+33624848659'), true)
})

test('un numéro étranger garde son indicatif', () => {
  /* +33 et 0033 doivent converger, sinon le doublon passe entre les mailles. */
  assert.equal(canonicalPhone('+33 6 24 84 86 59'), '33624848659')
  assert.equal(canonicalPhone('0033624848659'),     '33624848659')
  assert.equal(canonicalPhone('+33624848659'),      '33624848659')
})

test('un numéro français et un marocain ne se confondent pas', () => {
  assert.notEqual(canonicalPhone('+33624848659'), canonicalPhone('0624848659'))
})

test('les saisies inexploitables ne créent pas de faux doublons', () => {
  /* Sans seuil, « 0 » et « 00 » se réduiraient tous deux à '' et
     s'apparieraient — deux prospects sans téléphone deviendraient doublons. */
  for (const bruit of [null, undefined, '', '   ', '-', '0', '12', '00', 'appeler']) {
    assert.equal(canonicalPhone(bruit), '', `« ${bruit} » aurait dû être rejeté`)
  }
  assert.equal(samePhone(null, null), false)
  assert.equal(samePhone('', ''), false)
  assert.equal(samePhone('0', '0'), false)
})

test('samePhone reconnaît les écritures différentes', () => {
  assert.equal(samePhone('0661091900', '+212 661-091900'), true)
  assert.equal(samePhone('0661091900', '0661091901'), false)
  assert.equal(samePhone('0661091900', null), false)
})

test('groupByPhone ne retourne que les vrais doublons', () => {
  const prospects = [
    { id: 'a', nom: 'Med',    telephone: '0665064220'      },
    { id: 'b', nom: 'Achraf', telephone: '+212607084241'   },
    { id: 'c', nom: 'Med bis', telephone: '+212 665-064220' },  // = a
    { id: 'd', nom: 'Sans tel', telephone: null            },
    { id: 'e', nom: 'Vide',   telephone: ''                },
  ]
  const groups = groupByPhone(prospects, p => p.telephone)

  assert.equal(groups.size, 1, 'un seul groupe de doublons attendu')
  const doublon = groups.get('665064220')
  assert.ok(doublon, 'le groupe doit être indexé sur la forme canonique')
  assert.deepEqual(doublon.map(p => p.id).sort(), ['a', 'c'])

  /* Les fiches sans téléphone ne doivent JAMAIS être regroupées entre elles. */
  assert.equal([...groups.values()].flat().some(p => p.id === 'd' || p.id === 'e'), false)
})

test('un triplet est bien regroupé en une seule entrée', () => {
  const groups = groupByPhone(
    [
      { id: '1', tel: '0661091900'     },
      { id: '2', tel: '+212661091900'  },
      { id: '3', tel: '00212661091900' },
    ],
    p => p.tel,
  )
  assert.equal(groups.size, 1)
  assert.equal(groups.get('661091900')?.length, 3)
})
