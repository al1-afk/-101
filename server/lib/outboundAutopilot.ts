/**
 * OUTBOUND AUTOPILOT — orchestrateur quotidien.
 *
 *   FOR EACH tenant WITH autopilot.enabled = TRUE AND run_hour_utc = HH:
 *     1. Découvre des entreprises via Google Places (secteur × villes)
 *     2. Déduplique par google_place_id (unique par tenant)
 *     3. Filtre qualité (email/site/tél requis selon config)
 *     4. Crée les outbound_prospects (owner = default_owner_id)
 *     5. Pour chaque prospect créé :
 *        - génère message (email et/ou WhatsApp) via Claude/OpenAI
 *        - envoie en respectant le rate limit + fenêtre horaire
 *     6. Journalise dans outbound_autopilot_runs (status, compteurs, logs)
 *
 * Sécurité :
 *  - Respecte ne_plus_contacter
 *  - Cap dur : daily_prospect_limit, daily_search_limit
 *  - Fenêtre horaire (send_window_start/end)
 *  - Un seul run "running" par tenant à la fois (skip si déjà en cours)
 */
import { Pool } from 'pg'
import * as googlePlaces from './googlePlaces'
import * as aiEmailGen from './aiEmailGen'
import * as whatsappCloud from './whatsappCloud'
import { verifyPhoneFormat } from './verifyContact'
import { sendEmail } from './email'
import { buildOutboundEmailHtml } from './outboundEmailTemplate'
import { openPixelUrl, clickWrapUrl, recordSent } from './emailTracking'
import { logger } from './logger'

/* Villes marocaines par défaut (utilisées si cities = []). */
export const DEFAULT_MOROCCAN_CITIES = [
  'Casablanca','Rabat','Marrakech','Fès','Tanger','Meknès','Agadir','Oujda',
  'Kénitra','Tétouan','Salé','Nador','El Jadida','Béni Mellal','Mohammédia',
  'Safi','Khouribga','Larache','Errachidia','Settat',
]

type Channels = ('email' | 'whatsapp')[]

interface AutopilotConfig {
  id:                    string
  tenant_id:             string
  enabled:               boolean
  sector_id:             string | null
  keyword:               string | null
  cities:                string[]
  daily_prospect_limit:  number
  daily_search_limit:    number
  send_interval_seconds: number
  send_window_start:     string
  send_window_end:       string
  run_hour_utc:          number
  channel_email:         boolean
  channel_whatsapp:      boolean
  language:              'fr' | 'ar' | 'en'
  tone:                  'professionnel' | 'chaleureux' | 'direct'
  service_focus:         string | null
  whatsapp_template_id:  string | null
  require_email:         boolean
  require_website:       boolean
  require_phone:         boolean
  respect_ne_plus_contacter: boolean
  default_owner_id:      string | null
}

interface RunCounters {
  searches_done: number
  places_found: number
  prospects_created: number
  prospects_skipped: number
  emails_sent: number
  emails_failed: number
  whatsapp_sent: number
  whatsapp_failed: number
}

/* ─────────────────────────────────────────────────────────────────
   Point d'entrée : appelé par le scheduler chaque heure
───────────────────────────────────────────────────────────────── */
export async function runAutopilotForCurrentHour(pool: Pool): Promise<void> {
  const currentHour = new Date().getUTCHours()
  const { rows: configs } = await pool.query<AutopilotConfig>(`
    SELECT * FROM outbound_autopilot_config
     WHERE enabled = TRUE
       AND run_hour_utc = $1
  `, [currentHour])

  if (!configs.length) return
  logger.info(`[autopilot] ${configs.length} tenant(s) à traiter (heure ${currentHour}h UTC)`)

  /* On traite les tenants séquentiellement — évite de saturer les API externes. */
  for (const cfg of configs) {
    try {
      await runAutopilotForTenant(pool, cfg)
    } catch (e: any) {
      logger.error(`[autopilot] tenant ${cfg.tenant_id} : ${e?.message}`)
    }
  }
}

