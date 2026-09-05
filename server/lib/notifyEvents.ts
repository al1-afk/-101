/**
 * Catalogue des ÉVÉNEMENTS notifiables — la source unique.
 *
 * Un événement (`comment_new`, `task_completed`…) n'est pas la même
 * chose qu'une catégorie d'e-mail (`projet_message`, `tache_creee`…) :
 *
 *   • l'ÉVÉNEMENT est le réglage PERSONNEL (« préviens-moi quand une
 *     tâche est terminée »), coché dans Paramètres → Notifications ;
 *   • la CATÉGORIE D'E-MAIL est le réglage de l'ESPACE (« cet espace
 *     envoie-t-il des e-mails de ce type ? »), migration 096.
 *
 * Tous les événements n'ont pas de catégorie d'e-mail — « fichier
 * ajouté » n'en a aucune — d'où deux listes et une table de passage.
 *
 * ── Pourquoi les défauts sont prudents ─────────────────────────────
 * Brancher dix événements d'un coup multiplie le volume. La cloche est
 * gratuite et va donc partout ; le push est réservé à ce qui demande
 * une action ; l'e-mail reste sur les seules catégories qui en
 * envoyaient DÉJÀ avant ce module. Une personne peut ensuite monter le
 * son événement par événement — l'inverse (tout envoyer puis se faire
 * couper) commence par une journée de courrier indésirable.
 */
import type { EmailKind } from './notificationEmails'

export const NOTIFY_EVENTS = [
  'comment_new',       // commentaire sur une tâche / un projet
  'message_new',       // message dans la discussion d'un projet
  'task_created',      // tâche assignée
  'task_completed',    // tâche terminée
  'task_validation',   // demande de validation
  'member_blocked',    // employé bloqué : « j'ai besoin de ton intervention »
  'mention',           // @mention
  'file_added',        // fichier déposé
  'projet_delivered',  // projet livré
  'urgent',            // alerte urgente
] as const

export type NotifyEvent = (typeof NOTIFY_EVENTS)[number]

export interface ChannelSet {
  inapp: boolean
  push:  boolean
  email: boolean
}

/** Défaut serveur quand la personne n'a rien choisi pour cet événement. */
export const EVENT_DEFAULTS: Record<NotifyEvent, ChannelSet> = {
  comment_new:      { inapp: true, push: true,  email: false },
  message_new:      { inapp: true, push: true,  email: true  }, // envoyait déjà des e-mails
  task_created:     { inapp: true, push: true,  email: true  }, // idem
  task_completed:   { inapp: true, push: false, email: false },
  task_validation:  { inapp: true, push: true,  email: true  }, // idem
  member_blocked:   { inapp: true, push: true,  email: false },
  mention:          { inapp: true, push: true,  email: false },
  file_added:       { inapp: true, push: false, email: false },
  projet_delivered: { inapp: true, push: true,  email: false },
  urgent:           { inapp: true, push: true,  email: true  },
}

/** Catégorie d'e-mail de l'espace correspondant à l'événement, s'il y en a une. */
export const EVENT_EMAIL_KIND: Partial<Record<NotifyEvent, EmailKind>> = {
  message_new:     'projet_message',
  comment_new:     'projet_message',
  mention:         'projet_message',
  file_added:      'projet_message',
  task_created:    'tache_creee',
  task_validation: 'tache_validation',
}

/** Libellés affichés dans l'écran de réglages. */
export const EVENT_LABELS: Record<NotifyEvent, string> = {
  comment_new:      'Nouveau commentaire',
  message_new:      'Nouveau message',
  task_created:     'Nouvelle tâche',
  task_completed:   'Tâche terminée',
  task_validation:  'Demande de validation',
  member_blocked:   'Employé bloqué',
  mention:          'Mention @',
  file_added:       'Fichier ajouté',
  projet_delivered: 'Projet livré',
  urgent:           'Notification urgente',
}

/** Emoji par défaut d'un événement, quand l'appelant n'en fournit pas. */
export const EVENT_ICONS: Record<NotifyEvent, string> = {
  comment_new:      '💬',
  message_new:      '💬',
  task_created:     '📋',
  task_completed:   '✅',
  task_validation:  '🔎',
  member_blocked:   '🚧',
  mention:          '📣',
  file_added:       '📎',
  projet_delivered: '🚀',
  urgent:           '🚨',
}

export function isNotifyEvent(v: unknown): v is NotifyEvent {
  return typeof v === 'string' && (NOTIFY_EVENTS as readonly string[]).includes(v)
}

/**
 * Les sept catégories d'e-mails de l'espace (migration 096).
 *
 * Elles vivaient jusqu'ici en QUATRE exemplaires recopiés à la main
 * (migration 096, notificationEmails.ts, la route de réglages, l'écran
 * de réglages). Les consommateurs serveur importent désormais celle-ci.
 */
export const EMAIL_KINDS: EmailKind[] = [
  'projet_message', 'prospect_nouveau', 'paiement_recu',
  'devis_accepte', 'tache_validation', 'tache_creee', 'expiration',
]
