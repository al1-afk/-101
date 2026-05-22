/**
 * DevisActions
 * Both Imprimer + Télécharger PDF use the browser print engine (identical output).
 * @page { margin: 0 } removes the browser's URL/page-number footer.
 * Content padding is handled by the template itself (padding: 14mm).
 */
import { type RefObject } from 'react'
import { Printer, Download } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface DevisActionsProps {
  templateRef: RefObject<HTMLDivElement | null>
  numero: string
}

/* ── Print CSS ────────────────────────────────────────────────
   @page margin: 0   →  remove browser's URL / page-number header/footer.
   data-print-header / data-footer are position:fixed so the browser
   repaints them on every printed page. The body gets top/bottom padding
   so flowing content never sits underneath the repeated header/footer.
──────────────────────────────────────────────────────────────── */
const PRINT_CSS = `
  @page {
    size: A4;
    margin: 0;
  }

  html, body {
    margin: 0 !important;
    padding: 0 !important;
    background: white !important;
  }

  *, *::before, *::after {
    -webkit-print-color-adjust: exact !important;
    print-color-adjust: exact !important;
  }

  /* Reserve space at the top + bottom of every page for the fixed
     header / footer. Overrides the inline padding: 14mm on the wrapper. */
  [data-print-body] {
    min-height: 0 !important;
    height: auto !important;
    padding-top: 36mm !important;
    padding-bottom: 22mm !important;
  }

  /* Header — fixed at top of every page */
  [data-print-header] {
    position: fixed !important;
    top: 0 !important;
    left: 0 !important;
    right: 0 !important;
    padding: 8mm 14mm 0 14mm !important;
    margin: 0 !important;
    background: white !important;
    z-index: 9999;
  }

  /* Footer — fixed at bottom of every page */
  [data-footer] {
    position: fixed !important;
    bottom: 0 !important;
    left: 0 !important;
    right: 0 !important;
    padding: 4mm 14mm 6mm 14mm !important;
    margin: 0 !important;
    background: white !important;
    border-top: 1px solid #e2e8f0 !important;
    z-index: 9999;
  }

  /* Avoid cutting inside short inline elements only */
  p, li, blockquote {
    page-break-inside: avoid;
    break-inside: avoid;
  }
`

function getPageStyles(): string {
  return Array.from(document.styleSheets)
    .map(s => {
      try { return Array.from(s.cssRules).map(r => r.cssText).join('\n') }
      catch { return '' }
    })
    .join('\n')
}

function buildPrintHTML(el: HTMLDivElement, numero: string): string {
  const clone = el.cloneNode(true) as HTMLDivElement
  clone.setAttribute('data-print-body', 'true')
  clone.style.minHeight    = ''
  clone.style.height       = ''
  clone.style.paddingBottom = ''

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>${numero}</title>
  <style>${getPageStyles()}</style>
  <style>@media print { ${PRINT_CSS} }</style>
  <style>body { margin: 0; background: white; }</style>
</head>
<body>${clone.outerHTML}</body>
</html>`
}

export function openPrint(el: HTMLDivElement, numero: string, autoClose: boolean) {
  document.getElementById('__devis_if')?.remove()

  const html   = buildPrintHTML(el, numero)
  const iframe = document.createElement('iframe')
  iframe.id    = '__devis_if'
  iframe.style.cssText =
    'position:fixed;top:0;left:0;width:0;height:0;border:none;opacity:0;pointer-events:none'

  document.body.appendChild(iframe)

  const doc = iframe.contentDocument!
  doc.open()
  doc.write(html)
  doc.close()

  iframe.onload = () => {
    setTimeout(() => {
      iframe.contentWindow!.focus()
      iframe.contentWindow!.print()
      if (autoClose) setTimeout(() => iframe.remove(), 1500)
      else           setTimeout(() => iframe.remove(), 3000)
    }, 450)
  }
}

export default function DevisActions({ templateRef, numero }: DevisActionsProps) {
  const el = () => templateRef.current

  return (
    <div className="flex items-center gap-2">

      {/* ── Imprimer ──────────────────────────────────────── */}
      <Button
        variant="secondary"
        size="sm"
        onClick={() => { const e = el(); if (e) openPrint(e, numero, false) }}
        className="flex items-center gap-2"
      >
        <Printer className="w-4 h-4" />
        Imprimer
      </Button>

      {/* ── Télécharger PDF ───────────────────────────────── */}
      <Button
        size="sm"
        onClick={() => { const e = el(); if (e) openPrint(e, numero, true) }}
        className="flex items-center gap-2 bg-[#1e64c4] hover:bg-[#1558b0] text-white border-0"
      >
        <Download className="w-4 h-4" />
        Télécharger PDF
      </Button>

    </div>
  )
}
