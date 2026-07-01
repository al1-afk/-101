/**
 * Dialog "Envoyer au client" — facture / devis / reçu.
 *
 * Ouvert au clic explicite d'un bouton dans les pages Factures/Devis/Paiements.
 * L'admin peut ajuster l'email destinataire + ajouter un message perso avant
 * de confirmer l'envoi. Aucun envoi ne se déclenche automatiquement.
 */
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Send, Loader2, Mail } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { sendDocumentEmail, type DocKind } from '@/lib/sendDocument'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

const KIND_META: Record<DocKind, { title: string; icon: string; label: string }> = {
  facture: { title: 'Envoyer la facture',  icon: '📄', label: 'facture' },
  devis:   { title: 'Envoyer le devis',    icon: '📋', label: 'devis' },
  recu:    { title: 'Envoyer le reçu',     icon: '🧾', label: 'reçu' },
}

interface Props {
  open:            boolean
  onClose:         () => void
  kind:            DocKind
  numero:          string
  filename:        string
  /** Fabrique paresseuse — appelée au moment du "Envoyer" pour ne pas
   *  générer le PDF si l'utilisateur ferme le dialog sans envoyer. */
  buildPdf:        () => Blob | Promise<Blob>
  defaultEmail?:   string
  clientNom?:      string
}

export function SendDocumentDialog({
  open, onClose, kind, numero, filename, buildPdf, defaultEmail, clientNom,
}: Props) {
  const meta = KIND_META[kind]
  const [email,   setEmail]   = useState(defaultEmail ?? '')
  const [message, setMessage] = useState('')
  const [sending, setSending] = useState(false)

  /* Sync le champ email quand le default change (ex: on ouvre pour un autre
     client sans démonter le dialog). */
  useEffect(() => { setEmail(defaultEmail ?? '') }, [defaultEmail, open])
  useEffect(() => { if (!open) setMessage('') }, [open])

  const emailValid = EMAIL_RE.test(email.trim())

  const handleSend = async () => {
    if (!emailValid) {
      toast.error('Email destinataire invalide')
      return
    }
    setSending(true)
    try {
      const pdf = await buildPdf()
      await sendDocumentEmail({
        to:        email.trim(),
        kind,
        numero,
        clientNom,
        message:   message.trim() || undefined,
        filename,
        pdf,
      })
      toast.success(`✉️ ${meta.title.replace('Envoyer', 'Envoyée à')} ${email.trim()}`)
      onClose()
    } catch (err: any) {
      toast.error(err?.message || 'Envoi échoué')
    } finally {
      setSending(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={v => { if (!v && !sending) onClose() }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span>{meta.icon}</span>
            {meta.title} — <span className="text-muted-foreground font-normal">{numero}</span>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <label className="form-label flex items-center gap-1.5">
              <Mail className="w-3.5 h-3.5 text-muted-foreground" />
              Email du client *
            </label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="client@exemple.com"
              className="w-full h-9 px-3 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              disabled={sending}
              autoFocus
            />
            {!emailValid && email.length > 0 && (
              <p className="text-[11px] text-red-600 dark:text-red-400">Adresse email invalide</p>
            )}
          </div>

          <div className="space-y-1.5">
            <label className="form-label">Message personnalisé (optionnel)</label>
            <textarea
              value={message}
              onChange={e => setMessage(e.target.value)}
              placeholder={`Bonjour${clientNom ? ' ' + clientNom : ''},\nMerci de trouver ci-joint votre ${meta.label}…`}
              rows={4}
              className="w-full px-3 py-2 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-none"
              disabled={sending}
            />
            <p className="text-[11px] text-muted-foreground">
              Le PDF <strong>{filename}</strong> sera joint automatiquement.
            </p>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 mt-2">
          <Button variant="outline" onClick={onClose} disabled={sending} size="sm">
            Annuler
          </Button>
          <Button
            onClick={handleSend}
            disabled={sending || !emailValid}
            size="sm"
            className="min-w-[110px]"
          >
            {sending ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                Envoi…
              </>
            ) : (
              <>
                <Send className="w-3.5 h-3.5" />
                Envoyer
              </>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
