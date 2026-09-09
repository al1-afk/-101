/**
 * POLITIQUE DE TYPES DE FICHIERS — une seule, pour tous les modules.
 *
 * ── Ce que ce fichier protège ───────────────────────────────────────
 * Le type MIME arrive dans l'en-tête `content-type` de celui qui
 * téléverse : c'est une DÉCLARATION, rien n'oblige un « image/png » à
 * contenir une image. Le danger n'est pas théorique : un fichier
 * « photo.svg » contenant <script>, renvoyé plus tard avec son type
 * d'origine et `Content-Disposition: inline`, s'exécute dans l'ORIGINE
 * de l'application — le client transforme la réponse en
 * `URL.createObjectURL(blob)`, et une URL blob: hérite de l'origine du
 * document. Le script y lit alors le jeton de la personne qui a
 * simplement cliqué sur la vignette.
 *
 * D'où deux listes blanches, et jamais une liste noire :
 *   • à l'ENTRÉE, un type inconnu est stocké sous un type anonyme —
 *     le fichier est conservé, mais il ne pourra plus se présenter
 *     comme autre chose que du binaire ;
 *   • à la SORTIE, seuls les types de MIME_AFFICHABLES peuvent s'ouvrir
 *     dans le navigateur. Le SVG n'en fait pas partie et n'en fera
 *     jamais partie : c'est un document XML qui exécute du script.
 *
 * ── Pourquoi c'est ici et plus dans messages.ts ─────────────────────
 * Ces constantes et ce raisonnement vivaient dans la messagerie privée.
 * Le chat de projet, lui, renvoyait le type déclaré tel quel : la même
 * pièce jointe était donc traitée avec deux niveaux de rigueur selon la
 * porte par laquelle elle entrait. Une règle de sécurité recopiée est
 * une règle qui finit par diverger — celle-ci n'existe désormais qu'une
 * fois, et la bibliothèque de fichiers du projet en hérite d'office.
 */
import type { Response } from 'express'

/** Ce qu'on accepte de stocker sous son vrai type. */
export const MIME_AUTORISES = new Set([
  /* Images matricielles — aucun script possible dans le format. */
  'image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/avif',
  'image/bmp', 'image/heic', 'image/heif',
  /* Documents */
  'application/pdf', 'text/plain', 'text/csv', 'application/rtf',
  /* Bureautique */
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/vnd.oasis.opendocument.text',
  'application/vnd.oasis.opendocument.spreadsheet',
  'application/vnd.oasis.opendocument.presentation',
  /* Archives */
  'application/zip', 'application/x-rar-compressed',
  /* Audio & vidéo courants (message vocal, capture d'écran filmée) */
  'audio/mpeg', 'audio/mp4', 'audio/ogg', 'audio/wav', 'audio/webm', 'audio/aac',
  'video/mp4', 'video/webm', 'video/quicktime',
])

/* Appellations rencontrées dans la nature (vieux navigateurs, Windows) :
   on les ramène au type canonique plutôt que de dégrader inutilement un
   fichier parfaitement légitime. Sans cette table, une photo envoyée
   depuis un vieil appareil en « image/jpg » était stockée comme du
   binaire et refusait de s'afficher en vignette. */
const ALIAS_MIME: Record<string, string> = {
  'image/jpg':                     'image/jpeg',
  'image/pjpeg':                   'image/jpeg',
  'image/x-png':                   'image/png',
  'application/x-zip-compressed':  'application/zip',
  'application/x-pdf':             'application/pdf',
  'audio/mp3':                     'audio/mpeg',
  'audio/x-wav':                   'audio/wav',
  'audio/wave':                    'audio/wav',
  'text/rtf':                      'application/rtf',
}

/** Ce qui peut s'afficher DANS le navigateur sans rien pouvoir exécuter. */
export const MIME_AFFICHABLES = new Set([
  'image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/avif', 'image/bmp',
  'application/pdf',
])

export const BINAIRE_ANONYME = 'application/octet-stream'

/**
 * Type retenu à l'enregistrement. Un type absent de la liste blanche
 * n'interdit PAS le fichier — il le rend seulement inoffensif : il sera
 * stocké et resservi comme du binaire, donc téléchargé, jamais ouvert.
 *
 * Appliqué DEUX fois — à l'envoi (ce qu'on stocke) et au téléchargement
 * (ce qu'on sert) : les lignes écrites avant ce garde-fou portent encore
 * n'importe quoi.
 */
export function normaliserMime(brut: unknown): string {
  /* Les paramètres (« ; charset=utf-8 ») ne participent pas à la
     décision et servent surtout à masquer un type derrière un autre. */
  const base  = String(brut ?? '').split(';')[0].trim().toLowerCase()
  const canon = ALIAS_MIME[base] ?? base
  return MIME_AUTORISES.has(canon) ? canon : BINAIRE_ANONYME
}

/**
 * Pose les en-têtes d'un téléchargement de fichier privé.
 *
 * `inlineDemande` n'est qu'une DEMANDE : l'affichage dans le navigateur
 * n'est accordé que si le type figure dans MIME_AFFICHABLES. Les lignes
 * enregistrées avant ce durcissement portent encore le type déclaré par
 * leur expéditeur — ce contrôle à la sortie les couvre aussi.
 *
 * Renvoie le nom de flux à utiliser (aucun effet de bord au-delà des
 * en-têtes) pour que l'appelant reste maître du corps de la réponse.
 */
export function entetesFichier(
  res: Response,
  f: { filename: string; mime: string; size_bytes: string | number },
  inlineDemande: boolean,
): void {
  const affichable = MIME_AFFICHABLES.has(f.mime)
  const inline = inlineDemande && affichable

  res.setHeader('Content-Type', affichable ? f.mime : BINAIRE_ANONYME)
  res.setHeader('Content-Length', String(f.size_bytes))
  res.setHeader(
    'Content-Disposition',
    `${inline ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(f.filename)}`,
  )
  /* Le navigateur ne doit JAMAIS deviner le type à la place du serveur :
     sans cet en-tête, un fichier annoncé binaire mais commençant par
     « <html » peut être rendu comme une page. */
  res.setHeader('X-Content-Type-Options', 'nosniff')
  /* Dernier rempart pour ce qui s'affiche. Le PDF en est exempté : son
     lecteur intégré a besoin de son propre bac à sable et cesserait de
     fonctionner sous celui-ci. */
  if (f.mime !== 'application/pdf') {
    res.setHeader('Content-Security-Policy', "sandbox; default-src 'none'; img-src 'self' data:")
  }
  /* Contenu privé : aucun cache partagé ne doit le garder. */
  res.setHeader('Cache-Control', 'private, max-age=3600')
}
