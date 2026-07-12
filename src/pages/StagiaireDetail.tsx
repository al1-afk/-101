/**
 * Page détail / historique d'un stagiaire.
 *
 * Route : /:tenantSlug/stagiaire/:id
 *
 * Reprend l'intégralité de la fiche + un timeline (statut, dates, membre lié)
 * + accès rapide aux 3 documents PDF (attestation acceptation, convention,
 * attestation de stage).
 */
import { useMemo } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  ArrowLeft, Mail, Phone, MapPin, IdCard, School, Calendar, Loader2,
  User, UserRound, FileText, FileSignature, FileCheck2, Download, Eye,
  Link2, ExternalLink, Building2, GraduationCap, CalendarClock,
  CheckCircle2, Clock, XCircle,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { stagiairesApi } from '@/lib/api'
import { teamApi } from '@/lib/api'
import { cn, formatDate } from '@/lib/utils'
import { toast } from 'sonner'
import type { Stagiaire, StagiaireStatut } from '@/hooks/useStagiaires'
import type { TeamMember } from '@/hooks/useTeam'
import { generateAttestationAcceptation } from '@/lib/pdf/attestationAcceptation'
import { generateConventionStage } from '@/lib/pdf/conventionStage'
import { generateAttestationStage } from '@/lib/pdf/attestationStage'

