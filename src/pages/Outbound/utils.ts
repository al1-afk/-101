import { OUTBOUND_STATUS, PRIORITE_LABELS, type OutboundStatut, type OutboundPriorite } from '@/lib/outboundApi'

export function statusAccent(s: OutboundStatut): string {
  return OUTBOUND_STATUS.find(x => x.id === s)?.accent ?? '#64748B'
}
export function statusLabel(s: OutboundStatut): string {
  return OUTBOUND_STATUS.find(x => x.id === s)?.label ?? s
}
export function statusDot(s: OutboundStatut): string {
  return OUTBOUND_STATUS.find(x => x.id === s)?.dot ?? 'bg-slate-400'
}
export function priorityColor(p: OutboundPriorite): string {
  return PRIORITE_LABELS[p]?.color ?? '#64748B'
}
export function priorityLabel(p: OutboundPriorite): string {
  return PRIORITE_LABELS[p]?.label ?? p
}

export function fullContactName(prospect: {
  prenom_contact?: string | null; nom_contact?: string | null; entreprise?: string | null
}): string {
  const name = [prospect.prenom_contact, prospect.nom_contact].filter(Boolean).join(' ').trim()
  return name || prospect.entreprise || 'Sans nom'
}

export function isSuperAdmin(role: string | null): boolean {
  return role === 'admin'
}
export function isOutboundManager(role: string | null): boolean {
  return role === 'admin' || role === 'manager'
}
export function isOutboundAgent(role: string | null): boolean {
  return role === 'commercial'
}
