/**
 * LISTE DES PROSPECTS — version téléphone.
 *
 * ── Ce qu'on remplace ───────────────────────────────────────────────
 * Sur un écran de 390 px, la page mesure 4 069 px de haut : quatre
 * écrans et demi de défilement — bandeau, quatre cartes de statistiques,
 * quatre rangées de filtres, un sélecteur de période — avant d'atteindre
 * un tableau large de 1 544 px, qu'il faut ensuite faire glisser
 * latéralement pour lire le téléphone d'un client. Mesuré, pas supposé.
 *
 * ── Le geste que l'on vient faire ───────────────────────────────────
 * Sur un téléphone, on n'analyse pas un portefeuille : on APPELLE
 * quelqu'un. La carte porte donc, dans cet ordre, ce qu'il faut pour
 * cela — le nom, l'entreprise, l'étape, la valeur, la relance — et deux
 * boutons pleine hauteur : Appeler et WhatsApp. Aucun défilement
 * latéral, aucune colonne cachée.
 *
 * ── Ce qu'elle ne fait pas ──────────────────────────────────────────
 * Ni sélection multiple, ni transfert, ni tri par colonne : ces gestes
 * appartiennent au tableau, qui reprend la main dès `md`. Les mettre ici
 * rallongerait ce qu'on cherche à raccourcir.
 */
import { Phone, MessageCircle, ChevronRight, Calendar, Copy } from 'lucide-react'
import { motion } from 'framer-motion'
import { formatCurrency } from '@/lib/utils'
import type { Prospect } from '@/hooks/useProspects'

/** Numéro utilisable par `tel:` / `wa.me` : sans espace ni ponctuation. */
function numeroBrut(tel: string | null | undefined): string {
  return (tel ?? '').replace(/[^\d+]/g, '')
}

/** WhatsApp veut un numéro international SANS le « + » ni les zéros de tête. */
function numeroWhatsApp(tel: string | null | undefined): string {
  const brut = numeroBrut(tel)
  if (!brut) return ''
  if (brut.startsWith('+')) return brut.slice(1)
  /* Numéro marocain local : 06… devient 2126…, sinon wa.me le refuse. */
  if (brut.startsWith('0')) return '212' + brut.slice(1)
  return brut
}

interface Props {
  prospects: Prospect[]
  /** Couleur et libellé de l'étape, déjà calculés par la page. */
  accentDe: (statut: string) => string
  libelleDe: (statut: string) => string
  relanceAujourdhui: (p: Prospect) => boolean
  /** Relance DÉPASSÉE — signalée en rouge : c'est celle qu'on oublie. */
  relanceEnRetard: (p: Prospect) => boolean
  /** Autres fiches portant le même numéro — on ne rappelle pas deux fois. */
  doublonsDe: (p: Prospect) => Prospect[]
  onOuvrir: (p: Prospect) => void
}

export default function ProspectsMobile({
  prospects, accentDe, libelleDe, relanceAujourdhui, relanceEnRetard, doublonsDe, onOuvrir,
}: Props) {
  if (!prospects.length) return null

  return (
    <div className="space-y-2">
      {prospects.map(p => {
        const accent  = accentDe(p.statut)
        const aujourd = relanceAujourdhui(p)
        const retard  = relanceEnRetard(p)
        const jumeaux = doublonsDe(p)
        const tel     = numeroBrut(p.telephone)

        return (
          <motion.div
            key={p.id}
            layout
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            className={`rounded-xl border bg-[var(--surface-card)] overflow-hidden ${
              retard ? 'border-red-500/60' : aujourd ? 'border-amber-500/50' : 'border-border'
            }`}
          >
            {/* Le corps ouvre la fiche ; les deux boutons d'appel sont
                en dehors de cette zone pour qu'un doigt pressé ne se
                trompe pas de geste. */}
            <button
              type="button"
              onClick={() => onOuvrir(p)}
              className="w-full text-left px-3 py-2.5 active:bg-muted/40 transition-colors"
            >
              <div className="flex items-start gap-2.5">
                <div
                  className="w-9 h-9 rounded-full flex items-center justify-center text-white text-sm font-bold flex-shrink-0"
                  style={{ backgroundColor: accent }}
                >
                  {p.nom.charAt(0).toUpperCase()}
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <p className="text-sm font-semibold text-foreground truncate">{p.nom}</p>
                    {!!jumeaux.length && (
                      <span className="inline-flex items-center gap-0.5 flex-shrink-0 px-1.5 py-0.5 rounded-full bg-red-500/15 text-red-600 dark:text-red-400 text-[10px] font-bold">
                        <Copy className="w-2.5 h-2.5" />
                        Doublon
                      </span>
                    )}
                  </div>
                  {p.entreprise && (
                    <p className="text-xs text-muted-foreground truncate">{p.entreprise}</p>
                  )}

                  <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                    <span
                      className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full"
                      style={{ backgroundColor: `${accent}22`, color: accent }}
                    >
                      {libelleDe(p.statut)}
                    </span>
                    {p.valeur_estimee != null && p.valeur_estimee > 0 && (
                      <span className="text-[11px] font-semibold text-foreground">
                        {formatCurrency(p.valeur_estimee)}
                      </span>
                    )}
                    {p.date_relance && (
                      <span className={`text-[11px] inline-flex items-center gap-1 ${
                        retard ? 'text-red-600 dark:text-red-400 font-bold'
                        : aujourd ? 'text-amber-600 dark:text-amber-400 font-semibold'
                        : 'text-muted-foreground'
                      }`}>
                        <Calendar className="w-3 h-3" />
                        {retard
                          ? `En retard · ${new Date(p.date_relance).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' })}`
                          : aujourd
                            ? "Aujourd'hui"
                            : new Date(p.date_relance).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' })}
                      </span>
                    )}
                  </div>
                </div>

                <ChevronRight className="w-4 h-4 text-muted-foreground flex-shrink-0 mt-1" />
              </div>
            </button>

            {/* Appeler / WhatsApp — pleine largeur, à portée du pouce.
                Absents quand il n'y a pas de numéro : un bouton qui ne
                fait rien vaut moins que pas de bouton. */}
            {tel && (
              <div className="grid grid-cols-2 border-t border-border">
                <a
                  href={`tel:${tel}`}
                  className="flex items-center justify-center gap-1.5 py-2.5 text-xs font-semibold text-emerald-700 dark:text-emerald-400 active:bg-emerald-500/10 transition-colors"
                >
                  <Phone className="w-4 h-4" />
                  Appeler
                </a>
                <a
                  href={`https://wa.me/${numeroWhatsApp(p.telephone)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-center gap-1.5 py-2.5 text-xs font-semibold text-green-700 dark:text-green-400 border-l border-border active:bg-green-500/10 transition-colors"
                >
                  <MessageCircle className="w-4 h-4" />
                  WhatsApp
                </a>
              </div>
            )}
          </motion.div>
        )
      })}
    </div>
  )
}
