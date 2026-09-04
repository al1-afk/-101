/* Ce fichier exporte aussi deux fabricants de libellés (« En ligne », « vu
   il y a 5 min ») à côté de ses composants : les séparer pour satisfaire le
   rafraîchissement à chaud coûterait un fichier de plus pour douze lignes
   qui ne servent qu'ici. */
/* eslint-disable react-refresh/only-export-components */
/**
 * PresenceDot — les atomes d'identité de la messagerie : la pastille de
 * présence, son libellé, et l'avatar qui la porte.
 *
 * L'avatar vit ici et non dans un fichier à part parce qu'il n'est jamais
 * dessiné sans sa pastille : liste des correspondants, en-tête du fil et
 * boîte « Nouveau message » affichent tous les trois le même bloc, et les
 * séparer garantissait de les voir diverger à la première retouche.
 *
 * La présence est calculée par le serveur (battement de cœur user_presence,
 * migration 080) : on ne la recalcule pas ici, on la peint.
 */
import { cn } from '@/lib/utils'
import type { DmContact } from '@/lib/api'

type Presence = DmContact['presence']

const PRESENCE_STYLE: Record<Presence, string> = {
  online:  'bg-emerald-500',
  idle:    'bg-amber-400',
  offline: 'bg-slate-300 dark:bg-slate-600',
}

const PRESENCE_LABEL: Record<Presence, string> = {
  online:  'En ligne',
  idle:    'Inactif',
  offline: 'Hors ligne',
}

/** « vu il y a 12 min » — vide tant qu'on n'a jamais vu la personne. */
export function lastSeenLabel(lastSeenAt: string | null): string {
  if (!lastSeenAt) return ''
  const seconds = Math.floor((Date.now() - new Date(lastSeenAt).getTime()) / 1000)
  /* Une horloge client en avance donnerait « il y a -3 min » : on plafonne. */
  if (!Number.isFinite(seconds) || seconds < 60) return 'vu à l’instant'
  if (seconds < 3600)   return `vu il y a ${Math.floor(seconds / 60)} min`
  if (seconds < 86400)  return `vu il y a ${Math.floor(seconds / 3600)} h`
  if (seconds < 604800) return `vu il y a ${Math.floor(seconds / 86400)} j`
  return `vu le ${new Date(lastSeenAt).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}`
}

/** Texte complet affiché sous le nom : « En ligne », « Hors ligne · vu il y a 5 min ». */
export function presenceLabel(presence: Presence, lastSeenAt: string | null): string {
  if (presence === 'online') return PRESENCE_LABEL.online
  const seen = lastSeenLabel(lastSeenAt)
  if (!seen) return PRESENCE_LABEL[presence]
  return `${PRESENCE_LABEL[presence]} · ${seen}`
}

interface PresenceDotProps {
  presence:  Presence
  /** Anneau de la couleur du fond : indispensable quand la pastille chevauche un avatar. */
  ringed?:   boolean
  className?: string
}

export default function PresenceDot({ presence, ringed = false, className }: PresenceDotProps) {
  return (
    <span
      title={PRESENCE_LABEL[presence]}
      aria-label={PRESENCE_LABEL[presence]}
      className={cn(
        'inline-block w-2.5 h-2.5 rounded-full flex-shrink-0',
        PRESENCE_STYLE[presence],
        ringed && 'ring-2 ring-[var(--surface-card)]',
        className,
      )}
    />
  )
}

interface ContactAvatarProps {
  name:        string
  avatarUrl?:  string | null
  presence?:   Presence
  /** Diamètre en pixels : la pastille et la typographie suivent. */
  size?:       number
  className?:  string
}

/** Photo si elle existe, initiales sinon — jamais de trou dans la liste. */
export function ContactAvatar({
  name, avatarUrl, presence, size = 40, className,
}: ContactAvatarProps) {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .map(part => part[0])
    .join('')
    .toUpperCase()
    .slice(0, 2) || '?'

  return (
    <span
      className={cn('relative inline-flex flex-shrink-0', className)}
      style={{ width: size, height: size }}
    >
      {avatarUrl ? (
        <img
          src={avatarUrl}
          alt={name}
          className="w-full h-full rounded-full object-cover border border-black/[0.06] dark:border-white/[0.08]"
        />
      ) : (
        <span
          className="w-full h-full rounded-full bg-gradient-to-br from-blue-500 via-blue-600 to-cyan-500 text-white font-bold flex items-center justify-center select-none"
          style={{ fontSize: Math.max(10, Math.round(size * 0.36)) }}
        >
          {initials}
        </span>
      )}
      {presence && (
        <PresenceDot
          presence={presence}
          ringed
          className="absolute -bottom-0.5 -right-0.5"
        />
      )}
    </span>
  )
}
