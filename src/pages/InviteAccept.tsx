/**
 * /invite/:token — public page used by an invited team member to
 *   1. confirm the invitation is still valid
 *   2. set a password
 *   3. auto-log-in and redirect to /my-space
 */
import { useEffect, useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Loader2, ShieldCheck, AlertCircle, CheckCircle2, Eye, EyeOff, Mail } from 'lucide-react'
import { memberAuthApi, authApi } from '@/lib/api'
import { useMember } from '@/hooks/useMember'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { toast } from 'sonner'

interface InviteInfo {
  first_name:   string
  last_name:    string
  email:        string
  job_title:    string | null
  tenant_name:  string
  expires_at:   string | null
}

function passwordStrength(p: string): { score: number; label: string; color: string } {
  let score = 0
  if (p.length >= 8)            score++
  if (/[a-z]/.test(p) && /[A-Z]/.test(p)) score++
  if (/[0-9]/.test(p))          score++
  if (/[^a-zA-Z0-9]/.test(p))   score++
  if (p.length >= 12)           score++
  const labels = ['Très faible', 'Faible', 'Moyen', 'Bon', 'Excellent']
  const colors = ['bg-red-500', 'bg-orange-500', 'bg-amber-500', 'bg-blue-500', 'bg-emerald-500']
  const i = Math.max(0, Math.min(4, score - 1))
  return { score, label: labels[i], color: colors[i] }
}

