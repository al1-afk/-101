/**
 * Mise en forme des notifications et rapports automatiques.
 *
 * Chaque fonction `render*` renvoie de quoi expédier ET de quoi tracer :
 *   subject / html / text  → l'email
 *   inapp                  → la notification persistée (cloche)
 *   summary                → les compteurs journalisés dans notification_runs
 *
 * Le HTML reste volontairement en tableaux + styles inline : c'est ce
 * que les clients mail (Gmail, Outlook, Mail iOS) savent afficher, et
 * c'est déjà la convention des emails du projet (lib/notificationEmails).
 */
import type {
  TasksSnapshot, ContactsSnapshot, DailySnapshot, WeeklySnapshot,
  TaskRow, ContactRow, PriorityRow,
} from './reportData'
import { fmtMoney, fmtDateFr, LIST_LIMIT } from './reportData'

export type ReportKind = 'tasks_overdue' | 'clients_to_contact' | 'daily_report' | 'weekly_report'

export interface RenderContext {
  tenantName: string
  tenantSlug: string
  localDate:  string
}

export interface RenderedReport {
  subject:  string
  html:     string
  text:     string
  /** Vide = rien à signaler : l'alerte n'est pas envoyée ce jour-là. */
  empty:    boolean
  inapp: {
    title:    string
    message:  string
    link:     string
    icon:     string
    severity: 'info' | 'success' | 'warning' | 'critical'
  }
  summary: Record<string, number>
}

/* ─── Palette (alignée sur les emails existants du projet) ─────────── */
const C = {
  ink:    '#0f172a',
  body:   '#334155',
  muted:  '#64748b',
  faint:  '#94a3b8',
  line:   '#e2e8f0',
  blue:   '#2563eb',
  red:    '#dc2626',
  amber:  '#d97706',
  green:  '#059669',
}

/** Base publique du front (liens « Ouvrir dans l'application »). */
export function appBaseUrl(): string {
  const explicit = process.env.PUBLIC_APP_URL
  if (explicit) return explicit.replace(/\/$/, '')
  const cors = (process.env.CORS_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean)
  if (cors[0]) return cors[0].replace(/\/$/, '')
  return 'http://localhost:5173'
}

function link(slug: string, path: string): string {
  return `${appBaseUrl()}/${slug}${path}`
}

export function escapeHtml(s: unknown): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/* ─────────────────────────────────────────────────────────────────────
   Briques de mise en page
───────────────────────────────────────────────────────────────────── */

function layout(opts: {
  title:    string
  subtitle: string
  accent:   string
  body:     string
  ctaLabel?: string
  ctaUrl?:   string
}): string {
  const cta = opts.ctaUrl ? `
    <tr><td style="padding:4px 32px 28px;">
      <a href="${opts.ctaUrl}" style="display:inline-block;padding:11px 22px;border-radius:10px;background:${opts.accent};color:#ffffff;text-decoration:none;font-size:14px;font-weight:600;">
        ${escapeHtml(opts.ctaLabel ?? 'Ouvrir dans l\'application')}
      </a>
    </td></tr>` : ''

  return `<!doctype html>
<html><body style="margin:0;padding:0;background:#f5f7fb;font-family:-apple-system,Segoe UI,Roboto,Inter,sans-serif;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="padding:32px 12px;">
    <tr><td align="center">
      <table role="presentation" width="100%" style="max-width:640px;background:#ffffff;border-radius:16px;box-shadow:0 4px 16px rgba(15,23,42,0.06);overflow:hidden;">
        <tr><td style="padding:22px 32px;background:linear-gradient(135deg,${opts.accent}14,#ffffff);border-bottom:1px solid ${C.line};">
          <h1 style="margin:0;font-size:17px;color:${C.ink};">${escapeHtml(opts.title)}</h1>
          <p style="margin:5px 0 0;font-size:13px;color:${C.muted};">${escapeHtml(opts.subtitle)}</p>
        </td></tr>
        <tr><td style="padding:22px 32px 8px;font-size:14px;color:${C.body};line-height:1.6;">${opts.body}</td></tr>
        ${cta}
        <tr><td style="padding:14px 32px;border-top:1px solid ${C.line};background:#f8fafc;text-align:center;">
          <p style="margin:0;font-size:11px;color:${C.faint};">
            <strong style="color:${C.blue};">NEXT GITAL</strong> — CRM &amp; Gestion · Envoi automatique quotidien.<br/>
            Réglages : Paramètres → Notifications.
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`
}

