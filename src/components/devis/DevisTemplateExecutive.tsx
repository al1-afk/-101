/**
 * DevisTemplateExecutive — style « exécutif / premium ».
 * Bandeau d'entête coloré, hero card avec grand total, résumé bullet-list des
 * prestations et détail des prix en dessous. À réserver aux clients premium ou
 * aux propositions courtes (1-3 prestations) où l'on veut vendre la valeur.
 */
import { forwardRef } from 'react'
import type { Devis }  from '@/hooks/useDevis'
import type { Client } from '@/hooks/useClients'
import {
  parseDevisEnvelope, fmtMoney, fmtDate, stripHtml, CO,
  type Currency, type Prestation,
} from './templateShared'

interface Props { devis: Devis; client?: Client }

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

  /* Résumé bullet : titre + 1 ligne descriptive extraite du 1er bloc paragraphe. */
  const highlights = rows.map(r => {
    const firstText = r.description.find(b => b.type === 'paragraph' || b.type === 'title')
    return { titre: r.titre, hint: firstText ? stripHtml(firstText.content).slice(0, 90) : '' }
  })

  return (
    <div
      ref={ref}
      className="bg-white text-[#0a1a3c] font-sans"
      style={{
        width: '210mm', minHeight: '297mm', boxSizing: 'border-box',
        fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif",
        display: 'flex', flexDirection: 'column',
      }}
    >
      {/* Bandeau bleu foncé plein largeur */}
      <div
        style={{
          background: 'linear-gradient(120deg, #0a1a3c 0%, #1e3a8a 100%)',
          color: 'white',
          padding: '18mm 16mm 14mm 16mm',
        }}
      >
        <div className="flex items-start justify-between">
          <div>
            <p className="text-[26px] font-extrabold leading-none">{CO.name}</p>
            <p className="text-[10.5px] opacity-80 mt-1">{CO.sub}</p>
          </div>
          <div className="text-right">
            <p className="text-[10px] uppercase tracking-widest opacity-80">Proposition</p>
            <p className="text-[20px] font-extrabold leading-none mt-0.5">{d.numero}</p>
            <p className="text-[10px] opacity-80 mt-1">
              {fmtDate(d.date_emission)}
              {d.date_expiration && ` — valable jusqu'au ${fmtDate(d.date_expiration)}`}
            </p>
          </div>
        </div>
      </div>

      {/* Corps */}
      <div style={{ padding: '10mm 16mm 0 16mm' }} className="flex-1 flex flex-col">
        {/* Client + Hero prix */}
        <div className="grid grid-cols-5 gap-6 mb-8">
          <div className="col-span-3">
            <p className="text-[10px] text-[#64748b] font-semibold uppercase tracking-widest mb-1">Client</p>
            <p className="text-[16px] font-extrabold text-[#0a1a3c] leading-tight">
              {client?.entreprise ?? d.client_nom ?? '—'}
            </p>
            {client?.nom && client?.entreprise && (
              <p className="text-[11px] text-[#333] mt-0.5">À l'attention de {client.nom}</p>
            )}
            <p className="text-[11px] text-[#333] leading-relaxed mt-3">
              Merci de nous accorder votre confiance. La proposition ci-dessous synthétise notre
              accompagnement — nous restons disponibles pour l'ajuster à vos objectifs.
            </p>
          </div>
          <div
            className="col-span-2 rounded-xl text-white flex flex-col justify-center"
            style={{
              background: 'linear-gradient(135deg, #1e64c4 0%, #0a1a3c 100%)',
              padding: '14px 16px',
              boxShadow: '0 8px 24px rgba(30,100,196,0.25)',
            }}
          >
            <p className="text-[10px] uppercase tracking-widest opacity-80">Investissement TTC</p>
            <p className="text-[26px] font-extrabold leading-none mt-1">
              {fmtMoney(d.montant_ttc, currency)}
            </p>
            <p className="text-[9.5px] opacity-80 mt-1">
              HT : {fmtMoney(d.montant_ht, currency)}
              {hasTVA && ` · TVA ${d.tva}% : ${fmtMoney(tvaMont, currency)}`}
            </p>
          </div>
        </div>

        {/* Résumé — bullets */}
        <p className="text-[10px] text-[#64748b] font-semibold uppercase tracking-widest mb-2">
          Ce que couvre cette proposition
        </p>
        <div className="grid grid-cols-2 gap-x-8 gap-y-2 mb-8">
          {highlights.map((h, i) => (
            <div key={i} className="flex items-start gap-2">
              <div
                className="flex-shrink-0 mt-0.5"
                style={{
                  width: 18, height: 18, borderRadius: 9,
                  background: '#e0edff', color: '#1e64c4',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 10, fontWeight: 700,
                }}
              >
                {i + 1}
              </div>
              <div className="min-w-0">
                <p className="text-[11px] font-bold text-[#0a1a3c] leading-tight">{h.titre}</p>
                {h.hint && <p className="text-[9.5px] text-[#64748b] mt-0.5 leading-snug">{h.hint}</p>}
              </div>
            </div>
          ))}
        </div>

        {/* Détail des prix — liste sans tableau */}
        <p className="text-[10px] text-[#64748b] font-semibold uppercase tracking-widest mb-2">
          Détail
        </p>
        <div className="mb-8">
          {rows.map((r, i) => {
            const showQty  = r.showQuantite ?? true
            const total    = showQty ? r.quantite * r.prix_unitaire : r.prix_unitaire
            return (
              <div
                key={i}
                className="flex justify-between items-center py-2"
                style={{ borderBottom: '1px solid #e2e8f0' }}
              >
                <div>
                  <p className="text-[11px] font-semibold text-[#0a1a3c]">{r.titre}</p>
                  {showQty && r.quantite > 1 && (
                    <p className="text-[9px] text-[#64748b]">
                      {r.quantite} × {new Intl.NumberFormat('fr-MA', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(r.prix_unitaire)}
                    </p>
                  )}
                </div>
                <p className="text-[11px] font-bold text-[#0a1a3c]">
                  {fmtMoney(total, currency)}
                </p>
              </div>
            )
          })}
        </div>

        {/* Conditions + Signature */}
        <div className="grid grid-cols-2 gap-6 mb-6">
          <div>
            {parsed.conditions.length > 0 && (
              <>
                <p className="text-[10px] text-[#64748b] font-semibold uppercase tracking-widest mb-1.5">Conditions</p>
                <ul>
                  {parsed.conditions.slice(0, 4).map((c, i) => (
                    <li key={i} className="text-[9.5px] text-[#333] leading-relaxed">• {c}</li>
                  ))}
                </ul>
              </>
            )}
          </div>
          <div>
            <p className="text-[10px] text-[#64748b] font-semibold uppercase tracking-widest mb-1.5">
              Bon pour accord
            </p>
            <div
              className="rounded"
              style={{
                width: '100%', height: '26mm',
                border: '1px dashed #cbd5e1',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}
            >
              {signature
                ? <img src={signature} alt="Signature" className="max-w-full max-h-full object-contain" />
                : <span className="text-[9px] text-[#94a3b8]">Signature du client</span>}
            </div>
          </div>
        </div>

        <div className="flex-1" />

        {/* Footer */}
        <div style={{ borderTop: '1px solid #e2e8f0', padding: '4mm 0 8mm 0' }}>
          <div className="flex items-start justify-between text-[8.5px] text-[#333] leading-relaxed">
            <div className="max-w-[130mm]">
              <p><span className="font-bold text-[#0a1a3c]">{CO.legalName}</span>, {CO.addr}</p>
              <p>
                <span className="font-bold text-[#0a1a3c]">RC :</span> {CO.rc} &nbsp;·&nbsp;
                <span className="font-bold text-[#0a1a3c]">ICE :</span> {CO.ice} &nbsp;·&nbsp;
                <span className="font-bold text-[#0a1a3c]">IF :</span> {CO.if_}
              </p>
            </div>
            <div className="text-right">
              <p className="text-[10px] font-bold text-[#1e64c4]">{CO.tel}</p>
              <p className="text-[9px] text-[#333]">{CO.email}</p>
              <p className="text-[9px] font-bold text-[#1e64c4]">{CO.web}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
})

DevisTemplateExecutive.displayName = 'DevisTemplateExecutive'
export default DevisTemplateExecutive
