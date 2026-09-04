/**
 * ConversationList — la colonne de gauche de l'écran Messages : la liste des
 * COLLÈGUES, pas celle des fils. C'est une demande explicite du client : on
 * doit pouvoir écrire à quelqu'un qui ne nous a jamais écrit, donc une
 * personne sans conversation reste visible, simplement sans aperçu.
 *
 * La recherche est locale : le serveur renvoie déjà tout l'espace (quelques
 * dizaines de lignes au plus), un aller-retour réseau par frappe serait du
 * gaspillage pur.
 */
import { useMemo, useState } from 'react'
import { Search, Plus, Users, AlertCircle, RefreshCw, Paperclip } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { DmContact } from '@/lib/api'
import PresenceDot, { ContactAvatar, lastSeenLabel, presenceLabel } from './PresenceDot'

interface ConversationListProps {
  contacts:     DmContact[]
  /** Correspondant affiché à droite : sert à surligner sa ligne. */
  activeUserId: string | null
  isLoading:    boolean
  isError:      boolean
  onRetry:      () => void
  onSelect:     (contact: DmContact) => void
  onNewMessage: () => void
  className?:   string
}

/** Heure courte de la colonne : aujourd'hui l'heure, hier le mot, sinon la date. */
function formatListTime(iso: string | null): string {
  if (!iso) return ''
  const date  = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  const now   = new Date()
  const day   = new Date(date.getFullYear(), date.getMonth(), date.getDate())
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const days  = Math.round((today.getTime() - day.getTime()) / 86_400_000)
  if (days <= 0) return date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
  if (days === 1) return 'Hier'
  if (days < 7)   return date.toLocaleDateString('fr-FR', { weekday: 'short' })
  return date.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' })
}

/** Retire les accents pour que « Amelie » trouve « Amélie ». */
function fold(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
}

function ContactSkeleton() {
  return (
    <div className="flex items-center gap-3 px-3 py-3">
      <div className="w-10 h-10 rounded-full bg-black/[0.06] dark:bg-white/[0.06] animate-pulse flex-shrink-0" />
      <div className="flex-1 min-w-0 space-y-2">
        <div className="h-3 w-1/2 rounded bg-black/[0.06] dark:bg-white/[0.06] animate-pulse" />
        <div className="h-2.5 w-3/4 rounded bg-black/[0.04] dark:bg-white/[0.04] animate-pulse" />
      </div>
    </div>
  )
}