/**
 * Exécution manuelle d'un run pour un tenant donné (utilisé par le bouton
 * "Lancer maintenant" côté UI).
 */
export async function runAutopilotForTenantId(pool: Pool, tenantId: string): Promise<{ run_id: string }> {
  const { rows } = await pool.query<AutopilotConfig>(
    `SELECT * FROM outbound_autopilot_config WHERE tenant_id = $1 LIMIT 1`, [tenantId])
  if (!rows[0]) throw new Error('Configuration Autopilot introuvable')
  return runAutopilotForTenant(pool, rows[0])
}

/* ─────────────────────────────────────────────────────────────────
   Cœur — un run pour UN tenant
───────────────────────────────────────────────────────────────── */
async function runAutopilotForTenant(pool: Pool, cfg: AutopilotConfig): Promise<{ run_id: string }> {
  /* Auto-cleanup des runs bloqués : un run "running" depuis plus de 30 min
     est considéré mort (process killé, redémarrage serveur, crash…). Sans
     ça, le tenant reste bloqué à jamais et aucun nouveau run ne démarre. */
  await pool.query(`
    UPDATE outbound_autopilot_runs
       SET status = 'cancelled', finished_at = NOW(),
           error_message = COALESCE(error_message, '')
             || CASE WHEN error_message IS NULL OR error_message = '' THEN '' ELSE E'\n' END
             || 'Auto-annulé : run bloqué depuis plus de 30 min (probable crash ou redémarrage)'
     WHERE tenant_id = $1 AND status = 'running' AND started_at < NOW() - INTERVAL '30 minutes'
  `, [cfg.tenant_id])

  /* Skip si un run est déjà "running" pour ce tenant (évite les doublons). */
  const { rows: dup } = await pool.query(
    `SELECT id FROM outbound_autopilot_runs WHERE tenant_id = $1 AND status = 'running' LIMIT 1`,
    [cfg.tenant_id])
  if (dup[0]) {
    logger.warn(`[autopilot] ${cfg.tenant_id} : run déjà en cours (${dup[0].id}), skip`)
    return { run_id: dup[0].id }
  }

  /* Vérifie prérequis techniques */
  if (!googlePlaces.isConfigured()) {
    return recordFatal(pool, cfg, 'Google Places non configuré (GOOGLE_PLACES_API_KEY manquant)')
  }
  if (cfg.channel_email && !aiEmailGen.isConfigured()) {
    return recordFatal(pool, cfg, 'Provider IA non configuré (ANTHROPIC_API_KEY ou OPENAI_API_KEY)')
  }
  if (cfg.channel_whatsapp && !whatsappCloud.isConfigured()) {
    return recordFatal(pool, cfg, 'WhatsApp Cloud non configuré')
  }
  if (cfg.channel_whatsapp && !cfg.whatsapp_template_id) {
    return recordFatal(pool, cfg, 'Template WhatsApp non défini')
  }

  /* Résout la requête + villes */
  const query = await resolveKeyword(pool, cfg)
  if (!query) {
    return recordFatal(pool, cfg, 'Ni sector_id ni keyword défini')
  }
  const cities = cfg.cities.length ? cfg.cities : DEFAULT_MOROCCAN_CITIES
  const channels: Channels = [
    ...(cfg.channel_email    ? (['email']    as const) : []),
    ...(cfg.channel_whatsapp ? (['whatsapp'] as const) : []),
  ]

  /* Crée la ligne de run (status = running) */
  const { rows: r } = await pool.query(`
    INSERT INTO outbound_autopilot_runs
      (tenant_id, config_id, keyword, sector_id, cities, channels, status, logs)
    VALUES ($1,$2,$3,$4,$5,$6,'running','[]'::jsonb)
    RETURNING id
  `, [cfg.tenant_id, cfg.id, query, cfg.sector_id, JSON.stringify(cities), JSON.stringify(channels)])
  const runId: string = r[0].id
  const counters: RunCounters = {
    searches_done: 0, places_found: 0, prospects_created: 0, prospects_skipped: 0,
    emails_sent: 0, emails_failed: 0, whatsapp_sent: 0, whatsapp_failed: 0,
  }

  await log(pool, runId, 'info', `Démarrage — secteur "${query}" · ${cities.length} ville(s) · canaux [${channels.join(', ')}]`)

  try {
    /* ─── Phase 1 : découverte par ville ───────────────────────── */
    const newProspectIds: string[] = []

    for (const city of cities) {
      if (counters.searches_done >= cfg.daily_search_limit) {
        await log(pool, runId, 'warn', `Limite quotidienne de recherches atteinte (${cfg.daily_search_limit})`)
        break
      }
      if (counters.prospects_created >= cfg.daily_prospect_limit) {
        await log(pool, runId, 'warn', `Limite quotidienne de prospects atteinte (${cfg.daily_prospect_limit})`)
        break
      }

      const searchQuery = `${query} ${city}`
      let places: googlePlaces.GooglePlace[] = []
      try {
        places = await googlePlaces.searchPlaces(searchQuery, 15)
        counters.searches_done++
        counters.places_found += places.length
        await log(pool, runId, 'info', `${city} : ${places.length} résultat(s)`)
      } catch (e: any) {
        await log(pool, runId, 'error', `${city} — Google Places : ${e?.message}`)
        continue
      }

      for (const p of places) {
        if (counters.prospects_created >= cfg.daily_prospect_limit) break

        /* Filtre qualité */
        if (cfg.require_email   && !p.email)   { counters.prospects_skipped++; continue }
        if (cfg.require_phone   && !p.phone)   { counters.prospects_skipped++; continue }
        if (cfg.require_website && !p.website) { counters.prospects_skipped++; continue }

        /* Dedupe google_place_id — via requête directe (pas de RLS, on connaît le tenant). */
        const existing = await pool.query(
          `SELECT id FROM outbound_prospects WHERE tenant_id = $1 AND google_place_id = $2 LIMIT 1`,
          [cfg.tenant_id, p.place_id])
        if (existing.rows[0]) { counters.prospects_skipped++; continue }

        /* Résout source "google_maps" */
        const gsource = await pool.query(
          `SELECT id FROM outbound_sources WHERE tenant_id = $1 AND slug = 'google_maps' LIMIT 1`,
          [cfg.tenant_id])
        const sourceId = gsource.rows[0]?.id ?? null

        const emailSecondaire = p.emails_extra?.[0] ?? null
        const preferredChannel =
          cfg.channel_whatsapp && p.whatsapp ? 'whatsapp' :
          cfg.channel_email    && p.email    ? 'email'    :
          null

        const owner = cfg.default_owner_id
        try {
          const ins = await pool.query(`
            INSERT INTO outbound_prospects (
              tenant_id, entreprise, telephone, whatsapp, email, email_secondaire,
              site_web, adresse, ville, pays,
              google_maps_url, secteur_id, source_id, source_libre,
              google_place_id, enriched_from, enriched_at, canal_prefere,
              owner_id, assigned_to_id, created_by_id
            ) VALUES (
              $1,$2,$3,$4,$5,$6,
              $7,$8,$9,$10,
              $11,$12,$13,$14,
              $15,'google_places',NOW(),$16,
              $17,$17,$17
            ) RETURNING id
          `, [
            cfg.tenant_id, p.name, p.phone, p.whatsapp, p.email, emailSecondaire,
            p.website, p.address, p.city ?? city, p.country ?? 'Maroc',
            p.google_maps_url, cfg.sector_id, sourceId,
            p.category ? `Autopilot: ${p.category}` : 'Autopilot',
            p.place_id, preferredChannel,
            owner,
          ])
          const prospectId = ins.rows[0].id
          newProspectIds.push(prospectId)
          counters.prospects_created++

          /* Activity isolée : un échec ici ne doit pas invalider le prospect créé. */
          try {
            await pool.query(`
              INSERT INTO outbound_activities (tenant_id, prospect_id, type, message, auteur_id, auteur_nom, metadata)
              VALUES ($1,$2,'creation',$3,$4,'Autopilot',$5)
            `, [
              cfg.tenant_id, prospectId,
              `Prospect importé automatiquement (Autopilot · ${city})`,
              cfg.default_owner_id,
              JSON.stringify({ autopilot_run_id: runId, google_place_id: p.place_id, city }),
            ])
          } catch (e: any) {
            await log(pool, runId, 'warn', `Activity creation ${p.name} : ${e?.message}`)
          }
        } catch (e: any) {
          await log(pool, runId, 'error', `Insert ${p.name} : ${e?.message}`)
        }
      }

      await updateCounters(pool, runId, counters)
    }

    await log(pool, runId, 'info', `Phase 1 terminée — ${counters.prospects_created} nouveau(x) prospect(s)`)

    /* Résume les prospects "pending" créés lors de runs précédents qui n'ont
       jamais reçu d'email (Phase 2 interrompue, hors fenêtre horaire, etc.).
       Sans cette étape, ils resteraient orphelins à jamais. On respecte le
       cap quotidien : prospects_created + pending ≤ daily_prospect_limit. */
    const remainingQuota = Math.max(0, cfg.daily_prospect_limit - counters.prospects_created)
    if (remainingQuota > 0) {
      const { rows: pending } = await pool.query(`
        SELECT id FROM outbound_prospects
         WHERE tenant_id = $1
           AND statut = 'a_contacter'
           AND (nb_tentatives IS NULL OR nb_tentatives = 0)
           AND email IS NOT NULL
           AND (ne_plus_contacter IS NULL OR ne_plus_contacter = FALSE)
           AND (email_bounced IS NULL OR email_bounced = FALSE)
           AND id <> ALL($2::uuid[])
         ORDER BY created_at ASC
         LIMIT $3
      `, [cfg.tenant_id, newProspectIds, remainingQuota])
      if (pending.length) {
        await log(pool, runId, 'info',
          `Reprise de ${pending.length} prospect(s) en attente (créés lors de runs précédents)`)
        newProspectIds.push(...pending.map(r => r.id))
      }
    }

    /* ─── Phase 2 : envoi (avec rate limit + fenêtre horaire) ─── */
    const sender = await loadSenderProfile(pool, cfg.tenant_id)

    for (const prospectId of newProspectIds) {
      /* Attend jusqu'à être dans la fenêtre horaire (bloque max 60 min pour éviter
         de retenir la connexion trop longtemps). */
      if (!isWithinSendWindow(cfg.send_window_start, cfg.send_window_end)) {
        await log(pool, runId, 'info',
          `Hors fenêtre d'envoi (${cfg.send_window_start}-${cfg.send_window_end}), envois reportés au prochain run`)
        break
      }

      const prospect = await loadProspect(pool, cfg.tenant_id, prospectId)
      if (!prospect) continue
      if (cfg.respect_ne_plus_contacter && prospect.ne_plus_contacter) continue

      /* Email */
      if (cfg.channel_email && prospect.email) {
        try {
          const draft = await aiEmailGen.generateEmail({
            channel:  'email',
            language: cfg.language,
            tone:     cfg.tone,
            sender:   { company_name: sender.company, pitch: sender.pitch, contact_name: sender.name },
            prospect: {
              company: prospect.entreprise,
              contact: contactName(prospect),
              sector:  null,
              city:    prospect.ville,
              website: prospect.site_web,
              notes:   null,
            },
            service_focus: cfg.service_focus ?? null,
          })
          const html = buildOutboundEmailHtml({
            bodyText: draft.body,
            sender: {
              name:    sender.name,    role:    sender.role,
              company: sender.company, email:   sender.email,
              phone:   sender.phone ?? undefined,
              website: sender.website ?? undefined,
              logo_url: sender.logo ?? undefined,
            },
            prospectEmail: prospect.email,
            tracking: {
              openPixelUrl: openPixelUrl(prospect.id),
              wrapClickUrl: (u: string) => clickWrapUrl(prospect.id, u),
            },
          })
          await sendEmail({ to: prospect.email, subject: draft.subject, html, text: draft.body })
          /* L'email est parti — on incrémente MAINTENANT le compteur, avant les
             updates DB qui peuvent échouer sans invalider l'envoi. */
          counters.emails_sent++
          await log(pool, runId, 'info', `✉️  ${prospect.entreprise} → ${prospect.email}`)
          /* Event 'sent' : sert de base pour incrémenter les compteurs run
             quand open/click seront reçus (via l'autopilot_run_id lié). */
          try {
            await recordSent({
              pool, tenantId: cfg.tenant_id, prospectId: prospect.id,
              autopilotRunId: runId, subject: draft.subject,
            })
          } catch (e: any) {
            await log(pool, runId, 'warn', `recordSent : ${e?.message}`)
          }

          try {
            await pool.query(`
              UPDATE outbound_prospects
                 SET nb_tentatives = COALESCE(nb_tentatives,0)+1,
                     date_dernier_contact = NOW(),
                     ai_draft_email_subject = $2,
                     ai_draft_email_body = $3,
                     ai_generated_at = NOW(),
                     ai_generated_lang = $4,
                     statut = CASE WHEN statut = 'a_contacter' THEN 'contacte' ELSE statut END
               WHERE id = $1`, [prospect.id, draft.subject, draft.body, cfg.language])
            await pool.query(`
              INSERT INTO outbound_activities (tenant_id, prospect_id, type, message, auteur_id, auteur_nom, metadata)
              VALUES ($1,$2,'email',$3,$4,'Autopilot',$5)
            `, [cfg.tenant_id, prospect.id, `Email envoyé (Autopilot) : ${draft.subject}`,
                cfg.default_owner_id,
                JSON.stringify({ autopilot_run_id: runId, to: prospect.email, subject: draft.subject })])
          } catch (e: any) {
            await log(pool, runId, 'warn', `DB update après envoi email : ${e?.message}`)
          }
        } catch (e: any) {
          counters.emails_failed++
          await log(pool, runId, 'error', `Email ${prospect.entreprise} : ${e?.message}`)
        }
        await sleep(cfg.send_interval_seconds * 1000)
      }

      /* WhatsApp */
      if (cfg.channel_whatsapp) {
        const rawPhone = prospect.whatsapp || prospect.telephone
        const phoneCheck = verifyPhoneFormat(rawPhone)
        if (!phoneCheck.valid || !phoneCheck.e164) continue

        const tpl = await pool.query(
          `SELECT * FROM outbound_templates WHERE tenant_id = $1 AND id = $2 AND canal = 'whatsapp'`,
          [cfg.tenant_id, cfg.whatsapp_template_id])
        const template = tpl.rows[0]
        if (!template?.whatsapp_template_name) continue

        try {
          const vars = extractWhatsAppVariables(prospect, sender)
          const result = await whatsappCloud.sendWhatsAppTemplate({
            to:            phoneCheck.e164,
            templateName:  template.whatsapp_template_name,
            languageCode:  (template.whatsapp_template_language ?? cfg.language) as 'ar' | 'fr' | 'en',
            variables:     vars,
          })
          counters.whatsapp_sent++
          await log(pool, runId, 'info', `💬 ${prospect.entreprise} → ${phoneCheck.e164}`)
          try {
            await pool.query(`
              UPDATE outbound_prospects
                 SET nb_tentatives = COALESCE(nb_tentatives,0)+1,
                     date_dernier_contact = NOW(),
                     statut = CASE WHEN statut = 'a_contacter' THEN 'contacte' ELSE statut END
               WHERE id = $1`, [prospect.id])
            await pool.query(`
              INSERT INTO outbound_activities (tenant_id, prospect_id, type, message, auteur_id, auteur_nom, metadata)
              VALUES ($1,$2,'whatsapp',$3,$4,'Autopilot',$5)
            `, [cfg.tenant_id, prospect.id,
                `WhatsApp envoyé (Autopilot · template ${template.whatsapp_template_name})`,
                cfg.default_owner_id,
                JSON.stringify({ autopilot_run_id: runId, wamid: result.wamid, to: phoneCheck.e164 })])
          } catch (e: any) {
            await log(pool, runId, 'warn', `DB update après envoi WhatsApp : ${e?.message}`)
          }
        } catch (e: any) {
          counters.whatsapp_failed++
          await log(pool, runId, 'error', `WhatsApp ${prospect.entreprise} : ${e?.message}`)
        }
        await sleep(cfg.send_interval_seconds * 1000)
      }

      await updateCounters(pool, runId, counters)
    }

    /* Fin OK / partiel */
    const status: 'ok' | 'partial' =
      (counters.emails_failed + counters.whatsapp_failed) === 0 ? 'ok' : 'partial'
    await pool.query(`
      UPDATE outbound_autopilot_runs
         SET status = $2, finished_at = NOW()
       WHERE id = $1`, [runId, status])
    await pool.query(`
      UPDATE outbound_autopilot_config
         SET last_run_at = NOW(), last_run_status = $2
       WHERE id = $1`, [cfg.id, status])

    await log(pool, runId, 'info',
      `Terminé — ${counters.prospects_created} prospects · ${counters.emails_sent} email(s) · ${counters.whatsapp_sent} WhatsApp`)
    return { run_id: runId }
  } catch (e: any) {
    await pool.query(`
      UPDATE outbound_autopilot_runs
         SET status = 'error', finished_at = NOW(), error_message = $2
       WHERE id = $1`, [runId, e?.message ?? 'inconnue'])
    await pool.query(`
      UPDATE outbound_autopilot_config
         SET last_run_at = NOW(), last_run_status = 'error'
       WHERE id = $1`, [cfg.id])
    logger.error(`[autopilot] ${cfg.tenant_id} : ${e?.message}`)
    return { run_id: runId }
  }
}

