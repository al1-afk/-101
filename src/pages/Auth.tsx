import { useState, useEffect, useRef } from 'react'
import { Navigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { Eye, EyeOff, Lock, Mail, ArrowRight, Loader2, X, KeyRound, CheckCircle, ShieldCheck, ArrowLeft } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { authApi } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

type AuthStage = 'credentials' | 'verify'

export default function Auth() {
  const { isAuthorized, signIn, verifyLogin, resendLoginCode } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [resetOpen, setResetOpen] = useState(false)

  /* 2FA-on-login state */
  const [stage,   setStage]   = useState<AuthStage>('credentials')
  const [code,    setCode]    = useState('')
  const [resendIn, setResendIn] = useState(0)
  const [resending, setResending] = useState(false)

  /* Countdown for the "Renvoyer le code" link */
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
    setError(null)
    setLoading(true)
    try {
      const res: any = await signIn(email, password)
      if (res?.needsVerification) {
        setStage('verify')
        setResendIn(30)
      }
    } catch (err: any) {
      setError(err.message || 'Identifiants incorrects')
    } finally {
      setLoading(false)
    }
  }

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      await verifyLogin(email, code.trim())
    } catch (err: any) {
      setError(err.message || 'Code incorrect')
    } finally {
      setLoading(false)
    }
  }

  const handleResend = async () => {
    if (resendIn > 0 || resending) return
    setResending(true)
    setError(null)
    try {
      await resendLoginCode(email)
      setResendIn(30)
    } catch (err: any) {
      setError(err.message || 'Erreur lors du renvoi')
    } finally {
      setResending(false)
    }
  }

  const backToCredentials = () => {
    setStage('credentials')
    setCode('')
    setError(null)
  }

  return (
    <div className="min-h-[100dvh] bg-[#020617] flex items-center justify-center p-4 relative overflow-hidden">
      {/* Background effects */}
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute -top-40 -left-40 w-80 h-80 bg-blue-600/10 rounded-full blur-3xl" />
        <div className="absolute -bottom-40 -right-40 w-80 h-80 bg-blue-800/10 rounded-full blur-3xl" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-blue-900/5 rounded-full blur-3xl" />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 24, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.4, ease: 'easeOut' }}
        className="relative w-full max-w-md"
      >
        {/* Card */}
        <div className="bg-slate-900/80 backdrop-blur-xl border border-slate-700/60 rounded-2xl p-8 shadow-2xl">
          {/* Logo */}
          <div className="flex flex-col items-center mb-8">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-blue-500 to-blue-700 flex items-center justify-center mb-4 shadow-lg shadow-blue-600/30">
              {stage === 'verify'
                ? <ShieldCheck className="w-7 h-7 text-white" />
                : <span className="text-white font-bold text-2xl">N</span>}
            </div>
            <h1 className="text-2xl font-bold text-white">
              {stage === 'verify' ? 'Confirmation' : 'NEXT GITAL CRM'}
            </h1>
            <p className="text-slate-400 text-sm mt-1 text-center">
              {stage === 'verify'
                ? <>Code envoyé à <span className="text-blue-400 font-medium">{email}</span></>
                : 'Connectez-vous à votre espace'}
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
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-slate-300">Email</label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                <Input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="votre@email.com"
                  className="pl-9 bg-slate-800/60 border-slate-700 text-white placeholder:text-slate-500 focus-visible:border-blue-500"
                  required
                  autoFocus
                />
              </div>
            </div>

            {/* Password */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-slate-300">Mot de passe</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                <Input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="pl-9 pr-9 bg-slate-800/60 border-slate-700 text-white placeholder:text-slate-500 focus-visible:border-blue-500"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition-colors"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* Error */}
            {error && (
              <motion.div
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-red-500/10 border border-red-500/30 rounded-lg p-3 text-sm text-red-400"
              >
                {error}
              </motion.div>
            )}

            {/* Submit */}
            <Button
              type="submit"
              disabled={loading}
              className="w-full h-11 text-base mt-2 bg-gradient-to-br from-blue-500 to-blue-700 hover:from-blue-600 hover:to-blue-800 text-white shadow-lg shadow-blue-600/30 border-0"
            >
              {loading ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <>
                  Se connecter
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </Button>

            {/* Forgot password */}
            <div className="text-center pt-1">
              <button
                type="button"
                onClick={() => setResetOpen(true)}
                className="text-sm text-blue-400 hover:text-blue-300 hover:underline transition-colors"
              >
                Mot de passe oublié ?
              </button>
            </div>
          </form>
          )}

          <p className="text-center text-xs text-slate-600 mt-6">
            Accès restreint — Espace privé NEXT GITAL
          </p>
        </div>
      </motion.div>

      <ResetPasswordModal
        open={resetOpen}
        onClose={() => setResetOpen(false)}
        initialEmail={email}
      />
    </div>
  )
}

