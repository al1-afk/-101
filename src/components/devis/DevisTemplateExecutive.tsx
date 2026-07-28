/**
 * DevisTemplateExecutive — modèle « Executive / premium ».
 * Reproduit la maquette premium NEXT GITAL :
 *   en-tête (logo + panneau DEVIS + bloc client sectorisé) · OBJET DU DEVIS ·
 *   grille de cartes numérotées (une par prestation) · total en toutes lettres
 *   + encart totaux · équipe dédiée · conditions · double signature · pied de
 *   page légal complet.
 * Piloté par le modèle de données existant (prestations / conditions / totaux)
 * plus deux champs optionnels : `objet` et `offreTitle`.
 */
import { forwardRef } from 'react'
import type { Devis }  from '@/hooks/useDevis'
import type { Client } from '@/hooks/useClients'
import { sanitizeRichHtml } from '@/lib/safeHtml'
import {
  parseDevisEnvelope, fmtMoney, fmtDate, stripHtml, amountToWordsFr, CO,
  type Currency, type Prestation, type DescriptionBlock,
} from './templateShared'

interface Props { devis: Devis; client?: Client }

/* Équipe dédiée standard NEXT GITAL (générique, tous projets). */
const DEFAULT_TEAM: { role: string; desc: string }[] = [
  { role: 'Chef de projet',   desc: 'Votre interlocuteur unique. Il suit le planning, valide chaque étape avec vous et reste joignable par WhatsApp.' },
  { role: 'Designer',         desc: 'Charte graphique, maquettes du site et visuels des réseaux sociaux.' },
  { role: 'Développeur',      desc: 'Intégration, développement et mise en ligne de votre projet.' },
  { role: 'Technicien support', desc: 'Hébergement, sauvegardes, sécurité et assistance après la mise en ligne.' },
]

const NAVY = '#0a1a3c'
const BLUE = '#1e64c4'

/* Description d'une prestation → puces carrées bleues (style maquette). */
function CardBullets({ blocks }: { blocks: DescriptionBlock[] }) {
  if (!blocks?.length) return null
  const items: { kind: 'sub' | 'html' | 'bullet'; content: string }[] = []
  for (const b of blocks) {
    if (b.type === 'title') {
      items.push({ kind: 'sub', content: stripHtml(b.content) })
    } else if (b.type === 'list') {
      stripHtml(b.content).split('\n').filter(Boolean).forEach(l => items.push({ kind: 'bullet', content: l }))
    } else {
      // paragraphe : conserver le rich text (gras, listes…)
      items.push({ kind: 'html', content: b.content })
    }
  }
  return (
    <div className="mt-1.5 space-y-1">
      {items.map((it, i) => {
        if (it.kind === 'sub')
          return <p key={i} className="text-[10px] font-bold" style={{ color: NAVY }}>{it.content}</p>
        if (it.kind === 'html')
          return (
            <div
              key={i}
              className="text-[9.5px] leading-snug [&_ul]:list-disc [&_ul]:pl-4 [&_ol]:list-decimal [&_ol]:pl-4 [&_strong]:font-bold [&_strong]:text-[#0a1a3c]"
              style={{ color: '#0f172a' }}
              dangerouslySetInnerHTML={{ __html: sanitizeRichHtml(it.content) }}
            />
          )
        return (
          <div key={i} className="flex items-start gap-1.5">
            <span className="flex-shrink-0" style={{ width: 4, height: 4, marginTop: 5, background: BLUE }} />
            <span className="text-[9.5px] leading-snug" style={{ color: '#0f172a' }}>{it.content}</span>
          </div>
        )
      })}
    </div>
  )
}

