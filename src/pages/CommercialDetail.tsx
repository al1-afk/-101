/**
 * Fiche d'un commercial — /:tenantSlug/commerciaux/:userId
 *
 * ── Pourquoi une fiche distincte de celle d'Équipe ─────────────────
 * EquipeMemberDetail répond à « qui est cette personne » : contrat,
 * congés, salaire, SOP. Cette fiche-ci répond à « que fait-elle
 * commercialement, et jusqu'où a-t-elle le droit d'aller ». Les deux
 * cohabitent sur la même personne sans se recouvrir, et l'onglet
 * « Accès et permissions » est le seul endroit d'où l'on ouvre ou ferme
 * le CRM de quelqu'un.
 *
 * ── L'identité affichée ────────────────────────────────────────────
 * Un commercial peut venir de deux mondes : une fiche employé
 * (team_members, connexion /team-login) ou un compte d'espace
 * (tenant_users, connexion /auth). Le champ `kind` les sépare, et
 * l'en-tête le dit — sans quoi on chercherait en vain un employé dans
 * Équipe alors qu'il s'agit d'un administrateur.
 */
import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import {
  ArrowLeft, Mail, Phone, Building2, CalendarDays, Loader2, AlertCircle,
  RefreshCw, ShieldCheck, Users, Handshake, Activity, TrendingUp, UserCog,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import CrmPermissionsPanel from '@/components/commerciaux/CrmPermissionsPanel'
import ProspectsAssignesTab from '@/components/commerciaux/ProspectsAssignesTab'
import ActivitesTab from '@/components/commerciaux/ActivitesTab'
import PerformanceTab from '@/components/commerciaux/PerformanceTab'
import { commercialsApi, type CrmClient } from '@/lib/api'
import { cn, formatCurrency } from '@/lib/utils'

const fmtDate = (d?: string | null) =>
  d ? new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'

export default function CommercialDetail() {
  const { tenantSlug, userId } = useParams<{ tenantSlug: string; userId: string }>()
  const navigate = useNavigate()
  const base = tenantSlug ? `/${tenantSlug}` : ''

  /* MÊME clé que CrmPermissionsPanel : la requête est partagée, et
     l'écriture optimiste du panneau rafraîchit l'en-tête du même coup. */
  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['commercial', userId],
    queryFn:  () => commercialsApi.get(userId as string),
    enabled:  !!userId,
  })

  const c = data?.commercial

  if (isLoading) {
    return <div className="flex justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-blue-600" /></div>
  }

  if (isError || !c) {
    return (
      <div className="space-y-4">
        <Retour base={base} />
        <div className="rounded-xl border border-border bg-card p-10 text-center">
          <AlertCircle className="w-8 h-8 text-amber-500 mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">
            {(error as Error)?.message ?? 'Ce commercial est introuvable.'}
          </p>
          <Button variant="outline" size="sm" className="mt-4 gap-1.5" onClick={() => refetch()}>
            <RefreshCw className="w-3.5 h-3.5" /> Réessayer
          </Button>
        </div>
      </div>
    )
  }

  const initiales = c.name.split(' ').filter(Boolean).slice(0, 2).map(x => x[0]).join('').toUpperCase()

  return (
    <div className="space-y-4">
      <Retour base={base} />

      {/* ── En-tête ─────────────────────────────────────────────── */}
      <motion.div
        initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
        className="card-premium p-5"
      >
        <div className="flex items-start gap-4 flex-wrap">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-500 to-violet-600
                          flex items-center justify-center text-white text-xl font-bold flex-shrink-0">
            {initiales || '?'}
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-xl font-bold text-foreground truncate">{c.name}</h1>
              <span className={cn(
                'text-[11px] px-2 py-0.5 rounded-full font-semibold',
                c.crm_enabled
                  ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
                  : 'bg-slate-500/10 text-slate-600 dark:text-slate-300',
              )}>
                {c.crm_enabled ? '● Accès CRM actif' : '○ Accès CRM inactif'}
              </span>
              <span className="text-[11px] px-2 py-0.5 rounded-full font-semibold bg-blue-500/10 text-blue-700 dark:text-blue-300">
                {c.kind === 'member' ? 'Employé' : "Compte d'administration"}
              </span>
              {c.status && (
                <span className="text-[11px] px-2 py-0.5 rounded-full font-semibold bg-muted text-muted-foreground">
                  {c.status}
                </span>
              )}
            </div>

            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] text-muted-foreground">
              <span className="flex items-center gap-1.5"><Mail className="w-3.5 h-3.5" />{c.email}</span>
              {c.phone && <span className="flex items-center gap-1.5"><Phone className="w-3.5 h-3.5" />{c.phone}</span>}
              {c.department && <span className="flex items-center gap-1.5"><Building2 className="w-3.5 h-3.5" />{c.department}</span>}
              <span className="flex items-center gap-1.5"><CalendarDays className="w-3.5 h-3.5" />Arrivé le {fmtDate(c.hired_at)}</span>
            </div>
          </div>

          {/* La fiche RH reste à sa place : on y renvoie, on ne la recopie pas. */}
          {c.kind === 'member' && c.team_member_id && (
            <Button asChild variant="outline" size="sm" className="gap-1.5">
              <Link to={`${base}/equipe/${c.team_member_id}`}>
                <UserCog className="w-3.5 h-3.5" /> Fiche employé
              </Link>
            </Button>
          )}
        </div>

        {/* Les quatre chiffres qui résument son portefeuille. */}
        <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Compteur label="Prospects" valeur={c.counts?.prospects ?? 0} />
          <Compteur label="Clients"   valeur={c.counts?.clients ?? 0} />
          <Compteur label="Devis"     valeur={c.counts?.devis ?? 0} />
          <Compteur label="Conversions" valeur={c.counts?.conversions ?? 0} accent />
        </div>
      </motion.div>

      {/* ── Onglets ─────────────────────────────────────────────── */}
      <Tabs defaultValue="acces" className="space-y-4">
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="acces"><ShieldCheck className="w-4 h-4 mr-1.5" /> Accès et permissions</TabsTrigger>
          <TabsTrigger value="prospects"><Users className="w-4 h-4 mr-1.5" /> Prospects attribués</TabsTrigger>
          <TabsTrigger value="clients"><Handshake className="w-4 h-4 mr-1.5" /> Clients</TabsTrigger>
          <TabsTrigger value="activites"><Activity className="w-4 h-4 mr-1.5" /> Activités</TabsTrigger>
          <TabsTrigger value="performance"><TrendingUp className="w-4 h-4 mr-1.5" /> Performance</TabsTrigger>
        </TabsList>

        <TabsContent value="acces">
          <CrmPermissionsPanel userId={c.user_id} nom={c.name} />
        </TabsContent>
        <TabsContent value="prospects">
          <ProspectsAssignesTab userId={c.user_id} nom={c.name} />
        </TabsContent>
        <TabsContent value="clients">
          <ClientsTab userId={c.user_id} nom={c.name} />
        </TabsContent>
        <TabsContent value="activites">
          <ActivitesTab userId={c.user_id} nom={c.name} />
        </TabsContent>
        <TabsContent value="performance">
          <PerformanceTab userId={c.user_id} nom={c.name} />
        </TabsContent>
      </Tabs>
    </div>
  )
}

