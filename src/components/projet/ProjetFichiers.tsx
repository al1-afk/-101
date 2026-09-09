/**
 * ONGLET « FICHIERS » D'UN PROJET — la bibliothèque de l'espace.
 *
 * « Quand un employé m'envoie un fichier par e-mail ou par Google Drive,
 * je veux pouvoir le déposer ici, le retrouver, le télécharger sur mon
 * ordinateur et le supprimer — sans retourner fouiller ma boîte mail. »
 *
 * ── Ce que cet écran montre, et pourquoi ────────────────────────────
 * TOUS les fichiers du projet : ceux déposés ici, ET les pièces jointes
 * de la discussion, marquées d'un libellé. Masquer ces dernières
 * obligerait à les chercher dans le fil — c'est-à-dire à retourner
 * fouiller ailleurs, exactement ce que cet écran existe pour supprimer.
 *
 * ── Ce qu'il ne décide pas ──────────────────────────────────────────
 * Le droit de supprimer. Le serveur le calcule et le renvoie
 * (`peut_supprimer`, avec la même règle que la route DELETE) : l'écran
 * n'affiche le bouton que là où il aboutira, sans jamais deviner la
 * règle de son côté. Masquer n'a jamais protégé quoi que ce soit — la
 * route refuse de toute façon.
 */