/** Bandeau de chiffres clés (2 à 4 cases). */
function stats(items: Array<{ value: string | number; label: string; color?: string }>): string {
  if (!items.length) return ''
  const width = Math.floor(100 / items.length)
  const cells = items.map(i => `
    <td width="${width}%" style="padding:10px 8px;text-align:center;vertical-align:top;">
      <div style="font-size:24px;font-weight:800;color:${i.color ?? C.ink};line-height:1.1;">${escapeHtml(i.value)}</div>
      <div style="font-size:11px;color:${C.muted};margin-top:3px;">${escapeHtml(i.label)}</div>
    </td>`).join('')
  return `<table role="presentation" width="100%" style="margin:0 0 18px;background:#f8fafc;border:1px solid ${C.line};border-radius:12px;">
    <tr>${cells}</tr>
  </table>`
}

function heading(text: string, color = C.ink): string {
  return `<h2 style="margin:20px 0 8px;font-size:14px;color:${color};border-bottom:1px solid ${C.line};padding-bottom:6px;">${escapeHtml(text)}</h2>`
}

/** Liste à puces compacte : libellé principal + précision en gris. */
function bullets(rows: Array<{ main: string; sub?: string | null; tag?: string; tagColor?: string }>, total: number): string {
  if (!rows.length) return `<p style="margin:6px 0 0;font-size:13px;color:${C.muted};">Rien à signaler.</p>`
  const items = rows.map(r => `
    <li style="margin:0 0 7px;">
      <span style="color:${C.ink};">${escapeHtml(r.main)}</span>
      ${r.tag ? `<span style="display:inline-block;margin-left:6px;padding:1px 7px;border-radius:99px;font-size:10px;font-weight:700;color:#fff;background:${r.tagColor ?? C.muted};">${escapeHtml(r.tag)}</span>` : ''}
      ${r.sub ? `<br/><span style="font-size:12px;color:${C.muted};">${escapeHtml(r.sub)}</span>` : ''}
    </li>`).join('')
  const more = total > rows.length
    ? `<p style="margin:6px 0 0;font-size:12px;color:${C.faint};">+ ${total - rows.length} autre(s) — voir dans l'application.</p>`
    : ''
  return `<ul style="margin:8px 0 0;padding-left:18px;font-size:13px;line-height:1.5;">${items}</ul>${more}`
}

function priorityList(rows: PriorityRow[]): string {
  if (!rows.length) {
    return `<p style="margin:6px 0 0;font-size:13px;color:${C.green};">Aucune action critique — tout est à jour.</p>`
  }
  return rows.map(r => {
    const color = r.urgency === 'critical' ? C.red : r.urgency === 'warning' ? C.amber : C.blue
    const dot   = r.urgency === 'critical' ? '🔴' : r.urgency === 'warning' ? '🟠' : '🔵'
    return `<div style="margin:0 0 8px;padding:10px 12px;border-radius:10px;background:${color}0f;border-left:3px solid ${color};">
      <div style="font-size:13px;font-weight:600;color:${C.ink};">${dot} ${escapeHtml(r.label)}</div>
      ${r.detail ? `<div style="font-size:12px;color:${C.muted};margin-top:2px;">${escapeHtml(r.detail)}</div>` : ''}
    </div>`
  }).join('')
}

/* ─── Formatage des lignes métier ─────────────────────────────────── */

const PRIORITY_LABEL: Record<string, string> = {
  urgent: 'URGENT', high: 'HAUTE', normal: '', low: '',
}
const PRIORITY_COLOR: Record<string, string> = {
  urgent: C.red, high: C.amber, normal: C.muted, low: C.faint,
}

