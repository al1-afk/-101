import { useRef, useState } from 'react'
import { Download, Upload, FileText, FileJson, FileSpreadsheet, AlertTriangle, CheckCircle2, Loader2, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog'
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem,
} from '@/components/ui/dropdown-menu'
import { toast } from 'sonner'
import {
  type EntitySchema, toCSV, toJSON, downloadFile, parseImportFile, buildTemplate,
  type ImportResult, type ParsedRow,
} from '@/lib/importExport'

interface Props<T> {
  schema:   EntitySchema<T>
  data:     T[]
  /** Async callback called for each valid row to import. Should create the entity. */
  onImport: (row: Partial<T>) => Promise<void> | void
}

export function ImportExportButtons<T>({ schema, data, onImport }: Props<T>) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [importOpen, setImportOpen] = useState(false)
  const [parsing, setParsing] = useState(false)
  const [result, setResult] = useState<ImportResult<T> | null>(null)
  const [importing, setImporting] = useState(false)
  const [progress, setProgress] = useState({ done: 0, total: 0 })
  const [importedCount, setImportedCount] = useState<number | null>(null)

  /* ── Export ───────────────────────────────────────────────────── */
  const handleExportCSV = () => {
    if (data.length === 0) { toast.error('Aucune donnée à exporter'); return }
    const csv = toCSV(data, schema)
    const stamp = new Date().toISOString().slice(0, 10)
    downloadFile(`${schema.filename}_${stamp}.csv`, csv, 'text/csv')
    toast.success(`${data.length} ${schema.entity}${data.length > 1 ? 's' : ''} exporté${data.length > 1 ? 's' : ''}`)
  }

  const handleExportJSON = () => {
    if (data.length === 0) { toast.error('Aucune donnée à exporter'); return }
    const json = toJSON(data, schema)
    const stamp = new Date().toISOString().slice(0, 10)
    downloadFile(`${schema.filename}_${stamp}.json`, json, 'application/json')
    toast.success(`${data.length} ${schema.entity}${data.length > 1 ? 's' : ''} exporté${data.length > 1 ? 's' : ''}`)
  }

  const handleDownloadTemplate = () => {
    const csv = buildTemplate(schema)
    downloadFile(`modele_${schema.filename}.csv`, csv, 'text/csv')
    toast.success('Modèle téléchargé')
  }

  /* ── Import ───────────────────────────────────────────────────── */
  const openImport = () => {
    setResult(null)
    setImportedCount(null)
    setImportOpen(true)
    setTimeout(() => fileRef.current?.click(), 50)
  }

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setParsing(true)
    try {
      const text = await file.text()
      const format: 'csv' | 'json' = file.name.toLowerCase().endsWith('.json') ? 'json' : 'csv'
      const parsed = parseImportFile<T>(text, schema, format)
      setResult(parsed)
      if (parsed.rows.length === 0) toast.error('Fichier vide ou format invalide')
    } catch (err: any) {
      toast.error(`Erreur de lecture : ${err?.message ?? err}`)
    } finally {
      setParsing(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  const confirmImport = async () => {
    if (!result || result.valid.length === 0) return
    setImporting(true)
    setProgress({ done: 0, total: result.valid.length })
    let ok = 0
    for (const row of result.valid) {
      try {
        await onImport(row.data)
        ok++
      } catch {
        /* swallow per-row to continue batch */
      }
      setProgress(p => ({ ...p, done: p.done + 1 }))
    }
    setImporting(false)
    setImportedCount(ok)
    if (ok > 0) toast.success(`${ok} ${schema.entity}${ok > 1 ? 's' : ''} importé${ok > 1 ? 's' : ''}`)
    if (ok < result.valid.length) toast.error(`${result.valid.length - ok} échec${result.valid.length - ok > 1 ? 's' : ''}`)
  }

  const closeImport = () => {
    if (importing) return
    setImportOpen(false)
    setResult(null)
    setImportedCount(null)
    setProgress({ done: 0, total: 0 })
  }

  return (
    <>
      {/* ─── Buttons ─── */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="secondary" size="sm">
            <Download className="w-4 h-4" />
            Export
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-44">
          <DropdownMenuItem onClick={handleExportCSV}>
            <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
            <span>Exporter en CSV</span>
          </DropdownMenuItem>
          <DropdownMenuItem onClick={handleExportJSON}>
            <FileJson className="w-4 h-4 text-amber-600" />
            <span>Exporter en JSON</span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Button variant="secondary" size="sm" onClick={openImport}>
        <Upload className="w-4 h-4" />
        Import
      </Button>

      {/* ─── Hidden file input ─── */}
      <input
        ref={fileRef}
        type="file"
        accept=".csv,.json,text/csv,application/json"
        className="hidden"
        onChange={handleFile}
      />

      {/* ─── Import Dialog ─── */}
      <Dialog open={importOpen} onOpenChange={open => { if (!open) closeImport() }}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Upload className="w-5 h-5 text-blue-600" />
              Importer des {schema.filename}
            </DialogTitle>
            <DialogDescription>
              Formats acceptés : CSV ou JSON. Les doublons sont créés tels quels.
            </DialogDescription>
          </DialogHeader>

          {/* — Loading state — */}
          {parsing && (
            <div className="py-12 flex flex-col items-center gap-3">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
              <p className="text-sm text-muted-foreground">Analyse du fichier...</p>
            </div>
          )}

          {/* — Empty / pre-upload state — */}
          {!parsing && !result && (
            <div className="py-8 space-y-4">
              <div className="border-2 border-dashed border-border rounded-xl p-8 text-center">
                <FileText className="w-10 h-10 text-muted-foreground opacity-40 mx-auto mb-3" />
                <p className="text-sm font-medium text-foreground mb-1">Sélectionnez un fichier</p>
                <p className="text-xs text-muted-foreground mb-4">CSV ou JSON, max ~5 Mo</p>
                <Button variant="secondary" size="sm" onClick={() => fileRef.current?.click()}>
                  <Upload className="w-3.5 h-3.5" />
                  Choisir un fichier
                </Button>
              </div>
              <div className="flex items-center justify-between text-xs text-muted-foreground border-t border-border pt-3">
                <span>Besoin d'un modèle ?</span>
                <button
                  onClick={handleDownloadTemplate}
                  className="text-blue-600 dark:text-blue-400 hover:underline font-medium"
                >
                  Télécharger un modèle CSV
                </button>
              </div>
            </div>
          )}

          {/* — Preview state — */}
          {!parsing && result && importedCount === null && (
            <div className="space-y-4">
              {/* Summary */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                <SummaryCard label="Lignes lues"  value={result.rows.length}    color="text-foreground" />
                <SummaryCard label="Valides"       value={result.valid.length}   color="text-emerald-600 dark:text-emerald-400" icon={<CheckCircle2 className="w-3.5 h-3.5" />} />
                <SummaryCard label="Erreurs"      value={result.invalid.length} color="text-red-600 dark:text-red-400" icon={<AlertTriangle className="w-3.5 h-3.5" />} />
              </div>

              {/* Preview table — affiche uniquement les colonnes qui ont au moins
                  une valeur dans les lignes parsées (le 'nom' est toujours là). */}
              {result.rows.length > 0 && (() => {
                const visibleFields = schema.fields.filter(f =>
                  f.required || result.rows.some(r => {
                    const v = (r.data as any)[f.key]
                    return v != null && v !== ''
                  })
                ).slice(0, 8)
                return (
                  <div className="border border-border rounded-lg overflow-hidden">
                    <div className="max-h-72 overflow-auto">
                      <table className="w-full text-xs">
                        <thead className="bg-muted/40 sticky top-0">
                          <tr>
                            <th className="px-2 py-2 text-left font-semibold text-muted-foreground w-10">#</th>
                            {visibleFields.map(f => (
                              <th key={f.key} className="px-2 py-2 text-left font-semibold text-muted-foreground">
                                {f.label}
                              </th>
                            ))}
                            <th className="px-2 py-2 text-left font-semibold text-muted-foreground">Statut</th>
                          </tr>
                        </thead>
                        <tbody>
                          {result.rows.slice(0, 50).map(row => (
                            <PreviewRow key={row.index} row={row} fields={visibleFields} />
                          ))}
                        </tbody>
                      </table>
                    </div>
                    {result.rows.length > 50 && (
                      <div className="px-3 py-2 text-xs text-muted-foreground bg-muted/20 border-t border-border">
                        … et {result.rows.length - 50} ligne{result.rows.length - 50 > 1 ? 's' : ''} supplémentaire{result.rows.length - 50 > 1 ? 's' : ''}
                      </div>
                    )}
                  </div>
                )
              })()}

              {/* Import progress */}
              {importing && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">Import en cours...</span>
                    <span className="font-semibold text-foreground">{progress.done} / {progress.total}</span>
                  </div>
                  <div className="h-2 bg-muted rounded-full overflow-hidden">
                    <div
                      className="h-full bg-blue-600 transition-all duration-200"
                      style={{ width: `${progress.total ? (progress.done / progress.total) * 100 : 0}%` }}
                    />
                  </div>
                </div>
              )}

              {/* Actions */}
              <div className="flex items-center justify-between gap-3 pt-2 border-t border-border">
                <button
                  onClick={() => { setResult(null); setTimeout(() => fileRef.current?.click(), 50) }}
                  className="text-xs text-muted-foreground hover:text-foreground"
                  disabled={importing}
                >
                  Choisir un autre fichier
                </button>
                <div className="flex items-center gap-2">
                  <Button variant="secondary" size="sm" onClick={closeImport} disabled={importing}>
                    Annuler
                  </Button>
                  <Button
                    size="sm"
                    onClick={confirmImport}
                    disabled={importing || result.valid.length === 0}
                  >
                    {importing && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                    Importer ({result.valid.length})
                  </Button>
                </div>
              </div>
            </div>
          )}

          {/* — Done state — */}
          {!parsing && result && importedCount !== null && (
            <div className="py-8 flex flex-col items-center gap-3">
              <div className="w-14 h-14 rounded-full bg-emerald-500/15 flex items-center justify-center">
                <CheckCircle2 className="w-7 h-7 text-emerald-600 dark:text-emerald-400" />
              </div>
              <p className="text-base font-semibold text-foreground">Import terminé</p>
              <p className="text-sm text-muted-foreground text-center">
                {importedCount} ligne{importedCount > 1 ? 's' : ''} importée{importedCount > 1 ? 's' : ''} sur {result.valid.length}
                {result.invalid.length > 0 && ` · ${result.invalid.length} ignorée${result.invalid.length > 1 ? 's' : ''} (erreurs)`}
              </p>
              <Button size="sm" onClick={closeImport}>Fermer</Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}

/* ─── Sub-components ─────────────────────────────────────────────── */
function SummaryCard({ label, value, color, icon }: { label: string; value: number; color: string; icon?: React.ReactNode }) {
  return (
    <div className="border border-border rounded-lg px-3 py-2 bg-muted/20">
      <div className={`flex items-center gap-1.5 text-xs font-medium ${color}`}>
        {icon}
        {label}
      </div>
      <p className={`text-xl font-bold mt-0.5 ${color}`}>{value}</p>
    </div>
  )
}

function PreviewRow<T>({ row, fields }: { row: ParsedRow<T>; fields: { key: string; label: string }[] }) {
  const ok = row.errors.length === 0
  return (
    <tr className={`border-t border-border ${ok ? '' : 'bg-red-500/5'}`}>
      <td className="px-2 py-1.5 text-muted-foreground">{row.index}</td>
      {fields.map(f => {
        const v = (row.data as any)[f.key]
        return (
          <td key={f.key} className="px-2 py-1.5 text-foreground truncate max-w-[160px]">
            {v == null || v === '' ? <span className="text-muted-foreground">—</span> : String(v)}
          </td>
        )
      })}
      <td className="px-2 py-1.5">
        {ok ? (
          <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400 text-[11px] font-medium">
            <CheckCircle2 className="w-3 h-3" /> OK
          </span>
        ) : (
          <span
            className="inline-flex items-center gap-1 text-red-600 dark:text-red-400 text-[11px] font-medium"
            title={row.errors.join(' · ')}
          >
            <X className="w-3 h-3" /> {row.errors[0]}
          </span>
        )}
      </td>
    </tr>
  )
}