/* ─────────────────────────────────────────────────────────────────
   Helpers
───────────────────────────────────────────────────────────────── */

async function resolveKeyword(pool: Pool, cfg: AutopilotConfig): Promise<string | null> {
  if (cfg.keyword?.trim()) return cfg.keyword.trim()
  if (cfg.sector_id) {
    const { rows } = await pool.query(
      `SELECT nom FROM outbound_sectors WHERE id = $1`, [cfg.sector_id])
    if (rows[0]?.nom) return String(rows[0].nom).trim()
  }
  return null
}

async function loadSenderProfile(pool: Pool, tenantId: string): Promise<{
  name: string; role: string; company: string; email: string;
  phone: string | null; website: string | null; logo: string | null; pitch: string
}> {
  const { rows } = await pool.query(
    `SELECT name, slug, settings, logo_url FROM tenants WHERE id = $1`, [tenantId])
  const t = rows[0] ?? {}
  const s = (t.settings ?? {}) as Record<string, string | null>
  return {
    name:    s.sender_name    ?? 'L\'équipe NEXT GITAL',
    role:    s.sender_role    ?? 'Direction commerciale',
    company: t.name ?? 'NEXT GITAL',
    email:   process.env.SMTP_FROM_EMAIL ?? process.env.SMTP_USER ?? 'contact@nextgital.com',
    phone:   s.sender_phone   ?? process.env.OUTBOUND_SENDER_PHONE   ?? null,
    website: s.sender_website ?? process.env.OUTBOUND_SENDER_WEBSITE ?? null,
    logo:    t.logo_url ?? null,
    pitch:   s.sender_pitch ?? 'Nous accompagnons les entreprises marocaines dans leur transformation digitale : ERP sur-mesure, sites web, marketing automatisé.',
  }
}