function taskBullet(t: TaskRow, mode: 'late' | 'due' | 'idle' | 'plain' = 'plain') {
  const parts: string[] = []
  if (t.assignee) parts.push(t.assignee)
  else parts.push('non assignée')
  if (t.projet) parts.push(t.projet)
  if (mode === 'late' && t.days_late)  parts.push(`en retard de ${t.days_late} j (échéance ${fmtDateFr(t.due_date!)})`)
  if (mode === 'due'  && t.due_date)   parts.push(`échéance ${fmtDateFr(t.due_date)}`)
  if (mode === 'idle' && t.idle_days)  parts.push(`sans mouvement depuis ${t.idle_days} j`)
  return {
    main: t.title,
    sub:  parts.join(' · '),
    tag:  PRIORITY_LABEL[t.priority] || undefined,
    tagColor: PRIORITY_COLOR[t.priority],
  }
}

function contactBullet(c: ContactRow, mode: 'never' | 'stale' | 'relance') {
  const who = c.entreprise && c.entreprise !== c.nom ? `${c.nom} — ${c.entreprise}` : c.nom
  const parts: string[] = []
  if (c.telephone) parts.push(c.telephone)
  if (c.email)     parts.push(c.email)
  if (mode === 'never'   && c.days != null) parts.push(`créé il y a ${c.days} j`)
  if (mode === 'stale'   && c.days != null) parts.push(`dernier contact il y a ${c.days} j`)
  if (mode === 'relance' && c.days != null) {
    parts.push(c.days > 0 ? `relance en retard de ${c.days} j` : 'relance prévue aujourd\'hui')
  }
  return { main: who, sub: parts.join(' · ') }
}

/* Version texte : même contenu, sans balise — utile pour les clients
   mail en texte brut et pour les notifications push. */
function textLines(title: string, blocks: Array<[string, string[]]>): string {
  const out = [title, '='.repeat(Math.min(title.length, 60)), '']
  for (const [h, lines] of blocks) {
    if (!lines.length) continue
    out.push(h, ...lines.map(l => `  - ${l}`), '')
  }
  out.push('— NEXT GITAL · envoi automatique')
  return out.join('\n')
}

/* ─────────────────────────────────────────────────────────────────────
   1. Alerte — tâches en retard / non terminées
───────────────────────────────────────────────────────────────────── */
export function renderTasksAlert(snap: TasksSnapshot, ctx: RenderContext): RenderedReport {
  const c = snap.counts
  /* On alerte s'il y a un vrai signal : du retard, une échéance du jour,
     une validation qui traîne ou des tâches dormantes. Un backlog sans
     échéance ne déclenche pas un mail tous les matins. */
  const empty = c.overdue + c.today + c.validation + c.stale === 0

  const url = link(ctx.tenantSlug, '/projets')
  const body = [
    stats([
      { value: c.overdue, label: 'en retard',        color: c.overdue ? C.red : C.ink },
      { value: c.today,   label: "pour aujourd'hui", color: c.today ? C.amber : C.ink },
      { value: c.validation, label: 'à valider',     color: c.validation ? C.blue : C.ink },
      { value: c.open,    label: 'non terminées',    color: C.ink },
    ]),
    heading('⏰ En retard', C.red),
    bullets(snap.overdue.map(t => taskBullet(t, 'late')), c.overdue),
    heading("📅 À rendre aujourd'hui", C.amber),
    bullets(snap.today.map(t => taskBullet(t, 'due')), c.today),
    heading('⚑ Terminées par l\'équipe, en attente de validation', C.blue),
    bullets(snap.validation.map(t => taskBullet(t)), c.validation),
    heading(`💤 Sans échéance et sans mouvement`, C.muted),
    bullets(snap.stale.map(t => taskBullet(t, 'idle')), c.stale),
    c.unassigned
      ? `<p style="margin:16px 0 0;font-size:12px;color:${C.muted};">ℹ️ ${c.unassigned} tâche(s) non terminée(s) ne sont assignées à personne.</p>`
      : '',
  ].join('')

  const subject = c.overdue
    ? `101/ ⏰ ${c.overdue} tâche${c.overdue > 1 ? 's' : ''} en retard · ${c.open} non terminée${c.open > 1 ? 's' : ''}`
    : `101/ ✅ Point tâches — ${c.open} en cours`

  return {
    subject,
    empty,
    html: layout({
      title: '⏰ Tâches en retard et non terminées',
      subtitle: `${ctx.tenantName} · ${fmtDateFr(ctx.localDate)}`,
      accent: c.overdue ? C.red : C.blue,
      body,
      ctaLabel: 'Voir les tâches',
      ctaUrl: url,
    }),
    text: textLines(`Tâches — ${fmtDateFr(ctx.localDate)}`, [
      [`En retard (${c.overdue})`,     snap.overdue.map(t => `${t.title} — ${t.assignee ?? 'non assignée'} (${t.days_late} j)`)],
      [`Aujourd'hui (${c.today})`,     snap.today.map(t => `${t.title} — ${t.assignee ?? 'non assignée'}`)],
      [`À valider (${c.validation})`,  snap.validation.map(t => t.title)],
      [`Dormantes (${c.stale})`,       snap.stale.map(t => `${t.title} (${t.idle_days} j sans mouvement)`)],
    ]),
    inapp: {
      title:   c.overdue ? `${c.overdue} tâche(s) en retard` : `${c.open} tâche(s) non terminée(s)`,
      message: `${c.overdue} en retard · ${c.today} pour aujourd'hui · ${c.validation} à valider · ${c.stale} sans mouvement`,
      link:    '/projets',
      icon:    '⏰',
      severity: c.overdue ? 'critical' : 'warning',
    },
    summary: {
      overdue: c.overdue, today: c.today, soon: c.soon,
      stale: c.stale, validation: c.validation, open: c.open,
    },
  }
}

