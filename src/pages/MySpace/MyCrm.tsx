/**
 * /my-space/crm — l'espace CRM du commercial.
 *
 * ── La règle du module ─────────────────────────────────────────────
 * « Un commercial ne doit voir et utiliser que ce que l'administrateur
 * lui a explicitement autorisé. » Cet écran l'applique d'une seule
 * façon : il demande ses droits EFFECTIFS au serveur
 * (GET /api/my-space/crm/permissions) et n'affiche que ce qu'ils
 * autorisent. Il ne recalcule rien, ne déduit rien d'un rôle, ne
 * connaît même pas les règles de cumul des capacités — le serveur a
 * décidé, l'écran obéit.
 *
 * C'est exactement le patron déjà employé par MySops.tsx avec
 * /api/my-space/sops/editable-categories, et c'est le seul qui garantit
 * que l'écran promet précisément ce que l'API accorde.
 *
 * ── Masquer n'est pas protéger ─────────────────────────────────────
 * Chaque route de /api/my-space/crm revérifie les droits via
 * peutAcceder(). Ce fichier n'épargne que des clics voués à un 403 ; il
 * ne constitue en aucun cas la protection.
 */
import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import {
  Loader2, Lock, Users, Building2, FileText, AlertCircle, RefreshCw, Search,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { myCrmApi, type CrmClient, type CrmDevis } from './crm/contratCrm'
import ProspectsListe, { messageErreur } from './crm/ProspectsListe'
import ProspectFiche from './crm/ProspectFiche'
import { cn, formatCurrency } from '@/lib/utils'

export const CLE_PERMISSIONS = ['my-space', 'crm', 'permissions'] as const

type Onglet = 'prospects' | 'clients' | 'devis'

export default function MyCrm() {
  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: CLE_PERMISSIONS,
    queryFn:  () => myCrmApi.permissions(),
    /* Les droits changent rarement, mais un retrait doit se voir vite :
       une minute est le compromis entre « à jour » et « ne harcèle pas
       le serveur à chaque changement d'onglet ». */
    staleTime: 60_000,
    retry: false,
  })

  const [onglet, setOnglet]   = useState<Onglet | null>(null)
  const [ficheId, setFicheId] = useState<string | null>(null)

  const can          = data?.can
  const capabilities = useMemo(() => (data?.capabilities ?? []) as string[], [data])

  /* Les onglets réellement ouverts. L'ordre est celui du métier :
     on prospecte, puis on suit des clients, puis on chiffre. */
  const onglets = useMemo(() => {
    if (!can) return [] as { id: Onglet; label: string; icone: React.ElementType }[]
    const liste: { id: Onglet; label: string; icone: React.ElementType }[] = []
    if (can.prospects_view) liste.push({ id: 'prospects', label: 'Prospects', icone: Users })
    if (can.clients_view)   liste.push({ id: 'clients',   label: 'Clients',   icone: Building2 })
    if (can.devis_view)     liste.push({ id: 'devis',     label: 'Devis',     icone: FileText })
    return liste
  }, [can])

  const actif: Onglet | null = onglet ?? onglets[0]?.id ?? null

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
      </div>
    )
  }

  if (isError) {
    return (
      <EtatSimple
        icone={AlertCircle}
        titre="Impossible de charger votre CRM"
        texte={messageErreur(error, 'Réessayez dans un instant.')}
        action={<Button variant="outline" size="sm" className="gap-1.5" onClick={() => refetch()}>
          <RefreshCw className="w-3.5 h-3.5" /> Réessayer
        </Button>}
      />
    )
  }

  /* Pas d'accès : on l'explique posément, sans détail technique. Le
     serveur refuse déjà tout ; cet écran ne fait qu'éviter à la personne
     de croire à une panne. */
  if (!data?.enabled || !can) {
    return (
      <EtatSimple
        icone={Lock}
        titre="Le CRM n'est pas activé pour votre compte"
        texte="Votre administrateur peut vous y donner accès depuis « Les commerciaux »."
      />
    )
  }

  if (onglets.length === 0) {
    return (
      <EtatSimple
        icone={Lock}
        titre="Aucun module CRM ne vous est ouvert"
        texte="L'accès au CRM vous a été accordé, mais aucune section (prospects, clients, devis) n'est encore autorisée."
      />
    )
  }

  /* Une fiche ouverte prend tout l'écran : au téléphone, deux niveaux
     visibles en même temps ne tiennent pas. */
  if (ficheId && can.prospects_view) {
    return (
      <ProspectFiche
        prospectId={ficheId}
        can={can}
        capabilities={capabilities}
        onRetour={() => setFicheId(null)}
      />
    )
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
          <Users className="w-6 h-6 text-blue-500" /> CRM
        </h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Vos prospects et votre suivi commercial.
        </p>
      </div>

      {onglets.length > 1 && (
        <div className="flex items-center gap-1.5 flex-wrap">
          {onglets.map(o => (
            <button
              key={o.id}
              onClick={() => setOnglet(o.id)}
              className={cn(
                'inline-flex items-center gap-1.5 h-9 px-3.5 rounded-lg text-[13px] font-medium transition-colors',
                actif === o.id
                  ? 'bg-blue-600 text-white'
                  : 'text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700',
              )}
            >
              <o.icone className="w-4 h-4" /> {o.label}
            </button>
          ))}
        </div>
      )}

      <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.18 }}>
        {actif === 'prospects' && <ProspectsListe can={can} onOuvrir={setFicheId} />}
        {actif === 'clients'   && <ListeClients />}
        {actif === 'devis'     && <ListeDevis />}
      </motion.div>
    </div>
  )
}