async function loadProspect(pool: Pool, tenantId: string, id: string): Promise<any> {
  const { rows } = await pool.query(
    `SELECT * FROM outbound_prospects WHERE tenant_id = $1 AND id = $2`, [tenantId, id])
  return rows[0] ?? null
}

function contactName(p: { prenom_contact: string | null; nom_contact: string | null }): string | null {
  const s = [p.prenom_contact, p.nom_contact].filter(Boolean).join(' ').trim()
  return s || null
}

function extractWhatsAppVariables(prospect: any, sender: { name: string; company: string; pitch: string }): string[] {
  /* Convention : {{1}} = prénom contact / entreprise ; {{2}} = expéditeur ; {{3}} = entreprise prospect ; {{4}} = valeur ajoutée */
  const contact = prospect.prenom_contact || prospect.entreprise
  return [
    String(contact ?? ''),
    sender.name,
    String(prospect.entreprise ?? ''),
    'améliorer votre visibilité digitale',
  ]
}

function isWithinSendWindow(startHHMM: string, endHHMM: string): boolean {
  const [sH, sM] = startHHMM.split(':').map(Number)
  const [eH, eM] = endHHMM.split(':').map(Number)
  const now = new Date()
  /* Fenêtre en heure locale du serveur — en prod, le serveur est Europe/Paris ≈ Maroc. */
  const cur = now.getHours() * 60 + now.getMinutes()
  const start = sH * 60 + sM
  const end   = eH * 60 + eM
  if (start <= end) return cur >= start && cur <= end
  /* Fenêtre qui traverse minuit (rare mais on gère) */
  return cur >= start || cur <= end
}