/* ─────────────────────────────────────────────────────────────────────
   2. Alerte — clients & prospects à contacter
───────────────────────────────────────────────────────────────────── */
export function renderContactsAlert(snap: ContactsSnapshot, ctx: RenderContext, delayDays: number): RenderedReport {
  const c = snap.counts
  const empty = c.total === 0

  const body = [
    stats([
      { value: c.clients_never,     label: 'clients jamais contactés',  color: c.clients_never ? C.red : C.ink },
      { value: c.clients_stale,     label: `clients sans contact +${delayDays}j`, color: c.clients_stale ? C.amber : C.ink },
      { value: c.prospects_never,   label: 'prospects jamais contactés', color: c.prospects_never ? C.red : C.ink },
      { value: c.prospects_relance, label: 'relances échues',           color: c.prospects_relance ? C.red : C.ink },
    ]),
    heading('📞 Relances prospects à passer', C.red),
    bullets(snap.prospects_relance.map(p => contactBullet(p, 'relance')), c.prospects_relance),
    heading('🆕 Prospects jamais contactés', C.amber),
    bullets(snap.prospects_never.map(p => contactBullet(p, 'never')), c.prospects_never),
    heading('👤 Clients sans aucun contact enregistré', C.blue),
    bullets(snap.clients_never.map(p => contactBullet(p, 'never')), c.clients_never),
    heading(`🕰️ Clients sans nouvelle depuis plus de ${delayDays} jours`, C.muted),
    bullets(snap.clients_stale.map(p => contactBullet(p, 'stale')), c.clients_stale),
    `<p style="margin:18px 0 0;font-size:12px;color:${C.muted};">
       Après un appel ou un email, utilisez « Marquer comme contacté » sur la fiche client :
       elle sort alors de cette liste.
     </p>`,
  ].join('')

  return {
    subject: `101/ 📞 ${c.total} contact${c.total > 1 ? 's' : ''} à traiter — ${c.prospects_relance} relance(s), ${c.clients_never + c.prospects_never} jamais contacté(s)`,
    empty,
    html: layout({
      title: '📞 Clients et prospects à contacter',
      subtitle: `${ctx.tenantName} · ${fmtDateFr(ctx.localDate)}`,
      accent: C.blue,
      body,
      ctaLabel: 'Ouvrir le CRM',
      ctaUrl: link(ctx.tenantSlug, '/prospects'),
    }),
    text: textLines(`Contacts à traiter — ${fmtDateFr(ctx.localDate)}`, [
      [`Relances échues (${c.prospects_relance})`,   snap.prospects_relance.map(p => `${p.entreprise || p.nom} ${p.telephone ?? ''}`)],
      [`Prospects jamais contactés (${c.prospects_never})`, snap.prospects_never.map(p => `${p.entreprise || p.nom} ${p.telephone ?? ''}`)],
      [`Clients jamais contactés (${c.clients_never})`,     snap.clients_never.map(p => `${p.entreprise || p.nom} ${p.telephone ?? ''}`)],
      [`Clients sans nouvelle (${c.clients_stale})`,        snap.clients_stale.map(p => `${p.entreprise || p.nom} — ${p.days} j`)],
    ]),
    inapp: {
      title:   `${c.total} client(s) / prospect(s) à contacter`,
      message: `${c.prospects_relance} relance(s) échue(s) · ${c.prospects_never + c.clients_never} jamais contacté(s) · ${c.clients_stale} sans nouvelle`,
      link:    '/prospects',
      icon:    '📞',
      severity: c.prospects_relance ? 'critical' : 'warning',
    },
    summary: {
      clients_never: c.clients_never, clients_stale: c.clients_stale,
      prospects_never: c.prospects_never, prospects_relance: c.prospects_relance,
      total: c.total,
    },
  }
}

