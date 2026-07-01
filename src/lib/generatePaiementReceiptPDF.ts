import jsPDF from 'jspdf'
import type { Paiement } from '@/hooks/usePaiements'
import { formatCurrency, formatDate } from './utils'

const METHODE_LABELS: Record<string, string> = {
  virement: 'Virement',
  especes: 'Espèces',
  cheque: 'Chèque',
  carte_bancaire: 'Carte bancaire',
  paypal: 'PayPal',
  prelevement: 'Prélèvement',
}

const STATUS_LABELS: Record<string, string> = {
  paye: 'Payé',
  en_attente: 'En attente',
}

const TYPE_LABELS: Record<string, string> = {
  domaine: 'Domaine',
  hebergement: 'Hébergement',
  site_web: 'Site web',
  seo: 'SEO',
  ads: 'Ads',
  renouvellement: 'Renouvellement',
  autre: 'Autre',
}

function printPdf(doc: jsPDF, filename: string) {
  doc.autoPrint()
  const blobUrl = doc.output('bloburl')
  const win = window.open(blobUrl, '_blank')

  if (!win) {
    doc.save(filename)
  }
}

/** Construit le PDF du reçu sans imprimer ni sauver. */
export function buildPaiementReceiptPDF(paiement: Paiement, clientNom: string): jsPDF {
  const doc = new jsPDF('p', 'mm', 'a4')
  const pageW = doc.internal.pageSize.getWidth()
  const pageH = doc.internal.pageSize.getHeight()
  const m = 16

  doc.setFillColor(248, 250, 252)
  doc.rect(0, 0, pageW, pageH, 'F')

  doc.setFillColor(255, 255, 255)
  doc.roundedRect(m, 16, pageW - m * 2, pageH - 32, 4, 4, 'F')

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(22)
  doc.setTextColor(58, 82, 107)
  doc.text('NEXT GITAL', m + 8, 31)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  doc.setTextColor(100, 116, 139)
  doc.text('CRM & Gestion · Oujda, Maroc · info@nextgital.com', m + 8, 37)

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(17)
  doc.setTextColor(15, 23, 42)
  doc.text('REÇU DE PAIEMENT', pageW - m - 8, 31, { align: 'right' })

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.setTextColor(100, 116, 139)
  doc.text(`N° ${paiement.reference}`, pageW - m - 8, 38, { align: 'right' })
  doc.text(`Date : ${formatDate(paiement.date)}`, pageW - m - 8, 44, { align: 'right' })

  doc.setDrawColor(226, 232, 240)
  doc.setLineWidth(0.4)
  doc.line(m + 8, 53, pageW - m - 8, 53)

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8)
  doc.setTextColor(148, 163, 184)
  doc.text('REÇU DE', m + 8, 64)

  doc.setFontSize(12)
  doc.setTextColor(15, 23, 42)
  doc.text(clientNom || 'Client non spécifié', m + 8, 72)

  doc.setFillColor(236, 253, 245)
  doc.roundedRect(pageW - m - 76, 61, 68, 28, 3, 3, 'F')
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  doc.setTextColor(5, 150, 105)
  doc.text('MONTANT PAYÉ', pageW - m - 42, 70, { align: 'center' })
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(16)
  doc.text(formatCurrency(Number(paiement.montant)), pageW - m - 42, 80, { align: 'center' })

  const details: [string, string][] = [
    ['Référence', paiement.reference],
    ['Date du paiement', formatDate(paiement.date)],
    ['Méthode', METHODE_LABELS[paiement.methode] ?? paiement.methode],
    ['Statut', STATUS_LABELS[paiement.status] ?? paiement.status],
    ['Type', TYPE_LABELS[paiement.type_paiement] ?? paiement.type_paiement],
  ]

  let y = 104
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(9)
  doc.setTextColor(15, 23, 42)
  doc.text('Détails du paiement', m + 8, y)
  y += 8

  details.forEach(([label, value], index) => {
    const rowY = y + index * 10
    if (index % 2 === 0) {
      doc.setFillColor(248, 250, 252)
      doc.rect(m + 8, rowY - 6, pageW - m * 2 - 16, 9, 'F')
    }
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8.5)
    doc.setTextColor(100, 116, 139)
    doc.text(label, m + 12, rowY)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(15, 23, 42)
    doc.text(value || '—', pageW - m - 12, rowY, { align: 'right' })
  })

  y += details.length * 10 + 8

  if (paiement.notes) {
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(8)
    doc.setTextColor(148, 163, 184)
    doc.text('NOTES', m + 8, y)
    y += 6
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9)
    doc.setTextColor(51, 65, 85)
    doc.text(doc.splitTextToSize(paiement.notes, pageW - m * 2 - 16), m + 8, y)
  }

  doc.setDrawColor(226, 232, 240)
  doc.line(m + 8, pageH - 34, pageW - m - 8, pageH - 34)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  doc.setTextColor(100, 116, 139)
  doc.text('Merci pour votre paiement.', pageW / 2, pageH - 27, { align: 'center' })
  doc.text('Ce reçu confirme l’enregistrement du paiement dans NEXT GITAL.', pageW / 2, pageH - 21, { align: 'center' })

  return doc
}

/** Imprime le reçu (comportement historique). */
export function generatePaiementReceiptPDF(paiement: Paiement, clientNom: string): void {
  const doc = buildPaiementReceiptPDF(paiement, clientNom)
  printPdf(doc, `recu-${paiement.reference}.pdf`)
}

/** Retourne le reçu sous forme de Blob (pour envoi email). */
export function generatePaiementReceiptPDFBlob(paiement: Paiement, clientNom: string): Blob {
  return buildPaiementReceiptPDF(paiement, clientNom).output('blob')
}
