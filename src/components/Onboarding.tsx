import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Building2, User, Globe, Check, ChevronRight, ChevronLeft,
  Palette, Bell, Sparkles, X,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input }  from '@/components/ui/input'
import { AutocorrectInput } from '@/components/ui/AutocorrectInput'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { toast } from 'sonner'

const ONBOARDING_KEY = 'gestiq_onboarding_done'

export function isOnboardingDone(): boolean {
  try { return localStorage.getItem(ONBOARDING_KEY) === 'true' } catch { return true }
}

function markOnboardingDone() {
  try { localStorage.setItem(ONBOARDING_KEY, 'true') } catch {}
}

interface WizardData {
  company:    string
  activity:   string
  country:    string
  currency:   string
  fullname:   string
  role:       string
  theme:      'dark' | 'light'
  alerts:     boolean
}

const STEPS = [
  { id: 'company', title: 'Votre entreprise',    icon: Building2 },
  { id: 'profile', title: 'Votre profil',         icon: User      },
  { id: 'prefs',   title: 'Préférences',          icon: Palette   },
  { id: 'done',    title: 'Tout est prêt !',      icon: Sparkles  },
]

const ACTIVITIES = ['Agence Web / Digital','Développement Logiciel','Conseil & Formation','Commerce','Immobilier','Santé','Juridique','Autre']
const COUNTRIES  = ['Maroc','France','Belgique','Canada','Tunisie','Algérie','Sénégal','Autre']
const CURRENCIES = ['MAD — Dirham marocain','EUR — Euro','USD — Dollar','XOF — Franc CFA','TND — Dinar tunisien']

