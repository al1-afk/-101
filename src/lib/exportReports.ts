import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import type { Facture } from '@/hooks/useFactures'
import type { Prospect } from '@/hooks/useProspects'
import type { Depense } from '@/hooks/useDepenses'

const BRAND = { r: 37, g: 99, b: 235 } // blue-600

function header(doc: jsPDF, title: string, subtitle: string) {
  doc.setFillColor(BRAND.r, BRAND.g, BRAND.b)
  doc.rect(0, 0, 210, 18, 'F')
  doc.setTextColor(255, 255, 255)
  doc.setFontSize(13)
  doc.setFont('helvetica', 'bold')
  doc.text('NEXT GITAL', 14, 11)
  doc.setFontSize(9)
  doc.setFont('helvetica', 'normal')
  doc.text(title, 80, 11, { align: 'center' })
  doc.text(new Date().toLocaleDateString('fr-FR'), 196, 11, { align: 'right' })
  doc.setTextColor(30, 30, 30)
  doc.setFontSize(14)
  doc.setFont('helvetica', 'bold')
  doc.text(subtitle, 14, 30)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
}

function footer(doc: jsPDF) {
  const pages = doc.getNumberOfPages()
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i)
    doc.setFontSize(8)
    doc.setTextColor(150)
    doc.text(`Page ${i} / ${pages}  —  Généré par NEXT GITAL`, 105, 290, { align: 'center' })
  }
}

const fmt = (n: number) =>
  n.toLocaleString('fr-MA', { style: 'currency', currency: 'MAD', maximumFractionDigits: 2 })

/* ── 1. Rapport CA Factures ───────────────────────────────────────── */
export function exportFacturesPDF(factures: Facture[], periode: string) {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })
  header(doc, 'Rapport Factures', `Rapport des factures — ${periode}`)

  const total     = factures.reduce((s, f) => s + f.montant_ttc, 0)
  const paye      = factures.filter(f => f.statut === 'payee').reduce((s, f) => s + f.montant_ttc, 0)
  const impaye    = total - paye

  doc.setFontSize(9)
  doc.setTextColor(80)
  doc.text(`Total TTC: ${fmt(total)}   |   Encaissé: ${fmt(paye)}   |   Impayé: ${fmt(impaye)}`, 14, 38)

  autoTable(doc, {
    startY: 44,
    head: [['Numéro', 'Client', 'Date émission', 'Échéance', 'HT', 'TVA%', 'TTC', 'Payé', 'Statut']],
    body: factures.map(f => [
      f.numero,
      (f as any).client_nom ?? '—',
      f.date_emission,
      f.date_echeance ?? '—',
      fmt(f.montant_ht),
      `${f.tva}%`,
      fmt(f.montant_ttc),
      fmt(f.montant_paye),
      f.statut.toUpperCase(),
    ]),
    foot: [['', '', '', 'TOTAL', fmt(factures.reduce((s,f)=>s+f.montant_ht,0)), '', fmt(total), fmt(paye), '']],
    headStyles:   { fillColor: [BRAND.r, BRAND.g, BRAND.b], textColor: 255, fontSize: 8, fontStyle: 'bold' },
    footStyles:   { fillColor: [230, 236, 255], textColor: 30, fontSize: 8, fontStyle: 'bold' },
    bodyStyles:   { fontSize: 7.5 },
    alternateRowStyles: { fillColor: [248, 250, 255] },
    columnStyles: { 4: { halign: 'right' }, 5: { halign: 'center' }, 6: { halign: 'right' }, 7: { halign: 'right' } },
    didDrawCell: (data) => {
      if (data.section === 'body' && data.column.index === 8) {
        const statut = factures[data.row.index]?.statut
        const colors: Record<string, [number,number,number]> = {
          payee:    [22, 163, 74],
          impayee:  [220, 38, 38],
          partielle:[234, 179, 8],
          annulee:  [100, 116, 139],
        }
        if (colors[statut]) doc.setTextColor(...colors[statut])
      }
    },
  })

  footer(doc)
  doc.save(`factures_${periode.replace(/\s/g,'-')}.pdf`)
}