function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms))
}

async function log(pool: Pool, runId: string, level: 'info' | 'warn' | 'error', msg: string): Promise<void> {
  const entry = { ts: new Date().toISOString(), level, msg }
  try {
    /* Append au JSONB — sert de flux temps réel pour la page monitor. */
    await pool.query(`
      UPDATE outbound_autopilot_runs
         SET logs = COALESCE(logs, '[]'::jsonb) || $2::jsonb
       WHERE id = $1`, [runId, JSON.stringify([entry])])
  } catch (e: any) {
    logger.error(`[autopilot.log] ${e?.message}`)
  }
}

async function updateCounters(pool: Pool, runId: string, c: RunCounters): Promise<void> {
  await pool.query(`
    UPDATE outbound_autopilot_runs
       SET searches_done = $2, places_found = $3,
           prospects_created = $4, prospects_skipped = $5,
           emails_sent = $6, emails_failed = $7,
           whatsapp_sent = $8, whatsapp_failed = $9
     WHERE id = $1
  `, [runId, c.searches_done, c.places_found, c.prospects_created, c.prospects_skipped,
      c.emails_sent, c.emails_failed, c.whatsapp_sent, c.whatsapp_failed])
}

async function recordFatal(pool: Pool, cfg: AutopilotConfig, reason: string): Promise<{ run_id: string }> {
  const { rows } = await pool.query(`
    INSERT INTO outbound_autopilot_runs (tenant_id, config_id, status, finished_at, error_message, logs)
    VALUES ($1, $2, 'error', NOW(), $3, $4::jsonb)
    RETURNING id
  `, [cfg.tenant_id, cfg.id, reason, JSON.stringify([{ ts: new Date().toISOString(), level: 'error', msg: reason }])])
  await pool.query(`
    UPDATE outbound_autopilot_config
       SET last_run_at = NOW(), last_run_status = 'error'
     WHERE id = $1`, [cfg.id])
  logger.warn(`[autopilot] ${cfg.tenant_id} : ${reason}`)
  return { run_id: rows[0].id }
}

/* ─────────────────────────────────────────────────────────────────
   Scheduler — check chaque heure
───────────────────────────────────────────────────────────────── */
export function startAutopilotScheduler(pool: Pool): void {
  const ONE_HOUR = 60 * 60 * 1000
  /* Guard : swallow rejections avec .catch() pour éviter que Node.js exit
     sur unhandledRejection si un tick échoue (SQL erreur, réseau…). Sans
     ce guard, un incident passager (table manquante, migration retardée)
     causait un crash-loop qui rendait TOUTE l'API indisponible pendant
     les fenêtres de restart Swarm. */
  const safeTick = () =>
    runAutopilotForCurrentHour(pool).catch(err => {
      logger.error('[autopilotScheduler] tick échoué (ignoré) :', err?.message ?? err)
    })
  /* Premier tick 90s après boot (laisse DB + integrations se stabiliser) */
  setTimeout(safeTick, 90_000)
  setInterval(safeTick, ONE_HOUR)
  logger.info('[autopilotScheduler] démarré (1er check dans 90s, puis toutes les 60min)')
}
