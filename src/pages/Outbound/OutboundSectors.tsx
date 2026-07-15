import { useState } from 'react'
import { motion } from 'framer-motion'
import { Plus, Loader2, Layers, Trash2, Edit2, Check, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { AutocorrectInput } from '@/components/ui/AutocorrectInput'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useOutboundSectors, useCreateSector, useUpdateSector, useDeleteSector, useOutboundSources, useCreateSource, useUpdateSource, useDeleteSource } from '@/hooks/useOutbound'
import { isOutboundManager } from './utils'
import { useAuth } from '@/hooks/useAuth'

export default function OutboundSectors() {
  const { role } = useAuth()
  const canManage = isOutboundManager(role)

  const [tab, setTab] = useState<'sectors' | 'sources'>('sectors')

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="page-header">
        <div>
          <h1 className="page-title">Secteurs & Sources</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Catalogues configurables pour classer et sourcer vos prospects
          </p>
        </div>
      </div>

      <div className="flex gap-1 border-b border-border">
        {(['sectors', 'sources'] as const).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-semibold border-b-2 transition-all -mb-px ${
              tab === t ? 'border-sky-600 text-sky-600' : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            {t === 'sectors' ? 'Secteurs' : 'Sources'}
          </button>
        ))}
      </div>

      {tab === 'sectors' ? <SectorsTab canManage={canManage} /> : <SourcesTab canManage={canManage} />}
    </div>
  )
}

