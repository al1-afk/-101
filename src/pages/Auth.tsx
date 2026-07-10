import { useState, useEffect, useRef } from 'react'
import { Navigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Eye, EyeOff, Lock, Mail, ArrowRight, Loader2, X, KeyRound,
  CheckCircle, ShieldCheck, ArrowLeft, Sparkles, Zap, Shield, Cable,
} from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { authApi } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

type AuthStage = 'credentials' | 'verify'

export default function Auth() {
  const { isAuthorized, signIn, verifyLogin, resendLoginCode } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [resetOpen, setResetOpen] = useState(false)

  const [stage,    setStage]    = useState<AuthStage>('credentials')
  const [code,     setCode]     = useState('')
  const [resendIn, setResendIn] = useState(0)
  const [resending, setResending] = useState(false)

  useEffect(() => {
    if (resendIn <= 0) return
    const t = setTimeout(() => setResendIn(v => v - 1), 1000)
    return () => clearTimeout(t)
  }, [resendIn])

  if (isAuthorized) {
    const slug = sessionStorage.getItem('gestiq_tenant_slug') ?? 'demo'
    return <Navigate to={`/${slug}`} replace />
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null); setLoading(true)
    try {
      const res: any = await signIn(email, password)
      if (res?.needsVerification) { setStage('verify'); setResendIn(30) }
    } catch (err: any) {
      setError(err.message || 'Identifiants incorrects')
    } finally { setLoading(false) }
  }

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null); setLoading(true)
    try {
      await verifyLogin(email, code.trim())
    } catch (err: any) {
      setError(err.message || 'Code incorrect')
    } finally { setLoading(false) }
  }

  const handleResend = async () => {
    if (resendIn > 0 || resending) return
    setResending(true); setError(null)
    try {
      await resendLoginCode(email)
      setResendIn(30)
    } catch (err: any) {
      setError(err.message || 'Erreur lors du renvoi')
    } finally { setResending(false) }
  }

  const backToCredentials = () => {
    setStage('credentials'); setCode(''); setError(null)
  }

  return (
    <div className="min-h-[100dvh] w-full flex bg-background">

      {/* ══ LEFT — Navy hero brand panel (hidden on mobile) ══════════ */}
      <aside className="hidden lg:flex relative w-[46%] xl:w-[42%] flex-col overflow-hidden text-white"
             style={{ background: 'var(--gradient-hero)' }}>
        {/* Mesh grid + orbs */}
        <div
          className="absolute inset-0 pointer-events-none opacity-70"
          style={{
            backgroundImage:
              'radial-gradient(at 85% 15%, rgba(6,182,212,0.35) 0%, transparent 55%), radial-gradient(at 15% 85%, rgba(37,99,235,0.28) 0%, transparent 50%), radial-gradient(at 55% 50%, rgba(255,255,255,0.05) 0%, transparent 60%)',
          }}
        />
        <div
          className="absolute inset-0 pointer-events-none opacity-[0.35]"
          style={{
            backgroundImage:
              'linear-gradient(rgba(255,255,255,0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.05) 1px, transparent 1px)',
            backgroundSize: '38px 38px',
            maskImage: 'radial-gradient(ellipse at 50% 40%, black 0%, transparent 75%)',
            WebkitMaskImage: 'radial-gradient(ellipse at 50% 40%, black 0%, transparent 75%)',
          }}
        />
        {/* Floating cyan orb */}
        <motion.div
          initial={{ opacity: 0 }} animate={{ opacity: 1 }}
          transition={{ duration: 1 }}
          className="absolute -top-32 -right-32 w-[420px] h-[420px] rounded-full blur-3xl pointer-events-none"
          style={{ background: 'radial-gradient(circle, rgba(6,182,212,0.45) 0%, transparent 65%)' }}
        />
        <motion.div
          initial={{ opacity: 0 }} animate={{ opacity: 1 }}
          transition={{ duration: 1.2, delay: 0.2 }}
          className="absolute -bottom-40 -left-20 w-[380px] h-[380px] rounded-full blur-3xl pointer-events-none"
          style={{ background: 'radial-gradient(circle, rgba(37,99,235,0.4) 0%, transparent 65%)' }}
        />

        <div className="relative z-10 flex flex-col h-full p-10 xl:p-14">
          {/* Top — Logo */}
          <motion.div
            initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}
            className="flex items-center gap-3"
          >
            <div
              className="w-11 h-11 rounded-2xl flex items-center justify-center relative overflow-hidden"
              style={{ background: 'linear-gradient(135deg, #2563EB 0%, #06B6D4 100%)', boxShadow: '0 12px 32px -8px rgba(6,182,212,0.5)' }}
            >
              <span className="text-white font-black text-[17px] tracking-tight relative z-10">N</span>
              <span className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-white/25 blur-md" />
            </div>
            <div>
              <p className="font-bold text-[15px] tracking-tight leading-none">NEXT GITAL</p>
              <p className="text-[10.5px] font-semibold leading-none mt-1 text-cyan-200/85 uppercase tracking-[0.15em]">
                Enterprise ERP · FTTH
              </p>
            </div>
          </motion.div>

          {/* Middle — Marketing */}
          <div className="flex-1 flex flex-col justify-center max-w-lg mt-16 xl:mt-0">
            <motion.div
              initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.15 }}
              className="inline-flex items-center gap-1.5 h-6 px-2.5 rounded-full bg-white/10 border border-white/15 backdrop-blur-sm w-fit mb-6"
            >
              <Sparkles className="w-3 h-3 text-cyan-300" />
              <span className="text-white/85 text-[10.5px] font-semibold uppercase tracking-[0.14em]">
                Édition 2026
              </span>
            </motion.div>

            <motion.h1
              initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="text-4xl xl:text-5xl font-black tracking-[-0.03em] leading-[1.05]"
            >
              L'infrastructure de votre entreprise{' '}
              <span className="bg-gradient-to-r from-cyan-200 via-white to-cyan-300 bg-clip-text text-transparent">
                sans friction
              </span>
              .
            </motion.h1>

            <motion.p
              initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.25 }}
              className="text-white/65 text-[15px] mt-5 leading-relaxed"
            >
              CRM, projets FTTH, devis, factures, planning terrain — tout dans une seule plateforme premium,
              propulsée par l'IA Nexi.
            </motion.p>

            {/* Bullets */}
            <motion.div
              initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.32 }}
              className="mt-10 space-y-3.5"
            >
              {[
                { icon: Zap,    text: 'Génération de devis en 30 secondes avec IA' },
                { icon: Cable,  text: 'Suivi temps réel de vos chantiers fibre optique' },
                { icon: Shield, text: 'Conformité comptable Maroc + chiffrement bout-en-bout' },
              ].map((b) => {
                const Icon = b.icon
                return (
                  <div key={b.text} className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-white/10 border border-white/10 backdrop-blur-sm flex items-center justify-center flex-shrink-0">
                      <Icon className="w-4 h-4 text-cyan-300" />
                    </div>
                    <span className="text-white/80 text-[13.5px]">{b.text}</span>
                  </div>
                )
              })}
            </motion.div>
          </div>

          {/* Bottom — Trust footer */}
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }}
            transition={{ delay: 0.6 }}
            className="mt-14 flex items-center gap-4 pt-6 border-t border-white/10"
          >
            <div className="flex -space-x-2">
              {['#22D3EE', '#3B82F6', '#8B5CF6'].map((c) => (
                <div
                  key={c}
                  className="w-8 h-8 rounded-full border-2 border-navy-800"
                  style={{ background: `linear-gradient(135deg, ${c}, ${c}88)` }}
                />
              ))}
            </div>
            <div className="text-[11.5px] leading-tight">
              <p className="text-white font-semibold">+120 équipes terrain</p>
              <p className="text-white/50">utilisent NEXT GITAL au Maroc</p>
            </div>
          </motion.div>
        </div>
      </aside>

      {/* ══ RIGHT — Auth card ═════════════════════════════════════════ */}
      <main className="flex-1 flex items-center justify-center p-4 sm:p-8 relative overflow-hidden">
        {/* Subtle mesh for right side */}
        <div className="absolute inset-0 pointer-events-none opacity-60 dark:opacity-40"
             style={{ backgroundImage: 'var(--gradient-mesh)' }} />

        {/* Mobile logo (visible < lg) */}
        <motion.div
          initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}
          className="absolute top-5 left-5 lg:hidden flex items-center gap-2.5"
        >
          <div
            className="w-9 h-9 rounded-xl flex items-center justify-center"
            style={{ background: 'linear-gradient(135deg, #2563EB 0%, #06B6D4 100%)', boxShadow: '0 8px 20px -6px rgba(6,182,212,0.5)' }}
          >
            <span className="text-white font-black text-[14px] tracking-tight">N</span>
          </div>
          <div>
            <p className="font-bold text-[13.5px] tracking-tight text-foreground leading-none">NEXT GITAL</p>
            <p className="text-[9.5px] font-semibold leading-none mt-1 bg-gradient-to-r from-electric-600 to-cyan-500 bg-clip-text text-transparent uppercase tracking-widest">
              Enterprise ERP
            </p>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 16, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.4, ease: 'easeOut' }}
          className="relative w-full max-w-[420px]"
        >
          <div className="card-premium p-8 sm:p-10">
            {/* Icon + title */}
            <div className="flex flex-col items-start mb-8">
              <div
                className="w-12 h-12 rounded-2xl flex items-center justify-center mb-5 relative overflow-hidden"
                style={{ background: 'linear-gradient(135deg, #2563EB 0%, #06B6D4 100%)', boxShadow: '0 12px 32px -8px rgba(37,99,235,0.4)' }}
              >
                {stage === 'verify'
                  ? <ShieldCheck className="w-6 h-6 text-white relative z-10" />
                  : <span className="text-white font-black text-xl relative z-10">N</span>}
                <span className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-white/25 blur-md" />
              </div>
              <h1 className="text-[24px] font-black tracking-[-0.02em] text-foreground leading-none">
                {stage === 'verify' ? 'Confirmation' : 'Bienvenue'}
              </h1>
              <p className="text-[13px] text-muted-foreground mt-2">
                {stage === 'verify'
                  ? <>Code envoyé à <span className="text-electric-600 dark:text-cyan-400 font-semibold">{email}</span></>
                  : 'Connectez-vous à votre espace de gestion'}
              </p>
            </div>

            {stage === 'verify' ? (
              <VerifyStep
                code={code}
                setCode={setCode}
                loading={loading}
                error={error}
                resendIn={resendIn}
                resending={resending}
                onSubmit={handleVerify}
                onResend={handleResend}
                onBack={backToCredentials}
              />
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4">
                {/* Email */}
                <div>
                  <label className="text-[11.5px] font-semibold uppercase tracking-wider text-muted-foreground block mb-1.5">
                    Adresse email
                  </label>
                  <div className="relative">
                    <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                    <Input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="vous@nextgital.ma"
                      className="pl-10 h-11"
                      required
                      autoFocus
                    />
                  </div>
                </div>

                {/* Password */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-[11.5px] font-semibold uppercase tracking-wider text-muted-foreground">
                      Mot de passe
                    </label>
                    <button
                      type="button"
                      onClick={() => setResetOpen(true)}
                      className="text-[11.5px] font-medium text-electric-600 dark:text-cyan-400 hover:underline"
                    >
                      Oublié ?
                    </button>
                  </div>
                  <div className="relative">
                    <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                    <Input
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••"
                      className="pl-10 pr-10 h-11"
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 w-6 h-6 flex items-center justify-center rounded-md text-slate-400 hover:text-foreground hover:bg-black/[0.05] dark:hover:bg-white/[0.06]"
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                {/* Error */}
                <AnimatePresence>
                  {error && (
                    <motion.div
                      initial={{ opacity: 0, y: -6, height: 0 }}
                      animate={{ opacity: 1, y: 0, height: 'auto' }}
                      exit={{ opacity: 0, y: -6, height: 0 }}
                      className="overflow-hidden"
                    >
                      <div className="flex items-start gap-2.5 px-3 py-2.5 rounded-xl bg-red-500/10 border border-red-500/25 text-[13px] text-red-700 dark:text-red-300">
                        <span className="w-4 h-4 rounded-full bg-red-500/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                          <span className="w-1 h-1 rounded-full bg-red-500" />
                        </span>
                        <span className="leading-snug">{error}</span>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Submit */}
                <Button
                  type="submit"
                  disabled={loading}
                  size="lg"
                  className="w-full mt-2"
                >
                  {loading ? (
                    <><Loader2 className="w-4 h-4 animate-spin" /> Connexion…</>
                  ) : (
                    <>Se connecter <ArrowRight className="w-4 h-4" /></>
                  )}
                </Button>
              </form>
            )}

            {/* Footer */}
            <div className="pt-6 mt-6 border-t border-black/[0.06] dark:border-white/[0.06] flex items-center justify-center gap-2 text-[11.5px] text-muted-foreground">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
              <span>Espace privé sécurisé · SSL 256-bit</span>
            </div>
          </div>

          {/* Signup helper */}
          <p className="text-center text-[12px] text-muted-foreground mt-5">
            Pas encore de compte ? <span className="font-semibold text-foreground">Contactez votre administrateur</span>.
          </p>
        </motion.div>
      </main>

      <ResetPasswordModal
        open={resetOpen}
        onClose={() => setResetOpen(false)}
        initialEmail={email}
      />
    </div>
  )
}