import { useCallback, useMemo, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Upload, Download, Trash2, Loader2, FileText, MessageSquare,
  AlertCircle, HardDriveDownload,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { toast } from 'sonner'
import { projetChatApi, type ChatFile } from '@/lib/api'
import { tailleLisible, formatLisible, enregistrerSurLeDisque } from '@/lib/fichiers'

/** Date d'ajout : jour + heure. « Ajouté le » sans l'heure ne permet pas
 *  de distinguer deux versions déposées le même jour. */
function dateLisible(iso: string): string {
  const d = new Date(iso)
  if (isNaN(d.getTime())) return '—'
  return d.toLocaleString('fr-FR', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

interface Props {
  projetId: string
  /** Quel coffre à jetons : espace d'administration ou espace membre. */
  as?: 'admin' | 'member'
}

export default function ProjetFichiers({ projetId, as = 'admin' }: Props) {
  const qc = useQueryClient()
  /* useMemo : sans lui, la clé est un tableau neuf à chaque rendu, et la
     mémoïsation de `deposer` tombe à chaque frappe. */
  const cle = useMemo(() => ['projet-fichiers', projetId, as] as const, [projetId, as])

  const { data: fichiers = [], isLoading, isError, error } = useQuery<ChatFile[]>({
    queryKey: cle,
    queryFn:  () => projetChatApi.listFiles(projetId, as),
    staleTime: 30_000,
  })

  const [enCours, setEnCours]   = useState<string[]>([])
  const [survol, setSurvol]     = useState(false)
  const [aSupprimer, setASupprimer] = useState<ChatFile | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  /* ── Dépôt ───────────────────────────────────────────────────────
     Un fichier par requête : le corps de la requête EST le fichier
     (aucun multipart), c'est la convention de tout le dépôt. On les
     enchaîne donc, en montrant lesquels sont en vol. */
  const deposer = useCallback(async (liste: FileList | File[]) => {
    const files = Array.from(liste)
    if (!files.length) return
    setEnCours(p => [...p, ...files.map(f => f.name)])
    let reussis = 0
    for (const f of files) {
      try {
        await projetChatApi.uploadFile(projetId, f, as, 'bibliotheque')
        reussis++
      } catch (e: unknown) {
        toast.error(`${f.name} — ${e instanceof Error ? e.message : 'import impossible'}`)
      } finally {
        setEnCours(p => p.filter(n => n !== f.name))
      }
    }
    if (reussis) {
      toast.success(`${reussis} fichier${reussis > 1 ? 's' : ''} importé${reussis > 1 ? 's' : ''}`)
      qc.invalidateQueries({ queryKey: cle })
    }
  }, [projetId, as, qc, cle])

  /* ── Téléchargement ──────────────────────────────────────────────
     Le contenu passe par l'API authentifiée : on récupère un blob, puis
     on le pose dans un lien de téléchargement (cf. src/lib/fichiers.ts). */
  const [telechargement, setTelechargement] = useState<string | null>(null)
  const telecharger = async (f: ChatFile) => {
    setTelechargement(f.id)
    try {
      const url = await projetChatApi.fileBlobUrl(f.id, as, false)
      enregistrerSurLeDisque(url, f.filename)
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Téléchargement impossible')
    } finally {
      setTelechargement(null)
    }
  }

  const suppression = useMutation({
    mutationFn: (f: ChatFile) => projetChatApi.deleteFile(f.id, as),
    onSuccess: (_d, f) => {
      toast.success(`« ${f.filename} » supprimé`)
      setASupprimer(null)
      qc.invalidateQueries({ queryKey: cle })
      /* La pièce jointe d'un message disparaît aussi du fil : sa bulle
         est déjà chargée ailleurs, il faut la relire. */
      qc.invalidateQueries({ queryKey: ['projet-chat', projetId] })
    },
    onError: (e: unknown) => {
      toast.error(e instanceof Error ? e.message : 'Suppression impossible')
    },
  })

  const total = fichiers.reduce((s, f) => s + (Number(f.size_bytes) || 0), 0)

  return (
    <div className="space-y-4">
      {/* ── Zone de dépôt ─────────────────────────────────────────── */}
      <div
        onDragOver={e => { e.preventDefault(); setSurvol(true) }}
        onDragLeave={() => setSurvol(false)}
        onDrop={e => {
          e.preventDefault()
          setSurvol(false)
          if (e.dataTransfer?.files?.length) void deposer(e.dataTransfer.files)
        }}
        onClick={() => inputRef.current?.click()}
        className={`rounded-xl border-2 border-dashed px-6 py-8 text-center cursor-pointer transition-colors ${
          survol
            ? 'border-blue-500 bg-blue-500/5'
            : 'border-border hover:border-blue-500/50 hover:bg-muted/30'
        }`}
      >
        <input
          ref={inputRef}
          type="file"
          multiple
          className="hidden"
          onChange={e => {
            if (e.target.files?.length) void deposer(e.target.files)
            e.target.value = ''
          }}
        />
        <Upload className="w-7 h-7 mx-auto mb-2 text-muted-foreground" />
        <p className="text-sm font-medium text-foreground">
          Glissez vos fichiers ici, ou cliquez pour les choisir
        </p>
        <p className="text-xs text-muted-foreground mt-1">
          Le fichier reste dans l'espace de ce projet — vous pourrez le retrouver,
          le télécharger ou le supprimer à tout moment.
        </p>
      </div>

      {/* Imports en vol */}
      <AnimatePresence>
        {enCours.map(nom => (
          <motion.div
            key={nom}
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="flex items-center gap-2 px-3 py-2 rounded-lg bg-blue-500/10 border border-blue-500/30 text-xs"
          >
            <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-500" />
            <span className="truncate">Import de {nom}…</span>
          </motion.div>
        ))}
      </AnimatePresence>

      {/* ── Liste ─────────────────────────────────────────────────── */}
      {isLoading ? (
        <div className="py-12 text-center">
          <Loader2 className="w-5 h-5 animate-spin mx-auto text-muted-foreground" />
        </div>
      ) : isError ? (
        <div className="card-premium p-6 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-foreground">Fichiers indisponibles</p>
            <p className="text-xs text-muted-foreground mt-1">
              {error instanceof Error ? error.message : 'Erreur inconnue'}
            </p>
          </div>
        </div>
      ) : fichiers.length === 0 ? (
        <div className="py-12 text-center">
          <HardDriveDownload className="w-10 h-10 text-muted-foreground opacity-30 mx-auto mb-3" />
          <p className="text-sm font-medium text-foreground">Aucun fichier dans ce projet</p>
          <p className="text-xs text-muted-foreground mt-1">
            Déposez ici les documents reçus par e-mail ou par Google Drive.
          </p>
        </div>
      ) : (
        <div className="card-premium overflow-hidden">
          <div className="flex items-center justify-between px-4 py-2.5 border-b border-border bg-muted/20">
            <p className="text-xs text-muted-foreground">
              <span className="font-semibold text-foreground">{fichiers.length}</span>
              {' '}fichier{fichiers.length > 1 ? 's' : ''} · {tailleLisible(total)}
            </p>
          </div>
          <div className="table-scroll">
            <table className="w-full text-sm">
              <thead className="table-header">
                <tr>
                  <th>Nom</th>
                  <th className="w-24">Format</th>
                  <th className="w-24">Taille</th>
                  <th className="w-44">Ajouté le</th>
                  <th className="w-40">Par</th>
                  <th className="w-24 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                <AnimatePresence initial={false}>
                  {fichiers.map(f => (
                    <motion.tr
                      key={f.id}
                      layout
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0, x: -12 }}
                      className="table-row"
                    >
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2 min-w-0">
                          <FileText className="w-4 h-4 flex-shrink-0 text-muted-foreground" />
                          <span className="truncate font-medium text-foreground" title={f.filename}>
                            {f.filename}
                          </span>
                          {f.origine === 'chat' && (
                            <span
                              title="Pièce jointe envoyée dans la discussion du projet"
                              className="inline-flex items-center gap-1 flex-shrink-0 px-1.5 py-0.5 rounded-full bg-violet-500/15 text-violet-600 dark:text-violet-300 text-[10px] font-bold"
                            >
                              <MessageSquare className="w-2.5 h-2.5" /> Discussion
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className="inline-flex px-2 py-0.5 rounded-md bg-muted text-[11px] font-semibold text-muted-foreground">
                          {formatLisible(f.mime, f.filename)}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">{tailleLisible(f.size_bytes)}</td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">{dateLisible(f.created_at)}</td>
                      <td className="px-4 py-3 text-xs text-muted-foreground truncate" title={f.uploader_name}>
                        {f.uploader_name}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            type="button"
                            onClick={() => telecharger(f)}
                            disabled={telechargement === f.id}
                            title={`Télécharger « ${f.filename} » sur mon ordinateur`}
                            className="inline-flex items-center justify-center w-8 h-8 rounded-md text-muted-foreground hover:text-blue-600 dark:hover:text-blue-400 hover:bg-blue-500/10 transition-colors disabled:opacity-50"
                          >
                            {telechargement === f.id
                              ? <Loader2 className="w-4 h-4 animate-spin" />
                              : <Download className="w-4 h-4" />}
                            <span className="sr-only">Télécharger</span>
                          </button>
                          {(f as { peut_supprimer?: boolean }).peut_supprimer !== false && (
                            <button
                              type="button"
                              onClick={() => setASupprimer(f)}
                              title={`Supprimer « ${f.filename} »`}
                              className="inline-flex items-center justify-center w-8 h-8 rounded-md text-muted-foreground hover:text-red-600 dark:hover:text-red-400 hover:bg-red-500/10 transition-colors"
                            >
                              <Trash2 className="w-4 h-4" />
                              <span className="sr-only">Supprimer</span>
                            </button>
                          )}
                        </div>
                      </td>
                    </motion.tr>
                  ))}
                </AnimatePresence>
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Confirmation de suppression ───────────────────────────── */}
      <Dialog open={!!aSupprimer} onOpenChange={o => { if (!o) setASupprimer(null) }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-500">
              <Trash2 className="w-5 h-5" /> Supprimer ce fichier ?
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-1">
            <p className="text-sm text-muted-foreground">
              <span className="font-semibold text-foreground">{aSupprimer?.filename}</span>{' '}
              sera retiré du projet et son contenu effacé du serveur. Cette action est
              irréversible{aSupprimer?.origine === 'chat'
                ? ' — le fichier disparaîtra aussi du message qui le portait.'
                : '.'}
            </p>
            <div className="flex justify-end gap-3">
              <Button variant="secondary" size="sm" onClick={() => setASupprimer(null)}>
                Annuler
              </Button>
              <Button
                size="sm"
                className="bg-red-500 hover:bg-red-600 text-white border-0"
                disabled={suppression.isPending}
                onClick={() => aSupprimer && suppression.mutate(aSupprimer)}
              >
                {suppression.isPending
                  ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  : <Trash2 className="w-3.5 h-3.5" />}
                Supprimer
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