/* ── Verify step — 6-digit code received by email ───────────────── */
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
      <div className="space-y-1.5">
        <label className="text-sm font-medium text-slate-300">Code de vérification</label>
        <div className="relative">
          <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
          <Input
            ref={inputRef}
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
            placeholder="123456"
            maxLength={6}
            className="pl-9 bg-slate-800/60 border-slate-700 text-white placeholder:text-slate-500 focus-visible:border-blue-500 text-center tracking-[0.5em] font-mono text-lg"
            required
          />
        </div>
        <p className="text-xs text-slate-500 mt-1.5 leading-relaxed">
          Entrez le code à 6 chiffres reçu par email. Il expire dans 10 minutes.
        </p>
      </div>

      {error && (
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-red-500/10 border border-red-500/30 rounded-lg p-3 text-sm text-red-400"
        >
          {error}
        </motion.div>
      )}

      <Button
        type="submit"
        disabled={loading || code.length !== 6}
        className="w-full h-11 text-base mt-2 bg-gradient-to-br from-blue-500 to-blue-700 hover:from-blue-600 hover:to-blue-800 text-white shadow-lg shadow-blue-600/30 border-0"
      >
        {loading ? (
          <Loader2 className="w-5 h-5 animate-spin" />
        ) : (
          <>
            Vérifier
            <CheckCircle className="w-4 h-4" />
          </>
        )}
      </Button>

      <div className="flex items-center justify-between pt-2 text-sm">
        <button
          type="button"
          onClick={onBack}
          className="flex items-center gap-1 text-slate-400 hover:text-slate-200 transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Retour
        </button>
        {resendIn > 0 ? (
          <span className="text-slate-500">Renvoi possible dans {resendIn}s</span>
        ) : (
          <button
            type="button"
            onClick={onResend}
            disabled={resending}
            className="text-blue-400 hover:text-blue-300 hover:underline transition-colors disabled:opacity-50"
          >
            {resending ? 'Envoi…' : 'Renvoyer le code'}
          </button>
        )}
      </div>
    </form>
  )
}

