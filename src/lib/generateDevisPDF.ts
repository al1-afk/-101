/**
 * generateDevisPDF — Unified PDF engine.
 *
 * Renders the exact same DevisTemplate that is shown on screen,
 * then triggers the browser print dialog (or auto-closes for
 * the "download" path).  Zero divergence between preview and PDF.
 *
 * Previous jsPDF implementation removed: it ignored showQuantite /
 * showPrixUnit toggles, never rendered the signature, and could not
 * handle multi-page documents.
 */
import { createElement } from 'react'
import { createRoot }    from 'react-dom/client'
import { toast }         from 'sonner'
import html2canvas       from 'html2canvas'
import jsPDF             from 'jspdf'
import DevisTemplate     from '@/components/devis/DevisTemplate'
import { openPrint }     from '@/components/devis/DevisActions'
import type { Devis }    from '@/hooks/useDevis'
import type { Client }   from '@/hooks/useClients'

/**
 * Render DevisTemplate in a hidden off-screen container, capture the
 * resulting DOM node, and pass it to the shared iframe-print engine.
 *
 * @param autoClose  true  → "Télécharger PDF" (closes after print)
 *                   false → "Imprimer" (keeps dialog open)
 */
export function generateDevisPDF(
  d:          Devis,
  client?:    Client,
  autoClose = true,
): Promise<void> {
  return new Promise((resolve, reject) => {
    /* 1. Hidden mount point — off-screen, never painted */
    const container = document.createElement('div')
    container.style.cssText =
      'position:fixed;top:-9999px;left:-9999px;width:210mm;' +
      'visibility:hidden;pointer-events:none;z-index:-1;'
    document.body.appendChild(container)

    /* 2. Render the template (synchronous component, no async deps) */
    const root = createRoot(container)
    root.render(createElement(DevisTemplate, { devis: d, client }))

    /* 3. Four rAF → ensures React has committed on slow devices */
    let rafCount = 0
    const waitFrames = (cb: () => void) => {
      if (++rafCount < 4) requestAnimationFrame(() => waitFrames(cb))
      else cb()
    }

    waitFrames(() => {
      const el = container.firstElementChild as HTMLDivElement | null

      if (!el) {
        root.unmount()
        container.remove()
        reject(new Error('PDF render failed: template element not found'))
        return
      }

      openPrint(el, d.numero, autoClose)

      /* 4. Cleanup after print dialog closes / iframe auto-removes */
      setTimeout(() => {
        root.unmount()
        container.remove()
        resolve()
      }, 4_000)
    })
  })
}

/**
 * Génère un Blob PDF à partir du MÊME `DevisTemplate` que l'aperçu et le
 * téléchargement (html2canvas → jsPDF), pour l'attacher à un email.
 * → Le PDF envoyé au client est identique à celui qu'on voit / télécharge,
 *   au lieu d'un rendu jsPDF séparé qui divergeait.
 */
export async function generateDevisPDFBlobFromTemplate(
  d:       Devis,
  client?: Client,
): Promise<Blob> {
  const container = document.createElement('div')
  container.style.cssText =
    'position:fixed;top:0;left:-99999px;width:210mm;background:#ffffff;z-index:-1;'
  document.body.appendChild(container)

  const root = createRoot(container)
  root.render(createElement(DevisTemplate, { devis: d, client }))

  try {
    /* Laisse React committer le rendu (quelques frames). */
    await new Promise<void>(res => {
      let n = 0
      const step = () => { if (++n < 5) requestAnimationFrame(step); else res() }
      requestAnimationFrame(step)
    })

    const el = container.firstElementChild as HTMLElement | null
    if (!el) throw new Error('PDF render failed: template element not found')

    const canvas = await html2canvas(el, {
      scale: 2, useCORS: true, backgroundColor: '#ffffff',
    })

    const pdf   = new jsPDF('p', 'mm', 'a4')
    const pageW = pdf.internal.pageSize.getWidth()
    const pageH = pdf.internal.pageSize.getHeight()
    const imgW  = pageW
    const imgH  = (canvas.height * imgW) / canvas.width
    const img   = canvas.toDataURL('image/jpeg', 0.92)

    let heightLeft = imgH
    let position   = 0
    pdf.addImage(img, 'JPEG', 0, position, imgW, imgH)
    heightLeft -= pageH
    while (heightLeft > 0) {
      position -= pageH
      pdf.addPage()
      pdf.addImage(img, 'JPEG', 0, position, imgW, imgH)
      heightLeft -= pageH
    }

    return pdf.output('blob')
  } finally {
    root.unmount()
    container.remove()
  }
}

/**
 * Wraps generateDevisPDF with up to 3 automatic retries (1s apart).
 * Shows a user-facing toast on each attempt failure; fatal toast after
 * all retries are exhausted.
 */
export async function generateDevisPDFWithRetry(
  d:          Devis,
  client?:    Client,
  autoClose = true,
  maxRetries = 3,
): Promise<void> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      await generateDevisPDF(d, client, autoClose)
      return
    } catch (err) {
      if (attempt < maxRetries) {
        toast.warning(`Génération PDF échouée, nouvelle tentative (${attempt}/${maxRetries - 1})…`)
        await new Promise(r => setTimeout(r, 1_000))
      } else {
        toast.error('Impossible de générer le PDF après plusieurs tentatives. Veuillez réessayer.')
        throw err
      }
    }
  }
}