function SectorsTab({ canManage }: { canManage: boolean }) {
  const { data: sectors = [], isLoading } = useOutboundSectors()
  const create = useCreateSector()
  const update = useUpdateSector()
  const del = useDeleteSector()

  const [newName, setNewName] = useState('')
  const [newParent, setNewParent] = useState('')
  const [newColor, setNewColor] = useState('#64748B')
  const [editing, setEditing] = useState<{ id: string; nom: string; couleur: string } | null>(null)

  const rootSectors = sectors.filter(s => !s.parent_id)

  const handleCreate = () => {
    if (!newName.trim()) return
    create.mutate({ nom: newName.trim(), parent_id: newParent || null, couleur: newColor } as any, {
      onSuccess: () => { setNewName(''); setNewColor('#64748B'); setNewParent('') }
    })
  }

  if (isLoading) return <Loader2 className="w-6 h-6 animate-spin text-muted-foreground mx-auto my-8" />

  return (
    <div className="space-y-4">
      {canManage && (
        <div className="card-premium p-4 flex flex-wrap items-end gap-3">
          <div className="flex-1 min-w-40">
            <p className="text-xs font-medium text-muted-foreground mb-1.5">Nom</p>
            <AutocorrectInput value={newName} onChange={e => setNewName(e.target.value)} placeholder="Ex: Boulangeries" />
          </div>
          <div>
            <p className="text-xs font-medium text-muted-foreground mb-1.5">Parent</p>
            <Select value={newParent || '__none__'} onValueChange={v => setNewParent(v === '__none__' ? '' : v)}>
              <SelectTrigger className="w-40"><SelectValue placeholder="Racine" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">Racine</SelectItem>
                {rootSectors.map(s => <SelectItem key={s.id} value={s.id}>{s.nom}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <p className="text-xs font-medium text-muted-foreground mb-1.5">Couleur</p>
            <Input type="color" value={newColor} onChange={e => setNewColor(e.target.value)} className="w-16 h-8 p-1" />
          </div>
          <Button size="sm" onClick={handleCreate} disabled={create.isPending || !newName.trim()}>
            {create.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
            Ajouter
          </Button>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {rootSectors.map(s => {
          const subs = sectors.filter(x => x.parent_id === s.id)
          return (
            <motion.div
              key={s.id}
              layout
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              className="card-premium p-4"
            >
              <div className="flex items-center gap-2 mb-2">
                <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: `${s.couleur}22`, color: s.couleur }}>
                  <Layers className="w-4 h-4" />
                </div>
                {editing?.id === s.id ? (
                  <>
                    <AutocorrectInput value={editing.nom} onChange={e => setEditing(p => p ? { ...p, nom: e.target.value } : null)} className="flex-1" />
                    <button onClick={() => { update.mutate({ id: s.id, nom: editing.nom }); setEditing(null) }} className="w-7 h-7 rounded-md hover:bg-emerald-500/15 text-emerald-600 flex items-center justify-center"><Check className="w-3.5 h-3.5" /></button>
                    <button onClick={() => setEditing(null)} className="w-7 h-7 rounded-md hover:bg-muted text-muted-foreground flex items-center justify-center"><X className="w-3.5 h-3.5" /></button>
                  </>
                ) : (
                  <>
                    <p className="flex-1 font-semibold text-sm text-foreground">{s.nom}</p>
                    {canManage && (
                      <>
                        <button onClick={() => setEditing({ id: s.id, nom: s.nom, couleur: s.couleur })} className="w-7 h-7 rounded-md hover:bg-muted text-muted-foreground flex items-center justify-center"><Edit2 className="w-3.5 h-3.5" /></button>
                        <button onClick={() => { if (confirm(`Supprimer "${s.nom}" ?`)) del.mutate(s.id) }} className="w-7 h-7 rounded-md hover:bg-red-500/15 text-red-500 flex items-center justify-center"><Trash2 className="w-3.5 h-3.5" /></button>
                      </>
                    )}
                  </>
                )}
              </div>
              {subs.length > 0 && (
                <div className="pl-10 space-y-1">
                  {subs.map(sub => (
                    <p key={sub.id} className="text-xs text-muted-foreground flex items-center justify-between group">
                      <span>· {sub.nom}</span>
                      {canManage && (
                        <button onClick={() => { if (confirm(`Supprimer "${sub.nom}" ?`)) del.mutate(sub.id) }} className="opacity-0 group-hover:opacity-100 w-5 h-5 rounded-md hover:bg-red-500/15 text-red-500 flex items-center justify-center">
                          <Trash2 className="w-3 h-3" />
                        </button>
                      )}
                    </p>
                  ))}
                </div>
              )}
              <p className="text-[10px] text-muted-foreground mt-2 opacity-60">{s.actif ? 'Actif' : 'Inactif'}</p>
            </motion.div>
          )
        })}
      </div>
    </div>
  )
}

function SourcesTab({ canManage }: { canManage: boolean }) {
  const { data: sources = [], isLoading } = useOutboundSources()
  const create = useCreateSource()
  const update = useUpdateSource()
  const del = useDeleteSource()

  const [newName, setNewName] = useState('')

  if (isLoading) return <Loader2 className="w-6 h-6 animate-spin text-muted-foreground mx-auto my-8" />

  return (
    <div className="space-y-4">
      {canManage && (
        <div className="card-premium p-4 flex items-end gap-3">
          <div className="flex-1">
            <p className="text-xs font-medium text-muted-foreground mb-1.5">Nouvelle source</p>
            <AutocorrectInput value={newName} onChange={e => setNewName(e.target.value)} placeholder="Ex: TikTok" />
          </div>
          <Button size="sm" onClick={() => { if (newName.trim()) create.mutate({ nom: newName.trim() } as any, { onSuccess: () => setNewName('') }) }} disabled={!newName.trim() || create.isPending}>
            {create.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
            Ajouter
          </Button>
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
        {sources.map(s => (
          <div key={s.id} className="card-premium p-3 flex items-center justify-between gap-2">
            <span className="text-sm text-foreground truncate flex-1">{s.nom}</span>
            {canManage && (
              <div className="flex gap-1 flex-shrink-0">
                <button
                  onClick={() => update.mutate({ id: s.id, actif: !s.actif })}
                  className={`w-6 h-6 rounded-md flex items-center justify-center text-xs ${
                    s.actif ? 'bg-emerald-500/15 text-emerald-600' : 'bg-muted text-muted-foreground'
                  }`}
                  title={s.actif ? 'Actif' : 'Inactif'}
                >
                  {s.actif ? '●' : '○'}
                </button>
                <button
                  onClick={() => { if (confirm(`Supprimer "${s.nom}" ?`)) del.mutate(s.id) }}
                  className="w-6 h-6 rounded-md hover:bg-red-500/15 text-red-500 flex items-center justify-center"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
