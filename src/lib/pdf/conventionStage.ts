import jsPDF from 'jspdf'
import type { Stagiaire } from '@/hooks/useStagiaires'
import { ENTREPRISE } from '@/lib/entreprise'
import {
  articleStagiaire, quilQuelle, couvertAccord, pronomSujet,
  formatDateFR, dateAujourdHui, dureeEnMois, safeFilename,
} from './pdfHelpers'
import {
  drawHeader, drawFooter, loadEntrepriseLogo, COLORS, MARGIN, PAGE_W, PAGE_H,
} from './stagiairePdfCommon'

/**
 * Catalogue des articles de la convention. Chaque entrée est identifiée par
 * un id stable et sait produire ses paragraphes à partir des infos stagiaire.
 * Utilisé à la fois pour la génération PDF et pour la boîte de personnalisation.
 */
export interface ConventionArticle {
  id:              string
  num:             string
  title:           string
  optional:        boolean  // true = décochable ; false = obligatoire
  getParagraphs:  (s: Stagiaire) => string[]
}

export const CONVENTION_ARTICLES: ConventionArticle[] = [
  {
    id: 'etudes', num: '1', title: 'ÉTUDES ET FORMATION', optional: false,
    getParagraphs: s => [
      `Nature : ${s.formation}`,
      `Durée du stage : ${dureeEnMois(s.date_debut, s.date_fin)} mois (du ${formatDateFR(s.date_debut)} au ${formatDateFR(s.date_fin)})`,
    ],
  },
  {
    id: 'objectifs', num: '2', title: 'OBJECTIFS DU STAGE', optional: true,
    getParagraphs: () => [
      "Le stage a pour objectif de permettre au stagiaire de mettre en pratique les connaissances théoriques acquises lors de sa formation, conformément aux exigences pédagogiques.",
    ],
  },
  {
    id: 'conditions', num: '3', title: 'CONDITIONS DU STAGE', optional: true,
    getParagraphs: () => [
      "Le stagiaire s'engage à :",
      "• Respecter le règlement intérieur de l'entreprise.",
      "• Maintenir un environnement de travail 100 % professionnel.",
      "• Utiliser le téléphone uniquement pendant les pauses.",
      "• Porter une tenue correcte, respectueuse et professionnelle, reflétant l'image de l'entreprise.",
      "• Adopter un comportement professionnel en toutes circonstances.",
      "• Éviter tout comportement pouvant perturber la concentration ou le bon fonctionnement de l'équipe.",
      "• Respecter l'ensemble des membres de l'équipe, sans exception.",
      "• Garantir la confidentialité des informations obtenues.",
      '',
      "L'entreprise s'engage à :",
      "• Fournir les moyens nécessaires à la réalisation des missions.",
      "• Assurer un encadrement approprié.",
      '',
      "Le stagiaire conserve son statut d'étudiant pendant toute la durée du stage et reste sous la responsabilité de son établissement d'enseignement.",
    ],
  },
  {
    id: 'secret', num: '4', title: 'SECRET PROFESSIONNEL', optional: true,
    getParagraphs: () => [
      "Conformément au Code Pénal marocain, le stagiaire est tenu au secret professionnel absolu et s'engage à ne divulguer aucune information à des tiers sans autorisation écrite de l'entreprise.",
    ],
  },
  {
    id: 'gratification', num: '5', title: 'GRATIFICATION ET MOYENS MIS À DISPOSITION', optional: true,
    getParagraphs: () => [
      "L'entreprise mettra à disposition du stagiaire les outils et ressources nécessaires à la bonne réalisation de ses missions.",
      "Elle veillera également à lui fournir un encadrement de qualité, garantissant une immersion professionnelle enrichissante et conforme aux objectifs pédagogiques du stage.",
    ],
  },
  {
    id: 'assurance', num: '6', title: 'ASSURANCE DU STAGE', optional: true,
    getParagraphs: s => [
      `${articleStagiaire(s.genre)} confirme ${quilQuelle(s.genre)} est ${couvertAccord(s.genre)} par une assurance de responsabilité civile couvrant l'ensemble des risques liés à ses activités durant le stage, que cette couverture soit fournie par son établissement de formation ou par un organisme assureur privé.`,
      `${pronomSujet(s.genre)} déclare également bénéficier d'une police d'assurance contractée auprès d'un assureur, valable pendant toute la durée du stage, incluant la responsabilité civile pour les dommages pouvant survenir dans le cadre de l'exercice de ses missions en tant que stagiaire.`,
    ],
  },
  {
    id: 'evaluation', num: '7', title: 'ÉVALUATION DU STAGE', optional: true,
    getParagraphs: () => [
      "À l'issue du stage :",
      "• Le stagiaire doit fournir un rapport de stage à son établissement.",
      "• Une copie sera remise à l'entreprise.",
      "• L'entreprise délivrera une attestation de stage.",
    ],
  },
  {
    id: 'nature', num: '8', title: 'NATURE JURIDIQUE DU STAGE', optional: true,
    getParagraphs: () => [
      "Le stage ne constitue en aucun cas un contrat de travail. Il n'entraîne aucune relation de subordination juridique permanente entre les parties.",
    ],
  },
  {
    id: 'propriete', num: '9', title: 'PROPRIÉTÉ INTELLECTUELLE', optional: true,
    getParagraphs: () => [
      "Les productions réalisées durant le stage (documents, designs, contenus, etc.) demeurent la propriété exclusive de l'entreprise, sauf accord contraire écrit.",
    ],
  },
]

