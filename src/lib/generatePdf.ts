import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import type { Facture } from '@/hooks/useFactures'
import { formatCurrency, formatDate } from './utils'

const STATUT_LABELS: Record<string, string> = {
  brouillon: 'Brouillon',
  envoyee:   'Envoyée',
  impayee:   'Impayée',
  partielle: 'Partielle',
  payee:     'Payée',
  annulee:   'Annulée',
  refusee:   'Refusée',
}

/** Construit le document PDF (jsPDF) sans le sauver ni l'imprimer.
 *  Utilisé par `generateFacturePDF` (save) et `generateFacturePDFBlob` (email). */
export function buildFacturePDF(facture: Facture): jsPDF {
  const doc   = new jsPDF('p', 'mm', 'a4')
  const pageW = doc.internal.pageSize.getWidth()
  const pageH = doc.internal.pageSize.getHeight()
  const m     = 15   // margin

  /* ── Header left: company ─────────────────────────────────── */
  doc.setFontSize(22)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(58, 82, 107)
  doc.text('NEXT GITAL', m, 22)

  doc.setFontSize(8)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(100, 116, 139)
  doc.text('Oujda, Maroc  ·  info@nextgital.com', m, 28)

  /* ── Header right: invoice meta ───────────────────────────── */
  doc.setFontSize(18)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(30, 41, 59)
  doc.text('FACTURE', pageW - m, 22, { align: 'right' })

  doc.setFontSize(9)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(100, 116, 139)
  doc.text(`N° ${facture.numero}`, pageW - m, 29, { align: 'right' })
  doc.text(`Émission : ${formatDate(facture.date_emission)}`, pageW - m, 35, { align: 'right' })
  if (facture.date_echeance) {
    doc.text(`Échéance : ${formatDate(facture.date_echeance)}`, pageW - m, 41, { align: 'right' })
  }

  /* ── Divider ─────────────────────────────────────────────── */
  doc.setDrawColor(226, 232, 240)
  doc.setLineWidth(0.4)
  doc.line(m, 47, pageW - m, 47)

  /* ── Client / Statut block ───────────────────────────────── */
  doc.setFontSize(7)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(148, 163, 184)
  doc.text('FACTURÉ À', m, 55)
  doc.text('STATUT', pageW / 2 + 5, 55)

  doc.setFontSize(11)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(30, 41, 59)
  doc.text(facture.client_nom || 'Client non spécifié', m, 62)
  doc.text(STATUT_LABELS[facture.statut] ?? facture.statut, pageW / 2 + 5, 62)

  if (facture.client_email) {
    doc.setFontSize(8)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(100, 116, 139)
    doc.text(facture.client_email, m, 68)
  }

  /* ── Divider ─────────────────────────────────────────────── */
  doc.setDrawColor(226, 232, 240)
  doc.line(m, 73, pageW - m, 73)

  /* ── Items table ─────────────────────────────────────────── */
  const description = facture.notes
    ? `Services — ${facture.numero}\n${facture.notes.slice(0, 80)}`
    : `Services — ${facture.numero}`

  autoTable(doc, {
    startY: 80,
    head: [['Description', 'Montant HT', 'TVA', 'Montant TTC']],
    body: [[
      description,
      formatCurrency(facture.montant_ht),
      `${facture.tva} %`,
      formatCurrency(facture.montant_ttc),
    ]],
    styles: {
      fontSize: 9,
      cellPadding: { top: 5, right: 5, bottom: 5, left: 5 },
    },
    headStyles: {
      fillColor: [58, 82, 107],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 8,
    },
    alternateRowStyles: { fillColor: [248, 249, 250] },
    columnStyles: {
      0: { cellWidth: 90 },
      1: { cellWidth: 33, halign: 'right' },
      2: { cellWidth: 18, halign: 'center' },
      3: { cellWidth: 33, halign: 'right', fontStyle: 'bold' },
    },
    margin: { left: m, right: m },
  })

  /* ── Totals block ────────────────────────────────────────── */
  const finalY: number = (doc as any).lastAutoTable?.finalY ?? 130
  let row = finalY + 10
  const labelX = pageW - m - 50
  const valX   = pageW - m

  const writeLine = (
    label: string,
    value: string,
    labelColor: [number, number, number] = [100, 116, 139],
    valueColor: [number, number, number] = [30, 41, 59],
    bold = false,
  ) => {
    doc.setFontSize(9)
    doc.setFont('helvetica', bold ? 'bold' : 'normal')
    doc.setTextColor(...labelColor)
    doc.text(label, labelX, row, { align: 'right' })
    doc.setTextColor(...valueColor)
    doc.text(value, valX, row, { align: 'right' })
    row += 7
  }

  writeLine('Montant HT', formatCurrency(facture.montant_ht))
  writeLine(`TVA (${facture.tva}%)`, formatCurrency(facture.montant_ttc - facture.montant_ht))

  if (facture.montant_paye > 0 && facture.montant_paye < facture.montant_ttc) {
    writeLine('Déjà payé', `− ${formatCurrency(facture.montant_paye)}`, [100, 116, 139], [39, 80, 10])
  }

  // Divider before total
  doc.setDrawColor(58, 82, 107)
  doc.setLineWidth(0.4)
  doc.line(labelX - 25, row - 3, valX, row - 3)
  row += 2

  const isFullyPaid = facture.statut === 'payee'
  const reste       = Math.max(0, facture.montant_ttc - facture.montant_paye)
  const totalLabel  = facture.montant_paye > 0 && !isFullyPaid ? 'Reste à payer' : 'TOTAL TTC'
  const totalValue  = isFullyPaid ? facture.montant_ttc : reste

  doc.setFontSize(11)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(30, 41, 59)
  doc.text(totalLabel, labelX, row, { align: 'right' })
  doc.setTextColor(
    ...(isFullyPaid ? ([39, 80, 10] as [number, number, number]) : ([163, 45, 45] as [number, number, number]))
  )
  doc.text(formatCurrency(totalValue), valX, row, { align: 'right' })
  row += 12

  /* ── Notes ───────────────────────────────────────────────── */
  if (facture.notes) {
    doc.setFontSize(7)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(148, 163, 184)
    doc.text('NOTES', m, row)
    row += 5
    doc.setFontSize(8)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(30, 41, 59)
    const lines = doc.splitTextToSize(facture.notes, pageW - m * 2 - 60)
    doc.text(lines, m, row)
  }

  /* ── Footer ──────────────────────────────────────────────── */
  doc.setDrawColor(226, 232, 240)
  doc.setLineWidth(0.4)
  doc.line(m, pageH - 20, pageW - m, pageH - 20)
  doc.setFontSize(7.5)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(148, 163, 184)
  doc.text(
    'NEXT GITAL · Oujda, Maroc · info@nextgital.com · Merci pour votre confiance.',
    pageW / 2, pageH - 13, { align: 'center' }
  )

  return doc
}

/** Télécharge la facture au format PDF (comportement historique). */
export function generateFacturePDF(facture: Facture): void {
  const doc = buildFacturePDF(facture)
  doc.save(`${facture.numero}.pdf`)
}

/** Retourne le PDF sous forme de Blob (pour envoi email). */
export function generateFacturePDFBlob(facture: Facture): Blob {
  return buildFacturePDF(facture).output('blob')
}