const DevisTemplateExecutive = forwardRef<HTMLDivElement, Props>(({ devis: d, client }, ref) => {
  const parsed    = parseDevisEnvelope(d.notes)
  const currency  = (parsed.currency ?? 'MAD') as Currency
  const signature = parsed.signature
  const hasTVA    = d.tva > 0
  const tvaMont   = d.montant_ttc - d.montant_ht

  const rows: Prestation[] = parsed.prestations.length > 0 ? parsed.prestations : [{
    titre: 'Prestations digitales',
    description: [],
    quantite: 1,
    prix_unitaire: d.montant_ht,
  }]

  /* Bloc client : entreprise + secteur + ville/région. */
  const clientName   = client?.entreprise ?? d.client_nom ?? '—'
  const clientSector = client?.type_service || client?.sous_categorie || ''
  const clientPlace  = [client?.ville, client?.pays].filter(Boolean).join(' — ')
  const clientIce    = parsed.clientIce?.trim() || ''

  const objet      = parsed.objet?.trim()
  const offreTitle = parsed.offreTitle?.trim()

  /* Conditions → { label, value } (découpe sur le premier « : »). */
  const conds = (parsed.conditions ?? []).map(c => {
    const idx = c.indexOf(':')
    if (idx > 0 && idx < 40) return { label: c.slice(0, idx).trim(), value: c.slice(idx + 1).trim() }
    return { label: '', value: c.trim() }
  }).filter(c => c.value || c.label)
  const condMid  = Math.ceil(conds.length / 2)
  const condCols = [conds.slice(0, condMid), conds.slice(condMid)]

  return (
    <div
      ref={ref}
      className="bg-white font-sans"
      style={{
        width: '210mm', minHeight: '297mm', boxSizing: 'border-box',
        color: NAVY,
        fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif",
        padding: '14mm 15mm', display: 'flex', flexDirection: 'column',
      }}
    >
      {/* ══ EN-TÊTE ══════════════════════════════════════════════ */}
      <div className="flex items-start justify-between mb-4">
        <div className="flex flex-col">
          <img
            src="/logo-nextgital.png"
            alt={CO.name}
            className="h-[58px] w-auto object-contain self-start"
            crossOrigin="anonymous"
            onError={e => { (e.target as HTMLImageElement).style.display = 'none' }}
          />
          <p className="text-[10px] italic mt-1" style={{ color: '#475569' }}>{CO.sub}</p>
          <p className="text-[9.5px]" style={{ color: '#64748b' }}>Oujda, Maroc</p>
        </div>
        <div className="text-right">
          <p className="text-[26px] font-extrabold leading-none" style={{ color: NAVY }}>DEVIS</p>
          <p className="text-[11px] font-semibold mt-1.5" style={{ color: NAVY }}>N° {d.numero}</p>
          <p className="text-[10px]" style={{ color: '#64748b' }}>Date : {fmtDate(d.date_emission)}</p>
        </div>
      </div>

      {/* Panneau client (bloc lavande, aligné à droite) */}
      <div className="flex mb-4">
        <div className="ml-auto" style={{ width: '58%' }}>
          <div style={{ background: '#eef2fb', borderRadius: 6, padding: '10px 14px' }}>
            <p className="text-[14px] font-extrabold leading-tight" style={{ color: BLUE }}>{clientName}</p>
            {clientSector && <p className="text-[10.5px]" style={{ color: '#0f172a' }}>{clientSector}</p>}
            {clientPlace  && <p className="text-[10.5px]" style={{ color: '#0f172a' }}>{clientPlace}</p>}
            {clientIce    && <p className="text-[9.5px] mt-0.5" style={{ color: '#64748b' }}>ICE : {clientIce}</p>}
          </div>
        </div>
      </div>

      {/* Barre bleue de séparation */}
      <div style={{ height: 3, background: BLUE, borderRadius: 2, marginBottom: '6mm' }} />

      {/* ══ OBJET DU DEVIS ══════════════════════════════════════ */}
      <p className="text-[11px] font-bold uppercase tracking-[0.15em] mb-2" style={{ color: NAVY }}>
        Objet du devis
      </p>
      <div
        className="mb-7"
        style={{ background: '#f8fafc', borderLeft: `3px solid ${BLUE}`, borderRadius: 4, padding: '11px 14px' }}
      >
        {objet ? (
          <div
            className="text-[10.5px] leading-relaxed [&_strong]:font-bold [&_strong]:text-[#0a1a3c] [&_ul]:list-disc [&_ul]:pl-4"
            style={{ color: '#0f172a' }}
            dangerouslySetInnerHTML={{ __html: sanitizeRichHtml(objet.replace(/\n/g, '<br/>')) }}
          />
        ) : (
          <p className="text-[10.5px] leading-relaxed" style={{ color: '#0f172a' }}>
            Réalisation des prestations décrites ci-dessous pour <strong style={{ color: NAVY }}>{clientName}</strong>,
            dans le cadre d'un accompagnement personnalisé par {CO.legalName}, de la conception jusqu'à la
            mise en ligne et au suivi.
          </p>
        )}
      </div>

      {/* ══ OFFRE — cartes prestations ══════════════════════════ */}
      <p className="text-[11px] font-bold uppercase tracking-[0.15em] mb-3" style={{ color: NAVY }}>
        Offre{offreTitle ? ` — ${offreTitle}` : ''}
      </p>
      <div className="grid grid-cols-2 gap-4 mb-7">
        {rows.map((r, i) => (
          <div
            key={i}
            style={{
              border: '1px solid #e2e8f0', borderBottom: `2px solid ${NAVY}`,
              borderRadius: 6, padding: '10px 12px', breakInside: 'avoid',
            }}
          >
            <div className="flex items-baseline gap-1.5 pb-1.5 mb-1" style={{ borderBottom: `1px solid #dbe3f4` }}>
              <span className="text-[12px] font-extrabold" style={{ color: BLUE }}>{i + 1}.</span>
              <span className="text-[12px] font-extrabold leading-tight" style={{ color: NAVY }}>{r.titre}</span>
            </div>
            <CardBullets blocks={r.description} />
          </div>
        ))}
      </div>

      {/* ══ TOTAL EN LETTRES + ENCART TOTAUX ════════════════════ */}
      <div className="grid grid-cols-2 gap-6 mb-7" style={{ breakInside: 'avoid' }}>
        <div className="self-center">
          <p className="text-[11px] font-bold leading-snug" style={{ color: NAVY }}>
            Arrêté le présent devis à la somme de{' '}
            {amountToWordsFr(d.montant_ht, currency)} hors taxes ({fmtMoney(d.montant_ht, currency)} HT).
          </p>
          <p className="text-[9.5px] leading-relaxed mt-2" style={{ color: '#64748b' }}>
            Prix forfaitaire global : l'ensemble des prestations ci-dessus est compris dans ce montant unique,
            sans supplément. Montants exprimés en {currency === 'MAD' ? 'dirhams marocains (MAD)' : currency}.
          </p>
        </div>
        <div className="self-start">
          <div className="flex justify-between items-center px-4 py-2.5" style={{ background: NAVY }}>
            <span className="text-[12px] font-bold text-white tracking-wide">TOTAL HT</span>
            <span className="text-[14px] font-extrabold text-white">{fmtMoney(d.montant_ht, currency)}</span>
          </div>
          {hasTVA && (
            <>
              <div className="flex justify-between items-center px-4 py-2" style={{ borderBottom: '1px solid #e2e8f0' }}>
                <span className="text-[10.5px]" style={{ color: '#475569' }}>TVA {d.tva} %</span>
                <span className="text-[11px] font-semibold" style={{ color: NAVY }}>{fmtMoney(tvaMont, currency)}</span>
              </div>
              <div className="flex justify-between items-center px-4 py-2.5" style={{ borderBottom: `2px solid ${NAVY}` }}>
                <span className="text-[12px] font-extrabold" style={{ color: NAVY }}>Total TTC</span>
                <span className="text-[14px] font-extrabold" style={{ color: NAVY }}>{fmtMoney(d.montant_ttc, currency)}</span>
              </div>
            </>
          )}
        </div>
      </div>

      {/* ══ ÉQUIPE DÉDIÉE ═══════════════════════════════════════ */}
      <div className="mb-7" style={{ breakInside: 'avoid' }}>
        <p className="text-[11px] font-bold uppercase tracking-[0.15em] mb-3" style={{ color: NAVY }}>
          Votre équipe dédiée
        </p>
        <div className="grid grid-cols-4 gap-3">
          {DEFAULT_TEAM.map((m, i) => (
            <div key={i} style={{ borderTop: `2px solid ${BLUE}`, paddingTop: 6 }}>
              <p className="text-[10.5px] font-bold" style={{ color: NAVY }}>{m.role}</p>
              <p className="text-[9px] leading-snug mt-1" style={{ color: '#475569' }}>{m.desc}</p>
            </div>
          ))}
        </div>
      </div>

      {/* ══ CONDITIONS ══════════════════════════════════════════ */}
      {conds.length > 0 && (
        <div className="mb-7" style={{ breakInside: 'avoid' }}>
          <p className="text-[11px] font-bold uppercase tracking-[0.15em] mb-2" style={{ color: NAVY }}>
            Conditions
          </p>
          <div className="grid grid-cols-2 gap-x-8 gap-y-1.5">
            {condCols.map((col, ci) => (
              <div key={ci} className="space-y-1.5">
                {col.map((c, i) => (
                  <p key={i} className="text-[9.5px] leading-relaxed" style={{ color: '#0f172a' }}>
                    {c.label && <span className="font-bold" style={{ color: NAVY }}>{c.label} : </span>}
                    {c.value}
                  </p>
                ))}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ══ DOUBLE SIGNATURE ════════════════════════════════════ */}
      <div className="grid grid-cols-2 gap-6 mb-6" style={{ breakInside: 'avoid' }}>
        {[
          { title: `Bon pour accord — ${clientName}`, sig: null as string | null },
          { title: CO.name, sig: signature ?? null },
        ].map((s, i) => (
          <div key={i}>
            <p className="text-[10px] font-bold" style={{ color: NAVY }}>{s.title}</p>
            <p className="text-[9px] mb-1" style={{ color: '#64748b' }}>Date, cachet et signature</p>
            <div
              className="flex items-center justify-center overflow-hidden"
              style={{ height: '26mm', border: '1px solid #cbd5e1', borderRadius: 4 }}
            >
              {s.sig && <img src={s.sig} alt="Signature" className="max-w-full max-h-full object-contain" />}
            </div>
          </div>
        ))}
      </div>

      <div className="flex-1" />

      {/* ══ PIED DE PAGE LÉGAL ══════════════════════════════════ */}
      <div style={{ borderTop: '1px solid #cbd5e1', paddingTop: '3mm' }}>
        <p className="text-[8px] leading-relaxed" style={{ color: '#64748b' }}>
          <span className="font-bold" style={{ color: NAVY }}>{CO.legalName}</span> — {CO.addr} &nbsp;·&nbsp;
          <span className="font-semibold">RC</span> {CO.rc} &nbsp;·&nbsp;
          <span className="font-semibold">Patente N°</span> {CO.patente} &nbsp;·&nbsp;
          <span className="font-semibold">IF N°</span> {CO.if_} &nbsp;·&nbsp;
          <span className="font-semibold">ICE</span> {CO.ice}
        </p>
        <p className="text-[8px] leading-relaxed" style={{ color: '#64748b' }}>
          <span className="font-semibold">Banque</span> {CO.banque} &nbsp;·&nbsp;
          <span className="font-semibold">RIB</span> {CO.rib} &nbsp;·&nbsp;
          <span className="font-semibold">SWIFT</span> {CO.swift} &nbsp;·&nbsp;
          <span className="font-semibold" style={{ color: BLUE }}>{CO.tel}</span> &nbsp;·&nbsp;
          {CO.email} &nbsp;·&nbsp;
          <span className="font-semibold" style={{ color: BLUE }}>{CO.web}</span>
        </p>
        <p className="text-[8px] text-center mt-1.5" style={{ color: '#94a3b8' }}>
          {CO.name} — {CO.sub} — Oujda, Maroc &nbsp;•&nbsp; Devis N° {d.numero} du {fmtDate(d.date_emission)}
        </p>
      </div>
    </div>
  )
})

DevisTemplateExecutive.displayName = 'DevisTemplateExecutive'
export default DevisTemplateExecutive
