import { useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  X, Share2, Users, Loader2, Check, Mail, Eye, MessageCircle, Pencil,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import { useTenantMembers } from '@/hooks/useTenant'
import {
  useSopShares, useCreateSopShare, useUpdateSopShare, useDeleteSopShare,
  type SopAccessLevel,
} from '@/hooks/useSopCollab'
import { useAuth } from '@/hooks/useAuth'

interface Props {
  open:    boolean
  sopId:   string | null
  sopTitle:string
  onClose: () => void
}

const ACCESS_OPTIONS: { value: SopAccessLevel; label: string; icon: React.ElementType; desc: string }[] = [
  { value: 'read',    label: 'Lecture seule', icon: Eye,         desc: 'Peut consulter'   },
  { value: 'comment', label: 'Peut commenter',icon: MessageCircle,desc: 'Lecture + commentaires' },
  { value: 'edit',    label: 'Peut modifier', icon: Pencil,      desc: 'Édition complète' },
]

export function SopShareDialog({ open, sopId, sopTitle, onClose }: Props) {
  const [search, setSearch] = useState('')
  const [defaultAccess, setDefaultAccess] = useState<SopAccessLevel>('read')

  const { userId } = useAuth()
  const { data: members = [], isLoading: loadingMembers } = useTenantMembers()
  const { data: allShares = [] } = useSopShares()
  const create = useCreateSopShare()
  const update = useUpdateSopShare()
  const remove = useDeleteSopShare()

  const sopShares = useMemo(() => allShares.filter(s => s.sop_id === sopId), [allShares, sopId])
  const shareByUserId = useMemo(() => new Map(sopShares.map(s => [s.shared_with ?? '', s])), [sopShares])

  const filteredMembers = useMemo(() => {
    const q = search.trim().toLowerCase()
    const list = members.filter(m => m.status === 'active' && m.user_id && m.user_id !== userId)
    if (!q) return list
    return list.filter(m =>
      (m.name || '').toLowerCase().includes(q) ||
      (m.email || '').toLowerCase().includes(q),
    )
  }, [members, search, userId])

  const handleToggleShare = async (memberId: string) => {
    if (!sopId) return
    const existing = shareByUserId.get(memberId)
    if (existing) {
      await remove.mutateAsync(existing.id)
    } else {
      await create.mutateAsync({
        sop_id:       sopId,
        shared_with:  memberId,
        shared_by:    userId ?? null,
        access_level: defaultAccess,
      })
    }
  }

  const handleAccessChange = async (shareId: string, level: SopAccessLevel) => {
    await update.mutateAsync({ id: shareId, access_level: level })
  }

  const handleCopyLink = () => {
    if (!sopId) return
    const url = `${window.location.origin}/sop?id=${sopId}`
    navigator.clipboard.writeText(url).then(() => toast.success('Lien copié'))
  }

  if (!open || !sopId) return null

  return createPortal(
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        style={{ position: 'fixed', inset: 0, zIndex: 110 }}
        className="bg-slate-950/70 backdrop-blur-md flex items-center justify-center p-4"
        onClick={onClose}
      >
        <motion.div
          initial={{ opacity: 0, y: 20, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 20, scale: 0.97 }}
          transition={{ type: 'spring', damping: 28, stiffness: 280 }}
          className="bg-background border border-border rounded-2xl shadow-2xl w-full max-w-lg max-h-[85vh] flex flex-col overflow-hidden"
          onClick={e => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-border bg-gradient-to-br from-blue-50/50 to-emerald-50/30 dark:from-blue-950/20 dark:to-emerald-950/10">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-emerald-500 flex items-center justify-center shadow-md">
                <Share2 className="w-5 h-5 text-white" />
              </div>
              <div className="min-w-0">
                <h2 className="text-base font-extrabold text-foreground">Partager ce SOP</h2>
                <p className="text-xs text-muted-foreground truncate">{sopTitle}</p>
              </div>
            </div>
            <button onClick={onClose} className="p-2 rounded-lg hover:bg-white/80 dark:hover:bg-slate-800">
              <X className="w-5 h-5 text-muted-foreground" />
            </button>
          </div>

          {/* Body */}
          <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
            {/* Default access selector */}
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-2">Niveau d'accès par défaut</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                {ACCESS_OPTIONS.map(opt => {
                  const Icon = opt.icon
                  const active = defaultAccess === opt.value
                  return (
                    <button key={opt.value} onClick={() => setDefaultAccess(opt.value)}
                      className={cn(
                        'flex flex-col items-center gap-1 p-2 rounded-lg border transition-all text-xs',
                        active
                          ? 'border-blue-500 bg-blue-50 dark:bg-blue-950/30 text-blue-700 dark:text-blue-300'
                          : 'border-border bg-background hover:border-blue-300 text-muted-foreground hover:text-foreground',
                      )}>
                      <Icon className="w-4 h-4" />
                      <span className="font-semibold">{opt.label}</span>
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Search */}
            <div className="relative">
              <Users className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Rechercher un membre…" className="pl-9" />
            </div>

            {/* Members list */}
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-2">
                Membres de l'équipe ({filteredMembers.length})
              </p>
              {loadingMembers ? (
                <div className="flex items-center justify-center py-10">
                  <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
                </div>
              ) : filteredMembers.length === 0 ? (
                <p className="text-center text-sm text-muted-foreground py-6">Aucun membre trouvé.</p>
              ) : (
                <div className="space-y-1">
                  {filteredMembers.map(m => {
                    const memberId = m.user_id!
                    const share = shareByUserId.get(memberId)
                    return (
                      <div key={memberId} className="flex items-center gap-3 px-2 py-2 rounded-lg hover:bg-muted/40">
                        <div className="w-9 h-9 rounded-full bg-gradient-to-br from-blue-500 to-violet-600 text-white text-xs font-bold flex items-center justify-center flex-shrink-0">
                          {(m.name || m.email || '?').slice(0, 1).toUpperCase()}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-foreground truncate">{m.name || '—'}</p>
                          <p className="text-xs text-muted-foreground truncate flex items-center gap-1">
                            <Mail className="w-3 h-3" />{m.email}
                          </p>
                        </div>
                        {share ? (
                          <div className="flex items-center gap-2">
                            <select value={share.access_level}
                              onChange={e => handleAccessChange(share.id, e.target.value as SopAccessLevel)}
                              className="h-7 rounded-md border border-border bg-[var(--surface-input)] px-2 text-xs">
                              {ACCESS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                            </select>
                            <button onClick={() => handleToggleShare(memberId)}
                              className="p-1.5 rounded-md text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-900/30"
                              title="Retirer l'accès">
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ) : (
                          <Button size="sm" variant="secondary" onClick={() => handleToggleShare(memberId)}
                            disabled={create.isPending}
                            className="h-7 text-xs">
                            <Check className="w-3 h-3" /> Partager
                          </Button>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between gap-3 px-5 py-3 border-t border-border bg-card/95">
            <button onClick={handleCopyLink} className="text-xs text-blue-600 dark:text-blue-400 hover:underline font-semibold">
              📋 Copier le lien
            </button>
            <Button size="sm" onClick={onClose}>Terminé</Button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>,
    document.body,
  )
}
