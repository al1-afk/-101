import { useState, useMemo, useRef, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Plus, Search, Receipt, Loader2, Edit2, Trash2, CheckCircle,
  Eye, MoreHorizontal, Copy, Send, AlertTriangle, Clock, X,
  CreditCard, Calendar, FileText, MailOpen,
  ChevronLeft, ChevronRight, Check, Phone, Mail, MapPin,
  PenLine, ToggleLeft, ToggleRight,
} from 'lucide-react'
import {
  useFactures, useCreateFacture, useUpdateFacture, useDeleteFacture,
  useMarkFacturePaid, useMarkFactureEnvoyee, useDuplicateFacture,
  computeAutoStatut,
  type Facture, type FactureStatut,
} from '@/hooks/useFactures'
import { useClients, useCreateClient }     from '@/hooks/useClients'
import { Button }         from '@/components/ui/button'
import { Input }          from '@/components/ui/input'
import { Badge }          from '@/components/ui/badge'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { formatCurrency, formatCurrencyCompact, formatDate, getInitials, useIsMobileViewport } from '@/lib/utils'
import { ImportExportButtons } from '@/components/ImportExportButtons'
import { facturesSchema } from '@/lib/importExportSchemas'
import {
  DateRangeFilter, DEFAULT_RANGE, makeDatePredicate, type DateRange,
} from '@/components/ui/DateRangeFilter'
import {
  PrestationRow, A4Preview, StepBar,
  parseDevisNotes, DEFAULT_BANK,
  type Prestation, type BankInfo, type DescriptionBlock,
} from '@/pages/Devis'
import FactureTemplate from '@/components/facture/FactureTemplate'
import DevisActions, { buildPdfFilename } from '@/components/devis/DevisActions'
import { toast } from 'sonner'

/* ─── Status config ──────────────────────────────────────────────── */
type BadgeVariant = 'success' | 'warning' | 'destructive' | 'default' | 'secondary' | 'outline'

const STATUT_CONFIG: Record<FactureStatut, { label: string; variant: BadgeVariant }> = {
  brouillon: { label: 'Brouillon',  variant: 'secondary'   },
  envoyee:   { label: 'Envoyée',    variant: 'default'     },
  impayee:   { label: 'Impayée',    variant: 'destructive' },
  partielle: { label: 'Partielle',  variant: 'warning'     },
  payee:     { label: 'Payée',      variant: 'success'     },
  annulee:   { label: 'Annulée',    variant: 'secondary'   },
  refusee:   { label: 'Refusée',    variant: 'destructive' },
}

/* ─── Helpers ────────────────────────────────────────────────────── */
const fmtCur = (v: number) => (v === 0 ? '—' : formatCurrency(v))
const fmtCurCompact = (v: number) => (v === 0 ? '—' : formatCurrencyCompact(v))

function paymentPercent(f: Facture): number {
  if (!f.montant_ttc || f.montant_ttc === 0) return 0
  return Math.min(100, Math.round((f.montant_paye / f.montant_ttc) * 100))
}

/* ─── EcheanceCell ───────────────────────────────────────────────── */
function EcheanceCell({ date, statut }: { date: string | null | undefined; statut: string }) {
  if (!date) return <span className="text-muted-foreground">—</span>
  const diff    = Math.floor((new Date(date).getTime() - Date.now()) / 86_400_000)
  const settled = statut === 'payee' || statut === 'annulee' || statut === 'refusee'
  if (settled)  return <span className="text-muted-foreground text-sm">{formatDate(date)}</span>
  if (diff < 0) return (
    <span className="flex items-center gap-1 text-[#E24B4A] font-medium text-sm">
      <AlertTriangle className="w-3 h-3 shrink-0" />{formatDate(date)}
    </span>
  )
  if (diff <= 7) return (
    <span className="flex items-center gap-1 font-medium text-sm text-[#BA7517] dark:text-amber-400">
      <Clock className="w-3 h-3 shrink-0" />{formatDate(date)}
    </span>
  )
  return <span className="text-muted-foreground text-sm">{formatDate(date)}</span>
}

/* ─── SkeletonRows ───────────────────────────────────────────────── */
function SkeletonRows() {
  return (
    <>
      {Array.from({ length: 5 }).map((_, i) => (
        <tr key={i} className="table-row">
          {[70, 120, 80, 80, 90, 70, 60, 40].map((w, j) => (
            <td key={j}><div className="skeleton h-4 rounded" style={{ width: `${w}%` }} /></td>
          ))}
        </tr>
      ))}
    </>
  )
}