/* ── Reset password modal — 3 steps: email → code → new password ── */
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

  const reset = () => {
    setStep(1); setCode(''); setNewPwd(''); setError(null); setLoading(false)
  }

  const handleClose = () => { reset(); onClose() }

  const requestCode = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null); setLoading(true)
    try {
      await authApi.forgotPassword(email)
      setStep(2)
    } catch (err: any) {
      setError(err.message || 'Erreur lors de l\'envoi')
    } finally {
      setLoading(false)
    }
  }

  const submitReset = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null); setLoading(true)
    try {
      await authApi.resetPassword(email, code.trim(), newPassword)
      setStep(3)
    } catch (err: any) {
      setError(err.message || 'Erreur lors de la réinitialisation')
    } finally {
      setLoading(false)
    }
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={handleClose}
        >
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.96 }}
            onClick={(e) => e.stopPropagation()}
            className="relative w-full max-w-md bg-slate-900 border border-slate-700/60 rounded-2xl p-7 shadow-2xl"
          >
            <button
              type="button"
              onClick={handleClose}
              className="absolute top-4 right-4 text-slate-500 hover:text-slate-300 transition-colors"
              aria-label="Fermer"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 rounded-xl bg-blue-500/20 flex items-center justify-center">
                <KeyRound className="w-5 h-5 text-blue-400" />
              </div>
              <div>
                <h2 className="text-white font-semibold text-lg">
                  {step === 3 ? 'Succès' : 'Réinitialiser le mot de passe'}
                </h2>
                <p className="text-slate-400 text-xs">
                  {step === 1 && 'Entrez votre email pour recevoir un code'}
                  {step === 2 && `Code envoyé à ${email}`}
                  {step === 3 && 'Votre mot de passe a été modifié'}
                </p>
              </div>
            </div>

            {/* Step 1 — Email */}
            {step === 1 && (
              <form onSubmit={requestCode} className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-slate-300">Email</label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                    <Input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="votre@email.com"
                      className="pl-9 bg-slate-800/60 border-slate-700 text-white placeholder:text-slate-500 focus-visible:border-blue-500"
                      required
                      autoFocus
                    />
                  </div>
                </div>

                {error && (
                  <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3 text-sm text-red-400">
                    {error}
                  </div>
                )}

                <Button
                  type="submit"
                  disabled={loading}
                  className="w-full h-11 bg-gradient-to-br from-blue-500 to-blue-700 hover:from-blue-600 hover:to-blue-800 text-white shadow-lg shadow-blue-600/30 border-0"
                >
                  {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Envoyer le code'}
                </Button>
              </form>
            )}

            {/* Step 2 — Code + new password */}
            {step === 2 && (
              <form onSubmit={submitReset} className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-slate-300">Code reçu (6 chiffres)</label>
                  <Input
                    type="text"
                    inputMode="numeric"
                    maxLength={6}
                    value={code}
                    onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                    placeholder="123456"
                    className="bg-slate-800/60 border-slate-700 text-white text-center tracking-[0.5em] text-lg font-mono placeholder:text-slate-600 focus-visible:border-blue-500"
                    required
                    autoFocus
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-slate-300">Nouveau mot de passe</label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                    <Input
                      type={showPwd ? 'text' : 'password'}
                      value={newPassword}
                      onChange={(e) => setNewPwd(e.target.value)}
                      placeholder="Min. 8 caractères"
                      minLength={8}
                      className="pl-9 pr-9 bg-slate-800/60 border-slate-700 text-white placeholder:text-slate-500 focus-visible:border-blue-500"
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowPwd(!showPwd)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition-colors"
                    >
                      {showPwd ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                {error && (
                  <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3 text-sm text-red-400">
                    {error}
                  </div>
                )}

                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => { setStep(1); setError(null) }}
                    className="flex-1 h-11 bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700"
                  >
                    Retour
                  </Button>
                  <Button
                    type="submit"
                    disabled={loading || code.length !== 6}
                    className="flex-1 h-11 bg-gradient-to-br from-blue-500 to-blue-700 hover:from-blue-600 hover:to-blue-800 text-white shadow-lg shadow-blue-600/30 border-0"
                  >
                    {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Valider'}
                  </Button>
                </div>
              </form>
            )}

            {/* Step 3 — Success */}
            {step === 3 && (
              <div className="text-center py-2 space-y-4">
                <div className="w-16 h-16 rounded-full bg-emerald-500/20 flex items-center justify-center mx-auto">
                  <CheckCircle className="w-8 h-8 text-emerald-400" />
                </div>
                <p className="text-slate-300 text-sm">
                  Vous pouvez maintenant vous connecter avec votre nouveau mot de passe.
                </p>
                <Button
                  type="button"
                  onClick={handleClose}
                  className="w-full h-11 bg-gradient-to-br from-blue-500 to-blue-700 hover:from-blue-600 hover:to-blue-800 text-white shadow-lg shadow-blue-600/30 border-0"
                >
                  Retour à la connexion
                  <ArrowRight className="w-4 h-4" />
                </Button>
              </div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
