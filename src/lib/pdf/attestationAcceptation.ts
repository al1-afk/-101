import jsPDF from 'jspdf'
import type { Stagiaire } from '@/hooks/useStagiaires'
import { ENTREPRISE } from '@/lib/entreprise'
import {
  civilite, accepteAccord, accordE, formatDateFR, dateAujourdHui, safeFilename,
} from './pdfHelpers'
import {
  drawHeader, drawTitle, drawFooter, writeParagraph, loadEntrepriseLogo, COLORS, MARGIN, PAGE_W,
} from './stagiairePdfCommon'

/**
 * Document 1 — Attestation d'acceptation de stage.
 * Rendue avant le début du stage.
 */
export async function generateAttestationAcceptation(s: Stagiaire, mode: 'download' | 'preview' = 'download'): Promise<void> {
  const doc = new jsPDF('p', 'mm', 'a4')
  const logo = await loadEntrepriseLogo()

  drawHeader(doc, logo)
  drawTitle(doc, "ATTESTATION D'ACCEPTATION DE STAGE", 50)

  let y = 75

  // Intro
  y = writeParagraph(
    doc,
    `Je soussigné, ${ENTREPRISE.gerant}, gérant de la société ${ENTREPRISE.raisonSociale}, atteste par la présente que :`,
    y,
    { fontSize: 11 },
  )
  y += 8

  // Nom du stagiaire — centré, en gras, accent bleu
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(13)
  doc.setTextColor(...COLORS.accent)
  doc.text(`${civilite(s.genre)} ${s.nom_complet}`, PAGE_W / 2, y, { align: 'center' })
  y += 12

  // Corps
  y = writeParagraph(
    doc,
    `est ${accepteAccord(s.genre)} en tant que stagiaire au sein de notre entreprise.`,
    y,
    { fontSize: 11 },
  )
  y += 3

  y = writeParagraph(
    doc,
    `Le stage se déroulera du ${formatDateFR(s.date_debut)} au ${formatDateFR(s.date_fin)}, et portera sur les activités liées au développement web et marketing digital.`,
    y,
    { fontSize: 11 },
  )
  y += 3

  y = writeParagraph(
    doc,
    `Cette attestation est délivrée à l'intéressé${accordE(s.genre)} pour servir et valoir ce que de droit.`,
    y,
    { fontSize: 11 },
  )
  y += 18

  // Date d'émission
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(11)
  doc.setTextColor(...COLORS.text)
  doc.text(`Fait à ${ENTREPRISE.ville}, le ${dateAujourdHui()}`, MARGIN, y)
  y += 25

  // Bloc signature
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(11)
  doc.text('Le gérant', PAGE_W - MARGIN - 50, y)
  y += 6
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)
  doc.setTextColor(...COLORS.muted)
  doc.text(ENTREPRISE.gerant, PAGE_W - MARGIN - 50, y)
  y += 5
  doc.text(ENTREPRISE.raisonSociale, PAGE_W - MARGIN - 50, y)

  drawFooter(doc)
  const filename = `Attestation_Acceptation_${safeFilename(s.nom_complet)}.pdf`
  if (mode === 'preview') {
    window.open(doc.output('bloburl') as unknown as string, '_blank')
  } else {
    doc.save(filename)
  }
}
