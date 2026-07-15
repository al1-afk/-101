import { useState } from 'react'
import { CheckCircle2, XCircle, Loader2, ExternalLink, Sparkles, MessageCircle, Mail, MapPin, Info, PlayCircle } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { useOutboundIntegrationsStatus } from '@/hooks/useOutbound'
import { outboundApi } from '@/lib/outboundApi'

interface IntegrationCardProps {
  title:       string
  description: string
  configured:  boolean
  Icon:        React.ElementType
  color:       string
  setupUrl?:   string
  envVars:     string[]
}

function IntegrationCard({ title, description, configured, Icon, color, setupUrl, envVars }: IntegrationCardProps) {
  return (
    <div className={`rounded-2xl border p-5 ${configured ? 'border-emerald-500/30 bg-emerald-500/5' : 'border-border bg-[var(--surface-card)]'}`}>
      <div className="flex items-start gap-3 mb-3">
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0`} style={{ backgroundColor: `${color}22`, color }}>
          <Icon className="w-5 h-5" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-bold text-foreground">{title}</h3>
            {configured
              ? <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-700 dark:text-emerald-400">
                  <CheckCircle2 className="w-2.5 h-2.5" /> Connecté
                </span>
              : <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-500/15 text-red-600">
                  <XCircle className="w-2.5 h-2.5" /> Non configuré
                </span>}
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
        </div>
      </div>
      <div className="rounded-lg bg-muted/40 p-3 mb-2">
        <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-1">
          Variables .env.local requises
        </p>
        <ul className="space-y-0.5">
          {envVars.map(v => (
            <li key={v} className="font-mono text-[11px] text-foreground">{v}</li>
          ))}
        </ul>
      </div>
      {setupUrl && (
        <a href={setupUrl} target="_blank" rel="noopener noreferrer"
           className="inline-flex items-center gap-1 text-[11px] font-medium text-sky-600 hover:text-sky-500">
          Documentation setup <ExternalLink className="w-3 h-3" />
        </a>
      )}
    </div>
  )
}

export default function OutboundSettings() {
  const { data: status, isLoading } = useOutboundIntegrationsStatus()
  const [showTemplateGuide, setShowTemplateGuide] = useState(false)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<{
    success: boolean; duration_ms: number
    provider?: string | null; model?: string
    sample?: { subject: string; body: string }
    error?: string
  } | null>(null)

  const runAiTest = async () => {
    setTesting(true); setTestResult(null)
    try {
      const r = await outboundApi.testAi()
      setTestResult(r)
      if (r.success) toast.success(`${r.provider} OK (${r.duration_ms}ms)`)
      else toast.error(r.error ?? 'Test échoué')
    } catch (e: any) {
      toast.error(e?.message ?? 'Erreur test')
    } finally {
      setTesting(false)
    }
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="page-header">
        <div>
          <h1 className="page-title">Marketing Automation — Paramètres</h1>
          <p className="text-muted-foreground text-sm mt-1">
            État des intégrations externes utilisées par le module Outbound.
          </p>
        </div>
      </div>

      {isLoading || !status ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <IntegrationCard
              title="Google Places API"
              description="Recherche d'entreprises par mot-clé + ville, avec téléphone, site, adresse et catégorie."
              configured={status.google_places}
              Icon={MapPin}
              color="#4285F4"
              setupUrl="https://developers.google.com/maps/documentation/places/web-service/get-api-key"
              envVars={['GOOGLE_PLACES_API_KEY']}
            />
            <IntegrationCard
              title={
                status.ai_provider === 'claude' ? 'Claude Sonnet 4.6 (Anthropic)' :
                status.ai_provider === 'openai' ? `OpenAI ${(typeof window !== 'undefined' ? '' : '')}(actif)` :
                'IA (Claude ou OpenAI)'
              }
              description={
                status.ai_provider === 'openai'
                  ? 'GPT-4o-mini utilisé (ANTHROPIC_API_KEY absent). Claude Sonnet 4.6 prendra le relais si tu l\'ajoutes.'
                  : status.ai_provider === 'claude'
                  ? 'Claude génère les emails et messages WhatsApp personnalisés (qualité premium).'
                  : 'Aucun provider IA configuré. Ajoute ANTHROPIC_API_KEY OU OPENAI_API_KEY.'
              }
              configured={status.anthropic}
              Icon={Sparkles}
              color={status.ai_provider === 'openai' ? '#10A37F' : '#8B5CF6'}
              setupUrl={
                status.ai_provider === 'openai'
                  ? 'https://platform.openai.com/api-keys'
                  : 'https://console.anthropic.com/settings/keys'
              }
              envVars={['ANTHROPIC_API_KEY (préféré)', 'OPENAI_API_KEY (fallback auto)']}
            />
            <IntegrationCard
              title="Meta WhatsApp Cloud API"
              description="Envoi de messages template pré-approuvés (marketing) via l'API officielle Meta."
              configured={status.whatsapp}
              Icon={MessageCircle}
              color="#25D366"
              setupUrl="https://developers.facebook.com/docs/whatsapp/cloud-api/get-started"
              envVars={['WHATSAPP_CLOUD_TOKEN', 'WHATSAPP_PHONE_NUMBER_ID']}
            />
            <IntegrationCard
              title="Email SMTP + Resend fallback"
              description="Envoi d'emails via SMTP Titan/Hostinger avec bascule automatique sur Resend."
              configured={status.smtp || status.resend}
              Icon={Mail}
              color="#0EA5E9"
              envVars={['SMTP_HOST, SMTP_USER, SMTP_PASSWORD', 'RESEND_API_KEY (fallback)']}
            />
          </div>

          {status.whatsapp && (
            <div className="rounded-2xl border border-amber-500/40 bg-amber-500/5 p-5">
              <button
                onClick={() => setShowTemplateGuide(v => !v)}
                className="flex items-center gap-2 text-sm font-bold text-amber-700 dark:text-amber-400"
              >
                <Info className="w-4 h-4" />
                Guide — Créer un template WhatsApp Meta ({showTemplateGuide ? 'masquer' : 'afficher'})
              </button>
              {showTemplateGuide && (
                <div className="mt-3 space-y-3 text-xs text-foreground">
                  <p>
                    Meta n'autorise <strong>aucun</strong> envoi WhatsApp marketing en texte libre. Il faut passer
                    par un <strong>template pré-approuvé</strong>. Étapes :
                  </p>
                  <ol className="list-decimal ml-5 space-y-1.5">
                    <li>Va sur <a href="https://business.facebook.com/wa/manage/message-templates/" target="_blank" rel="noopener noreferrer" className="text-sky-600 underline">Meta Business Manager → Templates</a>.</li>
                    <li>Clique "Créer un modèle" → Catégorie : <strong>Marketing</strong>.</li>
                    <li>Choisis un nom simple (ex. <code className="px-1 rounded bg-muted">first_contact_ar</code>).</li>
                    <li>Rédige le corps avec des variables <code className="px-1 rounded bg-muted">{'{{1}}'}</code>, <code className="px-1 rounded bg-muted">{'{{2}}'}</code>, etc.</li>
                    <li>Attends l'approbation Meta (15 min à 24h).</li>
                    <li>Reviens sur <strong>/outbound/templates</strong>, crée un template avec canal "whatsapp" et remplis <code className="px-1 rounded bg-muted">whatsapp_template_name</code> avec le nom exact.</li>
                  </ol>
                  <div className="rounded-lg bg-muted/60 p-3 font-mono text-[11px] whitespace-pre-line">
                    Exemple template FR approuvé :
                    {'\n\n'}
                    Bonjour {'{{1}}'}, je suis {'{{2}}'} de NEXT GITAL.{'\n'}
                    J'ai découvert {'{{3}}'} et je pense qu'on peut vous aider à {'{{4}}'}.{'\n'}
                    Auriez-vous 10 min cette semaine pour en discuter ?
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Test IA */}
          {status.anthropic && (
            <div className="rounded-2xl border border-violet-500/30 bg-violet-500/5 p-5">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-violet-500" />
                    Test rapide du provider IA
                  </h3>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Génère un email fictif pour vérifier que <code className="px-1 rounded bg-muted">{status.ai_model}</code> répond correctement.
                  </p>
                </div>
                <Button size="sm" onClick={runAiTest} disabled={testing}>
                  {testing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <PlayCircle className="w-3.5 h-3.5" />}
                  Lancer le test
                </Button>
              </div>

              {testResult && (
                <div className={`rounded-lg p-3 text-xs ${testResult.success ? 'bg-emerald-500/10 border border-emerald-500/30' : 'bg-red-500/10 border border-red-500/30'}`}>
                  {testResult.success ? (
                    <>
                      <p className="font-bold mb-2">
                        ✅ {testResult.provider} · {testResult.model} · {testResult.duration_ms}ms
                      </p>
                      <p className="text-muted-foreground mb-1"><strong>Objet :</strong> {testResult.sample?.subject}</p>
                      <p className="text-foreground whitespace-pre-wrap">{testResult.sample?.body}</p>
                    </>
                  ) : (
                    <>
                      <p className="font-bold text-red-600 mb-1">❌ Échec ({testResult.duration_ms}ms)</p>
                      <p className="text-red-600 font-mono">{testResult.error}</p>
                    </>
                  )}
                </div>
              )}
            </div>
          )}

          <div className="rounded-2xl border border-border bg-[var(--surface-card)] p-5">
            <h3 className="text-sm font-bold text-foreground mb-2">Coûts estimés au MVP (50 emails + 20 WhatsApp / jour)</h3>
            <ul className="text-xs text-muted-foreground space-y-1.5">
              <li>Google Places : ~$3-5 / mois (200 recherches × 5 résultats)</li>
              <li>Claude Sonnet 4.6 : ~$7 / mois (1500 générations)</li>
              <li>Meta WhatsApp Cloud : <strong>gratuit</strong> jusqu'à 1000 conversations / mois</li>
              <li>SMTP Titan (existant) : inclus dans le forfait actuel</li>
              <li className="text-emerald-600 dark:text-emerald-400 font-semibold pt-2 border-t border-border mt-2">
                Total incrémental : ~$10-12 / mois
              </li>
            </ul>
          </div>
        </>
      )}
    </div>
  )
}
