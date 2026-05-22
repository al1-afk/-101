/**
 * BonLivraisonTemplate — A4 HTML template (handover projet → client).
 * Exporté en forwardRef pour la capture print / PDF.
 */
import { forwardRef } from 'react'
import type { BonLivraison } from '@/hooks/useBonsLivraison'
import type { Client }      from '@/hooks/useClients'
import type { Projet }      from '@/hooks/useProjets'

/* ─── Helpers ────────────────────────────────────────────────── */
function fmtDate(s: string | null) {
  if (!s) return '—'
  return new Date(s).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

const IDENT_LABEL: Record<string, string> = {
  user:     'Utilisateur',
  password: 'Mot de passe',
  email:    'Email',
  url:      'URL',
  other:    'Autre',
}

/* ─── Company constants ──────────────────────────────────────── */
const CO = {
  name:    'NEXT GITAL',
  sub:     'Agence Digitale & Web Solutions',
  addr1:   'Rue Mohamed V, Hôtel Aswan, Immeuble Kissi, 4ème Étage, Bureau N°7',
  addr2:   'Oujda, Maroc',
  tel:     '+212 620002066',
  fax:     '0536683707',
  email:   'info@gestiq.com',
  web:     'www.gestiq.com',
  rc:      '42415',
  if_:     '60270023',
  patente: '10301120',
  ice:     '003453451000013',
}

/* ─── MAIN TEMPLATE ──────────────────────────────────────────── */
interface BonLivraisonTemplateProps {
  bon:     BonLivraison
  client?: Client
  projet?: Projet
}

const BonLivraisonTemplate = forwardRef<HTMLDivElement, BonLivraisonTemplateProps>(
  ({ bon, client, projet }, ref) => {
    const liens        = Array.isArray(bon.liens)        ? bon.liens        : []
    const identifiants = Array.isArray(bon.identifiants) ? bon.identifiants : []

    return (
      <div
        ref={ref}
        className="bg-white text-[#0a1a3c] font-sans"
        style={{
          width: '210mm',
          padding: '14mm',
          boxSizing: 'border-box',
          fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif",
        }}
      >
        {/* ══ 1. HEADER (repeated on every printed page) ═════════ */}
        <div data-print-header="true">
          <div className="flex items-start justify-between mb-1">
            <div className="flex items-center gap-3">
              <img
                src="/logo-gestiq.png"
                alt="NEXT GITAL"
                className="w-16 h-16 object-contain"
                onError={e => { (e.target as HTMLImageElement).style.display = 'none' }}
              />
              <div>
                <p className="text-[22px] font-extrabold text-[#0a1a3c] leading-tight tracking-tight">{CO.name}</p>
                <p className="text-[11px] text-[#64748b] mt-0.5">{CO.sub}</p>
              </div>
            </div>

            <div className="text-right text-[10px] text-[#64748b] space-y-0.5 leading-relaxed">
              <p>RC: {CO.rc}  ·  IF: {CO.if_}  ·  Patente: {CO.patente}</p>
              <p>ICE: {CO.ice}</p>
              <p>Tél: {CO.tel}  ·  Fax: {CO.fax}</p>
              <p>{CO.email}  ·  {CO.web}</p>
            </div>
          </div>

          <div className="h-[2px] bg-[#059669] rounded-full mb-5" />
        </div>

        {/* ══ 2. TITLE BADGE + REF ═══════════════════════════════ */}
        <div className="flex items-start justify-between mb-5">
          <div
            className="px-6 py-2 rounded-lg text-white font-extrabold text-[16px] tracking-wider"
            style={{ backgroundColor: '#059669' }}
          >
            BON DE LIVRAISON
          </div>

          <div className="text-right text-[11px] space-y-1">
            {[
              { label: 'Réf :', val: bon.numero },
              { label: 'Date de livraison :', val: fmtDate(bon.date_livraison) },
            ].map(row => (
              <div key={row.label} className="flex items-center justify-end gap-4">
                <span className="text-[#64748b]">{row.label}</span>
                <span className="font-bold text-[#0a1a3c] w-40 text-right">{row.val}</span>
              </div>
            ))}
          </div>
        </div>

        {/* ══ 3. ÉMETTEUR / CLIENT ═══════════════════════════════ */}
        <div className="grid grid-cols-2 gap-4 mb-5">
          <div className="border border-[#e2e8f0] rounded-lg p-3 bg-[#f8fafc]">
            <p className="text-[9px] font-bold text-[#059669] uppercase tracking-widest mb-2">Émetteur</p>
            <p className="text-[13px] font-bold text-[#0a1a3c] mb-1">{CO.name}</p>
            <div className="text-[10px] text-[#374151] space-y-0.5">
              <p>{CO.addr1}</p>
              <p>{CO.addr2}</p>
              <p>Tél: {CO.tel}</p>
              <p>{CO.email}</p>
            </div>
          </div>

          <div className="border border-[#e2e8f0] rounded-lg p-3 bg-[#f8fafc]">
            <p className="text-[9px] font-bold text-[#059669] uppercase tracking-widest mb-2">Client</p>
            <p className="text-[13px] font-bold text-[#0a1a3c] mb-1">
              {client?.entreprise ?? client?.nom ?? '—'}
            </p>
            <div className="text-[10px] text-[#374151] space-y-0.5">
              {client?.entreprise && client?.nom && <p>{client.nom}</p>}
              {client?.email     && <p>{client.email}</p>}
              {client?.telephone && <p>{client.telephone}</p>}
              {(client?.adresse || client?.ville) && (
                <p>{[client.adresse, client.ville, client.pays].filter(Boolean).join(', ')}</p>
              )}
            </div>
          </div>
        </div>

        {/* ══ 4. PROJET LIVRÉ ════════════════════════════════════ */}
        <div className="mb-5">
          <p className="text-[10px] font-bold text-[#059669] uppercase tracking-widest mb-2">
            Projet livré
          </p>
          <p className="text-[14px] font-bold text-[#0a1a3c] mb-2">{bon.titre}</p>
          {projet && (
            <p className="text-[11px] text-[#64748b] mb-2">
              Projet associé : <span className="font-semibold text-[#0a1a3c]">{projet.nom}</span>
            </p>
          )}
          {bon.description && (
            <div className="text-[11px] text-[#374151] leading-relaxed whitespace-pre-wrap border-l-2 border-[#059669] pl-3 py-1 bg-[#f8fafc] rounded-r">
              {bon.description}
            </div>
          )}
        </div>

        {/* ══ 5. LIENS DU PROJET ═════════════════════════════════ */}
        {liens.length > 0 && (
          <div className="mb-5">
            <p className="text-[10px] font-bold text-[#059669] uppercase tracking-widest mb-2">
              Liens du projet
            </p>
            <table className="w-full border-collapse">
              <thead>
                <tr style={{ backgroundColor: '#059669' }}>
                  <th className="text-white text-[10px] font-bold py-2 px-3 text-left" style={{ width: '30%' }}>Libellé</th>
                  <th className="text-white text-[10px] font-bold py-2 px-3 text-left">URL</th>
                </tr>
              </thead>
              <tbody>
                {liens.map((l, i) => (
                  <tr key={i} style={{ backgroundColor: i % 2 === 0 ? '#fcfdff' : '#ffffff' }}>
                    <td className="px-3 py-2 text-[11px] font-semibold text-[#0a1a3c] border-b border-[#e2e8f0]">
                      {l.label || '—'}
                    </td>
                    <td className="px-3 py-2 text-[11px] text-[#1e40af] border-b border-[#e2e8f0] break-all">
                      {l.url || '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* ══ 6. IDENTIFIANTS ════════════════════════════════════ */}
        {identifiants.length > 0 && (
          <div className="mb-5">
            <p className="text-[10px] font-bold text-[#059669] uppercase tracking-widest mb-2">
              Identifiants &amp; mots de passe
            </p>
            <p className="text-[9px] text-[#64748b] italic mb-2">
              ⚠ Information confidentielle — conserver en lieu sûr.
            </p>
            <table className="w-full border-collapse">
              <thead>
                <tr style={{ backgroundColor: '#1a3460' }}>
                  <th className="text-white text-[10px] font-bold py-2 px-3 text-left" style={{ width: '25%' }}>Type</th>
                  <th className="text-white text-[10px] font-bold py-2 px-3 text-left" style={{ width: '30%' }}>Libellé</th>
                  <th className="text-white text-[10px] font-bold py-2 px-3 text-left">Valeur</th>
                </tr>
              </thead>
              <tbody>
                {identifiants.map((it, i) => (
                  <tr key={i} style={{ backgroundColor: i % 2 === 0 ? '#fcfdff' : '#ffffff' }}>
                    <td className="px-3 py-2 text-[11px] text-[#64748b] border-b border-[#e2e8f0]">
                      {IDENT_LABEL[it.type] || it.type}
                    </td>
                    <td className="px-3 py-2 text-[11px] font-semibold text-[#0a1a3c] border-b border-[#e2e8f0]">
                      {it.label || '—'}
                    </td>
                    <td className="px-3 py-2 text-[11px] text-[#0a1a3c] font-mono border-b border-[#e2e8f0] break-all">
                      {it.valeur || '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* ══ 7. SIGNATURE CLIENT ═══════════════════════════════ */}
        <div className="grid grid-cols-2 gap-6 mb-5 mt-8">
          <div>
            <p className="text-[10px] font-bold text-[#64748b] uppercase tracking-wider mb-2">
              Pour l&apos;émetteur
            </p>
            <div className="h-[80px] border border-[#e2e8f0] rounded-lg bg-white" />
            <p className="text-[9px] text-[#64748b] mt-1 text-center">Signature &amp; cachet</p>
          </div>
          <div>
            <p className="text-[10px] font-bold text-[#0a1a3c] uppercase tracking-wider mb-2">
              Pour le client — Bon pour réception
            </p>
            <div className="h-[80px] border border-[#0a1a3c] rounded-lg bg-white" />
            <p className="text-[9px] text-[#64748b] mt-1 text-center">Date, signature &amp; cachet</p>
          </div>
        </div>

        {/* ══ 8. FOOTER ═════════════════════════════════════════ */}
        <div data-footer="true" className="border-t border-[#e2e8f0] pt-3 mt-6">
          <p className="text-center text-[9px] text-[#94a3b8] mb-1">{bon.numero}  ·  Page 1/1</p>
          <p className="text-center text-[9px] text-[#94a3b8] leading-relaxed">
            {CO.name}  ·  {CO.addr1}, {CO.addr2}  ·  Tél: {CO.tel}  ·  Fax: {CO.fax}  ·  {CO.email}  ·  {CO.web}
          </p>
        </div>
      </div>
    )
  }
)

BonLivraisonTemplate.displayName = 'BonLivraisonTemplate'
export default BonLivraisonTemplate