/* ─── DeleteConfirmDialog ────────────────────────────────────────── */
function DeleteConfirmDialog({
  facture, open, onConfirm, onCancel, loading,
}: {
  facture: Facture | null
  open: boolean
  onConfirm: () => void
  onCancel: () => void
  loading: boolean
}) {
  return (
    <Dialog open={open} onOpenChange={v => !v && onCancel()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-[#A32D2D] dark:text-red-400">
            <Trash2 className="w-5 h-5" /> Supprimer la facture
          </DialogTitle>
        </DialogHeader>
        <div className="py-2 space-y-3">
          <p className="text-sm text-foreground">
            Vous êtes sur le point de supprimer{' '}
            <span className="font-semibold font-mono">{facture?.numero}</span>.
            Cette action est <span className="font-semibold">irréversible</span>.
          </p>
          {facture?.statut === 'payee' && (
            <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-50 border border-amber-200 dark:bg-amber-950/30 dark:border-amber-800/50">
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <p className="text-xs text-amber-700 dark:text-amber-400">
                Cette facture est marquée comme payée. Êtes-vous sûr de vouloir la supprimer ?
              </p>
            </div>
          )}
        </div>
        <div className="flex items-center justify-end gap-3 pt-1">
          <Button variant="secondary" onClick={onCancel} disabled={loading}>Annuler</Button>
          <Button
            variant="destructive"
            onClick={onConfirm}
            disabled={loading}
            className="bg-[#A32D2D] hover:bg-[#8a2424] text-white border-0"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
            Supprimer définitivement
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

/* ─── SendEmailDialog ────────────────────────────────────────────── */
function SendEmailDialog({
  facture, open, onClose, onMarkSent,
}: {
  facture: Facture | null
  open: boolean
  onClose: () => void
  onMarkSent: () => void
}) {
  const navigate       = useNavigate()
  const { tenantSlug } = useParams<{ tenantSlug: string }>()
  const base           = tenantSlug ? `/${tenantSlug}` : ''
  const [emailTo, setEmailTo] = useState(facture?.client_email || '')
  const subject = `Facture ${facture?.numero} — GestiQ`
  const body = [
    `Bonjour,`,
    ``,
    `Veuillez trouver ci-joint la facture ${facture?.numero} d'un montant de ${facture ? formatCurrency(facture.montant_ttc) : ''}.`,
    ``,
    facture?.date_echeance ? `Date d'échéance : ${formatDate(facture.date_echeance)}` : '',
    ``,
    `N'hésitez pas à nous contacter pour toute question.`,
    ``,
    `Cordialement,`,
    `GestiQ`,
  ].join('\n').trim()

  const handleOpenMailto = () => {
    const mailto = `mailto:${emailTo}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
    window.open(mailto, '_blank')
    onMarkSent()
    onClose()
  }

  // Reset email when facture changes
  const email = facture?.client_email || emailTo

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MailOpen className="w-5 h-5 text-blue-600 dark:text-blue-400" /> Envoyer par email
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-1">
          <div className="p-3 rounded-lg bg-muted flex items-center justify-between">
            <div>
              <p className="text-xs text-muted-foreground">Facture</p>
              <p className="text-sm font-semibold font-mono">{facture?.numero}</p>
            </div>
            <div className="text-right">
              <p className="text-xs text-muted-foreground">Montant TTC</p>
              <p className="text-sm font-bold">{facture ? fmtCur(facture.montant_ttc) : ''}</p>
            </div>
          </div>
          <div className="space-y-1.5">
            <label className="form-label">Adresse email du destinataire</label>
            <Input
              type="email"
              placeholder="client@exemple.com"
              value={email}
              onChange={e => setEmailTo(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <label className="form-label">Objet</label>
            <Input value={subject} readOnly className="opacity-70 cursor-default" />
          </div>
          <p className="text-xs text-muted-foreground leading-relaxed">
            Votre messagerie par défaut s'ouvrira avec ce message pré-rempli.
            Téléchargez le PDF et joignez-le avant l'envoi.
          </p>
        </div>
        <div className="flex items-center justify-between pt-1">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              if (!facture) return
              onClose()
              navigate(`${base}/factures/${facture.id}/preview`)
            }}
          >
            <Eye className="w-4 h-4" /> Ouvrir l'aperçu / PDF
          </Button>
          <div className="flex items-center gap-2">
            <Button variant="secondary" onClick={onClose}>Annuler</Button>
            <Button onClick={handleOpenMailto} disabled={!email}>
              <Send className="w-4 h-4" /> Ouvrir dans ma messagerie
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

/* ─── FactureDetailModal ─────────────────────────────────────────── */
function FactureDetailModal({
  facture, open, onClose, onEdit, onMarkPaid,
}: {
  facture: Facture | null
  open: boolean
  onClose: () => void
  onEdit: () => void
  onMarkPaid: () => void
}) {
  const navigate       = useNavigate()
  const { tenantSlug } = useParams<{ tenantSlug: string }>()
  const base           = tenantSlug ? `/${tenantSlug}` : ''
  if (!facture) return null
  const pct     = paymentPercent(facture)
  const reste   = facture.montant_ttc - facture.montant_paye
  const cfg     = STATUT_CONFIG[facture.statut]
  const canPay  = !['payee', 'annulee', 'refusee'].includes(facture.statut)

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-2xl">
        {/* Header */}
        <DialogHeader>
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Facture</p>
              <DialogTitle className="text-2xl font-mono">{facture.numero}</DialogTitle>
            </div>
            <Badge variant={cfg.variant} className="text-sm px-3 py-1 mt-1">{cfg.label}</Badge>
          </div>
        </DialogHeader>

        {/* Body */}
        <div className="space-y-5 py-1">
          {/* Client + Dates row */}
          <div className="grid grid-cols-2 gap-4">
            <div className="p-4 rounded-xl bg-muted space-y-1">
              <p className="text-xs text-muted-foreground uppercase tracking-wider">Client</p>
              <p className="font-semibold text-foreground">{facture.client_nom || '—'}</p>
              {facture.client_email && (
                <p className="text-xs text-muted-foreground">{facture.client_email}</p>
              )}
            </div>
            <div className="p-4 rounded-xl bg-muted space-y-2">
              <div className="flex items-center gap-2">
                <Calendar className="w-3.5 h-3.5 text-muted-foreground" />
                <span className="text-xs text-muted-foreground">Émission</span>
                <span className="text-sm font-medium ml-auto">{formatDate(facture.date_emission)}</span>
              </div>
              <div className="flex items-center gap-2">
                <Clock className="w-3.5 h-3.5 text-muted-foreground" />
                <span className="text-xs text-muted-foreground">Échéance</span>
                <span className="ml-auto">
                  <EcheanceCell date={facture.date_echeance} statut={facture.statut} />
                </span>
              </div>
            </div>
          </div>

          {/* Amounts */}
          <div className="rounded-xl border border-border overflow-hidden">
            <div className="grid grid-cols-3 divide-x divide-border">
              <div className="p-4 text-center">
                <p className="text-xs text-muted-foreground mb-1">Montant HT</p>
                <p className="text-base font-semibold text-foreground">{fmtCur(facture.montant_ht)}</p>
              </div>
              <div className="p-4 text-center">
                <p className="text-xs text-muted-foreground mb-1">TVA ({facture.tva}%)</p>
                <p className="text-base font-semibold text-foreground">
                  {fmtCur(facture.montant_ttc - facture.montant_ht)}
                </p>
              </div>
              <div className="p-4 text-center bg-[var(--surface-card)]">
                <p className="text-xs text-muted-foreground mb-1">Total TTC</p>
                <p className="text-xl font-bold text-foreground">{fmtCur(facture.montant_ttc)}</p>
              </div>
            </div>

            {/* Payment progress */}
            <div className="px-4 py-3 border-t border-border bg-muted/40">
              <div className="flex items-center justify-between mb-2 text-xs">
                <span className="text-muted-foreground">
                  Payé : <span className="font-medium text-foreground">{fmtCur(facture.montant_paye)}</span>
                </span>
                <span className="text-muted-foreground">
                  {facture.statut === 'payee'
                    ? <span className="text-[#27500A] dark:text-emerald-400 font-medium">✓ Soldé</span>
                    : <>Reste : <span className="font-medium text-[#A32D2D] dark:text-red-400">{fmtCur(reste)}</span></>
                  }
                </span>
              </div>
              <div className="h-2 rounded-full bg-border overflow-hidden">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${pct}%` }}
                  transition={{ duration: 0.6, ease: 'easeOut' }}
                  className={`h-full rounded-full ${
                    pct >= 100 ? 'bg-[#639922]' :
                    pct > 0    ? 'bg-amber-500'  : 'bg-[#E24B4A]'
                  }`}
                />
              </div>
              {pct > 0 && pct < 100 && (
                <p className="text-xs text-muted-foreground mt-1 text-right">{pct}% payé</p>
              )}
            </div>
          </div>

          {/* Notes */}
          {facture.notes && (
            <div className="p-4 rounded-xl bg-muted border border-border">
              <p className="text-xs text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-1.5">
                <FileText className="w-3.5 h-3.5" /> Notes
              </p>
              <p className="text-sm text-foreground leading-relaxed">{facture.notes}</p>
            </div>
          )}
        </div>

        {/* Footer actions */}
        <div className="flex items-center justify-between pt-2 border-t border-border">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              onClose()
              navigate(`${base}/factures/${facture.id}/preview`)
            }}
          >
            <Eye className="w-4 h-4" /> Ouvrir l'aperçu / PDF
          </Button>
          <div className="flex items-center gap-2">
            <Button variant="secondary" onClick={onClose}>Fermer</Button>
            <Button variant="secondary" onClick={onEdit}>
              <Edit2 className="w-4 h-4" /> Modifier
            </Button>
            {canPay && (
              <Button onClick={onMarkPaid}>
                <CheckCircle className="w-4 h-4" /> Marquer payée
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

/* ═══════════════════════════════════════════════════════════════════
   FactureWizard — Two-step creation flow mirroring the Devis wizard
   Step 1 : Client picker + dates (modal-size dialog)
   Step 2 : Full-screen prestations editor + live A4 preview
   ═══════════════════════════════════════════════════════════════════ */
function FactureWizard({
  facture, onClose, onStepChange,
}: {
  facture?:      Facture
  onClose:       () => void
  onStepChange?: (step: number) => void
}) {
  const create        = useCreateFacture()
  const update        = useUpdateFacture()
  const createClient  = useCreateClient()
  const { data: clients   = [] } = useClients()
  const { data: allFactures = [] } = useFactures()

  const today  = new Date().toISOString().slice(0, 10)
  const plus30 = new Date(Date.now() + 30 * 864e5).toISOString().slice(0, 10)

  /* ── Wizard state ── */
  const [step,         setStep]         = useState(facture ? 2 : 1)
  useEffect(() => { onStepChange?.(step) }, [step]) // eslint-disable-line
  const [clientSearch, setClientSearch] = useState('')
  const [selectedId,   setSelectedId]   = useState(facture?.client_id ?? '')
  const [dateFacture,  setDateFacture]  = useState(facture?.date_emission ?? today)
  const [dateEcheance, setDateEcheance] = useState(facture?.date_echeance ?? plus30)

  const [prestations,  setPrestations]  = useState<Prestation[]>(() => {
    if (!facture?.notes) return [{ id: '1', titre: '', description: [], quantite: 1, prix_unitaire: 0 }]
    const { prestations: p } = parseDevisNotes(facture.notes)
    return p.length
      ? p.map((x, i) => ({ ...x, id: String(i + 1) })) as Prestation[]
      : [{ id: '1', titre: '', description: [], quantite: 1, prix_unitaire: 0 }]
  })

  const [tvaEnabled, setTvaEnabled] = useState(() => facture ? facture.tva > 0 : true)
  const [tvaRate,    setTvaRate]    = useState(() => (facture?.tva ?? 0) > 0 ? facture!.tva : 20)

  const [bankInfo,  setBankInfo]  = useState<BankInfo>(() =>
    facture?.notes ? parseDevisNotes(facture.notes).bankInfo : DEFAULT_BANK
  )
  const [conditions, setConditions] = useState<string[]>(() => {
    if (!facture?.notes) return ['Délai de livraison : 7 jours ouvrables']
    const { conditions: c } = parseDevisNotes(facture.notes)
    return c.length ? c : ['Délai de livraison : 7 jours ouvrables']
  })
  const [newCondition, setNewCondition] = useState('')

  const [signature, setSignature] = useState<string | null>(() => {
    try { return localStorage.getItem('ng_signature') ?? null } catch { return null }
  })
  useEffect(() => {
    try {
      if (signature) localStorage.setItem('ng_signature', signature)
      else localStorage.removeItem('ng_signature')
    } catch {}
  }, [signature])

  const previewRef = useRef<HTMLDivElement>(null)

  /* ── Resizable left panel ── */
  const [panelWidth, setPanelWidth] = useState(340)
  const isResizing = useRef(false)
  const startResize = (e: React.MouseEvent) => {
    e.preventDefault()
    isResizing.current = true
    const startX = e.clientX
    const startW = panelWidth
    const onMove = (ev: MouseEvent) => {
      if (!isResizing.current) return
      const newW = Math.min(600, Math.max(240, startW + ev.clientX - startX))
      setPanelWidth(newW)
    }
    const onUp = () => {
      isResizing.current = false
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  /* ── Mobile edit/preview tab ── */
  const [mobileTab, setMobileTab] = useState<'edit' | 'preview'>('edit')

  /* ── New client inline form ── */
  const [showNewClient, setShowNewClient] = useState(false)
  const [newClientForm, setNewClientForm] = useState({ nom: '', telephone: '', email: '', entreprise: '' })

  const client = clients.find(c => c.id === selectedId)

  const filteredClients = useMemo(() =>
    clients.filter(c =>
      !clientSearch ||
      c.nom.toLowerCase().includes(clientSearch.toLowerCase()) ||
      (c.telephone ?? '').includes(clientSearch) ||
      (c.entreprise ?? '').toLowerCase().includes(clientSearch.toLowerCase())
    )
  , [clients, clientSearch])

  /* ── Calculations ── */
  const montantHT  = prestations.reduce((s, p) =>
    s + ((p.showQuantite ?? true) ? p.quantite * p.prix_unitaire : p.prix_unitaire), 0
  )
  const montantTVA = tvaEnabled ? montantHT * (tvaRate / 100) : 0
  const montantTTC = montantHT + montantTVA

  /* ── Prestation helpers ── */
  const addPrestation = () =>
    setPrestations(p => [...p, { id: Date.now().toString(), titre: '', description: [], quantite: 1, prix_unitaire: 0 }])

  const updatePrestation = (id: string, field: keyof Prestation, val: string | number | DescriptionBlock[]) =>
    setPrestations(p => p.map(x => x.id === id ? { ...x, [field]: val } : x))

  const deletePrestation = (id: string) =>
    setPrestations(p => p.filter(x => x.id !== id))

  /* ── New client save ── */
  const saveNewClient = () => {
    if (!newClientForm.nom.trim()) return
    createClient.mutate(
      { nom: newClientForm.nom, telephone: newClientForm.telephone || null,
        email: newClientForm.email || null, entreprise: newClientForm.entreprise || null,
        adresse: null, ville: null, pays: 'Maroc', notes: null },
      {
        onSuccess: (c: any) => {
          setSelectedId(c.id)
          setShowNewClient(false)
          setNewClientForm({ nom: '', telephone: '', email: '', entreprise: '' })
        },
      }
    )
  }

  /* ── Final submit ── */
  const handleSubmit = () => {
    if (!selectedId) { toast.error('Sélectionnez un client'); setStep(1); return }
    const notesData = {
      prestations: prestations.map(({ id: _id, ...p }) => p),
      conditions,
      bankInfo,
      signature,
    }
    const notes = JSON.stringify(notesData)

    /* Sequential numero: FAC-YYYY-001, FAC-YYYY-002… (no collision) */
    const year   = new Date().getFullYear()
    const maxSeq = allFactures
      .filter(x => x.numero.startsWith(`FAC-${year}-`))
      .reduce((max, x) => {
        const m = x.numero.match(/FAC-\d{4}-(\d+)/)
        return m ? Math.max(max, parseInt(m[1], 10)) : max
      }, 0)
    const newNumero = `FAC-${year}-${String(maxSeq + 1).padStart(3, '0')}`

    const statut: FactureStatut = facture?.statut
      ?? computeAutoStatut(facture?.montant_paye ?? 0, montantTTC, 'brouillon')

    const payload = {
      numero:        facture?.numero ?? newNumero,
      client_id:     selectedId,
      statut,
      date_emission: dateFacture,
      date_echeance: dateEcheance || null,
      montant_ht:    montantHT,
      tva:           tvaEnabled ? tvaRate : 0,
      montant_ttc:   montantTTC,
      montant_paye:  facture?.montant_paye ?? 0,
      notes,
    }

    if (facture) {
      update.mutate({ id: facture.id, ...payload }, { onSuccess: onClose })
    } else {
      create.mutate(payload as any, { onSuccess: onClose })
    }
  }

  const busy = create.isPending || update.isPending || createClient.isPending

  /* ══════════════════════════════════════════════
     STEP 2 — LIVE A4 PREVIEW + EDITOR
  ══════════════════════════════════════════════ */
  if (step === 2) {
    const previewFacture: Facture = {
      id:            facture?.id ?? 'preview',
      created_at:    new Date().toISOString(),
      numero:        facture?.numero ?? `FAC-${new Date().getFullYear()}-XXXX`,
      client_id:     selectedId,
      client_nom:    client?.entreprise ?? client?.nom,
      statut:        facture?.statut ?? 'brouillon',
      date_emission: dateFacture,
      date_echeance: dateEcheance || null,
      montant_ht:    montantHT,
      tva:           tvaEnabled ? tvaRate : 0,
      montant_ttc:   montantTTC,
      montant_paye:  facture?.montant_paye ?? 0,
      notes: JSON.stringify({
        prestations: prestations.map(({ id: _id, ...p }) => p),
        conditions, bankInfo, signature,
      }),
    }

    return (
      <div className="flex flex-col bg-slate-100 dark:bg-slate-900 overflow-hidden h-[100dvh] max-h-[100dvh]">

        {/* Top bar */}
        <div className="sticky top-0 z-30 flex items-center justify-between gap-2 px-3 md:px-5 py-2 md:py-3 bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 shadow-sm flex-shrink-0">
          <div className="flex items-center gap-2 md:gap-3 min-w-0">
            <button onClick={() => setStep(1)}
              className="flex items-center gap-1 md:gap-1.5 text-sm text-slate-500 hover:text-slate-800 dark:hover:text-white transition-colors">
              <ChevronLeft className="w-4 h-4" />
              <span className="hidden sm:inline">Client</span>
            </button>
            <div className="hidden sm:block w-px h-5 bg-slate-200 dark:bg-slate-600" />
            <span className="hidden sm:inline-block text-xs text-slate-400 font-mono bg-slate-100 dark:bg-slate-700 px-2 py-1 rounded select-none truncate">
              {previewFacture.numero}
            </span>

            {/* Mobile tab switcher */}
            <div className="md:hidden flex items-center rounded-lg border border-slate-200 dark:border-slate-600 p-0.5 bg-slate-50 dark:bg-slate-700/50">
              <button type="button" onClick={() => setMobileTab('edit')}
                className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors ${
                  mobileTab === 'edit'
                    ? 'bg-white dark:bg-slate-800 text-slate-800 dark:text-white shadow-sm'
                    : 'text-slate-500'
                }`}>Édition</button>
              <button type="button" onClick={() => setMobileTab('preview')}
                className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors ${
                  mobileTab === 'preview'
                    ? 'bg-white dark:bg-slate-800 text-slate-800 dark:text-white shadow-sm'
                    : 'text-slate-500'
                }`}>Aperçu</button>
            </div>
          </div>
          <div className="flex items-center gap-1.5 md:gap-2 flex-shrink-0">
            <div className="hidden md:flex items-center gap-2">
              <DevisActions
                templateRef={previewRef}
                filename={buildPdfFilename({
                  numero:     previewFacture.numero,
                  clientName: client?.entreprise ?? client?.nom ?? previewFacture.client_nom,
                  date:       previewFacture.date_emission,
                })}
              />
              <div className="w-px h-5 bg-slate-200 dark:bg-slate-600" />
            </div>
            <Button size="sm" onClick={handleSubmit} disabled={busy}
              className="bg-emerald-600 hover:bg-emerald-700 text-white border-0 px-2.5 md:px-3 h-8">
              {busy && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              <span className="hidden sm:inline">{facture ? 'Mettre à jour' : 'Créer la facture'}</span>
              <span className="sm:hidden">{facture ? 'Maj' : 'Créer'}</span>
            </Button>
            <button onClick={onClose}
              className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Two-panel body */}
        <div className="flex flex-1 min-h-0 overflow-hidden">

          {/* LEFT — Edit panel */}
          <div
            style={{
              ['--panel-w' as any]: `${panelWidth}px`,
              minWidth: 0,
              flexShrink: 0,
            }}
            className={`bg-white dark:bg-slate-800 overflow-y-auto h-full w-full md:w-[var(--panel-w)] md:min-w-[240px] md:max-w-[600px] ${
              mobileTab === 'edit' ? 'block' : 'hidden md:block'
            }`}
          >
            <div className="p-4 space-y-5">

              {/* ── Prestations ── */}
              <div className="space-y-3">
                <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">Prestations / Services</p>
                <AnimatePresence>
                  {prestations.map(p => (
                    <PrestationRow key={p.id} p={p} onChange={updatePrestation} onDelete={deletePrestation} />
                  ))}
                </AnimatePresence>
                <button
                  onClick={addPrestation}
                  className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border-2 border-dashed border-slate-200 dark:border-slate-600 text-xs text-slate-400 hover:border-blue-600/50 hover:text-blue-600 dark:text-blue-400 transition-colors"
                >
                  <Plus className="w-3.5 h-3.5" /> Ajouter une prestation
                </button>

                {/* TVA */}
                <div className="flex items-center justify-between p-2.5 rounded-xl border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-700/30">
                  <div>
                    <p className="text-xs font-medium text-slate-700 dark:text-slate-200">TVA</p>
                    {tvaEnabled && <p className="text-[10px] text-slate-400">{tvaRate}% · +{formatCurrency(montantTVA)}</p>}
                  </div>
                  <div className="flex items-center gap-2">
                    {tvaEnabled && (
                      <Select value={String(tvaRate)} onValueChange={v => setTvaRate(+v)}>
                        <SelectTrigger className="w-20 h-6 text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {[0, 7, 10, 14, 20].map(r => (
                            <SelectItem key={r} value={String(r)}>{r}%</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                    <button onClick={() => setTvaEnabled(v => !v)}>
                      {tvaEnabled
                        ? <ToggleRight className="w-7 h-7 text-blue-600 dark:text-blue-400" />
                        : <ToggleLeft  className="w-7 h-7 text-slate-400" />}
                    </button>
                  </div>
                </div>

                {/* Totals mini summary */}
                <div className="rounded-xl bg-slate-50 dark:bg-slate-700/30 border border-slate-200 dark:border-slate-600 divide-y divide-slate-200 dark:divide-slate-600 text-xs">
                  <div className="flex justify-between px-3 py-2">
                    <span className="text-slate-500">Sous-total HT</span>
                    <span className="font-semibold text-slate-700 dark:text-slate-200">{formatCurrency(montantHT)}</span>
                  </div>
                  {tvaEnabled && (
                    <div className="flex justify-between px-3 py-2">
                      <span className="text-slate-500">TVA {tvaRate}%</span>
                      <span className="font-semibold text-slate-700 dark:text-slate-200">{formatCurrency(montantTVA)}</span>
                    </div>
                  )}
                  <div className="flex justify-between px-3 py-2 bg-slate-100 dark:bg-slate-700 rounded-b-xl">
                    <span className="font-bold text-slate-700 dark:text-slate-100">TOTAL TTC</span>
                    <span className="font-bold text-[#1e64c4]">{formatCurrency(montantTTC)}</span>
                  </div>
                </div>
              </div>

              <div className="h-px bg-slate-100 dark:bg-slate-700" />

              {/* Coordonnées bancaires */}
              <div className="space-y-2">
                <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">Coordonnées bancaires</p>
                {(['banque', 'iban', 'swift'] as const).map(field => (
                  <div key={field}>
                    <label className="form-label text-xs capitalize">{field === 'swift' ? 'SWIFT/BIC' : field.charAt(0).toUpperCase() + field.slice(1)}</label>
                    <Input value={bankInfo[field]} onChange={e => setBankInfo(p => ({ ...p, [field]: e.target.value }))}
                      className={`h-8 text-sm mt-0.5 ${field === 'iban' ? 'font-mono text-xs' : ''}`} />
                  </div>
                ))}
              </div>

              <div className="h-px bg-slate-100 dark:bg-slate-700" />

              {/* Conditions de règlement */}
              <div className="space-y-2">
                <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">Conditions de règlement</p>
                <div className="space-y-1.5">
                  {conditions.map((c, i) => (
                    <div key={i} className="flex items-start gap-1.5 py-1 px-2.5 rounded-lg bg-slate-50 dark:bg-slate-700/50 border border-slate-200 dark:border-slate-600 group">
                      <span className="text-slate-400 text-xs mt-0.5">•</span>
                      <span className="text-xs text-slate-700 dark:text-slate-200 flex-1 leading-relaxed">{c}</span>
                      <button onClick={() => setConditions(p => p.filter((_, j) => j !== i))}
                        className="opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                        <X className="w-3 h-3 text-slate-400 hover:text-red-400" />
                      </button>
                    </div>
                  ))}
                </div>
                <div className="flex gap-1.5">
                  <Input value={newCondition} onChange={e => setNewCondition(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter' && newCondition.trim()) { setConditions(p => [...p, newCondition.trim()]); setNewCondition('') }}}
                    placeholder="Nouvelle condition..." className="h-7 text-xs" />
                  <Button size="sm" className="h-7 px-2.5 flex-shrink-0"
                    disabled={!newCondition.trim()}
                    onClick={() => { if (newCondition.trim()) { setConditions(p => [...p, newCondition.trim()]); setNewCondition('') }}}>
                    <Plus className="w-3 h-3" />
                  </Button>
                </div>
              </div>

              <div className="h-px bg-slate-100 dark:bg-slate-700" />

              {/* Dates */}
              <div className="space-y-2">
                <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">Dates</p>
                <div>
                  <label className="form-label text-xs">Date de la facture</label>
                  <Input type="date" value={dateFacture} onChange={e => setDateFacture(e.target.value)} className="h-8 text-sm mt-0.5" />
                </div>
                <div>
                  <label className="form-label text-xs">Date d'échéance</label>
                  <Input type="date" value={dateEcheance} onChange={e => setDateEcheance(e.target.value)} className="h-8 text-sm mt-0.5" />
                </div>
              </div>

              <div className="h-px bg-slate-100 dark:bg-slate-700" />

              {/* Signature */}
              <div className="space-y-2">
                <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">Signature</p>
                {signature ? (
                  <div className="space-y-2">
                    <div className="relative inline-block">
                      <img src={signature} alt="Signature" className="h-20 rounded-lg border border-slate-200 bg-white object-contain" />
                      <button type="button" onClick={() => setSignature(null)}
                        className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-red-500 text-white flex items-center justify-center shadow">
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                    <label className="cursor-pointer flex items-center gap-1.5 text-xs text-slate-400 hover:text-[#1e64c4] transition-colors">
                      <input type="file" accept="image/*" className="hidden"
                        onChange={e => {
                          const f = e.target.files?.[0]
                          if (f) { const r = new FileReader(); r.onload = ev => setSignature(ev.target?.result as string); r.readAsDataURL(f) }
                        }} />
                      <PenLine className="w-3 h-3" /> Changer
                    </label>
                  </div>
                ) : (
                  <label className="cursor-pointer flex items-center gap-2 px-3 py-2.5 rounded-lg border border-dashed border-slate-300 dark:border-slate-600 text-xs text-slate-500 hover:border-[#1e64c4]/50 hover:text-[#1e64c4] hover:bg-[#1e64c4]/5 transition-colors w-full">
                    <input type="file" accept="image/*" className="hidden"
                      onChange={e => {
                        const f = e.target.files?.[0]
                        if (f) { const r = new FileReader(); r.onload = ev => setSignature(ev.target?.result as string); r.readAsDataURL(f) }
                      }} />
                    <PenLine className="w-3.5 h-3.5" /> Ajouter une signature / tampon
                  </label>
                )}
              </div>
            </div>
          </div>

          {/* Resize handle */}
          <div
            onMouseDown={startResize}
            className="hidden md:block w-1 flex-shrink-0 bg-slate-200 dark:bg-slate-700 hover:bg-[#1e64c4] active:bg-[#1e64c4] cursor-col-resize transition-colors relative group"
            title="Glisser pour redimensionner"
          >
            <div className="absolute inset-y-0 -left-1 -right-1" />
          </div>

          {/* RIGHT — Scaled A4 preview */}
          <div className={`flex-1 min-w-0 flex flex-col ${
            mobileTab === 'preview' ? 'flex' : 'hidden md:flex'
          }`}>
            <A4Preview>
              <FactureTemplate ref={previewRef} facture={previewFacture} client={client} />
            </A4Preview>
          </div>
        </div>
      </div>
    )
  }

  /* ══════════════════════════════════════════════
     STEP 1 — CLIENT PICKER
  ══════════════════════════════════════════════ */
  return (
    <div className="space-y-0">
      <p className="text-xs text-muted-foreground mb-1">
        {facture ? 'Modifier la facture' : 'Nouvelle facture'} · Étape {step}/2
      </p>
      <StepBar step={step} labels={['Client', 'Facture']} />

      <AnimatePresence mode="wait">
        <motion.div key="s1" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-4">

          <div>
            <label className="form-label">Sélectionner un client *</label>
            <div className="flex gap-2 mt-1.5">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  value={clientSearch}
                  onChange={e => setClientSearch(e.target.value)}
                  placeholder="Rechercher par nom, téléphone, entreprise…"
                  className="pl-9"
                  autoFocus
                />
              </div>
              <Button size="sm" variant="secondary" onClick={() => setShowNewClient(s => !s)}>
                <Plus className="w-3.5 h-3.5" /> Nouveau client
              </Button>
            </div>
          </div>

          {/* New client inline form */}
          <AnimatePresence>
            {showNewClient && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="overflow-hidden"
              >
                <div className="rounded-xl border border-blue-600/30 bg-blue-600/5 p-4 space-y-3">
                  <p className="text-xs font-bold text-blue-600 dark:text-blue-400">Nouveau client</p>
                  <div className="grid grid-cols-2 gap-3">
                    <Input placeholder="Nom *" value={newClientForm.nom}
                      onChange={e => setNewClientForm(p => ({ ...p, nom: e.target.value }))} className="text-sm" />
                    <Input placeholder="Téléphone" value={newClientForm.telephone}
                      onChange={e => setNewClientForm(p => ({ ...p, telephone: e.target.value }))} className="text-sm" />
                    <Input placeholder="Email" value={newClientForm.email}
                      onChange={e => setNewClientForm(p => ({ ...p, email: e.target.value }))} className="text-sm" />
                    <Input placeholder="Entreprise" value={newClientForm.entreprise}
                      onChange={e => setNewClientForm(p => ({ ...p, entreprise: e.target.value }))} className="text-sm" />
                  </div>
                  <div className="flex justify-end gap-2">
                    <Button variant="ghost" size="sm" onClick={() => setShowNewClient(false)}>Annuler</Button>
                    <Button size="sm" onClick={saveNewClient} disabled={!newClientForm.nom.trim() || busy}>
                      {busy && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                      Créer & sélectionner
                    </Button>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Client list */}
          <div className="max-h-48 overflow-y-auto space-y-1 rounded-xl border border-border">
            {filteredClients.map(c => (
              <button
                key={c.id}
                onClick={() => setSelectedId(c.id)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 text-left transition-colors first:rounded-t-xl last:rounded-b-xl ${
                  selectedId === c.id
                    ? 'bg-blue-600/10 text-foreground'
                    : 'hover:bg-muted/50 text-muted-foreground hover:text-foreground'
                }`}
              >
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold flex-shrink-0 ${
                  selectedId === c.id ? 'bg-blue-600 text-white' : 'bg-muted'
                }`}>
                  {getInitials(c.nom)}
                </div>
                <div className="flex-1 min-w-0">
                  <p className={`text-sm font-medium leading-tight ${selectedId === c.id ? 'text-foreground' : ''}`}>
                    {c.telephone && <span className="mr-1">{c.telephone}</span>}
                    {c.entreprise && <span className="text-muted-foreground">{c.entreprise}</span>}
                  </p>
                  <p className="text-xs text-muted-foreground truncate">{c.nom}</p>
                </div>
                {selectedId === c.id && <Check className="w-4 h-4 text-blue-600 dark:text-blue-400 flex-shrink-0" />}
              </button>
            ))}
            {filteredClients.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-4">Aucun client trouvé</p>
            )}
          </div>

          {/* Selected client info card */}
          {client && (
            <motion.div
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              className="rounded-xl border border-blue-600/30 bg-blue-600/5 p-4"
            >
              <div className="mb-3">
                <p className="text-xs font-bold text-blue-600 dark:text-blue-400 uppercase tracking-wide">Informations du client</p>
              </div>
              <p className="text-sm font-semibold text-foreground">{client.entreprise ?? client.nom}</p>
              {client.telephone && (
                <p className="text-xs text-muted-foreground flex items-center gap-1 mt-1">
                  <Phone className="w-3 h-3" />{client.telephone}
                </p>
              )}
              {client.email && (
                <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                  <Mail className="w-3 h-3" />{client.email}
                </p>
              )}
              {client.adresse && (
                <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                  <MapPin className="w-3 h-3" />{[client.adresse, client.ville].filter(Boolean).join(', ')}
                </p>
              )}
            </motion.div>
          )}

          {/* Dates */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="form-label">Date de la facture</label>
              <Input type="date" value={dateFacture} onChange={e => setDateFacture(e.target.value)} className="mt-1" />
            </div>
            <div>
              <label className="form-label">Date d'échéance</label>
              <Input type="date" value={dateEcheance} onChange={e => setDateEcheance(e.target.value)} className="mt-1" />
            </div>
          </div>

          {/* Footer */}
          <div className="flex justify-between pt-2">
            <Button variant="secondary" size="sm" onClick={onClose}>Annuler</Button>
            <Button size="sm" onClick={() => { if (!selectedId) { toast.error('Sélectionnez un client'); return }; setStep(2) }}
              disabled={!selectedId}>
              Suivant <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        </motion.div>
      </AnimatePresence>
    </div>
  )
}

/* ─── Main Page ──────────────────────────────────────────────────── */
export default function Factures() {
  const navigate         = useNavigate()
  const { tenantSlug }   = useParams<{ tenantSlug: string }>()
  const base             = tenantSlug ? `/${tenantSlug}` : ''
  const isMobile         = useIsMobileViewport()
  const fmtKpi           = isMobile ? fmtCurCompact : fmtCur
  const { data: factures = [], isLoading } = useFactures()
  const createFacture    = useCreateFacture()
  const updateFacture    = useUpdateFacture()
  const deleteFacture    = useDeleteFacture()
  const markPaid         = useMarkFacturePaid()
  const markEnvoyee      = useMarkFactureEnvoyee()
  const duplicate        = useDuplicateFacture()

  const [search,       setSearch]      = useState('')
  const [filterStatut, setFilterStatut]= useState('all')
  const [dateRange,    setDateRange]   = useState<DateRange>(DEFAULT_RANGE)

  // Modal states
  const [showForm,     setShowForm]    = useState(false)
  const [wizardStep,   setWizardStep]  = useState(1)
  const [editing,      setEditing]     = useState<Facture | undefined>()
  const [viewTarget,   setViewTarget]  = useState<Facture | null>(null)
  const [deleteTarget, setDeleteTarget]= useState<Facture | null>(null)
  const [emailTarget,  setEmailTarget] = useState<Facture | null>(null)

  const closeWizard = () => { setShowForm(false); setEditing(undefined); setWizardStep(1) }

  /* ── Filtered list ─────────────────────────────────────────────── */
  const dateMatch = useMemo(() => makeDatePredicate(dateRange), [dateRange])
  const filtered = useMemo(() =>
    factures.filter(f => {
      const q = search.toLowerCase()
      const matchSearch = !search || [f.numero, f.client_nom].some(x => x?.toLowerCase().includes(q))
      const matchStatut = filterStatut === 'all' || f.statut === filterStatut
      const matchDate   = dateMatch(f.date_emission)
      return matchSearch && matchStatut && matchDate
    }),
    [factures, search, filterStatut, dateMatch]
  )

  /* ── KPI stats ─────────────────────────────────────────────────── */
  const stats = useMemo(() => ({
    totalTTC: factures.reduce((s, f) => s + f.montant_ttc, 0),
    encaisse: factures.filter(f => f.statut === 'payee').reduce((s, f) => s + f.montant_ttc, 0),
    impaye:   factures
      .filter(f => !['payee', 'annulee', 'brouillon', 'refusee'].includes(f.statut))
      .reduce((s, f) => s + Math.max(0, f.montant_ttc - f.montant_paye), 0),
    parStatut: Object.entries(STATUT_CONFIG).reduce((acc, [key]) => {
      acc[key as FactureStatut] = factures.filter(f => f.statut === key).length
      return acc
    }, {} as Record<FactureStatut, number>),
  }), [factures])

  /* ── Action handlers ───────────────────────────────────────────── */
  const openEdit = (f: Facture) => { setEditing(f); setViewTarget(null); setShowForm(true) }
  const openNew  = () => { setEditing(undefined); setShowForm(true) }

  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return
    await deleteFacture.mutateAsync(deleteTarget.id)
    setDeleteTarget(null)
  }

  const handleMarkPaid = async (f: Facture) => {
    await markPaid.mutateAsync(f)
    setViewTarget(prev => prev?.id === f.id ? { ...prev, statut: 'payee', montant_paye: f.montant_ttc } : prev)
  }

  const handleMarkEnvoyee = async (f: Facture) => {
    await markEnvoyee.mutateAsync(f.id)
    setEmailTarget(f)
  }

  const handleDuplicate = (f: Facture) => {
    duplicate.mutate(f)
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* ── Page header ─────────────────────────────────────────── */}
      <div className="page-header">
        <div>
          <h1 className="page-title">Factures</h1>
          <p className="text-sm mt-0.5 text-muted-foreground">
            {factures.length} facture{factures.length !== 1 ? 's' : ''}
            {' · '}
            <span className="text-[#27500A] dark:text-emerald-400 font-medium">{fmtCur(stats.encaisse)} encaissé</span>
            {stats.impaye > 0 && (
              <> · <span className="text-[#A32D2D] dark:text-red-400 font-medium">{fmtCur(stats.impaye)} impayé</span></>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <ImportExportButtons
            schema={facturesSchema}
            data={factures}
            onImport={async (row) => { await createFacture.mutateAsync(row as any) }}
          />
          <Button size="sm" onClick={openNew}>
            <Plus className="w-4 h-4" /> Nouvelle facture
          </Button>
        </div>
      </div>

      {/* ── KPI cards ───────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0 }}
          className="card-premium p-5 flex items-center gap-4">
          <div className="w-11 h-11 rounded-xl bg-blue-50 dark:bg-blue-900/20 flex items-center justify-center flex-shrink-0">
            <Receipt className="w-5 h-5 text-blue-600 dark:text-blue-400" />
          </div>
          <div className="min-w-0">
            <p className="text-lg sm:text-xl font-extrabold text-foreground truncate">{fmtKpi(stats.totalTTC)}</p>
            <p className="kpi-label mt-0.5">Total facturé</p>
          </div>
        </motion.div>
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.06 }}
          className="card-premium p-5 flex items-center gap-4">
          <div className="w-11 h-11 rounded-xl bg-emerald-50 dark:bg-emerald-900/20 flex items-center justify-center flex-shrink-0">
            <CheckCircle className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
          </div>
          <div className="min-w-0">
            <p className="text-lg sm:text-xl font-extrabold text-emerald-600 dark:text-emerald-400 truncate">{fmtKpi(stats.encaisse)}</p>
            <p className="kpi-label mt-0.5">Encaissé</p>
          </div>
        </motion.div>
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.12 }}
          className="card-premium p-5 flex items-center gap-4">
          <div className={`w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 ${stats.impaye > 0 ? 'bg-red-50 dark:bg-red-900/20' : 'bg-emerald-50 dark:bg-emerald-900/20'}`}>
            <Clock className={`w-5 h-5 ${stats.impaye > 0 ? 'text-red-600 dark:text-red-400' : 'text-emerald-600 dark:text-emerald-400'}`} />
          </div>
          <div className="min-w-0">
            <p className={`text-lg sm:text-xl font-extrabold truncate ${stats.impaye > 0 ? 'text-red-600 dark:text-red-400' : 'text-foreground'}`}>{fmtKpi(stats.impaye)}</p>
            <p className="kpi-label mt-0.5">En attente</p>
          </div>
        </motion.div>
      </div>

      {/* ── Date filter ──────────────────────────────────────────── */}
      <div className="card-premium p-3">
        <DateRangeFilter value={dateRange} onChange={setDateRange} />
      </div>

      {/* ── Statut breakdown pills ───────────────────────────────── */}
      <div className="flex items-center gap-2 flex-wrap">
        <button
          onClick={() => setFilterStatut('all')}
          className={`text-xs px-3 py-1.5 rounded-full border transition-all font-medium ${
            filterStatut === 'all'
              ? 'bg-blue-600 text-white border-blue-600'
              : 'border-border text-muted-foreground hover:border-blue-400'
          }`}
        >
          Toutes ({factures.length})
        </button>
        {(Object.entries(STATUT_CONFIG) as [FactureStatut, { label: string; variant: BadgeVariant }][]).map(([key, cfg]) => {
          const count = stats.parStatut[key]
          if (!count) return null
          return (
            <button
              key={key}
              onClick={() => setFilterStatut(filterStatut === key ? 'all' : key)}
              className={`text-xs px-3 py-1.5 rounded-full border transition-all font-medium ${
                filterStatut === key
                  ? 'bg-blue-600 text-white border-blue-600'
                  : 'border-border text-muted-foreground hover:border-blue-400'
              }`}
            >
              {cfg.label} ({count})
            </button>
          )
        })}
      </div>

      {/* ── Search ──────────────────────────────────────────────── */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Rechercher par numéro, client…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={filterStatut} onValueChange={setFilterStatut}>
          <SelectTrigger className="w-40 flex-shrink-0">
            <SelectValue placeholder="Tous les statuts" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tous les statuts</SelectItem>
            {Object.entries(STATUT_CONFIG).map(([k, v]) => (
              <SelectItem key={k} value={k}>{v.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* ── Table ───────────────────────────────────────────────── */}
      <div className="card-premium overflow-hidden">
        <div className="table-scroll">
          <table className="w-full">
            <thead className="table-header">
              <tr className="table-header">
                <th>N° Facture</th>
                <th>Client</th>
                <th>Émission</th>
                <th>Échéance</th>
                <th>Total TTC</th>
                <th>Paiement</th>
                <th>Statut</th>
                <th style={{ width: 116 }}></th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <SkeletonRows />
              ) : (
                <AnimatePresence>
                  {filtered.map(f => {
                    const pct = paymentPercent(f)
                    return (
                      <tr key={f.id} className="table-row group">
                        <td>
                          <button
                            onClick={() => setViewTarget(f)}
                            className="font-mono font-medium text-sm text-blue-600 dark:text-blue-400 hover:underline"
                          >
                            {f.numero}
                          </button>
                        </td>
                        <td className="text-foreground/80">{f.client_nom || '—'}</td>
                        <td className="text-muted-foreground text-sm">{formatDate(f.date_emission)}</td>
                        <td><EcheanceCell date={f.date_echeance} statut={f.statut} /></td>
                        <td className="font-semibold text-foreground">{fmtCur(f.montant_ttc)}</td>
                        <td>
                          <div className="space-y-1 min-w-[80px]">
                            <div className="flex items-center justify-between text-xs">
                              <span className="text-muted-foreground">{fmtCur(f.montant_paye)}</span>
                              {pct > 0 && pct < 100 && (
                                <span className="text-muted-foreground">{pct}%</span>
                              )}
                            </div>
                            {f.montant_ttc > 0 && (
                              <div className="h-1 rounded-full bg-border overflow-hidden">
                                <div
                                  className={`h-full rounded-full transition-all ${
                                    pct >= 100 ? 'bg-[#639922]' :
                                    pct > 0    ? 'bg-amber-400'  : 'bg-[#E24B4A]/40'
                                  }`}
                                  style={{ width: `${pct}%` }}
                                />
                              </div>
                            )}
                          </div>
                        </td>
                        <td>
                          <Badge variant={STATUT_CONFIG[f.statut]?.variant}>
                            {STATUT_CONFIG[f.statut]?.label}
                          </Badge>
                        </td>

                        {/* ── Row actions ── */}
                        <td>
                          <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                            {/* View — full A4 preview */}
                            <Button
                              variant="ghost" size="icon" className="h-7 w-7" title="Voir l'aperçu A4"
                              onClick={() => navigate(`${base}/factures/${f.id}/preview`)}
                            >
                              <Eye className="w-3.5 h-3.5" />
                            </Button>

                            {/* Edit */}
                            <Button
                              variant="ghost" size="icon" className="h-7 w-7" title="Modifier"
                              onClick={() => openEdit(f)}
                              disabled={['annulee', 'refusee'].includes(f.statut)}
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </Button>

                            {/* More actions */}
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon" className="h-7 w-7" title="Plus d'actions">
                                  <MoreHorizontal className="w-3.5 h-3.5" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end" className="w-52">

                                {/* Dupliquer */}
                                <DropdownMenuItem
                                  className="gap-2 text-sm cursor-pointer"
                                  onClick={() => handleDuplicate(f)}
                                  disabled={duplicate.isPending}
                                >
                                  {duplicate.isPending ? (
                                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                  ) : (
                                    <Copy className="w-3.5 h-3.5" />
                                  )}
                                  Dupliquer
                                </DropdownMenuItem>

                                {/* Aperçu / Télécharger PDF */}
                                <DropdownMenuItem
                                  className="gap-2 text-sm cursor-pointer"
                                  onClick={() => navigate(`${base}/factures/${f.id}/preview`)}
                                >
                                  <Eye className="w-3.5 h-3.5" />
                                  Aperçu / PDF
                                </DropdownMenuItem>

                                {/* Envoyer par email */}
                                <DropdownMenuItem
                                  className="gap-2 text-sm cursor-pointer"
                                  onClick={() => handleMarkEnvoyee(f)}
                                  disabled={['annulee', 'refusee', 'envoyee'].includes(f.statut)}
                                >
                                  <Send className="w-3.5 h-3.5" />
                                  Envoyer par email
                                  {f.statut === 'envoyee' && (
                                    <span className="ml-auto text-[10px] text-muted-foreground">déjà envoyée</span>
                                  )}
                                </DropdownMenuItem>

                                {/* Marquer payée */}
                                {!['payee', 'annulee', 'refusee', 'brouillon'].includes(f.statut) && (
                                  <DropdownMenuItem
                                    className="gap-2 text-sm cursor-pointer"
                                    onClick={() => handleMarkPaid(f)}
                                    disabled={markPaid.isPending}
                                  >
                                    {markPaid.isPending
                                      ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                      : <CheckCircle className="w-3.5 h-3.5 text-[#639922]" />
                                    }
                                    <span className="text-[#27500A] dark:text-emerald-400">Marquer payée</span>
                                  </DropdownMenuItem>
                                )}

                                {/* Annuler */}
                                {!['payee', 'annulee', 'refusee'].includes(f.statut) && (
                                  <DropdownMenuItem
                                    className="gap-2 text-sm cursor-pointer text-muted-foreground"
                                    onClick={() => updateFacture.mutate({ id: f.id, statut: 'annulee' })}
                                  >
                                    <X className="w-3.5 h-3.5" />
                                    Annuler la facture
                                  </DropdownMenuItem>
                                )}

                                <DropdownMenuSeparator />

                                {/* Supprimer */}
                                <DropdownMenuItem
                                  className="gap-2 text-sm cursor-pointer text-[#A32D2D] dark:text-red-400 focus:text-[#A32D2D] focus:bg-[#FCEBEB] dark:focus:bg-red-950/50"
                                  onClick={() => setDeleteTarget(f)}
                                >
                                  <Trash2 className="w-3.5 h-3.5" /> Supprimer
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </AnimatePresence>
              )}
            </tbody>
          </table>
        </div>

        {/* Empty state */}
        {!isLoading && filtered.length === 0 && (
          <div className="empty-state">
            <Receipt className="empty-state-icon" />
            <p className="empty-state-title">
              {search || filterStatut !== 'all' ? 'Aucun résultat' : 'Aucune facture'}
            </p>
            <p className="empty-state-desc">
              {search || filterStatut !== 'all'
                ? 'Essayez de modifier vos filtres de recherche.'
                : 'Créez votre première facture dès maintenant.'}
            </p>
            {!search && filterStatut === 'all' && (
              <Button size="sm" className="mt-4" onClick={openNew}>
                <Plus className="w-4 h-4" /> Créer une facture
              </Button>
            )}
          </div>
        )}
      </div>

      {/* ── Modals ──────────────────────────────────────────────── */}

      {/* Create / Edit wizard — Dialog grows full-screen on Step 2 */}
      <Dialog
        open={showForm}
        onOpenChange={v => {
          if (!v) {
            if (wizardStep === 1) { closeWizard(); return }
            if (window.confirm('Quitter sans sauvegarder ? Les modifications seront perdues.')) {
              closeWizard()
            }
          }
        }}
      >
        <DialogContent
          className={wizardStep === 2
            ? '!left-0 !top-0 !translate-x-0 !translate-y-0 !max-w-none !w-screen !h-[100dvh] !max-h-[100dvh] !p-0 !gap-0 !rounded-none !overflow-hidden [&>button:last-child]:hidden'
            : 'max-w-2xl max-h-[90dvh] overflow-y-auto'
          }
        >
          {wizardStep === 1 && (
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <CreditCard className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                {editing ? `Modifier ${editing.numero}` : 'Nouvelle facture'}
              </DialogTitle>
            </DialogHeader>
          )}
          <FactureWizard
            facture={editing}
            onClose={closeWizard}
            onStepChange={setWizardStep}
          />
        </DialogContent>
      </Dialog>

      {/* Detail view */}
      <FactureDetailModal
        facture={viewTarget}
        open={!!viewTarget}
        onClose={() => setViewTarget(null)}
        onEdit={() => { if (viewTarget) openEdit(viewTarget) }}
        onMarkPaid={() => { if (viewTarget) handleMarkPaid(viewTarget) }}
      />

      {/* Delete confirmation */}
      <DeleteConfirmDialog
        facture={deleteTarget}
        open={!!deleteTarget}
        onConfirm={handleDeleteConfirm}
        onCancel={() => setDeleteTarget(null)}
        loading={deleteFacture.isPending}
      />

      {/* Send email */}
      <SendEmailDialog
        facture={emailTarget}
        open={!!emailTarget}
        onClose={() => setEmailTarget(null)}
        onMarkSent={() => {
          if (emailTarget) markEnvoyee.mutate(emailTarget.id)
          setEmailTarget(null)
        }}
      />
    </div>
  )
}