/* ─────────────────────────────────────────────────────────────────────
   3. Rapport quotidien
───────────────────────────────────────────────────────────────────── */
export function renderDailyReport(snap: DailySnapshot, ctx: RenderContext): RenderedReport {
  const t = snap.tasks.counts
  const c = snap.contacts.counts

  const body = [
    stats([
      { value: snap.done_count, label: 'tâches réalisées', color: snap.done_count ? C.green : C.ink },
      { value: t.open,          label: 'en attente',       color: C.ink },
      { value: t.overdue,       label: 'en retard',        color: t.overdue ? C.red : C.ink },
      { value: c.total,         label: 'à contacter',      color: c.total ? C.amber : C.ink },
    ]),

    heading('🎯 Actions prioritaires', C.red),
    priorityList(snap.priorities),

    heading('✅ Tâches réalisées aujourd\'hui', C.green),
    bullets(snap.done.map(t2 => taskBullet(t2)), snap.done_count),

    heading('🕒 Tâches en attente', C.amber),
    `<p style="margin:8px 0 0;font-size:13px;color:${C.body};">
       ${t.overdue} en retard · ${t.today} pour aujourd'hui · ${t.soon} d'ici 7 jours ·
       ${t.validation} à valider · ${t.stale} sans mouvement
     </p>`,
    bullets([...snap.tasks.overdue.map(x => taskBullet(x, 'late')),
             ...snap.tasks.today.map(x => taskBullet(x, 'due'))].slice(0, LIST_LIMIT),
            t.overdue + t.today),

    heading('📞 Clients à contacter', C.blue),
    bullets([...snap.contacts.prospects_relance.map(p => contactBullet(p, 'relance')),
             ...snap.contacts.prospects_never.map(p => contactBullet(p, 'never')),
             ...snap.contacts.clients_never.map(p => contactBullet(p, 'never'))].slice(0, LIST_LIMIT),
            c.total),
  ].join('')

  return {
    subject: `101/ 📊 Rapport du ${fmtDateFr(snap.date)} — ${snap.done_count} fait · ${t.overdue} en retard · ${c.total} à contacter`,
    /* Un rapport quotidien part TOUS les jours, même une journée calme :
       c'est le suivi, pas une alerte. */
    empty: false,
    html: layout({
      title: '📊 Rapport quotidien',
      subtitle: `${ctx.tenantName} · ${fmtDateFr(snap.date)}`,
      accent: C.blue,
      body,
      ctaLabel: 'Ouvrir le tableau de bord',
      ctaUrl: link(ctx.tenantSlug, ''),
    }),
    text: textLines(`Rapport quotidien — ${fmtDateFr(snap.date)}`, [
      ['Actions prioritaires', snap.priorities.map(p => `${p.label}${p.detail ? ` (${p.detail})` : ''}`)],
      [`Réalisées (${snap.done_count})`, snap.done.map(x => x.title)],
      [`En retard (${t.overdue})`, snap.tasks.overdue.map(x => `${x.title} — ${x.days_late} j`)],
      [`À contacter (${c.total})`, [
        `${c.prospects_relance} relance(s) échue(s)`,
        `${c.prospects_never} prospect(s) jamais contacté(s)`,
        `${c.clients_never} client(s) jamais contacté(s)`,
        `${c.clients_stale} client(s) sans nouvelle`,
      ]],
    ]),
    inapp: {
      title:   `Rapport du ${fmtDateFr(snap.date)}`,
      message: `${snap.done_count} tâche(s) réalisée(s) · ${t.open} en attente · ${t.overdue} en retard · ${c.total} contact(s) à traiter`,
      link:    '',
      icon:    '📊',
      severity: t.overdue || c.prospects_relance ? 'warning' : 'info',
    },
    summary: {
      done: snap.done_count, open: t.open, overdue: t.overdue,
      validation: t.validation, to_contact: c.total,
      priorities: snap.priorities.length,
    },
  }
}

