/**
 * /team-login — dedicated login page for team_members.
 *   Direct email + password → token (no 2FA, no tenant slug needed).
 */
import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Loader2, Mail, Lock, Eye, EyeOff, Users, ArrowLeft, ShieldCheck } from 'lucide-react'
import { useMember } from '@/hooks/useMember'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { authApi } from '@/lib/api'
import { toast } from 'sonner'

export default function TeamLogin() {
  const { signIn, isAuth, loading } = useMember()
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [showPwd, setShowPwd]   = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [showReset, setShowReset] = useState(false)

  /* If a member token already exists and is valid, jump straight to their space */
  useEffect(() => {
    if (!loading && isAuth) window.location.replace('/my-space')
  }, [loading, isAuth])

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email || !password) return
    setSubmitting(true)
    try {
      await signIn(email, password)
      toast.success('Bienvenue dans votre espace')
    } catch (err: any) {
      toast.error(err?.message ?? 'Identifiants incorrects')
      setSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-emerald-50 via-white to-blue-50 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950 flex items-center justify-center px-4 py-12">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md"
      >
        <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-xl border border-slate-200 dark:border-slate-800 p-8">
          <div className="flex items-center justify-center mb-6">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-emerald-600 to-blue-600 flex items-center justify-center shadow-lg shadow-emerald-600/30">
              <Users className="w-7 h-7 text-white" />
            </div>
          </div>

          <h1 className="text-2xl font-bold text-center text-slate-900 dark:text-slate-50 mb-2">
            Espace membre
          </h1>
          <p className="text-sm text-center text-slate-500 dark:text-slate-400 mb-8">
            Connectez-vous pour accéder à vos SOPs et vos tâches
          </p>

          <form onSubmit={submit} className="space-y-4">
            <div>
              <label className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5 block">
                Email
              </label>
              <div className="relative">
                <Mail className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <Input
                  type="email"
                  autoFocus
                  autoComplete="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="prenom.nom@nextgital.com"
                  className="pl-9"
                />
              </div>
            </div>

            <div>
              <label className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5 block">
                Mot de passe
              </label>
              <div className="relative">
                <Lock className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <Input
                  type={showPwd ? 'text' : 'password'}
                  autoComplete="current-password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  className="pl-9 pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPwd(v => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
                >
                  {showPwd ? <EyeOff className="w-4 h-4"/> : <Eye className="w-4 h-4"/>}
                </button>
              </div>
            </div>

            <Button
              type="submit"
              disabled={submitting || !email || !password}
              className="w-full bg-gradient-to-r from-emerald-600 to-blue-600 hover:from-emerald-700 hover:to-blue-700 text-white"
            >
              {submitting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              Se connecter
            </Button>
          </form>

          <div className="mt-4 text-center">
            <button
              type="button"
              onClick={() => setShowReset(true)}
              className="text-xs text-blue-600 hover:text-blue-700 dark:text-blue-400 hover:underline"
            >
              Mot de passe oublié ?
            </button>
          </div>

          <div className="mt-6 pt-6 border-t border-slate-200 dark:border-slate-800 text-center">
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Vous n'avez pas reçu d'invitation ? Contactez votre administrateur.
            </p>
            <Link to="/auth" className="text-xs text-blue-600 hover:text-blue-700 dark:text-blue-400 mt-3 inline-block">
              Connexion administrateur →
            </Link>
          </div>
        </div>
      </motion.div>

      {showReset && (
        <TeamPasswordResetDialog
          defaultEmail={email}
          onClose={() => setShowReset(false)}
          onDone={() => { setShowReset(false); toast.success('Mot de passe mis à jour. Connectez-vous.') }}
        />
      )}
    </div>
  )
}

/* ── Password reset dialog — 3 steps: email → code → new password ── */
function TeamPasswordResetDialog({
  defaultEmail, onClose, onDone,
}: {
  defaultEmail: string
  onClose: () => void
  onDone:  () => void
}) {
  const [step, setStep] = useState<1 | 2 | 3>(1)
  const [email, setEmail] = useState(defaultEmail)
  const [code, setCode] = useState('')
  const [newPwd, setNewPwd] = useState('')
  const [showPwd, setShowPwd] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submitEmail = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null); setLoading(true)
    try {
      await authApi.forgotPassword(email.trim())
      setStep(2)
    } catch (err: any) {
      setError(err.message || 'Erreur')
    } finally { setLoading(false) }
  }

  const submitReset = async (e: React.FormEvent) => {
    e.preventDefault()
    if (newPwd.length < 8) { setError('Le mot de passe doit contenir au moins 8 caractères'); return }
    setError(null); setLoading(true)
    try {
      await authApi.resetPassword(email.trim(), code.trim(), newPwd)
      onDone()
    } catch (err: any) {
      setError(err.message || 'Code incorrect ou expiré')
    } finally { setLoading(false) }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm px-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        className="bg-white dark:bg-slate-900 rounded-2xl shadow-xl border border-slate-200 dark:border-slate-800 p-6 w-full max-w-md"
      >
        <div className="flex items-center justify-center mb-4">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-emerald-600 to-blue-600 flex items-center justify-center">
            {step === 3 ? <Lock className="w-6 h-6 text-white" /> : <ShieldCheck className="w-6 h-6 text-white" />}
          </div>
        </div>
        <h2 className="text-xl font-bold text-center text-slate-900 dark:text-slate-50 mb-1">
          {step === 1 && 'Mot de passe oublié'}
          {step === 2 && 'Entrez le code'}
          {step === 3 && 'Nouveau mot de passe'}
        </h2>
        <p className="text-sm text-center text-slate-500 dark:text-slate-400 mb-6">
          {step === 1 && 'Recevez un code de vérification par email'}
          {step === 2 && `Code envoyé à ${email}. Il expire dans 10 minutes.`}
          {step === 3 && 'Choisissez un nouveau mot de passe (min. 8 caractères)'}
        </p>

        {step === 1 && (
          <form onSubmit={submitEmail} className="space-y-4">
            <div className="relative">
              <Mail className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <Input type="email" autoFocus required value={email} onChange={e => setEmail(e.target.value)} placeholder="prenom.nom@nextgital.com" className="pl-9" />
            </div>
            {error && <p className="text-xs text-red-500 text-center">{error}</p>}
            <Button type="submit" disabled={loading || !email.trim()} className="w-full">
              {loading ? <Loader2 className="w-4 h-4 animate-spin"/> : 'Envoyer le code'}
            </Button>
          </form>
        )}

        {step === 2 && (
          <form onSubmit={e => { e.preventDefault(); if (code.length === 6) setStep(3) }} className="space-y-4">
            <Input
              autoFocus
              inputMode="numeric"
              maxLength={6}
              autoComplete="one-time-code"
              value={code}
              onChange={e => setCode(e.target.value.replace(/[^0-9]/g, '').slice(0,6))}
              placeholder="000000"
              className="text-center text-2xl tracking-[0.5em] font-mono"
            />
            {error && <p className="text-xs text-red-500 text-center">{error}</p>}
            <Button type="submit" disabled={code.length !== 6} className="w-full">
              Continuer
            </Button>
            <button type="button" onClick={() => setStep(1)} className="text-xs text-slate-500 hover:text-slate-700 flex items-center gap-1 mx-auto">
              <ArrowLeft className="w-3 h-3" /> Renvoyer un code
            </button>
          </form>
        )}

        {step === 3 && (
          <form onSubmit={submitReset} className="space-y-4">
            <div className="relative">
              <Lock className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <Input type={showPwd ? 'text' : 'password'} autoFocus value={newPwd} onChange={e => setNewPwd(e.target.value)} placeholder="Nouveau mot de passe" className="pl-9 pr-10" />
              <button type="button" onClick={() => setShowPwd(v => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                {showPwd ? <EyeOff className="w-4 h-4"/> : <Eye className="w-4 h-4"/>}
              </button>
            </div>
            {error && <p className="text-xs text-red-500 text-center">{error}</p>}
            <Button type="submit" disabled={loading || newPwd.length < 8} className="w-full">
              {loading ? <Loader2 className="w-4 h-4 animate-spin"/> : 'Réinitialiser'}
            </Button>
          </form>
        )}

        <button
          type="button"
          onClick={onClose}
          className="w-full mt-4 text-xs text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
        >
          Annuler
        </button>
      </motion.div>
    </div>
  )
}
