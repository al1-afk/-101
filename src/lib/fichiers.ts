/**
 * Petits outils de présentation et d'enregistrement des fichiers.
 *
 * Ces trois gestes étaient recopiés dans quatre composants (discussion
 * de projet, messagerie privée, pièces jointes d'étape SOP), avec des
 * variantes silencieuses : le délai de libération du blob allait de
 * l'immédiat à dix secondes selon l'endroit, et un blob libéré trop tôt
 * annule le téléchargement sur Safari — un bug qui ne se voit que sur
 * les gros fichiers, chez un utilisateur sur dix.
 */

/** Taille lisible, en français : « 842 o », « 37 Ko », « 5.5 Mo ». */
export function tailleLisible(octets: number | string): string {
  const n = Number(octets) || 0
  if (n < 1024) return `${n} o`
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} Ko`
  return `${(n / 1024 / 1024).toFixed(1)} Mo`
}

/* Étiquettes courtes des types que la plateforme accepte. Le type MIME
   brut (« application/vnd.openxmlformats-officedocument.… ») ne se lit
   pas dans une colonne de tableau. */
const ETIQUETTES: Record<string, string> = {
  'application/pdf': 'PDF',
  'image/png': 'PNG', 'image/jpeg': 'JPEG', 'image/gif': 'GIF',
  'image/webp': 'WEBP', 'image/avif': 'AVIF', 'image/bmp': 'BMP',
  'image/heic': 'HEIC', 'image/heif': 'HEIF',
  'text/plain': 'TXT', 'text/csv': 'CSV', 'application/rtf': 'RTF',
  'application/msword': 'DOC',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'DOCX',
  'application/vnd.ms-excel': 'XLS',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'XLSX',
  'application/vnd.ms-powerpoint': 'PPT',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'PPTX',
  'application/vnd.oasis.opendocument.text': 'ODT',
  'application/vnd.oasis.opendocument.spreadsheet': 'ODS',
  'application/vnd.oasis.opendocument.presentation': 'ODP',
  'application/zip': 'ZIP', 'application/x-rar-compressed': 'RAR',
  'audio/mpeg': 'MP3', 'audio/mp4': 'M4A', 'audio/ogg': 'OGG',
  'audio/wav': 'WAV', 'audio/webm': 'WEBM', 'audio/aac': 'AAC',
  'video/mp4': 'MP4', 'video/webm': 'WEBM', 'video/quicktime': 'MOV',
}

/**
 * Format affichable d'un fichier.
 *
 * Le serveur range sous `application/octet-stream` tout type qu'il ne
 * reconnaît pas — la protection est volontaire (cf. server/lib/
 * fichiersMime.ts), mais afficher « OCTET-STREAM » dans une colonne
 * « Format » ne renseigne personne. On retombe alors sur l'extension du
 * nom, qui est ce que l'utilisateur a sous les yeux dans son
 * explorateur de fichiers.
 */
export function formatLisible(mime: string | null | undefined, nom = ''): string {
  const m = (mime ?? '').split(';')[0].trim().toLowerCase()
  const connu = ETIQUETTES[m]
  if (connu) return connu
  const ext = nom.includes('.') ? nom.split('.').pop()! : ''
  if (ext && ext.length <= 5) return ext.toUpperCase()
  if (m && m !== 'application/octet-stream') return m.split('/').pop()!.toUpperCase().slice(0, 8)
  return 'Fichier'
}

/**
 * Enregistre sur le disque de l'utilisateur un contenu déjà récupéré
 * sous forme d'URL blob.
 *
 * Le contenu passe par l'API authentifiée : on ne peut donc pas poser
 * l'URL du serveur dans un `<a download>` — le navigateur n'y joindrait
 * pas le jeton. D'où le détour par un blob local.
 *
 * La libération est différée : révoquer l'URL trop tôt annule un
 * téléchargement qui n'a pas encore démarré. Dix secondes couvrent le
 * cas du gros fichier sur un disque lent.
 */
export function enregistrerSurLeDisque(urlBlob: string, nomFichier: string): void {
  const a = document.createElement('a')
  a.href = urlBlob
  a.download = nomFichier
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(urlBlob), 10_000)
}
