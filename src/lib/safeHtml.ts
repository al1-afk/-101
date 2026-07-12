/**
 * Safe HTML rendering — wraps DOMPurify with a strict allow-list.
 *
 * Use `sanitizeRichHtml(input)` before assigning to `dangerouslySetInnerHTML`.
 * Removes: <script>, <iframe>, <object>, event handlers (onclick, onerror…),
 *          javascript: URLs, data: URLs (except images), <style> tags.
 * Allows:  paragraphs, lists, headings, basic formatting, links (with rel).
 */
import DOMPurify from 'dompurify'

const ALLOWED_TAGS = [
  'a', 'b', 'br', 'code', 'div', 'em', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'hr', 'i', 'li', 'ol', 'p', 'pre', 'span', 'strong', 'sub', 'sup', 'u', 'ul',
  'blockquote', 'table', 'thead', 'tbody', 'tr', 'th', 'td',
]
const ALLOWED_ATTR = ['href', 'title', 'target', 'rel', 'class', 'style']

/* Force all links to be safe (target=_blank + rel=noopener noreferrer). */
DOMPurify.addHook('afterSanitizeAttributes', (node) => {
  if (node.tagName === 'A') {
    node.setAttribute('target', '_blank')
    node.setAttribute('rel', 'noopener noreferrer nofollow')
    /* Reject javascript:, data: (except image data uris are handled elsewhere) */
    const href = node.getAttribute('href') ?? ''
    if (/^\s*(javascript|data|vbscript|file):/i.test(href)) {
      node.removeAttribute('href')
    }
  }
})

export function sanitizeRichHtml(input: string): string {
  if (typeof input !== 'string' || !input) return ''
  return DOMPurify.sanitize(input, {
    ALLOWED_TAGS,
    ALLOWED_ATTR,
    FORBID_TAGS: ['script', 'iframe', 'object', 'embed', 'style', 'link', 'form', 'input', 'button'],
    FORBID_ATTR: ['onload', 'onerror', 'onclick', 'onmouseover', 'onfocus', 'onblur', 'onchange', 'onsubmit'],
    USE_PROFILES: { html: true },
  })
}