/**
 * Document 2 — Convention de stage.
 * Document principal signé entre les parties (entreprise + stagiaire).
 * @param includedArticleIds Optionnel : liste blanche d'ids d'articles à inclure.
 *                            Si non fourni, tous les articles sont inclus.
 */
export async function generateConventionStage(
  s: Stagiaire,
  mode: 'download' | 'preview' = 'download',
  includedArticleIds?: string[],
): Promise<void> {
  const doc = new jsPDF('p', 'mm', 'a4')
  const logo = await loadEntrepriseLogo()

  // Filtrer et renuméroter les articles retenus
  const selected = CONVENTION_ARTICLES.filter(a =>
    !a.optional || !includedArticleIds || includedArticleIds.includes(a.id),
  )

  let y = renderPage1Header(doc, logo)
  y = renderEntrepriseBloc(doc, y)
  y = renderStagiaireBloc(doc, s, y)

  selected.forEach((a, idx) => {
    if (y > PAGE_H - 60) { doc.addPage(); y = 25 }
    y = renderArticle(doc, String(idx + 1), a.title, a.getParagraphs(s), y)
  })

  // Signatures
  if (y > PAGE_H - 55) { doc.addPage(); y = 30 }
  y += 6
  doc.setDrawColor(...COLORS.divider)
  doc.setLineWidth(0.3)
  doc.line(MARGIN, y, PAGE_W - MARGIN, y)
  y += 8

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(11)
  doc.setTextColor(...COLORS.dark)
  doc.text('SIGNATURES', MARGIN, y)
  y += 8
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)
  doc.setTextColor(...COLORS.text)
  doc.text(`Fait à : ${ENTREPRISE.ville}, le ${dateAujourdHui()}`, MARGIN, y)
  y += 14

  // Deux colonnes signatures
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(11)
  doc.text("L'Entreprise :", MARGIN, y)
  doc.text('Le Stagiaire :', PAGE_W / 2 + 10, y)
  y += 6
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.setTextColor(...COLORS.muted)
  doc.text(`${ENTREPRISE.gerant} — ${ENTREPRISE.raisonSociale}`, MARGIN, y)
  doc.text(s.nom_complet, PAGE_W / 2 + 10, y)

  // Cadres de signature
  doc.setDrawColor(...COLORS.divider)
  doc.setLineWidth(0.3)
  doc.rect(MARGIN, y + 4, 80, 28)
  doc.rect(PAGE_W / 2 + 10, y + 4, 80, 28)

  // Footer sur chaque page
  const total = doc.getNumberOfPages()
  for (let i = 1; i <= total; i++) {
    doc.setPage(i)
    drawFooter(doc)
  }

  const filename = `Convention_Stage_${safeFilename(s.nom_complet)}.pdf`
  if (mode === 'preview') {
    window.open(doc.output('bloburl') as unknown as string, '_blank')
  } else {
    doc.save(filename)
  }
}

