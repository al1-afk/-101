import jsPDF from 'jspdf'
import type { Stagiaire } from '@/hooks/useStagiaires'
import { ENTREPRISE } from '@/lib/entreprise'
import {
  civilite, formatDateFR, dateAujourdHui, safeFilename,
} from './pdfHelpers'
import {
  drawHeader, drawTitle, drawFooter, writeParagraph, loadEntrepriseLogo, COLORS, MARGIN, PAGE_W,
} from './stagiairePdfCommon'

/**
 * Document 3 — Attestation de stage (fin de stage).
 * Délivrée à la fin du stage pour attester de sa réalisation.
 */
export async function generateAttestationStage(s: Stagiaire, mode: 'download' | 'preview' = 'download'): Promise<void> {
  const doc = new jsPDF('p', 'mm', 'a4')
  const logo = await loadEntrepriseLogo()

  drawHeader(doc, logo)
  drawTitle(doc, 'ATTESTATION DE STAGE', 50)

  let y = 75

  y = writeParagraph(
    doc,
    `Nous, soussignés, la société ${ENTREPRISE.raisonSociale}, spécialisée en marketing digital et développement web, dont le siège social est situé à l'${ENTREPRISE.adresseLongue}, représentée par M. ${ENTREPRISE.gerant},`,
    y,
    { fontSize: 11 },
  )
  y += 4

  y = writeParagraph(doc, 'Attestons par la présente que :', y, { fontSize: 11, bold: true })
  y += 4

  // Nom — centré, accent bleu
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(13)
  doc.setTextColor(...COLORS.accent)
  doc.text(`${civilite(s.genre)} ${s.nom_complet}`, PAGE_W / 2, y, { align: 'center' })
  y += 10

  y = writeParagraph(
    doc,
    `a effectué un stage au sein de notre entreprise, du ${formatDateFR(s.date_debut)} au ${formatDateFR(s.date_fin)}, au sein du département de ${s.departement}.`,
    y,
    { fontSize: 11 },
  )
  y += 3

  y = writeParagraph(
    doc,
    `Durant cette période, ${civilite(s.genre)} ${s.nom_complet} a accompli les tâches qui lui ont été confiées, en respectant les consignes et les délais fixés.`,
    y,
    { fontSize: 11 },
  )
  y += 3

  y = writeParagraph(
    doc,
    `La présente attestation lui est délivrée à sa demande pour servir et valoir ce que de droit.`,
    y,
    { fontSize: 11 },
  )
  y += 16

  // Date d'émission
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(11)
  doc.setTextColor(...COLORS.text)
  doc.text(`Fait à ${ENTREPRISE.ville}, le ${dateAujourdHui()}`, MARGIN, y)
  y += 22

  // Bloc signature représentant légal
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(11)
  doc.setTextColor(...COLORS.dark)
  doc.text('Le Représentant Légal', PAGE_W - MARGIN - 60, y)
  y += 6
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)
  doc.setTextColor(...COLORS.muted)
  doc.text(`M. ${ENTREPRISE.gerant}`, PAGE_W - MARGIN - 60, y)
  y += 5
  doc.text(`Gérant – ${ENTREPRISE.raisonSociale}`, PAGE_W - MARGIN - 60, y)

  drawFooter(doc)
  const filename = `Attestation_Stage_${safeFilename(s.nom_complet)}.pdf`
  if (mode === 'preview') {
    window.open(doc.output('bloburl') as unknown as string, '_blank')
  } else {
    doc.save(filename)
  }
}
