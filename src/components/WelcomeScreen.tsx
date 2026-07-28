/**
 * WelcomeScreen — écran d'accueil / onboarding plein écran (style app native).
 * Dégradé de marque NEXT GITAL, aperçu produit flottant, animations douces et
 * un grand bouton « Commencer ». S'affiche :
 *   - sur mobile natif (Capacitor) à chaque ouverture (accueil de marque),
 *   - sur le web une seule fois (mémorisé dans localStorage) pour l'aperçu.
 * Le bouton masque simplement l'overlay et révèle l'application (login/dashboard).
 */
import { useState } from 'react'
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion'
import { ArrowRight } from 'lucide-react'
import { Capacitor } from '@capacitor/core'

const SEEN_KEY = 'ng_welcome_seen'

export default function WelcomeScreen() {
  const isNative = Capacitor.isNativePlatform()
  const reduce   = useReducedMotion()

  const [show, setShow] = useState<boolean>(() => {
    if (isNative) return true
    try { return localStorage.getItem(SEEN_KEY) !== '1' } catch { return true }
  })

  const dismiss = () => {
    setShow(false)
    if (!isNative) { try { localStorage.setItem(SEEN_KEY, '1') } catch { /* ignore */ } }
  }

  const ease = [0.22, 1, 0.36, 1] as const
  const rise = (delay: number) => reduce
    ? { initial: { opacity: 0 }, animate: { opacity: 1 }, transition: { duration: 0.3, delay } }
    : { initial: { opacity: 0, y: 22 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.6, delay, ease } }

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          key="welcome"
          initial={{ opacity: 1 }}
          exit={{ opacity: 0, scale: reduce ? 1 : 1.04 }}
          transition={{ duration: 0.45, ease }}
          className="fixed inset-0 z-[9999] flex flex-col overflow-hidden text-white"
          style={{ background: 'linear-gradient(165deg, #060f28 0%, #0a1a3c 35%, #12306e 70%, #1e64c4 100%)' }}
        >
          {/* Halos décoratifs */}
          <div className="pointer-events-none absolute inset-0 overflow-hidden">
            <div className="absolute -top-24 -left-24 w-[60vw] h-[60vw] rounded-full opacity-40"
              style={{ background: 'radial-gradient(circle, rgba(34,211,238,0.35), transparent 60%)', filter: 'blur(40px)' }} />
            <div className="absolute -bottom-32 -right-20 w-[65vw] h-[65vw] rounded-full opacity-40"
              style={{ background: 'radial-gradient(circle, rgba(59,130,246,0.45), transparent 60%)', filter: 'blur(50px)' }} />
            {/* Grille subtile */}
            <div className="absolute inset-0 opacity-[0.06]"
              style={{ backgroundImage: 'linear-gradient(rgba(255,255,255,.6) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.6) 1px, transparent 1px)', backgroundSize: '38px 38px' }} />
          </div>

          {/* Passer */}
          <div className="relative flex justify-end px-5 pt-[max(16px,env(safe-area-inset-top))]">
            <button
              type="button"
              onClick={dismiss}
              className="text-[13px] font-medium text-white/70 hover:text-white transition-colors px-3 py-1.5"
            >
              Passer
            </button>
          </div>

          {/* Logo */}
          <motion.div {...rise(0.05)} className="relative flex justify-center pt-2">
            <img
              src="/logo-nextgital.png"
              alt="NEXT GITAL"
              className="h-11 w-auto object-contain"
              style={{ filter: 'brightness(0) invert(1)' }}
              onError={e => { (e.target as HTMLImageElement).style.display = 'none' }}
            />
          </motion.div>

          {/* Hero — aperçu produit flottant */}
          <div className="relative flex-1 flex items-center justify-center px-8">
            <motion.div
              {...rise(0.15)}
              animate={reduce ? { opacity: 1 } : { opacity: 1, y: [0, -10, 0] }}
              transition={reduce ? { duration: 0.3 } : { y: { duration: 6, repeat: Infinity, ease: 'easeInOut' }, opacity: { duration: 0.6, delay: 0.15 } }}
              className="relative w-full max-w-[340px]"
            >
              <div
                className="rounded-[22px] overflow-hidden border border-white/15"
                style={{ boxShadow: '0 30px 80px -20px rgba(0,0,0,0.65), 0 0 0 1px rgba(255,255,255,0.04)', transform: reduce ? 'none' : 'perspective(1200px) rotateX(6deg)' }}
              >
                <img
                  src="/dashboard-preview.png"
                  alt="Aperçu de l'application"
                  className="w-full h-auto block"
                  onError={e => {
                    const el = e.target as HTMLImageElement
                    el.style.display = 'none'
                    ;(el.parentElement as HTMLElement).style.minHeight = '200px'
                  }}
                />
              </div>
              {/* reflet */}
              <div className="absolute inset-x-6 -bottom-3 h-8 rounded-full opacity-40"
                style={{ background: 'radial-gradient(ellipse at center, rgba(34,211,238,0.5), transparent 70%)', filter: 'blur(12px)' }} />
            </motion.div>
          </div>

          {/* Texte + CTA */}
          <div className="relative px-8 pb-[max(28px,env(safe-area-inset-bottom))]">
            <motion.p {...rise(0.28)} className="text-[12px] font-semibold uppercase tracking-[0.25em] text-cyan-300/90 mb-2 text-center">
              NEXT GITAL
            </motion.p>
            <motion.h1 {...rise(0.36)} className="text-[30px] leading-[1.15] font-extrabold text-center text-white" style={{ textWrap: 'balance' } as any}>
              Votre gestion,<br />enfin simplifiée.
            </motion.h1>
            <motion.p {...rise(0.44)} className="text-[14px] text-white/70 text-center mt-3 max-w-[300px] mx-auto leading-relaxed">
              Clients, devis, factures et prospects — tout votre business, dans une seule app.
            </motion.p>

            <motion.button
              {...rise(0.54)}
              type="button"
              onClick={dismiss}
              whileTap={reduce ? undefined : { scale: 0.97 }}
              className="group mt-7 w-full h-14 rounded-2xl bg-white text-[#0a1a3c] font-bold text-[16px] flex items-center justify-center gap-2 shadow-[0_16px_40px_-12px_rgba(255,255,255,0.35)] active:shadow-none transition-shadow"
            >
              Commencer
              <ArrowRight className="w-5 h-5 transition-transform group-hover:translate-x-0.5" />
            </motion.button>

            <motion.p {...rise(0.62)} className="text-[11px] text-white/45 text-center mt-4">
              Agence Web &amp; Solutions Digitales — Oujda, Maroc
            </motion.p>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