/* ─── Verify step ─────────────────────────────────────────────────── */
function VerifyStep({
  code, setCode, loading, error, resendIn, resending,
  onSubmit, onResend, onBack,
}: {
  code:      string
  setCode:   (v: string) => void
  loading:   boolean
  error:     string | null
  resendIn:  number
  resending: boolean
  onSubmit:  (e: React.FormEvent) => void
  onResend:  () => void
  onBack:    () => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  useEffect(() => { inputRef.current?.focus() }, [])

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div>
        <label className="text-[11.5px] font-semibold uppercase tracking-wider text-muted-foreground block mb-1.5">
          Code de vérification
        </label>
        <div className="relative">
          <KeyRound className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
          <Input
            ref={inputRef}
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
            placeholder="••••••"
            maxLength={6}
            className="pl-10 h-12 text-center tracking-[0.5em] font-mono text-lg"
            required
          />
        </div>
        <p className="text-[11.5px] text-muted-foreground mt-2 leading-relaxed">
          Entrez le code à 6 chiffres reçu par email. Il expire dans <span className="font-semibold text-foreground">10 minutes</span>.
        </p>
      </div>

      <AnimatePresence>
        {error && (
          <motion.div
            initial={{ opacity: 0, y: -6, height: 0 }}
            animate={{ opacity: 1, y: 0, height: 'auto' }}
            exit={{ opacity: 0, y: -6, height: 0 }}
            className="overflow-hidden"
          >
            <div className="flex items-start gap-2.5 px-3 py-2.5 rounded-xl bg-red-500/10 border border-red-500/25 text-[13px] text-red-700 dark:text-red-300">
              <span className="w-4 h-4 rounded-full bg-red-500/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                <span className="w-1 h-1 rounded-full bg-red-500" />
              </span>
              <span className="leading-snug">{error}</span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <Button type="submit" disabled={loading || code.length !== 6} size="lg" className="w-full mt-2">
        {loading ? (
          <><Loader2 className="w-4 h-4 animate-spin" /> Vérification…</>
        ) : (
          <>Vérifier <CheckCircle className="w-4 h-4" /></>
        )}
      </Button>

      <div className="flex items-center justify-between pt-2 text-[12.5px]">
        <button
          type="button"
          onClick={onBack}
          className="flex items-center gap-1 text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5" /> Retour
        </button>
        {resendIn > 0 ? (
          <span className="text-muted-foreground">Renvoi dans <span className="font-semibold text-foreground tabular-nums">{resendIn}s</span></span>
        ) : (
          <button
            type="button"
            onClick={onResend}
            disabled={resending}
            className="text-electric-600 dark:text-cyan-400 hover:underline disabled:opacity-50 font-medium"
          >
            {resending ? 'Envoi…' : 'Renvoyer le code'}
          </button>
        )}
      </div>
    </form>
  )
}

/* ─── Reset password modal ────────────────────────────────────────── */
function ResetPasswordModal({
  open,
  onClose,
  initialEmail,
}: {
  open: boolean
  onClose: () => void
  initialEmail: string
}) {
  const [step, setStep]           = useState<1 | 2 | 3>(1)
  const [email, setEmail]         = useState(initialEmail)
  const [code, setCode]           = useState('')
  const [newPassword, setNewPwd]  = useState('')
  const [showPwd, setShowPwd]     = useState(false)
  const [loading, setLoading]     = useState(false)
  const [error, setError]         = useState<string | null>(null)

  const reset = () => { setStep(1); setCode(''); setNewPwd(''); setError(null); setLoading(false) }
  const handleClose = () => { reset(); onClose() }

  const requestCode = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null); setLoading(true)
    try {
      await authApi.forgotPassword(email)
      setStep(2)
    } catch (err: any) {
      setError(err.message || "Erreur lors de l'envoi")
    } finally { setLoading(false) }
  }

  const submitReset = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null); setLoading(true)
    try {
      await authApi.resetPassword(email, code.trim(), newPassword)
      setStep(3)
    } catch (err: any) {
      setError(err.message || 'Erreur lors de la réinitialisation')
    } finally { setLoading(false) }
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 bg-navy-900/80 backdrop-blur-md flex items-center justify-center p-4"
          onClick={handleClose}
        >
          <motion.div
            initial={{ opacity: 0, y: 16, scale: 0.97 }}
            animate={{ opacity: 1, y: 0,  scale: 1    }}
            exit={{    opacity: 0, y: 10, scale: 0.97 }}
            onClick={(e) => e.stopPropagation()}
            className="relative w-full max-w-md rounded-2xl overflow-hidden card-premium p-7 sm:p-8"
          >
            {/* Subtle mesh backdrop inside modal */}
            <div className="absolute inset-0 pointer-events-none opacity-40 dark:opacity-30"
                 style={{ backgroundImage: 'var(--gradient-primary-soft)' }} />

            <button
              type="button"
              onClick={handleClose}
              className="absolute top-4 right-4 w-7 h-7 flex items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-black/[0.05] dark:hover:bg-white/[0.06] transition-colors z-10"
              aria-label="Fermer"
            >
              <X className="w-4 h-4" />
            </button>

            {/* Icon + title */}
            <div className="relative flex items-center gap-3 mb-5">
              <div
                className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0"
                style={{ background: 'linear-gradient(135deg, #2563EB 0%, #06B6D4 100%)', boxShadow: '0 8px 20px -6px rgba(37,99,235,0.4)' }}
              >
                {step === 3 ? <CheckCircle className="w-5 h-5 text-white" /> : <KeyRound className="w-5 h-5 text-white" />}
              </div>
              <div className="min-w-0">
                <h2 className="text-foreground font-bold text-[16px] tracking-[-0.01em] leading-tight">
                  {step === 3 ? 'Mot de passe modifié' : 'Réinitialiser le mot de passe'}
                </h2>
                <p className="text-muted-foreground text-[12px] mt-0.5">
                  {step === 1 && 'Entrez votre email pour recevoir un code'}
                  {step === 2 && <>Code envoyé à <span className="text-foreground font-medium">{email}</span></>}
                  {step === 3 && 'Vous pouvez maintenant vous connecter'}
                </p>
              </div>
            </div>

            {/* Step indicator */}
            {step !== 3 && (
              <div className="relative flex items-center gap-2 mb-6">
                {[1, 2].map((s) => (
                  <div
                    key={s}
                    className={cn(
                      'h-1 flex-1 rounded-full transition-all',
                      s <= step
                        ? 'bg-gradient-primary'
                        : 'bg-black/[0.08] dark:bg-white/[0.08]',
                    )}
                  />
                ))}
                <span className="text-[10.5px] font-bold uppercase tracking-widest text-muted-foreground ml-1">
                  {step}/2
                </span>
              </div>
            )}

            {/* Step 1 */}
            {step === 1 && (
              <form onSubmit={requestCode} className="relative space-y-4">
                <div>
                  <label className="text-[11.5px] font-semibold uppercase tracking-wider text-muted-foreground block mb-1.5">
                    Adresse email
                  </label>
                  <div className="relative">
                    <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                    <Input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="vous@nextgital.ma"
                      className="pl-10 h-11"
                      required
                      autoFocus
                    />
                  </div>
                </div>

                <AnimatePresence>
                  {error && (
                    <motion.div
                      initial={{ opacity: 0, y: -6, height: 0 }}
                      animate={{ opacity: 1, y: 0, height: 'auto' }}
                      exit={{ opacity: 0, y: -6, height: 0 }}
                      className="overflow-hidden"
                    >
                      <div className="flex items-start gap-2.5 px-3 py-2.5 rounded-xl bg-red-500/10 border border-red-500/25 text-[13px] text-red-700 dark:text-red-300">
                        <span className="w-4 h-4 rounded-full bg-red-500/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                          <span className="w-1 h-1 rounded-full bg-red-500" />
                        </span>
                        <span className="leading-snug">{error}</span>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                <Button type="submit" disabled={loading} size="lg" className="w-full">
                  {loading ? <><Loader2 className="w-4 h-4 animate-spin" /> Envoi…</> : <>Envoyer le code <ArrowRight className="w-4 h-4" /></>}
                </Button>
              </form>
            )}

            {/* Step 2 */}
            {step === 2 && (
              <form onSubmit={submitReset} className="relative space-y-4">
                <div>
                  <label className="text-[11.5px] font-semibold uppercase tracking-wider text-muted-foreground block mb-1.5">
                    Code reçu · 6 chiffres
                  </label>
                  <Input
                    type="text"
                    inputMode="numeric"
                    maxLength={6}
                    value={code}
                    onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                    placeholder="••••••"
                    className="h-12 text-center tracking-[0.5em] text-lg font-mono"
                    required
                    autoFocus
                  />
                </div>

                <div>
                  <label className="text-[11.5px] font-semibold uppercase tracking-wider text-muted-foreground block mb-1.5">
                    Nouveau mot de passe
                  </label>
                  <div className="relative">
                    <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                    <Input
                      type={showPwd ? 'text' : 'password'}
                      value={newPassword}
                      onChange={(e) => setNewPwd(e.target.value)}
                      placeholder="Min. 8 caractères"
                      minLength={8}
                      className="pl-10 pr-10 h-11"
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowPwd(!showPwd)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 w-6 h-6 flex items-center justify-center rounded-md text-slate-400 hover:text-foreground hover:bg-black/[0.05] dark:hover:bg-white/[0.06]"
                    >
                      {showPwd ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <AnimatePresence>
                  {error && (
                    <motion.div
                      initial={{ opacity: 0, y: -6, height: 0 }}
                      animate={{ opacity: 1, y: 0, height: 'auto' }}
                      exit={{ opacity: 0, y: -6, height: 0 }}
                      className="overflow-hidden"
                    >
                      <div className="flex items-start gap-2.5 px-3 py-2.5 rounded-xl bg-red-500/10 border border-red-500/25 text-[13px] text-red-700 dark:text-red-300">
                        <span className="w-4 h-4 rounded-full bg-red-500/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                          <span className="w-1 h-1 rounded-full bg-red-500" />
                        </span>
                        <span className="leading-snug">{error}</span>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="secondary"
                    size="lg"
                    onClick={() => { setStep(1); setError(null) }}
                    className="flex-1"
                  >
                    <ArrowLeft className="w-4 h-4" /> Retour
                  </Button>
                  <Button
                    type="submit"
                    disabled={loading || code.length !== 6}
                    size="lg"
                    className="flex-1"
                  >
                    {loading ? <><Loader2 className="w-4 h-4 animate-spin" /> Validation…</> : 'Valider'}
                  </Button>
                </div>
              </form>
            )}

            {/* Step 3 — Success */}
            {step === 3 && (
              <div className="relative text-center py-4 space-y-5">
                <motion.div
                  initial={{ scale: 0.5, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
                  transition={{ type: 'spring', stiffness: 260, damping: 20 }}
                  className="w-16 h-16 rounded-2xl bg-emerald-500/10 ring-4 ring-emerald-500/10 flex items-center justify-center mx-auto"
                >
                  <CheckCircle className="w-8 h-8 text-emerald-500" />
                </motion.div>
                <p className="text-[13px] text-muted-foreground max-w-xs mx-auto">
                  Votre mot de passe a été modifié avec succès. Vous pouvez maintenant vous reconnecter.
                </p>
                <Button type="button" onClick={handleClose} size="lg" className="w-full">
                  Retour à la connexion <ArrowRight className="w-4 h-4" />
                </Button>
              </div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
