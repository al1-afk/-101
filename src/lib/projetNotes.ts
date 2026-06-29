/**
 * Projet notes envelope — stocke dans projets.notes (TEXT) :
 *   - blocks  : éditeur Notion-style (Documentation tab)
 *   - infos   : notes contact client libres
 *   - credentials : identifiants (label, url, username, password, notes)
 *   - usefulLinks : liens utiles
 *   - text    : legacy free text (rétrocompat)
 * Backward-compatible : si notes ne contient pas la sentinelle, on garde
 * tout en text et le reste vide.
 */
import type { SopBlock } from '@/hooks/useSops'

export interface Credential {
  id:        string
  label:     string
  type?:     string    // preset: wordpress, cpanel, ftp, email, ga, meta_ads…
  url?:      string
  username?: string
  password?: string
  notes?:    string
}

export interface UsefulLink {
  id:    string
  label: string
  url:   string
  notes?:string
}

export interface ProjetEnvelope {
  text:         string
  blocks:       SopBlock[]
  infos:        string             // notes libres contact client
  credentials:  Credential[]
  usefulLinks:  UsefulLink[]
}

const SENTINEL = '__projet_meta__'

export function parseProjet(notes: string | null | undefined): ProjetEnvelope {
  const empty: ProjetEnvelope = { text: '', blocks: [], infos: '', credentials: [], usefulLinks: [] }
  if (!notes) return empty
  const trimmed = notes.trim()
  if (trimmed.startsWith('{') && trimmed.includes(SENTINEL)) {
    try {
      const d = JSON.parse(trimmed) as Partial<ProjetEnvelope> & { sentinel?: string }
      return {
        text:        d.text ?? '',
        blocks:      d.blocks ?? [],
        infos:       d.infos ?? '',
        credentials: d.credentials ?? [],
        usefulLinks: d.usefulLinks ?? [],
      }
    } catch { /* fall through */ }
  }
  return { ...empty, text: notes }
}

export function serializeProjet(e: Partial<ProjetEnvelope>): string {
  const full: ProjetEnvelope = {
    text:        e.text ?? '',
    blocks:      e.blocks ?? [],
    infos:       e.infos ?? '',
    credentials: e.credentials ?? [],
    usefulLinks: e.usefulLinks ?? [],
  }
  const isEmpty =
    !full.text.trim() &&
    full.blocks.length === 0 &&
    !full.infos.trim() &&
    full.credentials.length === 0 &&
    full.usefulLinks.length === 0
  if (isEmpty) return ''
  /* If nothing structured, keep plain text for backward compat */
  if (full.blocks.length === 0 && !full.infos.trim() && full.credentials.length === 0 && full.usefulLinks.length === 0) {
    return full.text
  }
  return JSON.stringify({ sentinel: SENTINEL, ...full })
}

/* ─── Credential presets pour le picker rapide ─────────────────── */
export const CREDENTIAL_PRESETS: Array<{
  type:   string
  label:  string
  emoji:  string
  urlHint?: string
}> = [
  { type: 'wordpress',    label: 'WordPress Admin',         emoji: '🌐', urlHint: 'https://exemple.com/wp-admin' },
  { type: 'cpanel',       label: 'cPanel / Hébergement',    emoji: '🖥️', urlHint: 'https://cpanel.exemple.com:2083' },
  { type: 'ftp',          label: 'FTP / SFTP',              emoji: '📁', urlHint: 'ftp.exemple.com' },
  { type: 'email_pro',    label: 'Email professionnel',     emoji: '📧', urlHint: 'mail.exemple.com' },
  { type: 'domain',       label: 'Bureau d\'enregistrement', emoji: '🔗', urlHint: 'https://manage.example-registrar.com' },
  { type: 'google_analytics', label: 'Google Analytics',    emoji: '📊', urlHint: 'https://analytics.google.com' },
  { type: 'google_business', label: 'Google Business',      emoji: '📍', urlHint: 'https://business.google.com' },
  { type: 'meta_ads',     label: 'Meta Ads (Facebook)',     emoji: '📱' },
  { type: 'google_ads',   label: 'Google Ads',              emoji: '🎯' },
  { type: 'social_facebook', label: 'Facebook Page',        emoji: '📘' },
  { type: 'social_instagram', label: 'Instagram',           emoji: '📸' },
  { type: 'social_tiktok',label: 'TikTok',                  emoji: '🎵' },
  { type: 'mailchimp',    label: 'Mailchimp / Newsletter',  emoji: '📨' },
  { type: 'stripe',       label: 'Stripe / Paiement',       emoji: '💳' },
  { type: 'shopify',      label: 'Shopify',                 emoji: '🛍️' },
  { type: 'database',     label: 'Base de données',         emoji: '🗄️' },
  { type: 'github',       label: 'GitHub / Git',            emoji: '🐙' },
  { type: 'custom',       label: 'Autre',                   emoji: '🔐' },
]