export default function ConversationList({
  contacts, activeUserId, isLoading, isError, onRetry, onSelect, onNewMessage, className,
}: ConversationListProps) {
  const [search, setSearch] = useState('')

  /* L'ordre vient du serveur (fils vivants d'abord, puis alphabétique) : on
     se contente de filtrer, sinon la liste sauterait à chaque rafraîchissement. */
  const filtered = useMemo(() => {
    const needle = fold(search.trim())
    if (!needle) return contacts
    return contacts.filter(c =>
      fold(c.name).includes(needle) || fold(c.email ?? '').includes(needle))
  }, [contacts, search])

  const totalUnread = useMemo(
    () => contacts.reduce((sum, c) => sum + (c.unread || 0), 0),
    [contacts],
  )

  return (
    <div className={cn('flex flex-col min-h-0 h-full', className)}>
      {/* En-tête : titre, compteur global, bouton de rédaction */}
      <div className="px-3 sm:px-4 pt-3 pb-2 border-b border-border flex-shrink-0">
        <div className="flex items-center justify-between gap-2 mb-2.5">
          <div className="flex items-center gap-2 min-w-0">
            <h2 className="section-title truncate">Messages</h2>
            {totalUnread > 0 && (
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-red-500 text-white">
                {totalUnread > 99 ? '99+' : totalUnread}
              </span>
            )}
          </div>
          <Button size="sm" onClick={onNewMessage} className="flex-shrink-0">
            <Plus className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Nouveau message</span>
            <span className="sm:hidden">Nouveau</span>
          </Button>
        </div>

        <div className="relative">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
          <input
            type="search"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Rechercher un employé…"
            aria-label="Rechercher un employé"
            className="w-full h-9 rounded-xl pl-9 pr-3 text-[13px] bg-[var(--surface-input)] border border-black/[0.08] dark:border-white/[0.06] text-foreground placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:border-electric-500 transition-colors"
          />
        </div>
      </div>

      {/* Liste */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        {isError ? (
          <div className="p-6 text-center">
            <AlertCircle className="w-8 h-8 text-red-500/70 mx-auto mb-2" />
            <p className="text-sm text-foreground font-medium">Impossible de charger vos collègues</p>
            <p className="text-xs text-muted-foreground mt-1">
              Vérifiez votre connexion, puis réessayez.
            </p>
            <Button variant="secondary" size="sm" onClick={onRetry} className="mt-3">
              <RefreshCw className="w-3.5 h-3.5" /> Réessayer
            </Button>
          </div>
        ) : isLoading && contacts.length === 0 ? (
          <div className="py-1">
            {Array.from({ length: 6 }).map((_, i) => <ContactSkeleton key={i} />)}
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-6 text-center">
            <Users className="w-8 h-8 text-muted-foreground/40 mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">
              {search.trim()
                ? 'Aucun collègue ne correspond à cette recherche.'
                : 'Aucun autre compte actif dans cet espace pour le moment.'}
            </p>
          </div>
        ) : (
          <ul className="py-1">
            {filtered.map(contact => {
              const active = contact.user_id === activeUserId
              const hasUnread = contact.unread > 0
              const preview = contact.last_message_preview?.trim()
              return (
                <li key={contact.user_id}>
                  <button
                    type="button"
                    onClick={() => onSelect(contact)}
                    aria-current={active ? 'true' : undefined}
                    /* La ligne n'a pas la place d'afficher « Hors ligne · vu il
                       y a 12 min » sous l'aperçu du dernier message : l'info
                       reste accessible au survol, et en entier dans l'en-tête
                       de la conversation. */
                    title={`${contact.name} — ${presenceLabel(contact.presence, contact.last_seen_at)}`}
                    className={cn(
                      'w-full text-left px-3 sm:px-4 py-2.5 flex items-center gap-3 transition-colors',
                      active
                        ? 'bg-blue-50 dark:bg-blue-500/10'
                        : 'hover:bg-black/[0.03] dark:hover:bg-white/[0.04]',
                    )}
                  >
                    <ContactAvatar
                      name={contact.name}
                      avatarUrl={contact.avatar_url}
                      presence={contact.presence}
                      size={40}
                    />

                    <span className="flex-1 min-w-0">
                      <span className="flex items-center gap-2">
                        <span className={cn(
                          'flex-1 min-w-0 truncate text-[13.5px]',
                          hasUnread ? 'font-bold text-foreground' : 'font-semibold text-foreground',
                        )}>
                          {contact.name}
                        </span>
                        {contact.last_message_at && (
                          <span className={cn(
                            'text-[10px] whitespace-nowrap flex-shrink-0',
                            hasUnread ? 'text-blue-600 dark:text-blue-400 font-semibold' : 'text-muted-foreground',
                          )}>
                            {formatListTime(contact.last_message_at)}
                          </span>
                        )}
                      </span>

                      <span className="flex items-center gap-2 mt-0.5">
                        <span className={cn(
                          'flex-1 min-w-0 truncate text-[11.5px] flex items-center gap-1',
                          hasUnread ? 'text-foreground font-medium' : 'text-muted-foreground',
                        )}>
                          {preview ? (
                            <>
                              {contact.last_message_mine && (
                                <span className="text-muted-foreground flex-shrink-0">Vous :</span>
                              )}
                              <span className="truncate">{preview}</span>
                            </>
                          ) : (
                            <span className="italic text-muted-foreground/80 truncate">
                              {contact.presence === 'offline'
                                ? (lastSeenLabel(contact.last_seen_at) || 'Aucun message échangé')
                                : 'Aucun message échangé'}
                            </span>
                          )}
                        </span>
                        {hasUnread && (
                          <span className="text-[10px] font-bold min-w-[18px] h-[18px] px-1.5 rounded-full bg-red-500 text-white flex items-center justify-center flex-shrink-0">
                            {contact.unread > 99 ? '99+' : contact.unread}
                          </span>
                        )}
                      </span>
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </div>

      {/* Légende de présence : trois couleurs, aucune explication ailleurs. */}
      <div className="flex-shrink-0 border-t border-border px-3 sm:px-4 py-2 flex items-center gap-3 text-[10px] text-muted-foreground">
        <span className="flex items-center gap-1"><PresenceDot presence="online" /> En ligne</span>
        <span className="flex items-center gap-1"><PresenceDot presence="idle" /> Inactif</span>
        <span className="flex items-center gap-1"><PresenceDot presence="offline" /> Hors ligne</span>
        <span className="ml-auto hidden lg:flex items-center gap-1">
          <Paperclip className="w-3 h-3" /> Pièces jointes acceptées
        </span>
      </div>
    </div>
  )
}
