/**
 * La fiche d'un prospect, côté commercial.
 *
 * ── Ce que cet écran n'est pas ─────────────────────────────────────
 * Ce n'est pas la fiche de l'administration (src/pages/ProspectDetail.tsx,
 * 1 200 lignes) : celle-là montre tout à quelqu'un qui a le droit de tout
 * voir. Ici, chaque bloc n'apparaît que si la capacité correspondante a
 * été accordée, et l'écran ne décide de rien — il obéit aux droits
 * effectifs calculés par le serveur (GET /api/my-space/crm/permissions).
 *
 * ── Masquer n'est pas protéger ─────────────────────────────────────
 * Tout ce qui est caché ici est AUSSI refusé par le serveur, qui
 * revérifie chaque geste via peutAcceder(). Ce fichier ne fait
 * qu'épargner à l'utilisateur des boutons qui échoueraient. Un écart
 * d'une seconde reste possible — l'administrateur peut retirer un droit
 * pendant que la page est ouverte — d'où le message clair sur 403 plutôt
 * qu'une erreur brute.
 */
import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import {
  ArrowLeft, Building2, Mail, Phone, Loader2, AlertCircle, RefreshCw,
  Pencil, Check, X, MessageSquare, PhoneCall, CalendarClock, UserCheck,
  StickyNote, Send, History, Sparkles,
} from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  myCrmApi,
  type CrmActivity, type MyCrmAbilities, type MyCrmActivityType,
  type MyCrmProspectInput,
} from './contratCrm'
import {
  STATUTS, statutInfo, versContrat, CLE_PROSPECTS,
  messageErreur, dateFr, versInputDate,
  type StatutProspect,
} from './ProspectsListe'
import { cn, formatCurrency } from '@/lib/utils'

/* Les quatre gestes de journalisation, chacun derrière SA capacité.
   Le serveur les vérifie une par une : un commercial autorisé à noter
   mais pas à enregistrer un appel doit voir un seul bouton. */
const GESTES: {
  type:       MyCrmActivityType
  capacite:   string
  label:      string
  icone:      React.ElementType
  placeholder: string
  ton:        string
}[] = [
  { type: 'note',     capacite: 'activities.note',     label: 'Note',
    icone: StickyNote, placeholder: 'Ce qu\'il faut retenir…',
    ton: 'text-slate-600 dark:text-slate-300 bg-slate-500/10 border-slate-500/20' },
  { type: 'appel',    capacite: 'activities.call',     label: 'Appel',
    icone: PhoneCall,  placeholder: 'Ce qui s\'est dit pendant l\'appel…',
    ton: 'text-blue-700 dark:text-blue-300 bg-blue-500/10 border-blue-500/20' },
  { type: 'whatsapp', capacite: 'activities.whatsapp', label: 'WhatsApp',
    icone: MessageSquare, placeholder: 'Le message envoyé ou reçu…',
    ton: 'text-emerald-700 dark:text-emerald-300 bg-emerald-500/10 border-emerald-500/20' },
  { type: 'relance',  capacite: 'activities.followup', label: 'Relance',
    icone: CalendarClock, placeholder: 'Ce qu\'il faudra dire au prochain contact…',
    ton: 'text-amber-700 dark:text-amber-300 bg-amber-500/10 border-amber-500/20' },
]

const ICONE_ACTIVITE: Record<string, React.ElementType> = {
  note: StickyNote, appel: PhoneCall, whatsapp: MessageSquare, email: Mail,
  rdv: CalendarClock, relance: CalendarClock, creation: Sparkles,
  statut: History, edit: Pencil,
}

