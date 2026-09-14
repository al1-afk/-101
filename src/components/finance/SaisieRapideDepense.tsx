/**
 * SAISIE RAPIDE D'UNE DÉPENSE — version téléphone, un seul écran.
 *
 * ── Le problème ─────────────────────────────────────────────────────
 * Le formulaire complet empile sept champs sur toute la largeur, dont
 * six catégories l'une sous l'autre : sur un téléphone, enregistrer une
 * dépense demandait trois écrans de défilement et une dizaine de
 * gestes. Une dépense se note en marchant, à la caisse, entre deux
 * rendez-vous — si c'est long, on ne le fait pas, et le rappel de 22 h
 * arrive tous les soirs pour rien.
 *
 * ── Ce qui rend celui-ci rapide ─────────────────────────────────────
 * 1. Le montant est le PREMIER champ, en grand, avec le clavier
 *    numérique ouvert d'office : c'est la seule donnée qu'on ne peut
 *    pas deviner.
 * 2. Les six catégories tiennent en deux rangées de trois.
 * 3. La date, le compte et le type sont préremplis et repliés — on ne
 *    les touche que pour les changer.
 * 4. Après l'enregistrement, la catégorie, le compte et le type RESTENT :
 *    la dépense suivante ne coûte qu'un nombre et une touche. Le curseur
 *    revient de lui-même sur le montant.
 *
 * ── Une seule saisie, désormais, sur TOUS les écrans ────────────────
 * Le formulaire long qu'il a remplacé portait exactement les mêmes six
 * champs — montant, date, compte, catégorie, type, note — répartis sur
 * trois écrans de défilement. Deux formulaires pour les mêmes données,
 * c'est deux endroits où corriger un bug, et un jour où ils divergent.
 * Celui-ci sert les deux : trois catégories par rangée sur téléphone,
 * six d'un coup dès qu'il y a la place.
 */
import { useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Loader2, Check, CalendarDays, ChevronDown } from 'lucide-react'
import { toast } from 'sonner'
import { Input } from '@/components/ui/input'
import { toISODateLocal, round2 } from '@/lib/finance/compute'

export interface CategorieDepense {
  key: string
  label: string
  emoji: string
}

export interface CompteRapide {
  id: string
  nom: string
  icon?: string | null
}

interface Props {
  categories: readonly CategorieDepense[]
  comptes: CompteRapide[]
  /** Enregistre et rend la promesse — l'écran attend sa résolution. */
  onEnregistrer: (d: {
    montant: number
    date_depense: string
    bank_account_id: string | null
    categorie: string
    type: 'personnel' | 'business'
    description: string | null
  }) => Promise<unknown>
  enCours?: boolean
}

/* Le dernier choix est plus souvent le bon que le premier de la liste :
   on dépense plusieurs fois de suite depuis le même compte, dans la même
   catégorie. Mémorisé par appareil, jamais envoyé au serveur. */
const MEMOIRE = 'depense_rapide_dernier'

function lireMemoire(): { categorie?: string; compte?: string; type?: string } {
  try { return JSON.parse(localStorage.getItem(MEMOIRE) || '{}') } catch { return {} }
}