export default function Onboarding({ onClose }: { onClose: () => void }) {
  const [step, setStep] = useState(0)
  const [data, setData] = useState<WizardData>({
    company: '', activity: '', country: 'Maroc', currency: 'MAD — Dirham marocain',
    fullname: '', role: '', theme: 'dark', alerts: true,
  })

  const set = (k: keyof WizardData, v: any) => setData(d => ({ ...d, [k]: v }))

  const canNext = () => {
    if (step === 0) return data.company.trim().length > 0
    if (step === 1) return data.fullname.trim().length > 0
    return true
  }

  const handleFinish = () => {
    try {
      localStorage.setItem('gestiq_company',  data.company)
      localStorage.setItem('gestiq_activity', data.activity)
      localStorage.setItem('gestiq_country',  data.country)
      localStorage.setItem('gestiq_currency', data.currency.split(' — ')[0])
      localStorage.setItem('gestiq_fullname', data.fullname)
      localStorage.setItem('gestiq_role',     data.role)
      if (data.theme === 'light') document.documentElement.classList.remove('dark')
      else                        document.documentElement.classList.add('dark')
    } catch {}
    markOnboardingDone()
    toast.success(`Bienvenue, ${data.fullname || 'sur NEXT GITAL'} !`)
    onClose()
  }

  const StepIcon = STEPS[step].icon

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.94 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.94 }}
        className="bg-[#0f1829] border border-slate-700/60 rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden"
      >
        {/* Progress bar */}
        <div className="h-1 bg-slate-800">
          <motion.div
            className="h-full bg-blue-600"
            animate={{ width: `${((step + 1) / STEPS.length) * 100}%` }}
            transition={{ duration: 0.3 }}
          />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-5 pb-2">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-xl bg-blue-600/20 flex items-center justify-center">
              <StepIcon className="w-5 h-5 text-blue-400" />
            </div>
            <div>
              <p className="text-[11px] text-slate-500 font-medium">Étape {step + 1} / {STEPS.length}</p>
              <h2 className="text-sm font-bold text-white">{STEPS[step].title}</h2>
            </div>
          </div>
          <button onClick={() => { markOnboardingDone(); onClose() }} className="text-slate-600 hover:text-slate-400 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Step content */}
        <div className="px-6 py-4 min-h-[220px]">
          <AnimatePresence mode="wait">
            <motion.div
              key={step}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0  }}
              exit={{    opacity: 0, x:-20  }}
              transition={{ duration: 0.18 }}
              className="space-y-4"
            >
              {step === 0 && (
                <>
                  <div className="space-y-1.5">
                    <label className="text-xs text-slate-400 font-medium">Nom de l'entreprise *</label>
                    <AutocorrectInput
                      value={data.company} onChange={e => set('company', e.target.value)}
                      placeholder="Mon Agence Digital"
                      className="bg-slate-800 border-slate-700 text-white placeholder-slate-500"
                      autoFocus
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs text-slate-400 font-medium">Secteur d'activité</label>
                    <Select value={data.activity} onValueChange={v => set('activity', v)}>
                      <SelectTrigger className="bg-slate-800 border-slate-700 text-white">
                        <SelectValue placeholder="Choisir…" />
                      </SelectTrigger>
                      <SelectContent>
                        {ACTIVITIES.map(a => <SelectItem key={a} value={a}>{a}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <label className="text-xs text-slate-400 font-medium">Pays</label>
                      <Select value={data.country} onValueChange={v => set('country', v)}>
                        <SelectTrigger className="bg-slate-800 border-slate-700 text-white">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {COUNTRIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs text-slate-400 font-medium">Devise</label>
                      <Select value={data.currency} onValueChange={v => set('currency', v)}>
                        <SelectTrigger className="bg-slate-800 border-slate-700 text-white">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {CURRENCIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </>
              )}

              {step === 1 && (
                <>
                  <div className="space-y-1.5">
                    <label className="text-xs text-slate-400 font-medium">Votre nom complet *</label>
                    <AutocorrectInput
                      value={data.fullname} onChange={e => set('fullname', e.target.value)}
                      placeholder="Said Benali"
                      className="bg-slate-800 border-slate-700 text-white placeholder-slate-500"
                      autoFocus
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs text-slate-400 font-medium">Votre rôle</label>
                    <Select value={data.role} onValueChange={v => set('role', v)}>
                      <SelectTrigger className="bg-slate-800 border-slate-700 text-white">
                        <SelectValue placeholder="Choisir…" />
                      </SelectTrigger>
                      <SelectContent>
                        {['Dirigeant / Fondateur','Directeur commercial','Comptable','Manager','Commercial','Assistante'].map(r =>
                          <SelectItem key={r} value={r}>{r}</SelectItem>
                        )}
                      </SelectContent>
                    </Select>
                  </div>
                </>
              )}

              {step === 2 && (
                <>
                  <div className="space-y-3">
                    <p className="text-xs text-slate-400 font-medium">Thème de l'interface</p>
                    <div className="grid grid-cols-2 gap-3">
                      {(['dark', 'light'] as const).map(t => (
                        <button
                          key={t}
                          onClick={() => set('theme', t)}
                          className={`p-3 rounded-xl border-2 transition-all text-left ${data.theme === t ? 'border-blue-500 bg-blue-600/10' : 'border-slate-700 bg-slate-800/50 hover:border-slate-600'}`}
                        >
                          <div className={`w-full h-8 rounded-lg mb-2 ${t === 'dark' ? 'bg-slate-900' : 'bg-slate-100'}`} />
                          <p className="text-xs font-medium text-white">{t === 'dark' ? '🌙 Sombre' : '☀️ Clair'}</p>
                        </button>
                      ))}
                    </div>
                  </div>
                  <label className="flex items-center gap-3 cursor-pointer">
                    <div
                      onClick={() => set('alerts', !data.alerts)}
                      className={`w-10 h-5 rounded-full transition-colors relative ${data.alerts ? 'bg-blue-600' : 'bg-slate-700'}`}
                    >
                      <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${data.alerts ? 'translate-x-5' : 'translate-x-0.5'}`} />
                    </div>
                    <div>
                      <p className="text-sm text-white">Alertes intelligentes</p>
                      <p className="text-xs text-slate-500">Notifications pour factures, renouvellements, anomalies</p>
                    </div>
                  </label>
                </>
              )}

              {step === 3 && (
                <div className="text-center py-4 space-y-4">
                  <div className="w-16 h-16 rounded-2xl bg-blue-600/20 flex items-center justify-center mx-auto">
                    <Sparkles className="w-8 h-8 text-blue-400" />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-white">NEXT GITAL est prêt, {data.fullname || 'bienvenue'} !</h3>
                    <p className="text-sm text-slate-400 mt-1">{data.company} — {data.activity || data.country}</p>
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-xs">
                    {[
                      { label: 'CRM & Prospects',  icon: '🎯' },
                      { label: 'Factures & Devis',  icon: '📄' },
                      { label: 'Alertes IA',         icon: '🔔' },
                      { label: 'Automatisations',    icon: '⚡' },
                      { label: 'MRR & Abonnements', icon: '📈' },
                      { label: 'Rapports PDF',       icon: '📊' },
                    ].map(f => (
                      <div key={f.label} className="bg-slate-800/60 rounded-lg p-2 text-center">
                        <p className="text-lg">{f.icon}</p>
                        <p className="text-slate-400 mt-0.5 leading-tight">{f.label}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </motion.div>
          </AnimatePresence>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-800 flex items-center justify-between">
          <Button
            variant="ghost" size="sm"
            onClick={() => setStep(s => s - 1)}
            disabled={step === 0}
            className="text-slate-400"
          >
            <ChevronLeft className="w-4 h-4" /> Précédent
          </Button>

          {/* Step dots */}
          <div className="flex gap-1.5">
            {STEPS.map((_, i) => (
              <div key={i} className={`w-1.5 h-1.5 rounded-full transition-colors ${i === step ? 'bg-blue-500' : i < step ? 'bg-blue-800' : 'bg-slate-700'}`} />
            ))}
          </div>

          {step < STEPS.length - 1 ? (
            <Button size="sm" onClick={() => setStep(s => s + 1)} disabled={!canNext()}>
              Suivant <ChevronRight className="w-4 h-4" />
            </Button>
          ) : (
            <Button size="sm" onClick={handleFinish}>
              <Check className="w-4 h-4" /> Commencer
            </Button>
          )}
        </div>
      </motion.div>
    </div>
  )
}
