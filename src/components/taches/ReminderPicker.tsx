/**
 * Choix des rappels d'une tâche — « préviens-moi 5 min / 30 min / 1 jour avant ».
 *
 * Trois états, et la distinction compte :
 *   null  → « mes réglages par défaut » (le cas de la grande majorité
 *            des tâches : on ne veut rien décider à chaque saisie)
 *   []    → « aucun rappel sur celle-ci », choix explicite
 *   [30]  → rappels sur mesure
 *
 * Le bouton affiche toujours l'état courant en clair, sinon on ne sait
 * jamais si une tâche est réellement couverte par un rappel.
 */
import { Bell, BellOff, ChevronDown } from 'lucide-react'
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent,
  DropdownMenuCheckboxItem, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'

/**
 * Nombre maximal de rappels par tâche. Même valeur que `MAX_OFFSETS`
 * dans server/routes/taskReminders.ts et que la contrainte SQL
 * `task_reminder_prefs_offsets_ck` : proposer une 6e case ferait
 * échouer l'enregistrement en laissant l'écran afficher un réglage qui
 * n'est pas en base.
 */
export const MAX_OFFSETS = 5

/** Les offsets proposés — au-delà, la liste devient un formulaire. */
export const OFFSET_CHOICES: { min: number; label: string }[] = [
  { min: 5,    label: '5 minutes avant' },
  { min: 15,   label: '15 minutes avant' },
  { min: 30,   label: '30 minutes avant' },
  { min: 60,   label: '1 heure avant' },
  { min: 1440, label: '1 jour avant' },
  { min: 2880, label: '2 jours avant' },
]

export function offsetShort(min: number): string {
  if (min < 60)   return `${min} min`
  if (min < 1440) return `${Math.round(min / 60)} h`
  const d = Math.round(min / 1440)
  return d === 1 ? '1 j' : `${d} j`
}

/** « 30 min, 1 j » ou « par défaut » ou « aucun ». */
export function describeOffsets(offsets: number[] | null | undefined): string {
  if (offsets == null) return 'par défaut'
  if (!offsets.length) return 'aucun'
  return [...offsets].sort((a, b) => b - a).map(offsetShort).join(', ')
}

export function ReminderPicker({
  value, defaults, defaultsReady = true, onChange, className, compact,
}: {
  /** null = suivre les réglages par défaut. */
  value: number[] | null
  /** Réglages par défaut de la personne, affichés en repère. */
  defaults?: number[]
  /** false tant que les réglages ne sont pas chargés (évite de figer un repli). */
  defaultsReady?: boolean
  onChange: (next: number[] | null) => void
  className?: string
  compact?: boolean
}) {
  const active = value ?? defaults ?? []
  const none = value !== null && value.length === 0

  const toggle = (min: number) => {
    /* Premier clic sur une tâche « par défaut » : on part des valeurs
       par défaut plutôt que d'une liste vide — sinon cocher « 5 min »
       supprimerait silencieusement le rappel de la veille.

       `defaults` n'est repris que s'il est RÉELLEMENT chargé : sinon on
       matérialiserait le repli du hook ([1440, 30]) dans la tâche, en le
       faisant passer pour un choix de la personne. */
    const base = value ?? (defaultsReady ? defaults ?? [] : [])
    if (base.includes(min)) {
      onChange(base.filter(m => m !== min).sort((a, b) => b - a))
      return
    }
    /* Plafond aligné sur le serveur : au-delà, l'enregistrement échouerait. */
    if (base.length >= MAX_OFFSETS) return
    onChange([...base, min].sort((a, b) => b - a))
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className={cn(
            'inline-flex items-center gap-1.5 rounded-lg border border-border bg-[var(--surface-input)]',
            'text-foreground hover:border-electric-500/40 transition-colors',
            compact ? 'h-9 px-2.5 text-xs' : 'h-10 px-3 text-sm',
            className,
          )}
          title="Quand veux-tu être prévenu ?"
        >
          {none
            ? <BellOff className="w-3.5 h-3.5 text-muted-foreground" />
            : <Bell className="w-3.5 h-3.5 text-muted-foreground" />}
          <span className={cn(none && 'text-muted-foreground')}>{describeOffsets(value)}</span>
          <ChevronDown className="w-3 h-3 text-muted-foreground" />
        </button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="start" className="w-60">
        <DropdownMenuLabel className="text-[11px]">Me prévenir</DropdownMenuLabel>
        {OFFSET_CHOICES.map(o => (
          <DropdownMenuCheckboxItem
            key={o.min}
            checked={!none && active.includes(o.min)}
            /* Plein et non coché : la case est inerte plutôt que de
               produire un enregistrement refusé par le serveur. */
            disabled={!none && active.length >= MAX_OFFSETS && !active.includes(o.min)}
            onCheckedChange={() => toggle(o.min)}
            onSelect={e => e.preventDefault()}   // garder le menu ouvert
          >
            {o.label}
          </DropdownMenuCheckboxItem>
        ))}

        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => onChange(null)} disabled={value == null}>
          Utiliser mes réglages par défaut
          {defaults?.length ? (
            <span className="ml-1 text-[11px] text-muted-foreground">
              ({describeOffsets(defaults)})
            </span>
          ) : null}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => onChange([])} disabled={none}>
          Aucun rappel sur cette tâche
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
