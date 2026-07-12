/**
 * ProjectDataRef — lit une donnée déjà présente dans la fiche projet et
 * l'affiche dans un SOP. Si la donnée manque, propose un bouton
 * « Compléter les informations » qui deep-link vers la section concernée
 * du projet (via CustomEvent 'sop:goto-section' capté par ProjetDetail).
 *
 * Objectif : le SOP ne redemande jamais une info déjà connue (nom client,
 * téléphone, domaine, email, budget, VPS, chef de projet).
 */
import { Building2, Mail, Phone, Globe, Server, User, Calendar, Wallet, Info, AlertTriangle, ArrowRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatCurrency, formatDate } from '@/lib/utils'
import type { Projet } from '@/hooks/useProjets'
import type { Client } from '@/hooks/useClients'
import type { SopProjectField, SopProjectRefMeta } from '@/hooks/useSops'

interface Props {
  meta:    SopProjectRefMeta
  projet?: Projet
  client?: Client
}

interface Resolved {
  label:   string
  value:   string | null
  icon:    React.ElementType
  section: 'overview' | 'infos' | 'team' | 'docs' | 'infra'
  hint:    string          // pour l'état vide
}

function resolve(field: SopProjectField, projet?: Projet, client?: Client): Resolved {
  switch (field) {
    case 'client.name':
      return { label: 'Client', value: client?.nom ?? null, icon: Building2, section: 'overview',
        hint: 'Aucun client lié à ce projet.' }
    case 'client.company':
      return { label: 'Entreprise', value: client?.entreprise ?? null, icon: Building2, section: 'overview',
        hint: 'Aucune entreprise renseignée dans la fiche client.' }
    case 'client.email':
      return { label: 'Email client', value: client?.email ?? null, icon: Mail, section: 'overview',
        hint: 'Aucun email dans la fiche client.' }
    case 'client.phone':
      return { label: 'Téléphone client', value: client?.telephone ?? null, icon: Phone, section: 'overview',
        hint: 'Aucun téléphone dans la fiche client.' }
    case 'project.name':
      return { label: 'Projet', value: projet?.nom ?? null, icon: Info, section: 'overview',
        hint: 'Nom du projet manquant.' }
    case 'project.description':
      return { label: 'Description', value: projet?.description ?? null, icon: Info, section: 'overview',
        hint: 'Aucune description renseignée.' }
    case 'project.budget':
      return { label: 'Budget', value: projet?.budget != null ? formatCurrency(projet.budget) : null, icon: Wallet, section: 'overview',
        hint: 'Aucun budget renseigné dans la vue d\'ensemble.' }
    case 'project.responsable':
      return { label: 'Chef de projet', value: projet?.responsable ?? null, icon: User, section: 'team',
        hint: 'Aucun chef de projet désigné.' }
    case 'project.date_debut':
      return { label: 'Date de début', value: projet?.date_debut ? formatDate(projet.date_debut) : null, icon: Calendar, section: 'overview',
        hint: 'Aucune date de début.' }
    case 'project.date_fin_prevue':
      return { label: 'Date de fin prévue', value: projet?.date_fin_prevue ? formatDate(projet.date_fin_prevue) : null, icon: Calendar, section: 'overview',
        hint: 'Aucune date de fin prévue.' }
    case 'domain':
      return { label: 'Domaine', value: readNotesField(projet, 'domain'), icon: Globe, section: 'infos',
        hint: 'Domaine non renseigné dans Infos & Accès.' }
    case 'vps':
      return { label: 'VPS', value: readNotesField(projet, 'vps'), icon: Server, section: 'infos',
        hint: 'VPS non renseigné dans Infos & Accès.' }
    case 'hosting':
      return { label: 'Hébergement', value: readNotesField(projet, 'hosting'), icon: Server, section: 'infos',
        hint: 'Hébergement non renseigné dans Infos & Accès.' }
  }
}

function readNotesField(projet: Projet | undefined, key: string): string | null {
  if (!projet?.notes) return null
  try {
    const parsed = JSON.parse(projet.notes)
    const v = parsed?.[key]
    return typeof v === 'string' && v.trim() ? v : null
  } catch { return null }
}

export default function ProjectDataRef({ meta, projet, client }: Props) {
  const r = resolve(meta.field, projet, client)
  const Icon = r.icon
  const label = meta.label ?? r.label
  const targetSection = meta.section ?? r.section

  const goToSection = () => {
    window.dispatchEvent(new CustomEvent('sop:goto-section', { detail: { section: targetSection } }))
  }

  if (r.value) {
    return (
      <div className={cn(
        'my-2 inline-flex items-center gap-2 pl-2 pr-3 py-1.5 rounded-lg',
        'bg-blue-50/70 border border-blue-200/70 dark:bg-blue-950/30 dark:border-blue-900/40',
      )}>
        <span className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-blue-600 dark:text-blue-400">
          <Icon className="w-3 h-3" />
          {label}
        </span>
        <span className="text-sm font-semibold text-foreground">{r.value}</span>
        <span className="text-[9px] text-blue-500/70 font-mono">auto</span>
      </div>
    )
  }

  return (
    <div className="my-2 rounded-lg border border-amber-300 dark:border-amber-800 bg-amber-50/70 dark:bg-amber-950/30 p-3 flex items-start gap-3">
      <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-amber-800 dark:text-amber-300">
          ⚠ Information manquante — {label}
        </p>
        <p className="text-xs text-amber-700/80 dark:text-amber-400/80 mt-0.5">
          {r.hint}
        </p>
      </div>
      <button
        type="button"
        onClick={goToSection}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-500 text-white text-xs font-semibold hover:bg-amber-600 transition-colors flex-shrink-0"
      >
        Compléter
        <ArrowRight className="w-3 h-3" />
      </button>
    </div>
  )
}
