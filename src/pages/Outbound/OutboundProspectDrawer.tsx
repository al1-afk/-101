import { useState, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  X, Loader2, Trash2, Building2, User, Mail, Phone, MessageCircle,
  Globe, Link as LinkIcon, MapPin, DollarSign, Bell, Calendar,
  Send, PhoneCall, FileText, Sparkles, ExternalLink, Plus, CheckCircle2, ArrowRightLeft,
  UserPlus, Edit2,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { AutocorrectInput, AutocorrectTextarea } from '@/components/ui/AutocorrectInput'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { toast } from 'sonner'
import {
  OUTBOUND_STATUS, PRIORITE_LABELS,
  type OutboundProspect, type OutboundStatut, type OutboundPriorite, type OutboundActivityType,
} from '@/lib/outboundApi'
import {
  useCreateOutboundProspect, useUpdateOutboundProspect, useDeleteOutboundProspect,
  useOutboundActivities, useAddOutboundActivity,
  useOutboundSectors, useOutboundSources, useOutboundCampaigns,
  useConvertOutboundToCrm, useOutboundTeam,
  useVerifyProspect, useAiGenerateForProspect, useSendProspectEmail, useSendProspectWhatsApp,
  useOutboundIntegrationsStatus, useOutboundTemplates,
} from '@/hooks/useOutbound'
import { statusAccent, statusLabel, fullContactName, isOutboundManager } from './utils'
import { useAuth } from '@/hooks/useAuth'

const EMPTY = {
  nom_contact: '', prenom_contact: '', entreprise: '', fonction: '', taille_entreprise: '',
  description: '',
  secteur_id: '', sous_secteur_id: '',
  telephone: '', whatsapp: '', email: '', email_secondaire: '',
  site_web: '', linkedin_url: '', instagram_url: '', facebook_url: '', google_maps_url: '',
  adresse: '', ville: '', region: '', pays: 'Maroc',
  source_id: '', source_libre: '', campaign_id: '',
  statut: 'a_contacter' as OutboundStatut,
  priorite: 'normale' as OutboundPriorite,
  niveau_interet: '0',
  canal_prefere: '',
  valeur_potentielle: '',
  service_propose: '',
  motif_perte: '', motif_refus: '', ne_plus_contacter: false,
  date_dernier_contact: '',
  date_prochaine_relance: '',
  assigned_to_id: '',
  notes: '',
}

function prospectToForm(p: OutboundProspect): typeof EMPTY {
  return {
    nom_contact: p.nom_contact ?? '',
    prenom_contact: p.prenom_contact ?? '',
    entreprise: p.entreprise,
    fonction: p.fonction ?? '',
    taille_entreprise: p.taille_entreprise ?? '',
    description: p.description ?? '',
    secteur_id: p.secteur_id ?? '',
    sous_secteur_id: p.sous_secteur_id ?? '',
    telephone: p.telephone ?? '',
    whatsapp: p.whatsapp ?? '',
    email: p.email ?? '',
    email_secondaire: p.email_secondaire ?? '',
    site_web: p.site_web ?? '',
    linkedin_url: p.linkedin_url ?? '',
    instagram_url: p.instagram_url ?? '',
    facebook_url: p.facebook_url ?? '',
    google_maps_url: p.google_maps_url ?? '',
    adresse: p.adresse ?? '',
    ville: p.ville ?? '',
    region: p.region ?? '',
    pays: p.pays ?? 'Maroc',
    source_id: p.source_id ?? '',
    source_libre: p.source_libre ?? '',
    campaign_id: p.campaign_id ?? '',
    statut: p.statut,
    priorite: p.priorite,
    niveau_interet: String(p.niveau_interet ?? 0),
    canal_prefere: p.canal_prefere ?? '',
    valeur_potentielle: p.valeur_potentielle ? String(p.valeur_potentielle) : '',
    service_propose: p.service_propose ?? '',
    motif_perte: p.motif_perte ?? '',
    motif_refus: p.motif_refus ?? '',
    ne_plus_contacter: p.ne_plus_contacter,
    date_dernier_contact: p.date_dernier_contact?.slice(0, 10) ?? '',
    date_prochaine_relance: p.date_prochaine_relance ?? '',
    assigned_to_id: p.assigned_to_id,
    notes: p.notes ?? '',
  }
}

interface Props {
  open: boolean
  prospect: OutboundProspect | null
  onClose: () => void
}

const ACTIVITY_ICONS: Record<OutboundActivityType, React.ElementType> = {
  creation: UserPlus, statut: ArrowRightLeft, note: FileText, edit: Edit2,
  appel: PhoneCall, email: Mail, whatsapp: MessageCircle, linkedin: LinkIcon, sms: Send,
  rdv: Calendar, conversion: CheckCircle2, assignment: UserPlus, follow_up: Bell,
}

export default function OutboundProspectDrawer({ open, prospect, onClose }: Props) {
  const isEdit = !!prospect
  const { role } = useAuth()
  const canManageAll = isOutboundManager(role)

  const create = useCreateOutboundProspect()
  const update = useUpdateOutboundProspect()
  const del = useDeleteOutboundProspect()
  const convert = useConvertOutboundToCrm()
  const addAct = useAddOutboundActivity(prospect?.id ?? '')
  const { data: activities = [] } = useOutboundActivities(prospect?.id ?? null)
  const { data: sectors = [] } = useOutboundSectors()
  const { data: sources = [] } = useOutboundSources()
  const { data: campaigns = [] } = useOutboundCampaigns()
  const { data: team = [] } = useOutboundTeam()

  const [tab, setTab] = useState<'form' | 'history' | 'communication' | 'ai'>('form')
  const [form, setForm] = useState<typeof EMPTY>(() =>
    prospect ? prospectToForm(prospect) : { ...EMPTY }
  )
  const [prev, setPrev] = useState(prospect)
  if (prev !== prospect) {
    setPrev(prospect)
    setForm(prospect ? prospectToForm(prospect) : { ...EMPTY })
    setTab('form')
  }

  const [noteText, setNoteText] = useState('')
  const [noteType, setNoteType] = useState<OutboundActivityType>('note')

  const setF = (k: keyof typeof EMPTY) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setForm(p => ({ ...p, [k]: e.target.value }))

  const busy = create.isPending || update.isPending

  const activeSectors = sectors.filter(s => s.actif !== false && !s.parent_id)
  const subSectors = sectors.filter(s => s.parent_id === form.secteur_id)
  const activeSources = sources.filter(s => s.actif !== false)
  const activeCampaigns = campaigns.filter(c => c.statut === 'active')

  const handleSave = useCallback(() => {
    if (!form.entreprise.trim()) { toast.error('Entreprise requise'); return }

    const payload = {
      nom_contact: form.nom_contact.trim() || null,
      prenom_contact: form.prenom_contact.trim() || null,
      entreprise: form.entreprise.trim(),
      fonction: form.fonction.trim() || null,
      taille_entreprise: form.taille_entreprise.trim() || null,
      description: form.description.trim() || null,
      secteur_id: form.secteur_id || null,
      sous_secteur_id: form.sous_secteur_id || null,
      telephone: form.telephone.trim() || null,
      whatsapp: form.whatsapp.trim() || null,
      email: form.email.trim() || null,
      email_secondaire: form.email_secondaire.trim() || null,
      site_web: form.site_web.trim() || null,
      linkedin_url: form.linkedin_url.trim() || null,
      instagram_url: form.instagram_url.trim() || null,
      facebook_url: form.facebook_url.trim() || null,
      google_maps_url: form.google_maps_url.trim() || null,
      adresse: form.adresse.trim() || null,
      ville: form.ville.trim() || null,
      region: form.region.trim() || null,
      pays: form.pays.trim() || null,
      source_id: form.source_id || null,
      source_libre: form.source_libre.trim() || null,
      campaign_id: form.campaign_id || null,
      statut: form.statut,
      priorite: form.priorite,
      niveau_interet: parseInt(form.niveau_interet) || 0,
      canal_prefere: (form.canal_prefere || null) as any,
      valeur_potentielle: form.valeur_potentielle ? parseFloat(form.valeur_potentielle) : 0,
      service_propose: form.service_propose.trim() || null,
      motif_perte: form.motif_perte.trim() || null,
      motif_refus: form.motif_refus.trim() || null,
      ne_plus_contacter: form.ne_plus_contacter,
      date_dernier_contact: form.date_dernier_contact || null,
      date_prochaine_relance: form.date_prochaine_relance || null,
      notes: form.notes.trim() || null,
      ...(canManageAll && form.assigned_to_id ? { assigned_to_id: form.assigned_to_id } : {}),
    }

    if (isEdit && prospect) {
      update.mutate({ id: prospect.id, ...payload } as any, { onSuccess: onClose })
    } else {
      create.mutate(payload as any, { onSuccess: onClose })
    }
  }, [form, isEdit, prospect, canManageAll, create, update, onClose])

  const handleDelete = () => {
    if (!prospect) return
    if (!confirm('Supprimer ce prospect ?')) return
    del.mutate(prospect.id, { onSuccess: onClose })
  }

  const handleConvert = () => {
    if (!prospect) return
    if (prospect.converted_to_crm) { toast.error('Déjà converti'); return }
    if (!confirm('Convertir ce prospect en CRM Inbound qualifié ?')) return
    convert.mutate(prospect.id, { onSuccess: onClose })
  }

  const handleAddNote = () => {
    if (!prospect || !noteText.trim()) return
    addAct.mutate({ type: noteType, message: noteText.trim() }, {
      onSuccess: () => { setNoteText('') }
    })
  }

  const accent = isEdit ? statusAccent(prospect.statut) : '#0EA5E9'

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            key="backdrop"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm"
            onClick={onClose}
          />
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none" onClick={onClose}>
            <motion.aside
              initial={{ opacity: 0, scale: 0.96, y: 12 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 12 }}
              transition={{ type: 'spring', damping: 24, stiffness: 280 }}
              onClick={e => e.stopPropagation()}
              className="w-full max-w-3xl max-h-[92vh] bg-[var(--surface-card)] border border-border rounded-2xl shadow-2xl flex flex-col overflow-hidden pointer-events-auto"
            >
              {/* HEADER */}
              <div
                className="relative flex-shrink-0 px-6 pt-5 pb-4"
                style={{ background: `linear-gradient(135deg, ${accent}18 0%, transparent 60%)` }}
              >
                <button
                  onClick={onClose}
                  className="absolute top-4 right-4 w-7 h-7 rounded-full bg-muted/60 hover:bg-muted flex items-center justify-center transition-colors"
                >
                  <X className="w-3.5 h-3.5 text-muted-foreground" />
                </button>

                {isEdit ? (
                  <div className="flex items-start gap-4 pr-10">
                    <div
                      className="w-14 h-14 rounded-2xl flex items-center justify-center text-white text-xl font-bold flex-shrink-0 shadow-lg"
                      style={{ backgroundColor: accent }}
                    >
                      {prospect.entreprise.charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0 pt-0.5">
                      <h2 className="text-lg font-bold text-foreground leading-tight truncate">
                        {prospect.entreprise}
                      </h2>
                      <p className="text-sm text-muted-foreground flex items-center gap-1 mt-0.5">
                        <User className="w-3.5 h-3.5" />
                        {fullContactName(prospect)}{prospect.fonction ? ` · ${prospect.fonction}` : ''}
                      </p>
                      <div className="flex flex-wrap gap-2 mt-2">
                        <span
                          className="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full"
                          style={{ backgroundColor: `${accent}22`, color: accent }}
                        >
                          <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: accent }} />
                          {statusLabel(prospect.statut)}
                        </span>
                        {prospect.converted_to_crm && (
                          <span className="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full bg-emerald-500/20 text-emerald-700 dark:text-emerald-400">
                            <CheckCircle2 className="w-3 h-3" /> Converti CRM
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex gap-1.5 pt-0.5">
                      {prospect.telephone && (
                        <a href={`tel:${prospect.telephone}`} onClick={e => e.stopPropagation()}
                          className="w-8 h-8 rounded-lg bg-emerald-500/15 hover:bg-emerald-500/25 flex items-center justify-center transition-colors"
                          title={prospect.telephone}>
                          <Phone className="w-3.5 h-3.5 text-emerald-400" />
                        </a>
                      )}
                      {prospect.whatsapp && (
                        <a href={`https://wa.me/${prospect.whatsapp.replace(/\D/g, '')}`} target="_blank" rel="noopener noreferrer"
                          onClick={e => e.stopPropagation()}
                          className="w-8 h-8 rounded-lg bg-green-500/15 hover:bg-green-500/25 flex items-center justify-center transition-colors"
                          title={prospect.whatsapp}>
                          <MessageCircle className="w-3.5 h-3.5 text-green-500" />
                        </a>
                      )}
                      {prospect.email && (
                        <a href={`mailto:${prospect.email}`} onClick={e => e.stopPropagation()}
                          className="w-8 h-8 rounded-lg bg-blue-500/15 hover:bg-blue-500/25 flex items-center justify-center transition-colors">
                          <Mail className="w-3.5 h-3.5 text-blue-400" />
                        </a>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center gap-3 pr-16">
                    <div className="w-10 h-10 rounded-xl bg-sky-600/20 flex items-center justify-center">
                      <UserPlus className="w-5 h-5 text-sky-600" />
                    </div>
                    <div>
                      <h2 className="text-base font-bold text-foreground">Nouveau prospect Outbound</h2>
                      <p className="text-xs text-muted-foreground">Ajoutez une entreprise cible</p>
                    </div>
                  </div>
                )}
              </div>

              {/* TABS */}
              {isEdit && (
                <div className="flex px-6 gap-1 border-b border-border flex-shrink-0 bg-[var(--surface-card)] overflow-x-auto">
                  {([
                    { t: 'form', label: 'Fiche' },
                    { t: 'ai', label: '✦ Marketing IA' },
                    { t: 'communication', label: 'Communication' },
                    { t: 'history', label: 'Historique' },
                  ] as const).map(({ t, label }) => (
                    <button
                      key={t}
                      onClick={() => setTab(t)}
                      className={`px-4 py-2.5 text-xs font-semibold transition-all border-b-2 -mb-px ${
                        tab === t
                          ? 'border-sky-600 text-sky-600'
                          : 'border-transparent text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              )}

              {/* BODY */}
              <div className="flex-1 overflow-y-auto">
                {tab === 'form' && (
                  <div className="px-6 py-5 space-y-6">
                    {/* Identité */}
                    <SectionTitle>Identité</SectionTitle>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <FieldInput icon={Building2} value={form.entreprise} onChange={setF('entreprise')} placeholder="Nom de l'entreprise *" autoFocus={!isEdit} />
                      <FieldInput icon={User} value={form.fonction} onChange={setF('fonction')} placeholder="Fonction du contact" />
                      <FieldInput icon={User} value={form.prenom_contact} onChange={setF('prenom_contact')} placeholder="Prénom" />
                      <FieldInput icon={User} value={form.nom_contact} onChange={setF('nom_contact')} placeholder="Nom" />
                    </div>

                    {/* Secteur */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <Label>Secteur</Label>
                        <Select value={form.secteur_id || '__none__'} onValueChange={v => setForm(p => ({ ...p, secteur_id: v === '__none__' ? '' : v, sous_secteur_id: '' }))}>
                          <SelectTrigger><SelectValue placeholder="Choisir..." /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__none__">—</SelectItem>
                            {activeSectors.map(s => (
                              <SelectItem key={s.id} value={s.id}>
                                <span className="flex items-center gap-2">
                                  <span className="w-2 h-2 rounded-full" style={{ backgroundColor: s.couleur }} />
                                  {s.nom}
                                </span>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      {subSectors.length > 0 && (
                        <div>
                          <Label>Sous-secteur</Label>
                          <Select value={form.sous_secteur_id || '__none__'} onValueChange={v => setForm(p => ({ ...p, sous_secteur_id: v === '__none__' ? '' : v }))}>
                            <SelectTrigger><SelectValue placeholder="Choisir..." /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="__none__">—</SelectItem>
                              {subSectors.map(s => <SelectItem key={s.id} value={s.id}>{s.nom}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        </div>
                      )}
                      <div>
                        <Label>Taille entreprise</Label>
                        <Select value={form.taille_entreprise || '__none__'} onValueChange={v => setForm(p => ({ ...p, taille_entreprise: v === '__none__' ? '' : v }))}>
                          <SelectTrigger><SelectValue placeholder="Choisir..." /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__none__">—</SelectItem>
                            {['1-5', '6-20', '21-50', '51-200', '200+'].map(s => <SelectItem key={s} value={s}>{s} employés</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    <AutocorrectTextarea
                      value={form.description}
                      onChange={setF('description')}
                      className="input-field resize-none h-20"
                      placeholder="Description de l'entreprise..."
                    />

                    {/* Coordonnées */}
                    <SectionTitle>Coordonnées</SectionTitle>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <FieldInput icon={Phone} value={form.telephone} onChange={setF('telephone')} placeholder="Téléphone" />
                      <FieldInput icon={MessageCircle} value={form.whatsapp} onChange={setF('whatsapp')} placeholder="WhatsApp" />
                      <FieldInput icon={Mail} type="email" value={form.email} onChange={setF('email')} placeholder="Email" />
                      <FieldInput icon={Mail} type="email" value={form.email_secondaire} onChange={setF('email_secondaire')} placeholder="Email secondaire" />
                      <FieldInput icon={Globe} value={form.site_web} onChange={setF('site_web')} placeholder="Site web" />
                      <FieldInput icon={LinkIcon} value={form.linkedin_url} onChange={setF('linkedin_url')} placeholder="LinkedIn" />
                      <FieldInput icon={LinkIcon} value={form.instagram_url} onChange={setF('instagram_url')} placeholder="LinkIcon" />
                      <FieldInput icon={LinkIcon} value={form.facebook_url} onChange={setF('facebook_url')} placeholder="LinkIcon" />
                      <FieldInput icon={MapPin} value={form.google_maps_url} onChange={setF('google_maps_url')} placeholder="Google Maps URL" />
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <FieldInput icon={MapPin} value={form.adresse} onChange={setF('adresse')} placeholder="Adresse" />
                      <FieldInput icon={MapPin} value={form.ville} onChange={setF('ville')} placeholder="Ville" />
                      <FieldInput icon={MapPin} value={form.region} onChange={setF('region')} placeholder="Région" />
                      <FieldInput icon={MapPin} value={form.pays} onChange={setF('pays')} placeholder="Pays" />
                    </div>

                    {/* Prospection */}
                    <SectionTitle>Prospection</SectionTitle>

                    <div>
                      <Label>Statut</Label>
                      <div className="flex flex-wrap gap-1.5">
                        {OUTBOUND_STATUS.filter(s => s.id !== 'converti').map(s => (
                          <button
                            key={s.id}
                            type="button"
                            onClick={() => setForm(p => ({ ...p, statut: s.id }))}
                            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-all border ${
                              form.statut === s.id
                                ? 'border-transparent text-white shadow-sm'
                                : 'border-border text-muted-foreground hover:text-foreground bg-transparent'
                            }`}
                            style={form.statut === s.id ? { backgroundColor: s.accent } : {}}
                          >
                            <span className={`w-1.5 h-1.5 rounded-full ${s.dot}`} />
                            {s.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <Label>Priorité</Label>
                        <Select value={form.priorite} onValueChange={(v: OutboundPriorite) => setForm(p => ({ ...p, priorite: v }))}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {(['basse','normale','haute','urgente'] as OutboundPriorite[]).map(p => (
                              <SelectItem key={p} value={p}>{PRIORITE_LABELS[p].label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label>Canal préféré</Label>
                        <Select value={form.canal_prefere || '__none__'} onValueChange={v => setForm(p => ({ ...p, canal_prefere: v === '__none__' ? '' : v }))}>
                          <SelectTrigger><SelectValue placeholder="Aucun" /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__none__">—</SelectItem>
                            {['email','whatsapp','telephone','linkedin','sms'].map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label>Source</Label>
                        <Select value={form.source_id || '__none__'} onValueChange={v => setForm(p => ({ ...p, source_id: v === '__none__' ? '' : v }))}>
                          <SelectTrigger><SelectValue placeholder="Choisir..." /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__none__">—</SelectItem>
                            {activeSources.map(s => <SelectItem key={s.id} value={s.id}>{s.nom}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label>Campagne</Label>
                        <Select value={form.campaign_id || '__none__'} onValueChange={v => setForm(p => ({ ...p, campaign_id: v === '__none__' ? '' : v }))}>
                          <SelectTrigger><SelectValue placeholder="Aucune" /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__none__">—</SelectItem>
                            {activeCampaigns.map(c => <SelectItem key={c.id} value={c.id}>{c.nom}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <Label>Valeur potentielle (MAD)</Label>
                        <div className="relative">
                          <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
                          <Input type="number" min={0} value={form.valeur_potentielle} onChange={setF('valeur_potentielle')} placeholder="0" className="pl-9" />
                        </div>
                      </div>
                      <FieldInput icon={Sparkles} value={form.service_propose} onChange={setF('service_propose')} placeholder="Service proposé" label="Service" />
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <Label>1er contact</Label>
                        <div className="relative">
                          <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
                          <Input type="date" value={form.date_dernier_contact} onChange={setF('date_dernier_contact')} className="pl-9" />
                        </div>
                      </div>
                      <div>
                        <Label>Relance</Label>
                        <div className="relative">
                          <Bell className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
                          <Input type="date" value={form.date_prochaine_relance} onChange={setF('date_prochaine_relance')} className="pl-9" />
                        </div>
                      </div>
                    </div>

                    {/* Ownership (manager only) */}
                    {canManageAll && (
                      <div>
                        <Label>Employé propriétaire</Label>
                        <Select value={form.assigned_to_id || '__none__'} onValueChange={v => setForm(p => ({ ...p, assigned_to_id: v === '__none__' ? '' : v }))}>
                          <SelectTrigger><SelectValue placeholder="Moi" /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__none__">— Moi</SelectItem>
                            {team.filter(m => m.role !== 'viewer' && m.role !== 'comptable').map(m => (
                              <SelectItem key={m.user_id} value={m.user_id}>{m.name ?? m.email}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    )}

                    <label className="flex items-center gap-2 text-sm text-muted-foreground cursor-pointer">
                      <input type="checkbox" checked={form.ne_plus_contacter}
                        onChange={e => setForm(p => ({ ...p, ne_plus_contacter: e.target.checked }))}
                        className="w-4 h-4 rounded border-border" />
                      Ne plus contacter (RGPD / demande explicite)
                    </label>

                    {/* Notes */}
                    <SectionTitle>Notes</SectionTitle>
                    <AutocorrectTextarea
                      value={form.notes}
                      onChange={setF('notes')}
                      className="input-field resize-none h-28"
                      placeholder="Contexte, points clés, prochaines étapes…"
                    />

                    {/* Motifs */}
                    {['refuse','ne_repond_pas','non_qualifie'].includes(form.statut) && (
                      <>
                        <FieldInput icon={FileText} value={form.motif_refus} onChange={setF('motif_refus')} placeholder="Motif du refus" label="Motif refus" />
                        <FieldInput icon={FileText} value={form.motif_perte} onChange={setF('motif_perte')} placeholder="Motif de perte" label="Motif perte" />
                      </>
                    )}
                  </div>
                )}

                {/* AI Marketing tab */}
                {tab === 'ai' && prospect && (
                  <MarketingAiPanel prospect={prospect} />
                )}

                {/* Communication tab */}
                {tab === 'communication' && prospect && (
                  <div className="px-6 py-5 space-y-4">
                    <QuickCommunicationBar prospect={prospect} />
                    <div className="rounded-xl border border-border bg-muted/20 p-4 space-y-3">
                      <p className="text-xs font-bold text-foreground">Enregistrer une communication</p>
                      <div className="flex gap-1.5 flex-wrap">
                        {([
                          { t: 'appel' as OutboundActivityType, label: 'Appel', Icon: PhoneCall },
                          { t: 'email' as OutboundActivityType, label: 'Email', Icon: Mail },
                          { t: 'whatsapp' as OutboundActivityType, label: 'WhatsApp', Icon: MessageCircle },
                          { t: 'linkedin' as OutboundActivityType, label: 'LinkedIn', Icon: LinkIcon },
                          { t: 'sms' as OutboundActivityType, label: 'SMS', Icon: Send },
                          { t: 'rdv' as OutboundActivityType, label: 'RDV', Icon: Calendar },
                          { t: 'note' as OutboundActivityType, label: 'Note', Icon: FileText },
                        ]).map(({ t, label, Icon }) => (
                          <button
                            key={t}
                            onClick={() => setNoteType(t)}
                            className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold transition-all border ${
                              noteType === t
                                ? 'bg-sky-500/20 text-sky-600 border-transparent'
                                : 'border-border text-muted-foreground hover:text-foreground'
                            }`}
                          >
                            <Icon className="w-3 h-3" /> {label}
                          </button>
                        ))}
                      </div>
                      <AutocorrectTextarea
                        value={noteText}
                        onChange={e => setNoteText(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleAddNote() }}
                        className="input-field resize-none h-24 text-sm"
                        placeholder="Résumé de la communication..."
                      />
                      <div className="flex items-center justify-between">
                        <p className="text-[11px] text-muted-foreground">⌘ Entrée pour enregistrer</p>
                        <Button size="sm" onClick={handleAddNote} disabled={!noteText.trim() || addAct.isPending} className="h-7 px-3 text-xs">
                          {addAct.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Plus className="w-3 h-3" />}
                          Enregistrer
                        </Button>
                      </div>
                    </div>
                  </div>
                )}

                {tab === 'history' && prospect && (
                  <div className="px-6 py-5">
                    {activities.length === 0 ? (
                      <div className="py-8 text-center">
                        <FileText className="w-8 h-8 text-muted-foreground opacity-30 mx-auto mb-2" />
                        <p className="text-xs text-muted-foreground">Aucune activité enregistrée</p>
                      </div>
                    ) : (
                      <div className="relative space-y-0">
                        <div className="absolute left-[17px] top-4 bottom-4 w-px bg-border" />
                        {activities.map((log, i) => {
                          const Icon = ACTIVITY_ICONS[log.type] ?? FileText
                          return (
                            <motion.div
                              key={log.id}
                              initial={{ opacity: 0, x: -8 }}
                              animate={{ opacity: 1, x: 0 }}
                              transition={{ delay: i * 0.03 }}
                              className="relative flex gap-3 pb-4"
                            >
                              <div className="relative z-10 flex-shrink-0 w-[34px] h-[34px] rounded-full bg-sky-500/15 flex items-center justify-center">
                                <Icon className="w-3.5 h-3.5 text-sky-600" />
                              </div>
                              <div className="flex-1 pt-1.5 min-w-0">
                                <p className="text-sm text-foreground leading-snug">{log.message}</p>
                                <div className="flex items-center gap-2 mt-0.5">
                                  <span className="text-xs text-muted-foreground">
                                    {new Intl.DateTimeFormat('fr-FR', {
                                      day: '2-digit', month: 'short', year: 'numeric',
                                      hour: '2-digit', minute: '2-digit',
                                    }).format(new Date(log.created_at))}
                                  </span>
                                  {log.auteur_nom && <span className="text-xs text-muted-foreground">· {log.auteur_nom}</span>}
                                </div>
                              </div>
                            </motion.div>
                          )
                        })}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* FOOTER */}
              <div className="px-6 py-4 border-t border-border flex items-center justify-between gap-3 flex-shrink-0 bg-[var(--surface-card)]">
                {isEdit ? (
                  <button
                    onClick={handleDelete}
                    disabled={del.isPending}
                    className="flex items-center gap-1.5 text-xs font-medium text-red-600 dark:text-red-400 hover:text-red-500 transition-colors disabled:opacity-50"
                  >
                    {del.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                    Supprimer
                  </button>
                ) : <div />}
                <div className="flex gap-2">
                  {isEdit && canManageAll && !prospect.converted_to_crm && (
                    <Button variant="secondary" size="sm" onClick={handleConvert} disabled={convert.isPending} className="h-8 px-3 text-xs">
                      {convert.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                      Convertir en CRM
                    </Button>
                  )}
                  <Button variant="secondary" size="sm" onClick={onClose} className="h-8 px-4">Annuler</Button>
                  {tab === 'form' && (
                    <Button size="sm" onClick={handleSave} disabled={busy} className="h-8 px-5">
                      {busy && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                      {isEdit ? 'Enregistrer' : 'Créer le prospect'}
                    </Button>
                  )}
                </div>
              </div>
            </motion.aside>
          </div>
        </>
      )}
    </AnimatePresence>
  )
}

/* Helpers */
function SectionTitle({ children }: { children: React.ReactNode }) {
  return <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">{children}</p>
}
function Label({ children }: { children: React.ReactNode }) {
  return <p className="text-xs font-medium text-muted-foreground mb-1.5">{children}</p>
}
function FieldInput({
  icon: Icon, value, onChange, placeholder, type = 'text', autoFocus = false, label,
}: {
  icon: React.ElementType
  value: string
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void
  placeholder: string
  type?: string
  autoFocus?: boolean
  label?: string
}) {
  return (
    <div>
      {label && <Label>{label}</Label>}
      <div className="relative">
        <Icon className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
        {type === 'email' ? (
          <Input type={type} value={value} onChange={onChange} placeholder={placeholder} className="pl-9" autoFocus={autoFocus} />
        ) : (
          <AutocorrectInput value={value} onChange={onChange} placeholder={placeholder} className="pl-9" autoFocus={autoFocus} />
        )}
      </div>
    </div>
  )
}

function QuickCommunicationBar({ prospect }: { prospect: OutboundProspect }) {
  const actions = [
    prospect.telephone && { icon: Phone, label: 'Appeler', href: `tel:${prospect.telephone}`, color: 'text-emerald-500 bg-emerald-500/15' },
    prospect.whatsapp && { icon: MessageCircle, label: 'WhatsApp', href: `https://wa.me/${prospect.whatsapp.replace(/\D/g, '')}`, color: 'text-green-500 bg-green-500/15' },
    prospect.email && { icon: Mail, label: 'Email', href: `mailto:${prospect.email}`, color: 'text-blue-500 bg-blue-500/15' },
    prospect.linkedin_url && { icon: LinkIcon, label: 'LinkedIn', href: prospect.linkedin_url, color: 'text-sky-600 bg-sky-500/15' },
    prospect.site_web && { icon: Globe, label: 'Site web', href: prospect.site_web.startsWith('http') ? prospect.site_web : `https://${prospect.site_web}`, color: 'text-violet-500 bg-violet-500/15' },
    prospect.google_maps_url && { icon: MapPin, label: 'Google Maps', href: prospect.google_maps_url, color: 'text-red-500 bg-red-500/15' },
  ].filter(Boolean) as { icon: React.ElementType; label: string; href: string; color: string }[]

  if (!actions.length) {
    return <p className="text-xs text-muted-foreground italic">Aucun canal de contact renseigné pour ce prospect.</p>
  }

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
      {actions.map(({ icon: Icon, label, href, color }) => (
        <a
          key={label}
          href={href}
          target={href.startsWith('http') ? '_blank' : undefined}
          rel="noopener noreferrer"
          className={`flex items-center gap-2 px-3 py-2 rounded-lg border border-border hover:border-sky-500/40 transition-colors ${color}`}
        >
          <Icon className="w-4 h-4" />
          <span className="text-xs font-medium">{label}</span>
          <ExternalLink className="w-3 h-3 opacity-50 ml-auto" />
        </a>
      ))}
    </div>
  )
}

/* ─── Marketing IA panel ─────────────────────────────────────────── */

function MarketingAiPanel({ prospect }: { prospect: OutboundProspect }) {
  const { data: status } = useOutboundIntegrationsStatus()
  const { data: waTemplates = [] } = useOutboundTemplates('whatsapp')
  const verify   = useVerifyProspect()
  const aiGen    = useAiGenerateForProspect()
  const sendMail = useSendProspectEmail()
  const sendWa   = useSendProspectWhatsApp()

  const [language, setLanguage] = useState<'fr' | 'ar' | 'en'>('fr')
  const [tone, setTone] = useState<'professionnel' | 'chaleureux' | 'direct'>('professionnel')

  /* Pitch persistant en localStorage — évite de retaper à chaque prospect.
     Le pitch DOIT lister les offres concrètes, sinon Claude/GPT écrit "votre expertise" (vague). */
  const DEFAULT_PITCH = [
    'NEXT GITAL — agence marocaine qui accompagne les entreprises avec 4 offres concrètes :',
    '1) ERP sur-mesure (gestion clients, factures, projets, stock, RH) qui remplace Excel',
    '2) Modules IA intégrés à l\'ERP (assistant, classification auto, génération de contenu)',
    '3) Sites web performants (vitrine, e-commerce, prise de RDV) livrés en 2 semaines',
    '4) Marketing digital + prospection automatisée (Google Ads, SEO local, emailing) pour attirer plus de clients',
    'Cible principale : PME au Maroc qui veulent gagner du temps et accélérer leur croissance.',
  ].join('\n')

  const [senderPitch, setSenderPitch] = useState(() => {
    try { return localStorage.getItem('outbound-sender-pitch') ?? DEFAULT_PITCH }
    catch { return DEFAULT_PITCH }
  })
  const updatePitch = (v: string) => {
    setSenderPitch(v)
    try { localStorage.setItem('outbound-sender-pitch', v) } catch {}
  }

  /* Catalogue des services proposables — l'utilisateur en choisit UN avant de générer.
     Étiquettes en français ; l'IA adapte au secteur du prospect. */
  const SERVICE_OPTIONS: Array<{ id: string; label: string; short: string; emoji: string }> = [
    { id: 'erp',       emoji: '⚙️', label: 'ERP sur-mesure (gestion complète : clients, factures, projets, stock, RH)', short: 'ERP' },
    { id: 'ia',        emoji: '🤖', label: 'Modules IA (assistant, classification auto, génération de contenu)',        short: 'IA' },
    { id: 'site',      emoji: '🌐', label: 'Site web performant (vitrine, e-commerce, prise de RDV) livré en 2 semaines', short: 'Site web' },
    { id: 'marketing', emoji: '📣', label: 'Marketing digital + prospection auto (Google Ads, SEO local, emailing)',    short: 'Marketing IA' },
  ]
  const [serviceFocus, setServiceFocus] = useState<string>(() => {
    try { return localStorage.getItem('outbound-service-focus') ?? 'erp' } catch { return 'erp' }
  })
  const updateServiceFocus = (id: string) => {
    setServiceFocus(id)
    try { localStorage.setItem('outbound-service-focus', id) } catch {}
  }
  const activeService = SERVICE_OPTIONS.find(s => s.id === serviceFocus) ?? SERVICE_OPTIONS[0]

  /* Signature — persistée en localStorage. Nom, rôle, téléphone, site. */
  const [sig, setSig] = useState(() => {
    try {
      const raw = localStorage.getItem('outbound-signature')
      if (raw) return JSON.parse(raw) as { name: string; role: string; phone: string; website: string; company: string }
    } catch {}
    return { name: 'Said', role: 'Direction commerciale', phone: '+212 6 00 00 00 00', website: 'nextgital.com', company: 'NEXT GITAL' }
  })
  const updateSig = (k: keyof typeof sig, v: string) => {
    const next = { ...sig, [k]: v }
    setSig(next)
    try { localStorage.setItem('outbound-signature', JSON.stringify(next)) } catch {}
  }
  const [emailSubject, setEmailSubject] = useState(prospect.ai_draft_email_subject ?? '')
  const [emailBody, setEmailBody] = useState(prospect.ai_draft_email_body ?? '')
  const [waTemplateId, setWaTemplateId] = useState('')

  const emailReady = !!emailSubject.trim() && !!emailBody.trim() && !!prospect.email
  const canEmail = !!prospect.email && status?.anthropic
  const canWa    = !!(prospect.whatsapp || prospect.telephone) && status?.whatsapp

  const generateEmail = async () => {
    const r = await aiGen.mutateAsync({
      id: prospect.id, channel: 'email', language, tone, sender_pitch: senderPitch,
    }) as any
    if (r?.draft?.subject) setEmailSubject(r.draft.subject)
    if (r?.draft?.body)    setEmailBody(r.draft.body)
  }

  const doSendMail = () => {
    if (!emailReady) return
    sendMail.mutate({
      id: prospect.id,
      subject: emailSubject.trim(),
      body: emailBody.trim(),
      sender_name:    sig.name,
      sender_role:    sig.role,
      sender_company: sig.company,
      sender_phone:   sig.phone,
      sender_website: sig.website,
    })
  }

  const doSendWa = () => {
    if (!waTemplateId) { toast.error('Choisis un template WhatsApp'); return }
    const contactName = [prospect.prenom_contact, prospect.nom_contact].filter(Boolean).join(' ') || 'bonjour'
    const senderName = 'NEXT GITAL'
    /* Variables par défaut selon le template first_contact_* — l'utilisateur
       peut adapter en éditant le template Meta et en changeant l'ordre ici. */
    const variables = [
      contactName,
      senderName,
      prospect.entreprise,
      'digitaliser votre activité',
    ]
    sendWa.mutate({ id: prospect.id, template_id: waTemplateId, variables })
  }

  return (
    <div className="px-6 py-5 space-y-5">
      {/* Vérification */}
      <div className="rounded-xl border border-border bg-muted/20 p-4">
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs font-bold text-foreground">Vérification des coordonnées</p>
          <Button size="sm" variant="secondary" onClick={() => verify.mutate(prospect.id)} disabled={verify.isPending} className="h-7 px-3 text-xs">
            {verify.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCircle2 className="w-3 h-3" />}
            Vérifier
          </Button>
        </div>
        <div className="grid grid-cols-2 gap-3 text-xs">
          <div>
            <p className="text-muted-foreground mb-0.5">Email</p>
            <p className="font-mono truncate">{prospect.email ?? '—'}</p>
            <VerifBadge status={prospect.email_verification_status ?? null} />
          </div>
          <div>
            <p className="text-muted-foreground mb-0.5">Téléphone</p>
            <p className="font-mono truncate">{prospect.telephone ?? prospect.whatsapp ?? '—'}</p>
            {prospect.phone_verified === true && <span className="inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-700">✓ Valide</span>}
            {prospect.phone_verified === false && <span className="inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded bg-red-500/15 text-red-600">✗ Invalide</span>}
          </div>
        </div>
      </div>

      {/* Email AI */}
      <div className="rounded-xl border border-border bg-[var(--surface-card)] p-4">
        <div className="flex items-center gap-2 mb-3">
          <Sparkles className="w-4 h-4 text-violet-500" />
          <p className="text-sm font-bold text-foreground">Email personnalisé (Claude Sonnet 4.6)</p>
        </div>

        {!status?.anthropic && (
          <p className="text-[11px] text-red-600 mb-3">⚠ ANTHROPIC_API_KEY manquant. Voir Paramètres.</p>
        )}

        {/* Étape 1 — Choisir le service à proposer */}
        <div className="mb-3">
          <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider mb-2">
            1. Service à proposer à ce prospect
          </p>
          <div className="grid grid-cols-2 gap-1.5">
            {SERVICE_OPTIONS.map(s => (
              <button
                key={s.id}
                type="button"
                onClick={() => updateServiceFocus(s.id)}
                className={`flex items-start gap-2 px-3 py-2 rounded-lg border text-left transition-all ${
                  serviceFocus === s.id
                    ? 'border-violet-500 bg-violet-500/10 text-foreground shadow-sm'
                    : 'border-border text-muted-foreground hover:border-violet-500/40 hover:text-foreground'
                }`}
                title={s.label}
              >
                <span className="text-base flex-shrink-0">{s.emoji}</span>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-bold">{s.short}</p>
                  <p className="text-[10px] leading-tight opacity-70 line-clamp-2">{s.label.replace(s.short + ' — ', '').split('(')[0]}</p>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Étape 2 — Langue + Ton + Générer */}
        <div className="mb-3">
          <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider mb-2">
            2. Langue et ton
          </p>
          <div className="grid grid-cols-3 gap-2">
            <Select value={language} onValueChange={(v: any) => setLanguage(v)}>
              <SelectTrigger className="h-9 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="fr">🇫🇷 Français</SelectItem>
                <SelectItem value="ar">🇲🇦 العربية</SelectItem>
                <SelectItem value="en">🇬🇧 English</SelectItem>
              </SelectContent>
            </Select>
            <Select value={tone} onValueChange={(v: any) => setTone(v)}>
              <SelectTrigger className="h-9 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="professionnel">Professionnel</SelectItem>
                <SelectItem value="chaleureux">Chaleureux</SelectItem>
                <SelectItem value="direct">Direct</SelectItem>
              </SelectContent>
            </Select>
            <Button
              size="sm"
              onClick={() => aiGen.mutate({
                id: prospect.id, channel: 'email', language, tone,
                sender_pitch: senderPitch,
                service_focus: activeService.label,
              }, {
                onSuccess: (r: any) => {
                  if (r?.draft?.subject) setEmailSubject(r.draft.subject)
                  if (r?.draft?.body)    setEmailBody(r.draft.body)
                }
              })}
              disabled={!status?.anthropic || aiGen.isPending}
              className="h-9 text-xs"
            >
              {aiGen.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
              Générer
            </Button>
          </div>
        </div>

        <details className="mb-2 group">
          <summary className="text-[11px] font-semibold text-muted-foreground cursor-pointer hover:text-foreground py-1 flex items-center gap-1">
            <span className="group-open:rotate-90 transition-transform inline-block">▸</span>
            Pitch de ton entreprise ({senderPitch.length} car.) — sauvegardé automatiquement
          </summary>
          <AutocorrectTextarea
            value={senderPitch}
            onChange={e => updatePitch(e.target.value)}
            className="input-field resize-none h-32 text-xs mt-1"
            placeholder="Décris tes offres CONCRÈTES (ERP, sites web, IA, marketing…). Sois précis — l'IA reprendra CE contexte pour proposer un service adapté au prospect."
          />
          <p className="text-[10px] text-muted-foreground mt-1">
            💡 Plus tu es précis (offres, cible, prix, exemples), meilleur sera l'email généré.
          </p>
        </details>
        <Input
          value={emailSubject}
          onChange={e => setEmailSubject(e.target.value)}
          placeholder="Objet de l'email"
          className="h-8 text-xs mb-2"
        />
        <AutocorrectTextarea
          value={emailBody}
          onChange={e => setEmailBody(e.target.value)}
          className="input-field resize-none h-32 text-xs font-mono"
          placeholder="Corps de l'email — utilise 'Générer' pour un draft IA"
        />

        {/* Signature — HTML pro avec logo, contact, footer */}
        <details className="mt-3 group">
          <summary className="text-[11px] font-semibold text-muted-foreground cursor-pointer hover:text-foreground py-1 flex items-center gap-1">
            <span className="group-open:rotate-90 transition-transform inline-block">▸</span>
            ✍ Signature ({sig.name} · {sig.company}) — sauvegardée automatiquement
          </summary>
          <div className="grid grid-cols-2 gap-2 mt-2">
            <div>
              <label className="text-[10px] text-muted-foreground block mb-0.5">Nom</label>
              <Input value={sig.name} onChange={e => updateSig('name', e.target.value)} className="h-8 text-xs" />
            </div>
            <div>
              <label className="text-[10px] text-muted-foreground block mb-0.5">Fonction</label>
              <Input value={sig.role} onChange={e => updateSig('role', e.target.value)} className="h-8 text-xs" />
            </div>
            <div>
              <label className="text-[10px] text-muted-foreground block mb-0.5">Entreprise</label>
              <Input value={sig.company} onChange={e => updateSig('company', e.target.value)} className="h-8 text-xs" />
            </div>
            <div>
              <label className="text-[10px] text-muted-foreground block mb-0.5">Téléphone</label>
              <Input value={sig.phone} onChange={e => updateSig('phone', e.target.value)} className="h-8 text-xs" />
            </div>
            <div className="col-span-2">
              <label className="text-[10px] text-muted-foreground block mb-0.5">Site web</label>
              <Input value={sig.website} onChange={e => updateSig('website', e.target.value)} className="h-8 text-xs" />
            </div>
          </div>
        </details>

        <div className="flex items-center justify-between mt-3">
          <p className="text-[10px] text-muted-foreground">
            {prospect.email ? `→ ${prospect.email}` : '⚠ Prospect sans email'}
          </p>
          <Button size="sm" onClick={doSendMail} disabled={!emailReady || sendMail.isPending} className="h-8 px-4 text-xs">
            {sendMail.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Send className="w-3 h-3" />}
            Envoyer l'email
          </Button>
        </div>
      </div>

      {/* WhatsApp */}
      <div className="rounded-xl border border-border bg-[var(--surface-card)] p-4">
        <div className="flex items-center gap-2 mb-3">
          <MessageCircle className="w-4 h-4 text-green-500" />
          <p className="text-sm font-bold text-foreground">WhatsApp (Meta Cloud API)</p>
        </div>

        {!status?.whatsapp && (
          <p className="text-[11px] text-red-600 mb-3">⚠ WhatsApp Cloud non configuré. Voir Paramètres.</p>
        )}
        {!canWa && status?.whatsapp && (
          <p className="text-[11px] text-amber-600 mb-3">⚠ Aucun numéro WhatsApp/téléphone renseigné pour ce prospect.</p>
        )}

        <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Template pré-approuvé Meta</label>
        <Select value={waTemplateId || '__none__'} onValueChange={v => setWaTemplateId(v === '__none__' ? '' : v)}>
          <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Choisir un template WhatsApp…" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__none__">—</SelectItem>
            {waTemplates.filter(t => t.actif && t.whatsapp_template_name).map(t => (
              <SelectItem key={t.id} value={t.id}>
                {t.nom} · {t.whatsapp_template_name} ({t.whatsapp_template_language ?? '?'})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {waTemplates.filter(t => t.actif && t.whatsapp_template_name).length === 0 && (
          <p className="text-[11px] text-muted-foreground mt-2">
            Aucun template WhatsApp configuré. Crée-en un dans <strong>Templates</strong> avec le nom exact du template Meta approuvé.
          </p>
        )}

        <div className="flex items-center justify-between mt-3">
          <p className="text-[10px] text-muted-foreground">
            → {prospect.whatsapp || prospect.telephone || '—'}
          </p>
          <Button
            size="sm"
            onClick={doSendWa}
            disabled={!canWa || !waTemplateId || sendWa.isPending}
            className="h-8 px-4 text-xs bg-green-600 hover:bg-green-700 text-white"
          >
            {sendWa.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <MessageCircle className="w-3 h-3" />}
            Envoyer WhatsApp
          </Button>
        </div>
      </div>
    </div>
  )
}

function VerifBadge({ status }: { status: string | null }) {
  if (!status) return null
  const cfg: Record<string, { label: string; cls: string }> = {
    valid:   { label: '✓ Valide',       cls: 'bg-emerald-500/20 text-emerald-700 dark:text-emerald-400' },
    invalid: { label: '✗ Invalide',     cls: 'bg-red-500/15 text-red-600' },
    risky:   { label: '⚠ À risque',     cls: 'bg-amber-500/15 text-amber-600' },
    unknown: { label: '? Inconnu',      cls: 'bg-muted text-muted-foreground' },
  }
  const c = cfg[status] ?? cfg.unknown
  return <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded ${c.cls}`}>{c.label}</span>
}