/* ─────────────────────────────────────────────────────────────────── */

function renderPage1Header(doc: jsPDF, logo?: string | null): number {
  drawHeader(doc, logo)
  // Titre centré
  doc.setTextColor(...COLORS.dark)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(18)
  doc.text('CONVENTION DE STAGE', PAGE_W / 2, 50, { align: 'center' })
  const w = doc.getTextWidth('CONVENTION DE STAGE')
  doc.setDrawColor(...COLORS.accent)
  doc.setLineWidth(0.6)
  doc.line(PAGE_W / 2 - w / 2, 52, PAGE_W / 2 + w / 2, 52)
  return 64
}

function renderEntrepriseBloc(doc: jsPDF, y: number): number {
  drawSectionTitle(doc, "ENTREPRISE D'ACCUEIL", y)
  y += 8
  const rows: [string, string][] = [
    ['Nom',          'NEXT GITAL'],
    ['Représentée par', ENTREPRISE.gerant],
    ['Adresse',      'Rue Mohammed V, Immeuble Kissi, 4ème étage, Bureau N°7, Oujda'],
    ['Téléphone',    ENTREPRISE.telephone],
    ['Activité',     'Agence de marketing digital'],
  ]
  return drawKeyValueList(doc, rows, y) + 4
}

function renderStagiaireBloc(doc: jsPDF, s: Stagiaire, y: number): number {
  drawSectionTitle(doc, 'STAGIAIRE', y)
  y += 8
  const naissance = [formatDateFR(s.date_naissance), s.lieu_naissance].filter(Boolean).join(' ') || '—'
  const rows: [string, string][] = [
    ['Nom et prénom',                  s.nom_complet],
    ['Numéro de carte nationale',      s.cin],
    ['Date et lieu de naissance',      naissance],
    ['Adresse',                        s.adresse],
  ]
  return drawKeyValueList(doc, rows, y) + 4
}

function drawSectionTitle(doc: jsPDF, title: string, y: number): void {
  doc.setFillColor(...COLORS.primary)
  doc.rect(MARGIN, y - 4, 4, 6, 'F')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(11)
  doc.setTextColor(...COLORS.primary)
  doc.text(title, MARGIN + 7, y)
}

function drawKeyValueList(doc: jsPDF, rows: [string, string][], startY: number): number {
  let y = startY
  for (const [k, v] of rows) {
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(9.5)
    doc.setTextColor(...COLORS.muted)
    doc.text(`${k} :`, MARGIN + 2, y)

    doc.setFont('helvetica', 'normal')
    doc.setFontSize(10)
    doc.setTextColor(...COLORS.text)
    const valueLines = doc.splitTextToSize(v, PAGE_W - MARGIN * 2 - 55)
    doc.text(valueLines, MARGIN + 55, y)
    y += Math.max(5.5, valueLines.length * 4.5)
  }
  return y
}

function renderArticle(doc: jsPDF, num: string, title: string, paragraphs: string[], y: number): number {
  // Saut de page si nécessaire
  if (y > PAGE_H - 50) { doc.addPage(); y = 25 }

  // Titre article
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(10.5)
  doc.setTextColor(...COLORS.primary)
  doc.text(`ARTICLE ${num} : ${title}`, MARGIN, y)
  y += 6

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9.5)
  doc.setTextColor(...COLORS.text)

  for (const p of paragraphs) {
    if (p === '') { y += 2; continue }
    const lines = doc.splitTextToSize(p, PAGE_W - MARGIN * 2 - 2)
    // Saut de page si nécessaire au milieu d'un article
    if (y + lines.length * 4.3 > PAGE_H - 25) {
      doc.addPage()
      y = 25
    }
    doc.text(lines, MARGIN + 2, y, { align: 'justify', maxWidth: PAGE_W - MARGIN * 2 - 2 } as any)
    y += lines.length * 4.3 + 1
  }
  return y + 4
}
