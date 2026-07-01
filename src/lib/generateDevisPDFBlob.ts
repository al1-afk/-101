/**
 * generateDevisPDFBlob — Version jsPDF légère pour envoi par email.
 *
 * L'export HTML/print (`generateDevisPDF`) reste utilisé pour l'aperçu et
 * l'impression interactive. Ici on génère un PDF propre côté client
 * (via jsPDF) pour l'attacher à un email — sans dépendre du DOM.
 */
import jsPDF     from 'jspdf'
import autoTable from 'jspdf-autotable'
import type { Devis } from '@/hooks/useDevis'
import { formatCurrency, formatDate } from './utils'

const STATUT_LABELS: Record<Devis['statut'], string> = {
  brouillon: 'Brouillon',
  envoye:    'Envoyé',
  accepte:   'Accepté',
  refuse:    'Refusé',
  expire:    'Expiré',
}

interface BuildOpts {
  clientNom?:   string
  clientEmail?: string
}

function buildDevisPDF(devis: Devis, opts: BuildOpts = {}): jsPDF {
  const doc   = new jsPDF('p', 'mm', 'a4')
  const pageW = doc.internal.pageSize.getWidth()
  const pageH = doc.internal.pageSize.getHeight()
  const m     = 15

  /* ── Header entreprise ── */
  doc.setFontSize(22)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(58, 82, 107)
  doc.text('NEXT GITAL', m, 22)

  doc.setFontSize(8)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(100, 116, 139)
  doc.text('Oujda, Maroc  ·  info@nextgital.com', m, 28)

  /* ── Header droite ── */
  doc.setFontSize(18)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(30, 41, 59)
  doc.text('DEVIS', pageW - m, 22, { align: 'right' })

  doc.setFontSize(9)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(100, 116, 139)
  doc.text(`N° ${devis.numero}`, pageW - m, 29, { align: 'right' })
  doc.text(`Émission : ${formatDate(devis.date_emission)}`, pageW - m, 35, { align: 'right' })
  if (devis.date_expiration) {
    doc.text(`Expiration : ${formatDate(devis.date_expiration)}`, pageW - m, 41, { align: 'right' })
  }

  doc.setDrawColor(226, 232, 240)
  doc.setLineWidth(0.4)
  doc.line(m, 47, pageW - m, 47)

  /* ── Bloc client / statut ── */
  doc.setFontSize(7)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(148, 163, 184)
  doc.text('ADRESSÉ À', m, 55)
  doc.text('STATUT', pageW / 2 + 5, 55)

  doc.setFontSize(11)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(30, 41, 59)
  doc.text(opts.clientNom || devis.client_nom || 'Client non spécifié', m, 62)
  doc.text(STATUT_LABELS[devis.statut] ?? devis.statut, pageW / 2 + 5, 62)

  if (opts.clientEmail) {
    doc.setFontSize(8)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(100, 116, 139)
    doc.text(opts.clientEmail, m, 68)
  }

  doc.setDrawColor(226, 232, 240)
  doc.line(m, 73, pageW - m, 73)

  /* ── Tableau des lignes ── */
  const rows: (string | number)[][] = (devis.lignes && devis.lignes.length > 0
    ? devis.lignes.map(l => [
        l.description || '—',
        l.quantite,
        formatCurrency(l.prix_unitaire),
        formatCurrency(l.total),
      ])
    : [[
        `Prestations — ${devis.numero}`,
        1,
        formatCurrency(devis.montant_ht),
        formatCurrency(devis.montant_ht),
      ]]
  )

  autoTable(doc, {
    startY: 80,
    head:  [['Description', 'Qté', 'PU HT', 'Total HT']],
    body:  rows,
    styles: {
      fontSize:    9,
      cellPadding: { top: 5, right: 5, bottom: 5, left: 5 },
    },
    headStyles: {
      fillColor: [58, 82, 107],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize:  8,
    },
    alternateRowStyles: { fillColor: [248, 249, 250] },
    columnStyles: {
      0: { cellWidth: 90 },
      1: { cellWidth: 18, halign: 'center' },
      2: { cellWidth: 33, halign: 'right' },
      3: { cellWidth: 33, halign: 'right', fontStyle: 'bold' },
    },
    margin: { left: m, right: m },
  })

  /* ── Totaux ── */
  const finalY: number = (doc as any).lastAutoTable?.finalY ?? 130
  let row = finalY + 10
  const labelX = pageW - m - 50
  const valX   = pageW - m

  const writeLine = (label: string, value: string, bold = false) => {
    doc.setFontSize(9)
    doc.setFont('helvetica', bold ? 'bold' : 'normal')
    doc.setTextColor(100, 116, 139)
    doc.text(label, labelX, row, { align: 'right' })
    doc.setTextColor(30, 41, 59)
    doc.text(value, valX, row, { align: 'right' })
    row += 7
  }

  writeLine('Montant HT', formatCurrency(devis.montant_ht))
  writeLine(`TVA (${devis.tva}%)`, formatCurrency(devis.montant_ttc - devis.montant_ht))

  doc.setDrawColor(58, 82, 107)
  doc.setLineWidth(0.4)
  doc.line(labelX - 25, row - 3, valX, row - 3)
  row += 2

  doc.setFontSize(11)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(30, 41, 59)
  doc.text('TOTAL TTC', labelX, row, { align: 'right' })
  doc.setTextColor(37, 99, 235)
  doc.text(formatCurrency(devis.montant_ttc), valX, row, { align: 'right' })
  row += 12

  /* ── Notes ── */
  if (devis.notes) {
    /* Les notes peuvent être un JSON (bloc conditions/prestations). Si oui,
       on n'affiche pas ce JSON brut — juste un rappel court. */
    let notesText = ''
    try {
      const j = JSON.parse(devis.notes)
      if (Array.isArray(j?.conditions) && j.conditions.length) {
        notesText = 'Conditions :\n' + j.conditions.map((c: string) => `• ${c}`).join('\n')
      }
    } catch {
      notesText = devis.notes
    }
    if (notesText) {
      doc.setFontSize(7)
      doc.setFont('helvetica', 'bold')
      doc.setTextColor(148, 163, 184)
      doc.text('CONDITIONS', m, row)
      row += 5
      doc.setFontSize(8)
      doc.setFont('helvetica', 'normal')
      doc.setTextColor(30, 41, 59)
      const lines = doc.splitTextToSize(notesText, pageW - m * 2)
      doc.text(lines, m, row)
    }
  }

  /* ── Footer ── */
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

/** Retourne le PDF du devis sous forme de Blob (pour envoi email). */
export function generateDevisPDFBlob(devis: Devis, opts: BuildOpts = {}): Blob {
  return buildDevisPDF(devis, opts).output('blob')
}