export default function ProspectFiche({
  prospectId, can, capabilities, onRetour,
}: {
  prospectId:   string
  can:          MyCrmAbilities
  capabilities: string[]
  onRetour:     () => void
}) {
  const qc = useQueryClient()
  const cle = useMemo(() => [...CLE_PROSPECTS, prospectId] as const, [prospectId])

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: cle,
    queryFn:  () => myCrmApi.prospect(prospectId),
    retry:    false,
  })

  const prospect   = data?.prospect
  const activites  = useMemo(() => data?.activities ?? [], [data])

  /* ── Modification ────────────────────────────────────────────── */
  const [enEdition, setEnEdition] = useState(false)
  const [form, setForm] = useState<Partial<MyCrmProspectInput>>({})

  /* Le formulaire se recharge quand la fiche change — sinon on éditerait
     les champs du prospect précédent après une navigation. */
  useEffect(() => {
    if (!prospect) return
    setForm({
      nom:            prospect.nom,
      email:          prospect.email,
      telephone:      prospect.telephone,
      entreprise:     prospect.entreprise,
      statut:         prospect.statut,
      valeur_estimee: prospect.valeur_estimee,
      source:         prospect.source,
      notes:          prospect.notes,
      date_relance:   versInputDate(prospect.date_relance ?? prospect.relance_at),
    })
    setEnEdition(false)
  }, [prospect])

  const invalider = () => {
    void qc.invalidateQueries({ queryKey: cle })
    void qc.invalidateQueries({ queryKey: CLE_PROSPECTS })
  }

  const mEdit = useMutation({
    mutationFn: (patch: Partial<MyCrmProspectInput>) => myCrmApi.updateProspect(prospectId, patch),
    onSuccess: () => { toast.success('Fiche enregistrée'); setEnEdition(false); invalider() },
    onError: (e) => toast.error(messageErreur(e, 'Modification refusée')),
  })

  const mActivite = useMutation({
    mutationFn: (v: { type: MyCrmActivityType; contenu: string; date_relance?: string | null }) =>
      myCrmApi.logActivity(prospectId, v),
    onSuccess: () => { toast.success('Activité enregistrée'); setSaisie(null); setTexte(''); invalider() },
    onError: (e) => toast.error(messageErreur(e, 'Enregistrement refusé')),
  })

  const mConvert = useMutation({
    mutationFn: () => myCrmApi.convert(prospectId),
    onSuccess: () => { toast.success('Prospect converti en client'); invalider() },
    onError: (e) => toast.error(messageErreur(e, 'Conversion refusée')),
  })

  /* ── Saisie d'activité ───────────────────────────────────────── */
  const [saisie, setSaisie] = useState<MyCrmActivityType | null>(null)
  const [texte, setTexte]   = useState('')
  const [dateRelance, setDateRelance] = useState('')

  const gestesAutorises = GESTES.filter(g =>
    can.activities_create && capabilities.includes(g.capacite))

  /* ── États ───────────────────────────────────────────────────── */
  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
      </div>
    )
  }

  if (isError || !prospect) {
    /* Un 403 n'est pas une panne : la fiche existe, elle est simplement
       hors du périmètre accordé. Le dire évite de chercher un bug. */
    const msg = messageErreur(error, 'Fiche indisponible')
    const horsPerimetre = /403|refus|accès/i.test(msg)
    return (
      <div className="space-y-4">
        <BoutonRetour onRetour={onRetour} />
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-8 text-center">
          <AlertCircle className="w-8 h-8 text-amber-500 mx-auto mb-3" />
          <p className="text-sm text-slate-600 dark:text-slate-300">
            {horsPerimetre
              ? "Ce prospect ne fait pas partie de ceux qui vous sont attribués."
              : msg}
          </p>
          {!horsPerimetre && (
            <Button variant="outline" size="sm" className="mt-4 gap-1.5" onClick={() => refetch()}>
              <RefreshCw className="w-3.5 h-3.5" /> Réessayer
            </Button>
          )}
        </div>
      </div>
    )
  }

  const st = statutInfo(prospect.statut)
  const dejaConverti = !!(prospect as { converted_at?: string | null }).converted_at

  return (
    <div className="space-y-4">
      <BoutonRetour onRetour={onRetour} />

      {/* ── En-tête ─────────────────────────────────────────────── */}
      <motion.div
        initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
        className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5"
      >
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100 truncate">
                {prospect.nom}
              </h1>
              <span className={cn('text-[11px] px-2 py-0.5 rounded-full font-semibold', st.badge)}>
                {st.label}
              </span>
              {dejaConverti && (
                <span className="text-[11px] px-2 py-0.5 rounded-full font-semibold
                                 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300">
                  ✓ Converti en client
                </span>
              )}
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] text-slate-500 dark:text-slate-400">
              {prospect.entreprise && (
                <span className="flex items-center gap-1.5"><Building2 className="w-3.5 h-3.5" />{prospect.entreprise}</span>
              )}
              {prospect.telephone && (
                <a href={`tel:${prospect.telephone}`} className="flex items-center gap-1.5 hover:text-blue-600">
                  <Phone className="w-3.5 h-3.5" />{prospect.telephone}
                </a>
              )}
              {prospect.email && (
                <a href={`mailto:${prospect.email}`} className="flex items-center gap-1.5 hover:text-blue-600">
                  <Mail className="w-3.5 h-3.5" />{prospect.email}
                </a>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2">
            {can.prospects_edit && !enEdition && (
              <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setEnEdition(true)}>
                <Pencil className="w-3.5 h-3.5" /> Modifier
              </Button>
            )}
            {can.convert && !dejaConverti && (
              <Button
                size="sm"
                className="gap-1.5"
                disabled={mConvert.isPending}
                onClick={() => {
                  if (!window.confirm(`Convertir « ${prospect.nom} » en client ?`)) return
                  mConvert.mutate()
                }}
              >
                {mConvert.isPending
                  ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  : <UserCheck className="w-3.5 h-3.5" />}
                Convertir en client
              </Button>
            )}
          </div>
        </div>

        {/* Valeur et relance : deux chiffres qui décident de la journée. */}
        <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Bloc label="Valeur estimée"
                valeur={prospect.valeur_estimee ? formatCurrency(prospect.valeur_estimee) : '—'} />
          <Bloc label="Source"        valeur={prospect.source || '—'} />
          <Bloc label="Dernier contact" valeur={dateFr(prospect.date_contact)} />
          <Bloc label="Prochaine relance"
                valeur={dateFr(prospect.date_relance ?? prospect.relance_at)} />
        </div>
      </motion.div>

      {/* ── Formulaire de modification ──────────────────────────── */}
      {enEdition && can.prospects_edit && (
        <div className="rounded-xl border border-blue-200 dark:border-blue-900/50 bg-white dark:bg-slate-900 p-5 space-y-3">
          <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100">Modifier la fiche</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Champ label="Nom">
              <Input value={form.nom ?? ''} onChange={e => setForm(f => ({ ...f, nom: e.target.value }))} />
            </Champ>
            <Champ label="Entreprise">
              <Input value={form.entreprise ?? ''} onChange={e => setForm(f => ({ ...f, entreprise: e.target.value }))} />
            </Champ>
            <Champ label="Téléphone">
              <Input value={form.telephone ?? ''} onChange={e => setForm(f => ({ ...f, telephone: e.target.value }))} />
            </Champ>
            <Champ label="E-mail">
              <Input value={form.email ?? ''} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} />
            </Champ>
            <Champ label="Statut">
              <Select
                value={String(form.statut ?? prospect.statut)}
                onValueChange={v => setForm(f => ({ ...f, statut: versContrat(v as StatutProspect) }))}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {STATUTS.map(s => <SelectItem key={s.id} value={s.id}>{s.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </Champ>
            <Champ label="Valeur estimée (MAD)">
              <Input
                type="number" inputMode="decimal"
                value={form.valeur_estimee ?? ''}
                onChange={e => setForm(f => ({
                  ...f, valeur_estimee: e.target.value === '' ? null : Number(e.target.value),
                }))}
              />
            </Champ>
            <Champ label="Prochaine relance">
              <Input type="date" value={String(form.date_relance ?? '')}
                     onChange={e => setForm(f => ({ ...f, date_relance: e.target.value || null }))} />
            </Champ>
            <Champ label="Source">
              <Input value={form.source ?? ''} onChange={e => setForm(f => ({ ...f, source: e.target.value }))} />
            </Champ>
          </div>
          <Champ label="Notes">
            <textarea
              className="w-full min-h-[80px] rounded-lg border border-slate-200 dark:border-slate-700
                         bg-white dark:bg-slate-800 px-3 py-2 text-sm"
              value={form.notes ?? ''}
              onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
            />
          </Champ>
          <div className="flex items-center gap-2">
            <Button size="sm" className="gap-1.5" disabled={mEdit.isPending}
                    onClick={() => mEdit.mutate(form)}>
              {mEdit.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
              Enregistrer
            </Button>
            <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setEnEdition(false)}>
              <X className="w-3.5 h-3.5" /> Annuler
            </Button>
          </div>
        </div>
      )}

      {/* ── Journal d'activité ──────────────────────────────────── */}
      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
        <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between gap-2 flex-wrap">
          <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
            <History className="w-4 h-4 text-blue-600" /> Historique ({activites.length})
          </h2>
          {gestesAutorises.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {gestesAutorises.map(g => (
                <button
                  key={g.type}
                  onClick={() => { setSaisie(saisie === g.type ? null : g.type); setTexte('') }}
                  className={cn(
                    'inline-flex items-center gap-1.5 h-8 px-3 rounded-lg text-[12px] font-medium border transition-colors',
                    g.ton, saisie === g.type && 'ring-2 ring-blue-500/30',
                  )}
                >
                  <g.icone className="w-3.5 h-3.5" /> {g.label}
                </button>
              ))}
            </div>
          )}
        </div>

        {saisie && (
          <div className="p-4 border-b border-slate-100 dark:border-slate-800 space-y-2 bg-slate-50/60 dark:bg-slate-800/30">
            <textarea
              autoFocus
              className="w-full min-h-[70px] rounded-lg border border-slate-200 dark:border-slate-700
                         bg-white dark:bg-slate-900 px-3 py-2 text-sm"
              placeholder={GESTES.find(g => g.type === saisie)?.placeholder}
              value={texte}
              onChange={e => setTexte(e.target.value)}
            />
            {saisie === 'relance' && (
              <Champ label="Date de la relance">
                <Input type="date" value={dateRelance} onChange={e => setDateRelance(e.target.value)} />
              </Champ>
            )}
            <div className="flex items-center gap-2">
              <Button
                size="sm" className="gap-1.5"
                disabled={!texte.trim() || mActivite.isPending}
                onClick={() => mActivite.mutate({
                  type: saisie,
                  contenu: texte.trim(),
                  date_relance: saisie === 'relance' ? (dateRelance || null) : undefined,
                })}
              >
                {mActivite.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                Enregistrer
              </Button>
              <Button size="sm" variant="outline" onClick={() => { setSaisie(null); setTexte('') }}>
                Annuler
              </Button>
            </div>
          </div>
        )}

        {activites.length === 0 ? (
          <p className="p-8 text-center text-sm text-slate-500 dark:text-slate-400">
            Aucune activité enregistrée sur cette fiche.
          </p>
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {activites.map(a => <LigneActivite key={a.id} a={a} />)}
          </div>
        )}
      </div>
    </div>
  )
}

/* ── Petites briques ────────────────────────────────────────────── */

function BoutonRetour({ onRetour }: { onRetour: () => void }) {
  return (
    <button
      onClick={onRetour}
      className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-900
                 dark:hover:text-slate-100 transition-colors"
    >
      <ArrowLeft className="w-4 h-4" /> Retour aux prospects
    </button>
  )
}

function Bloc({ label, valeur }: { label: string; valeur: string }) {
  return (
    <div className="rounded-lg bg-slate-50 dark:bg-slate-800/50 px-3 py-2">
      <p className="text-[10px] uppercase tracking-wide text-slate-400 dark:text-slate-500">{label}</p>
      <p className="text-sm font-semibold text-slate-900 dark:text-slate-100 mt-0.5 truncate">{valeur}</p>
    </div>
  )
}

function Champ({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400">{label}</span>
      {children}
    </label>
  )
}

function LigneActivite({ a }: { a: CrmActivity }) {
  const Icone = ICONE_ACTIVITE[a.type] ?? StickyNote
  return (
    <div className="p-3 flex items-start gap-3">
      <span className="w-7 h-7 rounded-lg bg-slate-100 dark:bg-slate-800 flex items-center justify-center flex-shrink-0">
        <Icone className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm text-slate-800 dark:text-slate-200 whitespace-pre-wrap break-words">
          {a.message}
        </p>
        <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-0.5">
          {new Date(a.created_at).toLocaleString('fr-FR', {
            day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
          })}
          {a.auteur ? ` · ${a.auteur}` : ''}
          {a.duration_minutes ? ` · ${a.duration_minutes} min` : ''}
        </p>
      </div>
    </div>
  )
}