/* ── 2. Rapport CA Mensuel ───────────────────────────────────────── */
export function exportCaMensuelPDF(factures: Facture[], year: number) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  header(doc, 'Chiffre d\'Affaires', `CA Mensuel ${year}`)

  const months = ['Janvier','Février','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Décembre']
  const rows = months.map((mois, i) => {
    const mFact = factures.filter(f => {
      const d = new Date(f.date_emission)
      return d.getFullYear() === year && d.getMonth() === i
    })
    const ca      = mFact.filter(f => f.statut === 'payee').reduce((s,f)=>s+f.montant_ttc, 0)
    const encours = mFact.filter(f => f.statut !== 'payee' && f.statut !== 'annulee').reduce((s,f)=>s+f.montant_ttc, 0)
    return [mois, mFact.length.toString(), fmt(ca), fmt(encours), fmt(ca + encours)]
  })

  const total = rows.reduce((s, r) => s + parseFloat(r[4].replace(/[^\d.]/g,'')), 0)

  autoTable(doc, {
    startY: 38,
    head:   [['Mois', 'Nb factures', 'CA encaissé', 'En cours', 'Total émis']],
    body:   rows,
    foot:   [['TOTAL', factures.length.toString(), '', '', fmt(factures.reduce((s,f)=>s+f.montant_ttc,0))]],
    headStyles:  { fillColor: [BRAND.r, BRAND.g, BRAND.b], textColor: 255, fontSize: 9, fontStyle: 'bold' },
    footStyles:  { fillColor: [230, 236, 255], fontStyle: 'bold' },
    bodyStyles:  { fontSize: 9 },
    alternateRowStyles: { fillColor: [248, 250, 255] },
    columnStyles: { 2: { halign: 'right' }, 3: { halign: 'right' }, 4: { halign: 'right' } },
  })

  footer(doc)
  doc.save(`ca_mensuel_${year}.pdf`)
}

/* ── 3. Rapport Dépenses ─────────────────────────────────────────── */
export function exportDepensesPDF(depenses: Depense[], periode: string) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  header(doc, 'Rapport Dépenses', `Dépenses — ${periode}`)

  const total = depenses.reduce((s, d) => s + d.montant, 0)
  doc.setFontSize(9)
  doc.setTextColor(80)
  doc.text(`Total dépenses: ${fmt(total)}`, 14, 38)

  autoTable(doc, {
    startY: 44,
    head:   [['Date', 'Description', 'Catégorie', 'Type', 'Montant']],
    body:   depenses.map(d => [d.date_depense, d.description, d.categorie, d.type, fmt(d.montant)]),
    foot:   [['', '', '', 'TOTAL', fmt(total)]],
    headStyles:  { fillColor: [BRAND.r, BRAND.g, BRAND.b], textColor: 255, fontSize: 9, fontStyle: 'bold' },
    footStyles:  { fillColor: [230, 236, 255], fontStyle: 'bold' },
    bodyStyles:  { fontSize: 8.5 },
    alternateRowStyles: { fillColor: [248, 250, 255] },
    columnStyles: { 4: { halign: 'right' } },
  })

  footer(doc)
  doc.save(`depenses_${periode.replace(/\s/g,'-')}.pdf`)
}

/* ── 4. CSV Export (clients / prospects) ─────────────────────────── */
function toCSV(headers: string[], rows: string[][]): string {
  const escape = (v: string) => `"${v.replace(/"/g, '""')}"`
  return [headers.map(escape).join(','), ...rows.map(r => r.map(escape).join(','))].join('\n')
}

function downloadCSV(filename: string, csv: string) {
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href = url; a.download = filename; a.click()
  URL.revokeObjectURL(url)
}

export function exportClientsCSV(clients: any[]) {
  const csv = toCSV(
    ['Nom', 'Entreprise', 'Email', 'Téléphone', 'Ville', 'Pays', 'Date création'],
    clients.map(c => [c.nom, c.entreprise||'', c.email||'', c.telephone||'', c.ville||'', c.pays||'', c.created_at?.slice(0,10)||''])
  )
  downloadCSV('clients.csv', csv)
}

export function exportProspectsCSV(prospects: Prospect[]) {
  const csv = toCSV(
    ['Nom', 'Entreprise', 'Email', 'Statut', 'Valeur estimée', 'Source', 'Date contact'],
    prospects.map(p => [p.nom, p.entreprise||'', p.email||'', p.statut, String(p.valeur_estimee||0), p.source||'', p.date_contact||''])
  )
  downloadCSV('prospects.csv', csv)
}

export function exportFacturesCSV(factures: Facture[]) {
  const csv = toCSV(
    ['Numéro', 'Client', 'Date émission', 'Échéance', 'HT', 'TVA%', 'TTC', 'Payé', 'Statut'],
    factures.map(f => [f.numero, (f as any).client_nom||'', f.date_emission, f.date_echeance||'', String(f.montant_ht), String(f.tva), String(f.montant_ttc), String(f.montant_paye), f.statut])
  )
  downloadCSV('factures.csv', csv)
}