/* ── Clients ────────────────────────────────────────────────────────
   Volontairement en lecture seule : le cahier des charges n'ouvre au
   commercial que la consultation de ses clients. Créer ou modifier un
   client reste un geste d'administration. */
function ListeClients() {
  const [recherche, setRecherche] = useState('')
  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['my-space', 'crm', 'clients'],
    queryFn:  () => myCrmApi.clients({ limit: 500 }),
    retry: false,
  })

  const clients = useMemo(() => {
    const liste = data?.clients ?? []
    const q = recherche.trim().toLowerCase()
    if (!q) return liste
    return liste.filter(c =>
      [c.nom, c.entreprise, c.email, c.telephone].some(v => (v ?? '').toLowerCase().includes(q)))
  }, [data, recherche])

  if (isLoading) return <Chargement />
  if (isError) return <ErreurBloc message={messageErreur(error, 'Clients indisponibles')} onRetry={refetch} />

  return (
    <div className="space-y-3">
      <ChampRecherche valeur={recherche} onChange={setRecherche} placeholder="Rechercher un client…" />
      {clients.length === 0 ? (
        <VideBloc texte="Aucun client ne vous est rattaché pour le moment." />
      ) : (
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 divide-y divide-slate-100 dark:divide-slate-800">
          {clients.map(c => <LigneClient key={c.id} c={c} />)}
        </div>
      )}
    </div>
  )
}

function LigneClient({ c }: { c: CrmClient }) {
  return (
    <div className="p-3 flex items-center gap-3">
      <span className="w-9 h-9 rounded-full bg-gradient-to-br from-blue-500 to-violet-600 text-white
                       text-[11px] font-bold flex items-center justify-center flex-shrink-0">
        {c.nom.slice(0, 2).toUpperCase()}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">{c.nom}</p>
        <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
          {[c.entreprise, c.telephone, c.email].filter(Boolean).join(' · ') || '—'}
        </p>
      </div>
      {typeof c.montant_ttc_annuel === 'number' && c.montant_ttc_annuel > 0 && (
        <span className="text-[12px] font-semibold text-slate-700 dark:text-slate-200 whitespace-nowrap">
          {formatCurrency(c.montant_ttc_annuel)}
        </span>
      )}
    </div>
  )
}

/* ── Devis ─────────────────────────────────────────────────────── */
const TON_DEVIS: Record<string, string> = {
  brouillon: 'bg-slate-500/10 text-slate-600 dark:text-slate-300',
  envoye:    'bg-blue-500/10 text-blue-700 dark:text-blue-300',
  accepte:   'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
  refuse:    'bg-red-500/10 text-red-700 dark:text-red-300',
  expire:    'bg-amber-500/10 text-amber-700 dark:text-amber-300',
}

function ListeDevis() {
  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['my-space', 'crm', 'devis'],
    queryFn:  () => myCrmApi.devis({ limit: 500 }),
    retry: false,
  })
  if (isLoading) return <Chargement />
  if (isError) return <ErreurBloc message={messageErreur(error, 'Devis indisponibles')} onRetry={refetch} />

  const devis = data?.devis ?? []
  if (devis.length === 0) return <VideBloc texte="Aucun devis ne vous est rattaché pour le moment." />

  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 divide-y divide-slate-100 dark:divide-slate-800">
      {devis.map((d: CrmDevis) => (
        <div key={d.id} className="p-3 flex items-center gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">
              {d.numero}{d.client_nom ? ` · ${d.client_nom}` : ''}
            </p>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              {new Date(d.date_emission).toLocaleDateString('fr-FR')}
            </p>
          </div>
          <span className={cn('text-[11px] px-2 py-0.5 rounded-full font-semibold', TON_DEVIS[d.statut] ?? '')}>
            {d.statut}
          </span>
          <span className="text-[12px] font-semibold text-slate-700 dark:text-slate-200 whitespace-nowrap">
            {formatCurrency(d.montant_ttc)}
          </span>
        </div>
      ))}
    </div>
  )
}

/* ── Briques d'état ─────────────────────────────────────────────── */

function EtatSimple({ icone: Icone, titre, texte, action }: {
  icone: React.ElementType; titre: string; texte: string; action?: React.ReactNode
}) {
  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-10 text-center">
      <Icone className="w-9 h-9 text-slate-300 dark:text-slate-600 mx-auto mb-3" />
      <p className="text-base font-semibold text-slate-800 dark:text-slate-100">{titre}</p>
      <p className="text-sm text-slate-500 dark:text-slate-400 mt-1 max-w-md mx-auto">{texte}</p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}

const Chargement = () => (
  <div className="flex justify-center py-12"><Loader2 className="w-5 h-5 animate-spin text-blue-600" /></div>
)

const VideBloc = ({ texte }: { texte: string }) => (
  <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-8 text-center">
    <p className="text-sm text-slate-500 dark:text-slate-400">{texte}</p>
  </div>
)

const ErreurBloc = ({ message, onRetry }: { message: string; onRetry: () => void }) => (
  <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-8 text-center">
    <AlertCircle className="w-7 h-7 text-amber-500 mx-auto mb-2" />
    <p className="text-sm text-slate-600 dark:text-slate-300">{message}</p>
    <Button variant="outline" size="sm" className="mt-3 gap-1.5" onClick={onRetry}>
      <RefreshCw className="w-3.5 h-3.5" /> Réessayer
    </Button>
  </div>
)

const ChampRecherche = ({ valeur, onChange, placeholder }: {
  valeur: string; onChange: (v: string) => void; placeholder: string
}) => (
  <div className="relative">
    <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
    <Input className="pl-9" value={valeur} placeholder={placeholder}
           onChange={e => onChange(e.target.value)} />
  </div>
)