/* ── Briques locales ────────────────────────────────────────────── */

function Retour({ base }: { base: string }) {
  return (
    <Link
      to={`${base}/commerciaux`}
      className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
    >
      <ArrowLeft className="w-4 h-4" /> Les commerciaux
    </Link>
  )
}

function Compteur({ label, valeur, accent }: { label: string; valeur: number; accent?: boolean }) {
  return (
    <div className={cn(
      'rounded-lg px-3 py-2',
      accent ? 'bg-emerald-500/10' : 'bg-muted',
    )}>
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={cn(
        'text-lg font-bold mt-0.5 tabular-nums',
        accent ? 'text-emerald-700 dark:text-emerald-300' : 'text-foreground',
      )}>{valeur}</p>
    </div>
  )
}

/**
 * Clients suivis. Volontairement en lecture seule : réattribuer un client
 * n'est pas un geste de cette fiche — il se fait depuis le client
 * lui-même, là où l'on voit son contexte complet.
 */
function ClientsTab({ userId, nom }: { userId: string; nom: string }) {
  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['commercial-clients', userId],
    queryFn:  () => commercialsApi.clients(userId),
    enabled:  !!userId,
  })

  if (isLoading) {
    return <div className="flex justify-center py-12"><Loader2 className="w-5 h-5 animate-spin text-blue-600" /></div>
  }
  if (isError) {
    return (
      <div className="rounded-xl border border-border bg-card p-8 text-center">
        <AlertCircle className="w-7 h-7 text-amber-500 mx-auto mb-2" />
        <p className="text-sm text-muted-foreground">{(error as Error)?.message ?? 'Clients indisponibles'}</p>
        <Button variant="outline" size="sm" className="mt-3 gap-1.5" onClick={() => refetch()}>
          <RefreshCw className="w-3.5 h-3.5" /> Réessayer
        </Button>
      </div>
    )
  }

  const clients = data?.clients ?? []
  if (clients.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-card p-10 text-center">
        <Handshake className="w-8 h-8 text-muted-foreground/40 mx-auto mb-3" />
        <p className="text-sm font-medium text-foreground">Aucun client suivi</p>
        <p className="text-xs text-muted-foreground mt-1 max-w-md mx-auto">
          {nom} n'a pas encore de client rattaché. Un client lui revient soit par attribution
          directe, soit automatiquement lorsqu'il convertit l'un de ses prospects.
        </p>
      </div>
    )
  }

  return (
    <div className="rounded-xl border border-border bg-card divide-y divide-border">
      {clients.map((cl: CrmClient) => (
        <div key={cl.id} className="p-3 flex items-center gap-3">
          <span className="w-9 h-9 rounded-full bg-gradient-to-br from-blue-500 to-violet-600
                           text-white text-[11px] font-bold flex items-center justify-center flex-shrink-0">
            {cl.nom.slice(0, 2).toUpperCase()}
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-foreground truncate">{cl.nom}</p>
            <p className="text-[11px] text-muted-foreground truncate">
              {[cl.entreprise, cl.telephone, cl.email].filter(Boolean).join(' · ') || '—'}
            </p>
          </div>
          {typeof cl.montant_ttc_annuel === 'number' && cl.montant_ttc_annuel > 0 && (
            <span className="text-[12px] font-semibold text-foreground whitespace-nowrap">
              {formatCurrency(cl.montant_ttc_annuel)}
            </span>
          )}
        </div>
      ))}
    </div>
  )
}