const STATUT_CONFIG: Record<StagiaireStatut, { label: string; color: string; bg: string; dot: string; icon: React.ElementType }> = {
  accepte:  { label: 'Accepté',  color: 'text-blue-600 dark:text-blue-400',       bg: 'bg-blue-50 dark:bg-blue-500/10',       dot: 'bg-blue-500',    icon: Clock },
  en_cours: { label: 'En cours', color: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-50 dark:bg-emerald-500/10', dot: 'bg-emerald-500', icon: CheckCircle2 },
  termine:  { label: 'Terminé',  color: 'text-slate-600 dark:text-slate-300',     bg: 'bg-slate-100 dark:bg-slate-500/15',    dot: 'bg-slate-500',   icon: CheckCircle2 },
  annule:   { label: 'Annulé',   color: 'text-red-600 dark:text-red-400',         bg: 'bg-red-50 dark:bg-red-500/10',         dot: 'bg-red-500',     icon: XCircle },
}

function dureeJours(debut: string, fin: string) {
  if (!debut || !fin) return null
  const d = Math.round((new Date(fin).getTime() - new Date(debut).getTime()) / 86400000) + 1
  return d > 0 ? d : null
}

export default function StagiaireDetail() {
  const { id, tenantSlug } = useParams<{ id: string; tenantSlug: string }>()
  const navigate = useNavigate()
  const base = tenantSlug ? `/${tenantSlug}` : ''

  const stagiaireQ = useQuery<Stagiaire>({
    queryKey: ['stagiaires', id],
    queryFn:  () => stagiairesApi.get(id!) as Promise<Stagiaire>,
    enabled:  !!id,
  })
  const s = stagiaireQ.data

  /* Charge le membre lié quand présent — pour afficher la carte de rappel. */
  const memberQ = useQuery<TeamMember>({
    queryKey: ['team_members', s?.member_id],
    queryFn:  () => teamApi.get(s!.member_id!) as Promise<TeamMember>,
    enabled:  !!s?.member_id,
  })

  const timeline = useMemo(() => {
    if (!s) return []
    return [
      { date: s.created_at,  label: 'Fiche créée',   icon: FileText,   color: 'text-slate-500' },
      { date: s.date_debut,  label: 'Début du stage', icon: CalendarClock, color: 'text-blue-500' },
      { date: s.date_fin,    label: 'Fin prévue',    icon: CalendarClock, color: 'text-amber-500' },
      { date: s.updated_at,  label: 'Dernière mise à jour', icon: Clock, color: 'text-emerald-500' },
    ].filter(t => !!t.date)
     .sort((a, b) => new Date(a.date!).getTime() - new Date(b.date!).getTime())
  }, [s])

  if (stagiaireQ.isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="w-6 h-6 animate-spin text-blue-500" />
      </div>
    )
  }

  if (stagiaireQ.isError || !s) {
    return (
      <div className="p-6 max-w-2xl mx-auto space-y-4">
        <Button variant="secondary" onClick={() => navigate(`${base}/equipe`)}>
          <ArrowLeft className="w-4 h-4 mr-1.5" /> Retour aux stagiaires
        </Button>
        <div className="rounded-lg border border-red-200 bg-red-50 dark:bg-red-900/20 p-4 text-sm text-red-700 dark:text-red-300">
          Stagiaire introuvable.
        </div>
      </div>
    )
  }

  const cfg  = STATUT_CONFIG[s.statut]
  const StatutIcon = cfg.icon
  const duree = dureeJours(s.date_debut, s.date_fin)

  const runPdf = async (kind: 'acceptation' | 'convention' | 'attestation', mode: 'download' | 'preview') => {
    try {
      if (kind === 'acceptation')      await generateAttestationAcceptation(s, mode)
      else if (kind === 'convention')  await generateConventionStage(s, mode)
      else                             await generateAttestationStage(s, mode)
      toast.success(mode === 'preview' ? 'Aperçu ouvert' : 'Document téléchargé')
    } catch (e: any) {
      toast.error(e?.message ?? 'Erreur lors de la génération')
    }
  }

  return (
    <div className="p-4 md:p-6 space-y-4 max-w-6xl mx-auto">
      {/* Retour */}
      <div className="flex items-center gap-3">
        <Link to={`${base}/equipe`}>
          <Button variant="secondary" size="sm">
            <ArrowLeft className="w-4 h-4 mr-1.5" /> Équipe
          </Button>
        </Link>
      </div>

      {/* En-tête */}
      <div className="rounded-2xl border border-border bg-card p-5 flex flex-col md:flex-row md:items-center gap-5">
        <div className={cn(
          'w-20 h-20 rounded-2xl flex items-center justify-center flex-shrink-0',
          s.genre === 'femme' ? 'bg-pink-100 dark:bg-pink-500/20' : 'bg-blue-100 dark:bg-blue-500/20',
        )}>
          {s.genre === 'femme'
            ? <UserRound className="w-10 h-10 text-pink-600 dark:text-pink-400" />
            : <User      className="w-10 h-10 text-blue-600 dark:text-blue-400" />}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-bold text-foreground truncate">{s.nom_complet}</h1>
            <Badge className={cn('text-xs', cfg.color, cfg.bg)}>
              <StatutIcon className="w-3 h-3 mr-1" />
              {cfg.label}
            </Badge>
            <span className="text-xs px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-600 dark:text-blue-400 font-medium flex items-center gap-1">
              <GraduationCap className="w-3 h-3" /> Stagiaire
            </span>
          </div>
          <p className="text-sm text-muted-foreground mt-1 flex items-center gap-1.5">
            <IdCard className="w-3.5 h-3.5" /> CIN {s.cin}
          </p>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-2 text-sm text-muted-foreground">
            {s.email     && <span className="flex items-center gap-1.5"><Mail   className="w-3.5 h-3.5" /> {s.email}</span>}
            {s.telephone && <span className="flex items-center gap-1.5"><Phone  className="w-3.5 h-3.5" /> {s.telephone}</span>}
            <span className="flex items-center gap-1.5"><Calendar className="w-3.5 h-3.5" /> Créé le {formatDate(s.created_at)}</span>
          </div>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Kpi label="Début du stage" value={formatDate(s.date_debut)} icon={CalendarClock} color="text-blue-500" />
        <Kpi label="Fin du stage"   value={formatDate(s.date_fin)}   icon={CalendarClock} color="text-amber-500" />
        <Kpi label="Durée"          value={duree ? `${duree} jour${duree > 1 ? 's' : ''}` : '—'} icon={Clock} color="text-emerald-500" />
        <Kpi label="Établissement"  value={s.etablissement || '—'}  icon={Building2} color="text-purple-500" truncate />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Colonne principale : détails */}
        <div className="lg:col-span-2 space-y-4">
          {/* Identité complète */}
          <Card title="Identité" icon={User}>
            <Row label="Nom complet"     value={s.nom_complet} />
            <Row label="Genre"           value={s.genre === 'femme' ? 'Femme' : 'Homme'} />
            <Row label="CIN"             value={s.cin} />
            <Row label="Date de naissance" value={s.date_naissance ? formatDate(s.date_naissance) : '—'} />
            <Row label="Lieu de naissance" value={s.lieu_naissance || '—'} />
          </Card>

          {/* Coordonnées */}
          <Card title="Coordonnées" icon={Mail}>
            <Row label="Email"     value={s.email || '—'} />
            <Row label="Téléphone" value={s.telephone || '—'} />
            <Row label="Adresse" value={
              s.adresse
                ? <span className="flex items-center gap-1.5"><MapPin className="w-3.5 h-3.5" /> {s.adresse}</span>
                : '—'
            } />
          </Card>

          {/* Formation & Stage */}
          <Card title="Formation & Stage" icon={School}>
            <Row label="Établissement" value={s.etablissement} />
            <Row label="Formation"     value={s.formation} />
            <Row label="Département d'accueil" value={s.departement} />
            <Row label="Statut" value={
              <Badge className={cn('text-xs', cfg.color, cfg.bg)}>
                <StatutIcon className="w-3 h-3 mr-1" />
                {cfg.label}
              </Badge>
            } />
          </Card>

          {/* Notes internes */}
          {s.notes && (
            <Card title="Notes internes" icon={FileText}>
              <p className="text-sm text-foreground whitespace-pre-wrap">{s.notes}</p>
            </Card>
          )}
        </div>

        {/* Colonne latérale */}
        <div className="space-y-4">
          {/* Timeline */}
          <Card title="Historique" icon={Clock}>
            <ol className="relative border-l border-border ml-2 space-y-3">
              {timeline.map((t, i) => {
                const Icon = t.icon
                return (
                  <li key={i} className="ml-4">
                    <span className="absolute -left-[7px] w-3 h-3 rounded-full border-2 border-background bg-current opacity-60" style={{ color: 'currentColor' }} />
                    <div className="flex items-center gap-2">
                      <Icon className={cn('w-3.5 h-3.5', t.color)} />
                      <span className="text-xs font-medium text-foreground">{t.label}</span>
                    </div>
                    <p className="text-[11px] text-muted-foreground mt-0.5">{formatDate(t.date!)}</p>
                  </li>
                )
              })}
            </ol>
          </Card>

          {/* Membre lié (compte plateforme) */}
          <Card title="Compte plateforme" icon={Link2}>
            {s.member_id && memberQ.data ? (
              <Link
                to={`${base}/equipe/${s.member_id}`}
                className="flex items-center gap-2.5 p-2 -m-2 rounded-lg hover:bg-accent/50 transition-colors"
              >
                <div className="w-9 h-9 rounded-full bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center text-white text-[11px] font-bold flex-shrink-0">
                  {((memberQ.data.prenom?.[0] ?? '') + (memberQ.data.nom?.[0] ?? '')).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">{memberQ.data.prenom} {memberQ.data.nom}</p>
                  <p className="text-[11px] text-muted-foreground truncate">{memberQ.data.email || 'sans email'}</p>
                </div>
                <ExternalLink className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
              </Link>
            ) : (
              <p className="text-[12px] text-muted-foreground">
                Aucun compte plateforme rattaché. Vous pouvez l'inviter depuis <strong>Espace équipe</strong>.
              </p>
            )}
          </Card>

          {/* Documents */}
          <Card title="Documents officiels" icon={FileText}>
            <div className="space-y-2">
              <DocRow
                label="Attestation d'acceptation"
                hint="Avant le début du stage"
                icon={FileText}
                iconColor="text-blue-500"
                onPreview={() => runPdf('acceptation', 'preview')}
                onDownload={() => runPdf('acceptation', 'download')}
              />
              <DocRow
                label="Convention de stage"
                hint="Contrat signé entre parties"
                icon={FileSignature}
                iconColor="text-emerald-500"
                onPreview={() => runPdf('convention', 'preview')}
                onDownload={() => runPdf('convention', 'download')}
              />
              <DocRow
                label="Attestation de stage"
                hint="Fin de stage"
                icon={FileCheck2}
                iconColor="text-amber-500"
                onPreview={() => runPdf('attestation', 'preview')}
                onDownload={() => runPdf('attestation', 'download')}
              />
            </div>
          </Card>
        </div>
      </div>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════════
   SOUS-COMPOSANTS
═══════════════════════════════════════════════════════════════════ */

function Kpi({ label, value, icon: Icon, color, truncate }: {
  label: string; value: React.ReactNode; icon: React.ElementType; color: string; truncate?: boolean
}) {
  return (
    <div className="card-premium p-3 flex items-center gap-3">
      <div className={cn('w-9 h-9 rounded-lg bg-muted/50 flex items-center justify-center', color)}>
        <Icon className="w-4 h-4" />
      </div>
      <div className="min-w-0">
        <p className={cn('text-sm font-bold text-foreground', truncate && 'truncate')}>{value}</p>
        <p className="text-[11px] text-muted-foreground">{label}</p>
      </div>
    </div>
  )
}

function Card({ title, icon: Icon, children }: { title: string; icon: React.ElementType; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <div className="flex items-center gap-2 mb-3 pb-2 border-b border-border">
        <Icon className="w-4 h-4 text-muted-foreground" />
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
      </div>
      <div className="space-y-2">{children}</div>
    </div>
  )
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="grid grid-cols-3 gap-3 text-sm items-start">
      <dt className="text-xs text-muted-foreground pt-0.5">{label}</dt>
      <dd className="col-span-2 text-foreground break-words">{value ?? '—'}</dd>
    </div>
  )
}

function DocRow({ label, hint, icon: Icon, iconColor, onPreview, onDownload }: {
  label: string
  hint:  string
  icon:  React.ElementType
  iconColor: string
  onPreview: () => void
  onDownload: () => void
}) {
  return (
    <div className="flex items-center gap-2 p-2 rounded-lg hover:bg-muted/40 transition-colors">
      <Icon className={cn('w-4 h-4 flex-shrink-0', iconColor)} />
      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium text-foreground truncate">{label}</p>
        <p className="text-[10.5px] text-muted-foreground truncate">{hint}</p>
      </div>
      <button
        type="button"
        onClick={onPreview}
        className="w-7 h-7 flex items-center justify-center rounded-md text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-950/30"
        title="Aperçu"
      >
        <Eye className="w-3.5 h-3.5" />
      </button>
      <button
        type="button"
        onClick={onDownload}
        className="w-7 h-7 flex items-center justify-center rounded-md text-emerald-500 hover:bg-emerald-50 dark:hover:bg-emerald-950/30"
        title="Télécharger"
      >
        <Download className="w-3.5 h-3.5" />
      </button>
    </div>
  )
}