/* ─────────────────────────────────────────────────────────────────────
   4. Rapport hebdomadaire
───────────────────────────────────────────────────────────────────── */
export function renderWeeklyReport(snap: WeeklySnapshot, ctx: RenderContext): RenderedReport {
  const t = snap.tasks.counts
  const c = snap.contacts.counts
  const r = snap.results
  const periode = `${fmtDateFr(snap.from)} → ${fmtDateFr(snap.to)}`

  const perPerson = snap.done_by_person.length
    ? `<table role="presentation" width="100%" style="margin:8px 0 0;font-size:13px;border-collapse:collapse;">
        ${snap.done_by_person.map(p => `
          <tr>
            <td style="padding:5px 0;color:${C.body};border-bottom:1px solid ${C.line};">${escapeHtml(p.assignee)}</td>
            <td style="padding:5px 0;text-align:right;font-weight:700;color:${C.ink};border-bottom:1px solid ${C.line};">${p.done}</td>
          </tr>`).join('')}
       </table>`
    : `<p style="margin:6px 0 0;font-size:13px;color:${C.muted};">Aucune tâche clôturée sur la période.</p>`

  const resultats = `
    <table role="presentation" width="100%" style="margin:8px 0 0;font-size:13px;border-collapse:collapse;">
      ${resultRow('Devis acceptés',      `${r.devis_acceptes.count}`, fmtMoney(r.devis_acceptes.montant), C.green)}
      ${resultRow('Devis envoyés',       `${r.devis_envoyes.count}`, fmtMoney(r.devis_envoyes.montant), C.blue)}
      ${resultRow('Factures émises',     `${r.factures_emises.count}`, fmtMoney(r.factures_emises.montant), C.blue)}
      ${resultRow('Encaissements',       '', fmtMoney(r.encaissements), C.green)}
      ${resultRow('Nouveaux clients',    `${r.nouveaux_clients}`, '', C.ink)}
      ${resultRow('Nouveaux prospects',  `${r.nouveaux_prospects}`, '', C.ink)}
      ${resultRow('Projets terminés',    `${r.projets_termines}`, '', C.ink)}
    </table>`

  const body = [
    stats([
      { value: snap.done_count, label: 'tâches réalisées', color: snap.done_count ? C.green : C.ink },
      { value: t.overdue,       label: 'encore en retard', color: t.overdue ? C.red : C.ink },
      { value: snap.contacted_clients + snap.contacted_prospects, label: 'contacts traités', color: C.blue },
      { value: c.total,         label: 'restent à contacter', color: c.total ? C.amber : C.ink },
    ]),

    heading('✅ Tâches réalisées cette semaine', C.green),
    perPerson,
    bullets(snap.done_sample.map(x => taskBullet(x)), snap.done_count),

    heading('⏰ Tâches en retard', C.red),
    bullets(snap.tasks.overdue.map(x => taskBullet(x, 'late')), t.overdue),

    heading('📞 Clients contactés / non contactés', C.blue),
    `<p style="margin:8px 0 0;font-size:13px;color:${C.body};">
       <strong style="color:${C.green};">Contactés :</strong> ${snap.contacted_clients} client(s) et ${snap.contacted_prospects} prospect(s) sur la semaine.<br/>
       <strong style="color:${C.amber};">Non contactés :</strong> ${c.clients_never} client(s) sans aucun contact,
       ${c.clients_stale} client(s) sans nouvelle, ${c.prospects_never} prospect(s) jamais contacté(s),
       ${c.prospects_relance} relance(s) échue(s).
     </p>`,
    bullets([...snap.contacts.prospects_relance.map(p => contactBullet(p, 'relance')),
             ...snap.contacts.clients_never.map(p => contactBullet(p, 'never'))].slice(0, LIST_LIMIT),
            c.clients_never + c.prospects_relance),

    heading('📈 Résultats obtenus', C.green),
    resultats,

    heading('➡️ Prochaines actions', C.blue),
    priorityList(snap.next_actions),
  ].join('')

  return {
    subject: `101/ 🗓️ Bilan semaine ${periode} — ${snap.done_count} tâche(s) faite(s) · ${fmtMoney(r.encaissements)} encaissés`,
    empty: false,
    html: layout({
      title: '🗓️ Rapport hebdomadaire',
      subtitle: `${ctx.tenantName} · ${periode}`,
      accent: C.green,
      body,
      ctaLabel: 'Ouvrir le tableau de bord',
      ctaUrl: link(ctx.tenantSlug, ''),
    }),
    text: textLines(`Rapport hebdomadaire — ${periode}`, [
      [`Réalisé (${snap.done_count})`, snap.done_by_person.map(p => `${p.assignee} : ${p.done}`)],
      [`En retard (${t.overdue})`,     snap.tasks.overdue.map(x => `${x.title} — ${x.days_late} j`)],
      ['Contacts', [
        `${snap.contacted_clients} client(s) contacté(s)`,
        `${snap.contacted_prospects} prospect(s) contacté(s)`,
        `${c.clients_never + c.prospects_never} jamais contacté(s)`,
        `${c.prospects_relance} relance(s) échue(s)`,
      ]],
      ['Résultats', [
        `${r.devis_acceptes.count} devis accepté(s) — ${fmtMoney(r.devis_acceptes.montant)}`,
        `${r.factures_emises.count} facture(s) émise(s) — ${fmtMoney(r.factures_emises.montant)}`,
        `Encaissements : ${fmtMoney(r.encaissements)}`,
        `${r.nouveaux_clients} nouveau(x) client(s), ${r.nouveaux_prospects} nouveau(x) prospect(s)`,
        `${r.projets_termines} projet(s) terminé(s)`,
      ]],
      ['Prochaines actions', snap.next_actions.map(p => `${p.label}${p.detail ? ` (${p.detail})` : ''}`)],
    ]),
    inapp: {
      title:   `Bilan de la semaine (${periode})`,
      message: `${snap.done_count} tâche(s) réalisée(s) · ${t.overdue} en retard · ${fmtMoney(r.encaissements)} encaissés · ${c.total} contact(s) en attente`,
      link:    '',
      icon:    '🗓️',
      severity: 'info',
    },
    summary: {
      done: snap.done_count, overdue: t.overdue,
      contacted: snap.contacted_clients + snap.contacted_prospects,
      to_contact: c.total,
      devis_acceptes: r.devis_acceptes.count,
      encaissements: Math.round(r.encaissements),
    },
  }
}

function resultRow(label: string, count: string, montant: string, color: string): string {
  return `<tr>
    <td style="padding:6px 0;color:${C.body};border-bottom:1px solid ${C.line};">${escapeHtml(label)}</td>
    <td style="padding:6px 0;text-align:right;color:${C.ink};font-weight:700;border-bottom:1px solid ${C.line};">${escapeHtml(count)}</td>
    <td style="padding:6px 0 6px 14px;text-align:right;color:${color};font-weight:700;border-bottom:1px solid ${C.line};white-space:nowrap;">${escapeHtml(montant)}</td>
  </tr>`
}
