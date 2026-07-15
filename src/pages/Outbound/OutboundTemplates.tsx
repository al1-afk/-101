import { useState } from 'react'
import { motion } from 'framer-motion'
import {
  Plus, Loader2, Mail, MessageCircle, Send, Link as LinkIcon, FileText, Trash2, Edit2, Copy,
} from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { AutocorrectInput, AutocorrectTextarea } from '@/components/ui/AutocorrectInput'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useOutboundTemplates, useCreateTemplate, useUpdateTemplate, useDeleteTemplate } from '@/hooks/useOutbound'
import type { OutboundTemplate } from '@/lib/outboundApi'
import { isOutboundManager } from './utils'
import { useAuth } from '@/hooks/useAuth'

const CANAL_ICONS: Record<string, React.ElementType> = {
  email: Mail, whatsapp: MessageCircle, sms: Send, linkedin: LinkIcon, autre: FileText,
}
const CANAL_COLORS: Record<string, string> = {
  email: 'bg-blue-500/15 text-blue-600',
  whatsapp: 'bg-green-500/15 text-green-600',
  sms: 'bg-violet-500/15 text-violet-600',
  linkedin: 'bg-sky-500/15 text-sky-600',
  autre: 'bg-slate-500/15 text-slate-600',
}

export default function OutboundTemplates() {
  const { role } = useAuth()
  const canManage = isOutboundManager(role)

  const [filterCanal, setFilterCanal] = useState('all')
  const { data: templates = [], isLoading } = useOutboundTemplates(filterCanal === 'all' ? undefined : filterCanal)
  const del = useDeleteTemplate()

  const [dialog, setDialog] = useState<{ open: boolean; editing: OutboundTemplate | null }>({ open: false, editing: null })

  const copy = (t: OutboundTemplate) => {
    const text = [t.objet ? `Objet: ${t.objet}` : '', t.corps].filter(Boolean).join('\n\n')
    navigator.clipboard.writeText(text).then(() => toast.success('Copié'))
  }

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="page-header">
        <div>
          <h1 className="page-title">Modèles de messages</h1>
          <p className="text-muted-foreground text-sm mt-1">
            {templates.length} modèle{templates.length > 1 ? 's' : ''} pour email, WhatsApp, SMS, LinkedIn
          </p>
        </div>
        {canManage && (
          <Button size="sm" onClick={() => setDialog({ open: true, editing: null })}>
            <Plus className="w-4 h-4" /> Nouveau modèle
          </Button>
        )}
      </div>

      <Select value={filterCanal} onValueChange={setFilterCanal}>
        <SelectTrigger className="w-44 h-8 text-sm"><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Tous canaux</SelectItem>
          {['email', 'whatsapp', 'sms', 'linkedin', 'autre'].map(c => (
            <SelectItem key={c} value={c}>{c}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      ) : templates.length === 0 ? (
        <div className="card-premium p-16 text-center">
          <FileText className="w-10 h-10 text-muted-foreground opacity-30 mx-auto mb-3" />
          <p className="text-sm font-medium text-foreground">Aucun modèle</p>
          <p className="text-xs text-muted-foreground mt-1">Les modèles font gagner du temps sur les envois répétitifs</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {templates.map(t => {
            const Icon = CANAL_ICONS[t.canal] ?? FileText
            const color = CANAL_COLORS[t.canal] ?? CANAL_COLORS.autre
            return (
              <motion.div
                key={t.id}
                layout
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                className="card-premium p-5"
              >
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div className="flex items-center gap-2">
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${color}`}>
                      <Icon className="w-4 h-4" />
                    </div>
                    <div>
                      <p className="text-sm font-bold text-foreground">{t.nom}</p>
                      <p className="text-xs text-muted-foreground uppercase">{t.canal}</p>
                    </div>
                  </div>
                  <div className="flex gap-1">
                    <button onClick={() => copy(t)} className="w-7 h-7 rounded-md hover:bg-muted flex items-center justify-center text-muted-foreground" title="Copier"><Copy className="w-3.5 h-3.5" /></button>
                    {canManage && (
                      <>
                        <button onClick={() => setDialog({ open: true, editing: t })} className="w-7 h-7 rounded-md hover:bg-muted flex items-center justify-center text-muted-foreground"><Edit2 className="w-3.5 h-3.5" /></button>
                        <button onClick={() => { if (confirm('Supprimer ce modèle ?')) del.mutate(t.id) }} className="w-7 h-7 rounded-md hover:bg-red-500/15 flex items-center justify-center text-red-500"><Trash2 className="w-3.5 h-3.5" /></button>
                      </>
                    )}
                  </div>
                </div>
                {t.objet && (
                  <p className="text-xs text-foreground mb-2 pl-10">
                    <span className="font-semibold">Objet :</span> {t.objet}
                  </p>
                )}
                <div className="text-xs text-muted-foreground whitespace-pre-wrap pl-10 line-clamp-6 border-l-2 border-border/50 pl-3 ml-8">
                  {t.corps}
                </div>
              </motion.div>
            )
          })}
        </div>
      )}

      <TemplateDialog
        open={dialog.open}
        editing={dialog.editing}
        onClose={() => setDialog({ open: false, editing: null })}
      />
    </div>
  )
}

function TemplateDialog({
  open, editing, onClose,
}: {
  open: boolean; editing: OutboundTemplate | null; onClose: () => void
}) {
  const create = useCreateTemplate()
  const update = useUpdateTemplate()

  const [form, setForm] = useState({
    nom: '', canal: 'email' as OutboundTemplate['canal'], objet: '', corps: '', langue: 'fr',
  })
  const [prev, setPrev] = useState<OutboundTemplate | null>(null)
  if (prev !== editing) {
    setPrev(editing)
    if (editing) {
      setForm({
        nom: editing.nom, canal: editing.canal, objet: editing.objet ?? '',
        corps: editing.corps, langue: editing.langue,
      })
    } else {
      setForm({ nom: '', canal: 'email', objet: '', corps: '', langue: 'fr' })
    }
  }

  const submit = () => {
    if (!form.nom.trim() || !form.corps.trim()) return
    const payload = {
      nom: form.nom.trim(), canal: form.canal,
      objet: form.objet.trim() || null,
      corps: form.corps.trim(), langue: form.langue,
    }
    if (editing) update.mutate({ id: editing.id, ...payload as any }, { onSuccess: onClose })
    else create.mutate(payload as any, { onSuccess: onClose })
  }

  const busy = create.isPending || update.isPending

  return (
    <Dialog open={open} onOpenChange={o => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{editing ? 'Modifier' : 'Nouveau'} modèle</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 pt-2">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-1.5">Nom *</p>
              <AutocorrectInput value={form.nom} onChange={e => setForm(p => ({ ...p, nom: e.target.value }))} placeholder="Prospection médecin - Prise de contact" autoFocus />
            </div>
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-1.5">Canal *</p>
              <Select value={form.canal} onValueChange={(v: any) => setForm(p => ({ ...p, canal: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {['email', 'whatsapp', 'sms', 'linkedin', 'autre'].map(c => (
                    <SelectItem key={c} value={c}>{c}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          {(form.canal === 'email' || form.canal === 'autre') && (
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-1.5">Objet</p>
              <AutocorrectInput value={form.objet} onChange={e => setForm(p => ({ ...p, objet: e.target.value }))} placeholder="Ex : Développement digital pour votre cabinet" />
            </div>
          )}
          <div>
            <p className="text-xs font-medium text-muted-foreground mb-1.5">Corps *</p>
            <AutocorrectTextarea
              value={form.corps}
              onChange={e => setForm(p => ({ ...p, corps: e.target.value }))}
              className="input-field h-40 resize-none text-sm font-mono"
              placeholder="Bonjour {{prenom}},&#10;&#10;Je vous contacte car..."
            />
            <p className="text-[10px] text-muted-foreground mt-1">
              Variables disponibles : {'{{prenom}}, {{nom}}, {{entreprise}}, {{ville}}'}
            </p>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" size="sm" onClick={onClose}>Annuler</Button>
            <Button size="sm" onClick={submit} disabled={busy || !form.nom.trim() || !form.corps.trim()}>
              {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : (editing ? 'Enregistrer' : 'Créer')}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
