/**
 * NewMessageDialog — choix du destinataire avant rédaction.
 *
 * La liste de gauche suffit dans 90 % des cas ; cette boîte existe pour le
 * cas restant : un espace de trente personnes où l'on cherche quelqu'un à
 * qui l'on n'a jamais écrit, et qui se trouve donc tout en bas du classement
 * par dernier message.
 *
 * Choisir quelqu'un ne crée rien de visible pour lui : la conversation
 * n'existe côté serveur qu'à partir du premier message envoyé.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Search, Loader2, Users } from 'lucide-react'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import type { DmContact } from '@/lib/api'
import { ContactAvatar, presenceLabel } from './PresenceDot'

interface NewMessageDialogProps {
  open:         boolean
  onOpenChange: (open: boolean) => void
  contacts:     DmContact[]
  isLoading:    boolean
  onPick:       (contact: DmContact) => void
}

/** Retire les accents pour que « Amelie » trouve « Amélie ». */
function fold(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
}

export default function NewMessageDialog({
  open, onOpenChange, contacts, isLoading, onPick,
}: NewMessageDialogProps) {
  const [search, setSearch] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  /* Le filtre est vidé à la FERMETURE, pas à l'ouverture : rouvrir la boîte
     sur la recherche de la fois précédente donnerait l'impression que des
     gens ont disparu, et remettre l'état à zéro depuis un effet d'ouverture
     ferait rendre la liste filtrée le temps d'une image. */
  const handleOpenChange = useCallback((next: boolean) => {
    if (!next) setSearch('')
    onOpenChange(next)
  }, [onOpenChange])

  useEffect(() => {
    if (!open) return
    /* Le focus attend la fin de l'animation d'ouverture de Radix. */
    const timer = setTimeout(() => inputRef.current?.focus(), 80)
    return () => clearTimeout(timer)
  }, [open])

  /* Ici, contrairement à la colonne de gauche, l'ordre alphabétique prime :
     on cherche une personne, pas une conversation récente. */
  const filtered = useMemo(() => {
    const needle = fold(search.trim())
    const base = needle
      ? contacts.filter(c => fold(c.name).includes(needle) || fold(c.email ?? '').includes(needle))
      : contacts
    return base.slice().sort((a, b) => a.name.localeCompare(b.name, 'fr'))
  }, [contacts, search])

  const pick = (contact: DmContact) => {
    handleOpenChange(false)
    onPick(contact)
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Nouveau message</DialogTitle>
          <DialogDescription>
            Choisissez la personne à qui écrire. La conversation reste privée entre vous deux.
          </DialogDescription>
        </DialogHeader>

        <div className="relative">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
          <input
            ref={inputRef}
            type="search"
            value={search}
            onChange={e => setSearch(e.target.value)}
            onKeyDown={e => {
              /* Entrée ouvre le premier résultat : chercher puis viser à la
                 souris pour un seul nom restant serait deux gestes de trop. */
              if (e.key === 'Enter' && filtered.length > 0) {
                e.preventDefault()
                pick(filtered[0])
              }
            }}
            placeholder="Rechercher un employé…"
            aria-label="Rechercher un employé"
            className="w-full h-10 rounded-xl pl-9 pr-3 text-[13.5px] bg-[var(--surface-input)] border border-black/[0.08] dark:border-white/[0.06] text-foreground placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:border-electric-500 transition-colors"
          />
        </div>

        <div className="max-h-[46vh] overflow-y-auto -mx-1 px-1">
          {isLoading && contacts.length === 0 ? (
            <div className="flex justify-center py-8">
              <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="py-8 text-center">
              <Users className="w-8 h-8 text-muted-foreground/40 mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">
                {search.trim()
                  ? 'Aucun collègue ne correspond à cette recherche.'
                  : 'Aucun autre compte actif dans cet espace.'}
              </p>
            </div>
          ) : (
            <ul className="space-y-0.5">
              {filtered.map(contact => (
                <li key={contact.user_id}>
                  <button
                    type="button"
                    onClick={() => pick(contact)}
                    className={cn(
                      'w-full text-left px-2 py-2 rounded-xl flex items-center gap-3 transition-colors',
                      'hover:bg-black/[0.04] dark:hover:bg-white/[0.06]',
                    )}
                  >
                    <ContactAvatar
                      name={contact.name}
                      avatarUrl={contact.avatar_url}
                      presence={contact.presence}
                      size={36}
                    />
                    <span className="flex-1 min-w-0">
                      <span className="block text-[13.5px] font-semibold text-foreground truncate">
                        {contact.name}
                      </span>
                      <span className="block text-[11px] text-muted-foreground truncate">
                        {contact.email || presenceLabel(contact.presence, contact.last_seen_at)}
                      </span>
                    </span>
                    {contact.unread > 0 && (
                      <span className="text-[10px] font-bold min-w-[18px] h-[18px] px-1.5 rounded-full bg-red-500 text-white flex items-center justify-center flex-shrink-0">
                        {contact.unread > 99 ? '99+' : contact.unread}
                      </span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