export default function InviteAccept() {
  const { token = '' } = useParams<{ token: string }>()
  const navigate = useNavigate()
  const { acceptInvite } = useMember()

  const [info, setInfo]       = useState<InviteInfo | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState<string | null>(null)

  const [pwd, setPwd]         = useState('')
  const [pwd2, setPwd2]       = useState('')
  const [showPwd, setShowPwd] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  /* Renvoi de lien : si le token est invalide/expiré, l'employé saisit son email
     ici et le backend lui envoie un nouveau lien d'invitation. */
  const [resendEmail, setResendEmail]   = useState('')
  const [resendState, setResendState]   = useState<'idle' | 'sending' | 'sent'>('idle')

  const requestNewLink = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!resendEmail.trim()) return
    setResendState('sending')
    try {
      await authApi.forgotPassword(resendEmail.trim())
      setResendState('sent')
    } catch (err: any) {
      toast.error(err?.message ?? 'Erreur lors de la demande')
      setResendState('idle')
    }
  }

  useEffect(() => {
    memberAuthApi.verifyInvite(token)
      .then(d => setInfo(d))
      .catch(e => setError(e?.message ?? 'Lien invalide'))
      .finally(() => setLoading(false))
  }, [token])

  const strength = passwordStrength(pwd)

  const canSubmit =
    pwd.length >= 8 && /[0-9]/.test(pwd) && pwd === pwd2 && !submitting && info != null

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!canSubmit) return
    if (pwd !== pwd2) { toast.error('Les mots de passe ne correspondent pas'); return }
    setSubmitting(true)
    try {
      await acceptInvite(token, pwd)
      toast.success(`Bienvenue ${info?.first_name} !`)
      /* navigation happens inside acceptInvite */
    } catch (err: any) {
      toast.error(err?.message ?? 'Erreur lors de la création')
      setSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-violet-50 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950 flex items-center justify-center px-4 py-12">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md"
      >
        <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-xl border border-slate-200 dark:border-slate-800 p-8">
          {/* Logo */}
          <div className="flex items-center justify-center mb-6">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-blue-600 to-violet-600 flex items-center justify-center shadow-lg shadow-blue-600/30">
              <span className="text-white text-2xl font-extrabold">N</span>
            </div>
          </div>

          {loading && (
            <div className="text-center py-10">
              <Loader2 className="w-8 h-8 animate-spin mx-auto text-blue-600" />
              <p className="text-sm text-slate-500 dark:text-slate-400 mt-4">Vérification du lien…</p>
            </div>
          )}

          {!loading && error && (
            <div className="text-center py-6">
              <div className="w-14 h-14 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center mx-auto mb-4">
                <AlertCircle className="w-7 h-7 text-red-600 dark:text-red-400" />
              </div>
              <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-2">Lien invalide</h2>
              <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">{error}</p>

              {resendState === 'sent' ? (
                <div className="rounded-lg bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 p-4 text-left">
                  <div className="flex items-start gap-2">
                    <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400 flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="text-sm font-medium text-emerald-900 dark:text-emerald-100">Email envoyé</p>
                      <p className="text-xs text-emerald-700 dark:text-emerald-300 mt-1">
                        Si un compte existe pour <strong>{resendEmail}</strong>, un nouveau lien vient d'être envoyé. Vérifiez votre boîte mail (et vos spams).
                      </p>
                    </div>
                  </div>
                </div>
              ) : (
                <>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">
                    Entrez votre email pour recevoir un nouveau lien d'invitation :
                  </p>
                  <form onSubmit={requestNewLink} className="space-y-3">
                    <div className="relative">
                      <Mail className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                      <Input
                        type="email"
                        autoFocus
                        required
                        value={resendEmail}
                        onChange={e => setResendEmail(e.target.value)}
                        placeholder="votre.email@exemple.com"
                        className="pl-9"
                      />
                    </div>
                    <Button
                      type="submit"
                      disabled={resendState === 'sending' || !resendEmail.trim()}
                      className="w-full bg-gradient-to-r from-blue-600 to-violet-600 hover:from-blue-700 hover:to-violet-700 text-white"
                    >
                      {resendState === 'sending' ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Mail className="w-4 h-4 mr-2" />}
                      Recevoir un nouveau lien
                    </Button>
                  </form>
                  <Link to="/team-login" className="block mt-4">
                    <Button variant="outline" className="w-full">Aller à la page de connexion</Button>
                  </Link>
                </>
              )}
            </div>
          )}

          {!loading && !error && info && (
            <>
              <div className="text-center mb-6">
                <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-50">
                  Bienvenue {info.first_name} !
                </h1>
                <p className="text-sm text-slate-500 dark:text-slate-400 mt-2">
                  Vous rejoignez l'équipe <strong className="text-slate-900 dark:text-slate-100">{info.tenant_name}</strong>
                  {info.job_title ? ` en tant que ${info.job_title}` : ''}.
                </p>
                <p className="text-xs text-slate-400 dark:text-slate-500 mt-2">
                  Créez votre mot de passe pour accéder à votre espace.
                </p>
              </div>

              <form onSubmit={submit} className="space-y-4">
                <div>
                  <label className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5 block">
                    Mot de passe
                  </label>
                  <div className="relative">
                    <Input
                      type={showPwd ? 'text' : 'password'}
                      value={pwd}
                      onChange={e => setPwd(e.target.value)}
                      autoFocus
                      autoComplete="new-password"
                      placeholder="Min. 8 caractères + 1 chiffre"
                      className="pr-10"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPwd(v => !v)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
                    >
                      {showPwd ? <EyeOff className="w-4 h-4"/> : <Eye className="w-4 h-4"/>}
                    </button>
                  </div>
                  {pwd && (
                    <div className="mt-2">
                      <div className="flex gap-1">
                        {[0,1,2,3,4].map(i => (
                          <div key={i} className={`h-1 flex-1 rounded ${i < strength.score ? strength.color : 'bg-slate-200 dark:bg-slate-700'}`} />
                        ))}
                      </div>
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">{strength.label}</p>
                    </div>
                  )}
                </div>

                <div>
                  <label className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5 block">
                    Confirmer le mot de passe
                  </label>
                  <Input
                    type={showPwd ? 'text' : 'password'}
                    value={pwd2}
                    onChange={e => setPwd2(e.target.value)}
                    autoComplete="new-password"
                  />
                  {pwd2 && pwd === pwd2 && (
                    <p className="text-xs text-emerald-600 dark:text-emerald-400 mt-1 flex items-center gap-1">
                      <CheckCircle2 className="w-3 h-3" /> Les mots de passe correspondent
                    </p>
                  )}
                  {pwd2 && pwd !== pwd2 && (
                    <p className="text-xs text-red-600 dark:text-red-400 mt-1">Les mots de passe ne correspondent pas</p>
                  )}
                </div>

                <Button
                  type="submit"
                  disabled={!canSubmit}
                  className="w-full bg-gradient-to-r from-blue-600 to-violet-600 hover:from-blue-700 hover:to-violet-700 text-white"
                >
                  {submitting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <ShieldCheck className="w-4 h-4 mr-2" />}
                  Créer mon accès
                </Button>
              </form>

              <p className="text-xs text-slate-400 dark:text-slate-500 mt-6 text-center">
                Si vous n'avez pas demandé cet accès, ignorez cet email.
              </p>
            </>
          )}
        </div>
      </motion.div>
    </div>
  )
}