export default function SaisieRapideDepense({ categories, comptes, onEnregistrer, enCours }: Props) {
  const memoire = lireMemoire()

  const [montant, setMontant]   = useState('')
  const [categorie, setCategorie] = useState(memoire.categorie ?? categories[0]?.key ?? 'autre')
  const [compte, setCompte]     = useState(memoire.compte ?? '')
  const [type, setType]         = useState<'personnel' | 'business'>(
    memoire.type === 'business' ? 'business' : 'personnel')
  const [date, setDate]         = useState(toISODateLocal(new Date()))
  const [note, setNote]         = useState('')
  const [dateOuverte, setDateOuverte] = useState(false)
  const [succes, setSucces]     = useState(false)
  const champMontant = useRef<HTMLInputElement>(null)

  /* ── Le compte retenu se DÉDUIT, il ne se règle pas ───────────────
     Les comptes arrivent souvent APRÈS le premier rendu (requête en
     vol), et le dernier compte mémorisé peut avoir été supprimé depuis.
     Corriger cela dans un effet demanderait d'écrire un état juste
     après le rendu — un second rendu pour rien, et une liste qui
     clignote. On calcule donc la valeur affichée à partir de ce qu'on
     a sous la main ; `compte` ne garde que le choix EXPLICITE. */
  const compteRetenu = compte && comptes.some(c => c.id === compte)
    ? compte
    : (comptes[0]?.id ?? '')

  const valide = Number(String(montant).replace(',', '.')) > 0

  const enregistrer = async () => {
    const n = Number(String(montant).replace(',', '.'))
    if (!Number.isFinite(n) || n <= 0 || enCours) return
    try {
      await onEnregistrer({
        montant: round2(n),
        date_depense: date,
        bank_account_id: compteRetenu || null,
        categorie,
        type,
        description: note.trim() || null,
      })
      try {
        localStorage.setItem(MEMOIRE, JSON.stringify({ categorie, compte: compteRetenu, type }))
      } catch { /* stockage refusé : la saisie marche quand même */ }

      /* On garde catégorie, compte et type : la dépense suivante ne
         coûte qu'un nombre. */
      setMontant('')
      setNote('')
      setSucces(true)
      setTimeout(() => setSucces(false), 1400)
      champMontant.current?.focus()
      toast.success(`${n.toLocaleString('fr-FR')} DH enregistrés`)
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Enregistrement impossible')
    }
  }

  const aujourdhui = toISODateLocal(new Date())

  return (
    <div className="space-y-3">
      {/* ── Montant ─────────────────────────────────────────────── */}
      <div className="relative">
        <input
          ref={champMontant}
          /* `decimal` et non `numeric` : le clavier affiche la virgule,
             indispensable pour 12,50 DH. */
          inputMode="decimal"
          autoFocus
          value={montant}
          onChange={e => setMontant(e.target.value.replace(/[^\d.,]/g, ''))}
          onKeyDown={e => { if (e.key === 'Enter' && valide) void enregistrer() }}
          placeholder="0"
          aria-label="Montant en dirhams"
          className="w-full h-20 rounded-2xl border-2 border-border bg-background
                     text-center text-4xl font-bold tabular-nums text-foreground
                     placeholder:text-muted-foreground/40
                     focus:outline-none focus:border-blue-500 transition-colors"
        />
        <span className="absolute right-5 top-1/2 -translate-y-1/2 text-lg font-semibold text-muted-foreground">
          DH
        </span>
      </div>

      {/* ── Catégories : deux rangées de trois ───────────────────── */}
      <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
        {categories.map(c => {
          const actif = categorie === c.key
          return (
            <button
              key={c.key}
              type="button"
              onClick={() => setCategorie(c.key)}
              className={`flex flex-col items-center justify-center gap-1 py-3 rounded-xl border text-[11px] font-semibold transition-all ${
                actif
                  ? 'bg-blue-600 text-white border-blue-600 shadow-sm scale-[1.02]'
                  : 'bg-background text-foreground border-border active:scale-95'
              }`}
            >
              <span className="text-xl leading-none">{c.emoji}</span>
              <span className="truncate w-full text-center px-1">{c.label.split(' ')[0]}</span>
            </button>
          )
        })}
      </div>

      {/* ── Compte · type · date, sur une seule ligne ────────────── */}
      <div className="flex items-center gap-2">
        {comptes.length > 0 && (
          <div className="relative flex-1 min-w-0">
            <select
              value={compteRetenu}
              onChange={e => setCompte(e.target.value)}
              aria-label="Payé depuis"
              className="w-full appearance-none h-11 pl-3 pr-8 rounded-xl border border-border bg-background
                         text-sm text-foreground truncate focus:outline-none focus:border-blue-500"
            >
              {comptes.map(a => (
                <option key={a.id} value={a.id}>{a.icon || '🏦'} {a.nom}</option>
              ))}
            </select>
            <ChevronDown className="w-4 h-4 absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
          </div>
        )}

        <div className="flex rounded-xl border border-border overflow-hidden h-11 flex-shrink-0">
          {([['personnel', '👤'], ['business', '💼']] as const).map(([v, e]) => (
            <button
              key={v}
              type="button"
              onClick={() => setType(v)}
              aria-label={v}
              className={`px-3 text-base transition-colors ${
                type === v ? 'bg-blue-600 text-white' : 'bg-background text-muted-foreground'
              }`}
            >
              {e}
            </button>
          ))}
        </div>

        <button
          type="button"
          onClick={() => setDateOuverte(v => !v)}
          className={`h-11 px-3 rounded-xl border text-xs font-medium flex items-center gap-1.5 flex-shrink-0 transition-colors ${
            date === aujourdhui
              ? 'border-border bg-background text-muted-foreground'
              : 'border-amber-500/50 bg-amber-500/10 text-amber-700 dark:text-amber-300'
          }`}
        >
          <CalendarDays className="w-3.5 h-3.5" />
          {date === aujourdhui ? "Auj." : date.slice(8, 10) + '/' + date.slice(5, 7)}
        </button>
      </div>

      {/* La date ne prend de la place que si on la demande. */}
      <AnimatePresence>
        {dateOuverte && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
          >
            <Input type="date" value={date} onChange={e => setDate(e.target.value)} className="h-11" />
          </motion.div>
        )}
      </AnimatePresence>

      <Input
        value={note}
        onChange={e => setNote(e.target.value)}
        placeholder="Note (facultatif)"
        className="h-11"
      />

      {/* ── Enregistrer ─────────────────────────────────────────── */}
      <button
        type="button"
        onClick={() => void enregistrer()}
        disabled={!valide || enCours}
        className={`w-full h-14 rounded-2xl text-base font-bold flex items-center justify-center gap-2 transition-all ${
          succes
            ? 'bg-emerald-600 text-white'
            : valide
              ? 'bg-blue-600 text-white active:scale-[0.98]'
              : 'bg-muted text-muted-foreground'
        }`}
      >
        {enCours
          ? <Loader2 className="w-5 h-5 animate-spin" />
          : succes
            ? <><Check className="w-5 h-5" /> Enregistré</>
            : 'Enregistrer'}
      </button>

      <p className="text-[11px] text-center text-muted-foreground">
        La catégorie et le compte restent choisis — la dépense suivante ne demande qu'un montant.
      </p>
    </div>
  )
}
