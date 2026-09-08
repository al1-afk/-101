/**
 * RACINE DE STOCKAGE DES FICHIERS — et son diagnostic au démarrage.
 *
 * ── Pourquoi ce fichier existe ──────────────────────────────────────
 * Le 2026-09-08, les 23 pièces jointes du chat de projet (62 Mo) ont
 * disparu d'un coup : le conteneur de production n'avait AUCUN volume
 * monté sur `/app/uploads`. Les fichiers vivaient donc dans la couche
 * inscriptible du conteneur, que chaque redéploiement détruit. La base
 * gardait les lignes, l'interface montrait les bulles, et le
 * téléchargement répondait « 404 » — sans que rien, nulle part, n'ait
 * signalé la perte.
 *
 * Le montage se règle dans l'hébergeur, pas ici. Ce que le code PEUT
 * faire, c'est refuser de perdre des fichiers en silence : au démarrage,
 * on confronte ce que la base annonce à ce que le disque contient, et on
 * crie si les deux se contredisent. Mieux vaut l'apprendre au boot que
 * le jour où quelqu'un clique sur « télécharger ».
 *
 * La constante était recopiée dans quatre fichiers (projetChat,
 * messages, mySpaceSops, crud). Quatre copies d'un chemin, c'est trois
 * occasions qu'il diverge : le diagnostic aurait alors surveillé un
 * dossier que personne n'écrit.
 */
import { mkdir, stat } from 'node:fs/promises'
import path from 'node:path'
import { query } from '../db/pool'
import { logger } from './logger'

/** Racine de stockage — volume de l'hébergeur en production. */
export const UPLOAD_DIR = process.env.UPLOAD_DIR
  || (process.env.NODE_ENV === 'production' ? '/app/uploads' : path.resolve(process.cwd(), 'uploads'))

/** Tables qui référencent un fichier posé sur cette racine. */
const TABLES_FICHIERS = [
  { table: 'projet_message_files', libelle: 'pièces jointes du chat de projet' },
  { table: 'dm_files',             libelle: 'pièces jointes de la messagerie' },
  { table: 'sop_images',           libelle: 'images des SOP' },
] as const

interface Etat {
  annonces: number
  verifies: number
  absents:  number
}

/**
 * Compare ce que la base annonce à ce que le disque contient.
 *
 * On ne parcourt pas le dossier : sur un stockage sain il peut porter
 * des dizaines de milliers de fichiers, et le démarrage n'a pas à les
 * compter. On vérifie un ÉCHANTILLON — les plus récents, c'est-à-dire
 * exactement ceux qu'un redéploiement vient d'emporter.
 *
 * La requête passe par `query()` et non `tenantQuery()` : il s'agit d'un
 * diagnostic d'exploitation, pas d'une lecture métier — il doit voir
 * TOUS les espaces, et il ne renvoie jamais de contenu, seulement des
 * comptes et des chemins.
 */
async function etatDe(table: string, echantillon: number): Promise<Etat | null> {
  let annonces = 0
  let recents: Array<{ storage_path: string }> = []
  try {
    const [{ n }] = await query<{ n: string }>(`SELECT count(*)::text AS n FROM public.${table}`)
    annonces = Number(n)
    if (!annonces) return { annonces: 0, verifies: 0, absents: 0 }
    recents = await query<{ storage_path: string }>(
      `SELECT storage_path FROM public.${table} ORDER BY created_at DESC LIMIT $1`,
      [echantillon],
    )
  } catch (e: any) {
    /* Table absente (42P01) = migration pas encore appliquée sur cette
       base. Ce n'est pas une panne de stockage, on ne dit rien. */
    if (e?.code !== '42P01') logger.error(`[stockage] ${table} illisible —`, e?.message)
    return null
  }

  let absents = 0
  for (const r of recents) {
    if (!r.storage_path) continue
    try { await stat(path.join(UPLOAD_DIR, r.storage_path)) }
    catch { absents++ }
  }
  return { annonces, verifies: recents.length, absents }
}

/**
 * À appeler UNE fois au démarrage. N'échoue jamais : un diagnostic qui
 * empêche l'API de démarrer serait pire que le problème qu'il signale.
 */
export async function verifierStockageFichiers(echantillon = 5): Promise<void> {
  try {
    /* Créer la racine si elle manque : les écritures la créent déjà à la
       volée, mais un dossier présent au boot rend le diagnostic lisible
       (« vide » plutôt que « inexistant »). */
    await mkdir(UPLOAD_DIR, { recursive: true })

    let totalAnnonces = 0
    let totalAbsents  = 0
    let totalVerifies = 0
    const details: string[] = []

    for (const { table, libelle } of TABLES_FICHIERS) {
      const etat = await etatDe(table, echantillon)
      if (!etat || !etat.annonces) continue
      totalAnnonces += etat.annonces
      totalAbsents  += etat.absents
      totalVerifies += etat.verifies
      if (etat.absents) details.push(`${etat.absents}/${etat.verifies} ${libelle} introuvables sur le disque`)
    }

    if (!totalAnnonces) {
      logger.info(`[stockage] ${UPLOAD_DIR} — aucune pièce jointe en base, rien à vérifier`)
      return
    }

    if (!totalAbsents) {
      logger.info(`[stockage] ${UPLOAD_DIR} — ${totalAnnonces} fichier(s) en base, ${totalVerifies} vérifié(s), tous présents`)
      return
    }

    /* Tout l'échantillon manquant = le stockage a été remis à zéro
       (conteneur sans volume). Une partie seulement = suppressions
       manuelles ou incident isolé : on le dit sans dramatiser. */
    const total = totalAbsents === totalVerifies
    logger.error(
      `[stockage] ${total ? 'STOCKAGE VIDE' : 'FICHIERS MANQUANTS'} — ${details.join(' ; ')}. ` +
      `Racine : ${UPLOAD_DIR}. La base référence ${totalAnnonces} fichier(s) que le disque n'a plus.` +
      (total
        ? ` Cause la plus probable : aucun volume persistant n'est monté sur cette racine, et le redéploiement`
          + ` a effacé la couche du conteneur. Montez un volume sur ${UPLOAD_DIR} avant tout nouvel envoi,`
          + ` sinon les prochains fichiers disparaîtront de la même façon.`
        : ''),
    )
  } catch (e: any) {
    logger.error('[stockage] diagnostic impossible —', e?.message)
  }
}
