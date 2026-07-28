import { Suspense } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { lazyWithRetry as lazy } from '@/lib/lazyWithRetry'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Toaster } from 'sonner'
import AppLayout      from '@/components/layout/AppLayout'
import WelcomeScreen  from '@/components/WelcomeScreen'
import ProtectedRoute from '@/components/auth/ProtectedRoute'
import ErrorBoundary  from '@/components/ErrorBoundary'
import { ThemeProvider }  from '@/contexts/ThemeContext'
import { TenantProvider } from '@/contexts/TenantContext'

// Lazy load all pages for code splitting & performance
const Dashboard      = lazy(() => import('@/pages/Dashboard'))
const Auth           = lazy(() => import('@/pages/Auth'))
const Prospects      = lazy(() => import('@/pages/Prospects'))
const ProspectDetail = lazy(() => import('@/pages/ProspectDetail'))
const Clients        = lazy(() => import('@/pages/Clients'))
const RenewalsBreakdown = lazy(() => import('@/pages/RenewalsBreakdown'))
const ClientDetail   = lazy(() => import('@/pages/ClientDetail'))
const Devis          = lazy(() => import('@/pages/Devis'))
const DevisPreview   = lazy(() => import('@/pages/DevisPreview'))
const Factures       = lazy(() => import('@/pages/Factures'))
const FacturePreview = lazy(() => import('@/pages/FacturePreview'))
const Contrats       = lazy(() => import('@/pages/Contrats'))
const Paiements      = lazy(() => import('@/pages/Paiements'))
const ChequesRecus   = lazy(() => import('@/pages/ChequesRecus'))
const ChequesEmis    = lazy(() => import('@/pages/ChequesEmis'))
const Depenses       = lazy(() => import('@/pages/Depenses'))
const Finances       = lazy(() => import('@/pages/Finances'))
const FinanceIA      = lazy(() => import('@/pages/FinanceIA'))
const Abonnements    = lazy(() => import('@/pages/Abonnements'))
const Equipe             = lazy(() => import('@/pages/Equipe'))
const EquipeMemberDetail = lazy(() => import('@/pages/EquipeMemberDetail'))
const StagiaireDetail    = lazy(() => import('@/pages/StagiaireDetail'))
const Fournisseurs   = lazy(() => import('@/pages/Fournisseurs'))
const Contacts       = lazy(() => import('@/pages/Contacts'))
const Domaines       = lazy(() => import('@/pages/Domaines'))
const Hebergements   = lazy(() => import('@/pages/Hebergements'))
const Vehicules      = lazy(() => import('@/pages/Vehicules'))
const Produits       = lazy(() => import('@/pages/Produits'))
const Services       = lazy(() => import('@/pages/Services'))
const ProduitsStock  = lazy(() => import('@/pages/ProduitsStock'))
const BonsCommande   = lazy(() => import('@/pages/BonsCommande'))
const BonsLivraison       = lazy(() => import('@/pages/BonsLivraison'))
const BonLivraisonPreview = lazy(() => import('@/pages/BonLivraisonPreview'))
const Statistiques   = lazy(() => import('@/pages/Statistiques'))
const ActivityLogs   = lazy(() => import('@/pages/ActivityLogs'))
const ConseillerIA   = lazy(() => import('@/pages/ConseillerIA'))
const Taches         = lazy(() => import('@/pages/Taches'))
const Projets        = lazy(() => import('@/pages/Projets'))
const Templates      = lazy(() => import('@/pages/Templates'))
const ProjetDetail   = lazy(() => import('@/pages/ProjetDetail'))
const Calendrier     = lazy(() => import('@/pages/Calendrier'))
const Planificateur  = lazy(() => import('@/pages/Planificateur'))
const Parametres       = lazy(() => import('@/pages/Parametres'))
const ModelesPrestations = lazy(() => import('@/pages/ModelesPrestations'))
const AdminSecurity    = lazy(() => import('@/pages/AdminSecurity'))
const Automatisations     = lazy(() => import('@/pages/Automatisations'))
const AbonnementsClients  = lazy(() => import('@/pages/AbonnementsClients'))
const Integrations        = lazy(() => import('@/pages/Integrations'))
const Rapports            = lazy(() => import('@/pages/Rapports'))
const SOP                 = lazy(() => import('@/pages/SOP'))
const Landing             = lazy(() => import('@/pages/Landing'))
const ComingSoon          = lazy(() => import('@/pages/ComingSoon'))
const Guides              = lazy(() => import('@/pages/Guides'))
const GuideStep           = lazy(() => import('@/pages/GuideStep'))
const Vision              = lazy(() => import('@/pages/Vision'))

/* Outbound Marketing (module de prospection sortante) */
const OutboundDashboard   = lazy(() => import('@/pages/Outbound/OutboundDashboard'))
const OutboundProspects   = lazy(() => import('@/pages/Outbound/OutboundProspects'))
const OutboundPipeline    = lazy(() => import('@/pages/Outbound/OutboundPipeline'))
const OutboundFollowUps   = lazy(() => import('@/pages/Outbound/OutboundFollowUps'))
const OutboundCampaigns   = lazy(() => import('@/pages/Outbound/OutboundCampaigns'))
const OutboundTemplates   = lazy(() => import('@/pages/Outbound/OutboundTemplates'))
const OutboundSectors     = lazy(() => import('@/pages/Outbound/OutboundSectors'))
const OutboundTeam        = lazy(() => import('@/pages/Outbound/OutboundTeam'))
const OutboundReports     = lazy(() => import('@/pages/Outbound/OutboundReports'))
const OutboundEnrich      = lazy(() => import('@/pages/Outbound/OutboundEnrich'))
const OutboundSettings    = lazy(() => import('@/pages/Outbound/OutboundSettings'))
const OutboundAutopilot        = lazy(() => import('@/pages/Outbound/OutboundAutopilot'))
const OutboundAutopilotMonitor      = lazy(() => import('@/pages/Outbound/OutboundAutopilotMonitor'))
const OutboundAutopilotEmailPreview = lazy(() => import('@/pages/Outbound/OutboundAutopilotEmailPreview'))
const OutboundTracking              = lazy(() => import('@/pages/Outbound/OutboundTracking'))

/* Team member space (invite + login + dashboard) */
const InviteAccept        = lazy(() => import('@/pages/InviteAccept'))
const TeamLogin           = lazy(() => import('@/pages/TeamLogin'))
const MySpaceLayout       = lazy(() => import('@/pages/MySpace/MySpaceLayout'))
const MyDashboard         = lazy(() => import('@/pages/MySpace/MyDashboard'))
const MySops              = lazy(() => import('@/pages/MySpace/MySops'))
const MyTasks             = lazy(() => import('@/pages/MySpace/MyTasks'))
const MyProjets           = lazy(() => import('@/pages/MySpace/MyProjets'))
const MyProjetDetail      = lazy(() => import('@/pages/MySpace/MyProjetDetail'))
const MyNotifications     = lazy(() => import('@/pages/MySpace/MyNotifications'))
const MyMessages          = lazy(() => import('@/pages/MySpace/MyMessages'))
const MyProfile           = lazy(() => import('@/pages/MySpace/MyProfile'))

import { queryClient } from '@/lib/queryClient'

function PageLoader() {
  return (
    <div className="flex items-center justify-center min-h-[400px]">
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded-full border-2 border-blue-500 border-t-transparent animate-spin" />
        <span className="text-slate-400 text-sm">Chargement...</span>
      </div>
    </div>
  )
}

export default function App() {
  return (
    <ThemeProvider>
    <WelcomeScreen />
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <ErrorBoundary>
        <Suspense fallback={<PageLoader />}>
          <Routes>
            {/* ── Public routes ─────────────────────────────────── */}
            <Route path="/"     element={<Landing />} />
            <Route path="/auth" element={<Auth />} />

            {/* ── Team member: invite + login + personal space ───── */}
            <Route path="/invite/:token" element={<InviteAccept />} />
            <Route path="/team-login"    element={<TeamLogin />} />
            <Route path="/my-space" element={<MySpaceLayout />}>
              <Route index               element={<MyDashboard />} />
              <Route path="sops"         element={<MySops />} />
              <Route path="tasks"        element={<MyTasks />} />
              <Route path="projets"      element={<MyProjets />} />
              <Route path="projets/:id"  element={<MyProjetDetail />} />
              <Route path="notifications" element={<MyNotifications />} />
              <Route path="messages"     element={<MyMessages />} />
              <Route path="profile"      element={<MyProfile />} />
            </Route>

            {/* ── Tenant workspace: nextgital.com/:tenantSlug/* ─────── */}
            <Route path="/:tenantSlug" element={
              <TenantProvider>
                <ProtectedRoute><AppLayout /></ProtectedRoute>
              </TenantProvider>
            }>
              <Route index                              element={<Dashboard />} />
              <Route path="prospects"                  element={<Prospects />} />
              <Route path="prospects/:id"              element={<ProspectDetail />} />
              <Route path="outbound"                   element={<OutboundDashboard />} />
              <Route path="outbound/prospects"         element={<OutboundProspects />} />
              <Route path="outbound/pipeline"          element={<OutboundPipeline />} />
              <Route path="outbound/follow-ups"        element={<OutboundFollowUps />} />
              <Route path="outbound/campaigns"         element={<OutboundCampaigns />} />
              <Route path="outbound/templates"         element={<OutboundTemplates />} />
              <Route path="outbound/sectors"           element={<OutboundSectors />} />
              <Route path="outbound/team"              element={<OutboundTeam />} />
              <Route path="outbound/reports"           element={<OutboundReports />} />
              <Route path="outbound/enrich"            element={<OutboundEnrich />} />
              <Route path="outbound/settings"          element={<OutboundSettings />} />
              <Route path="outbound/autopilot"         element={<OutboundAutopilot />} />
              <Route path="outbound/autopilot/monitor"       element={<OutboundAutopilotMonitor />} />
              <Route path="outbound/autopilot/email-preview" element={<OutboundAutopilotEmailPreview />} />
              <Route path="outbound/tracking"                element={<OutboundTracking />} />
              <Route path="clients"                    element={<Clients />} />
              <Route path="clients/renewals"           element={<RenewalsBreakdown />} />
              <Route path="clients/:id"                element={<ClientDetail />} />
              <Route path="taches"                     element={<Taches />} />
              <Route path="projets"                    element={<Projets />} />
              <Route path="projets/:id"                element={<ProjetDetail />} />
              <Route path="templates"                  element={<Templates />} />
              <Route path="calendrier"                 element={<Calendrier />} />
              <Route path="planificateur"              element={<Planificateur />} />
              <Route path="devis"                      element={<Devis />} />
              <Route path="devis/:id/preview"          element={<DevisPreview />} />
              {/* Backwards-compat: old shared links missing the /devis/ segment */}
              <Route path=":id/preview"                element={<DevisPreview />} />
              <Route path="factures"                   element={<Factures />} />
              <Route path="factures/:id/preview"       element={<FacturePreview />} />
              <Route path="contrats"                   element={<Contrats />} />
              <Route path="bons-commande"              element={<BonsCommande />} />
              <Route path="bons-livraison"             element={<BonsLivraison />} />
              <Route path="bons-livraison/:id/preview" element={<BonLivraisonPreview />} />
              <Route path="produits"                   element={<Produits />} />
              <Route path="services"                   element={<Services />} />
              <Route path="produits-stock"             element={<ProduitsStock />} />
              <Route path="paiements"                  element={<Paiements />} />
              <Route path="cheques-recus"              element={<ChequesRecus />} />
              <Route path="cheques-emis"               element={<ChequesEmis />} />
              <Route path="depenses"                   element={<Depenses />} />
              <Route path="finances"                   element={<Finances />} />
              <Route path="finance-ia"                 element={<FinanceIA />} />
              <Route path="abonnements"                element={<Abonnements />} />
              <Route path="abonnements-clients"        element={<AbonnementsClients />} />
              <Route path="integrations"               element={<Integrations />} />
              <Route path="equipe"                     element={<Equipe />} />
              <Route path="equipe/:id"                 element={<EquipeMemberDetail />} />
              <Route path="stagiaire/:id"              element={<StagiaireDetail />} />
              <Route path="fournisseurs"               element={<Fournisseurs />} />
              <Route path="contacts"                   element={<Contacts />} />
              <Route path="domaines"                   element={<Domaines />} />
              <Route path="hebergements"               element={<Hebergements />} />
              <Route path="vehicules"                  element={<Vehicules />} />
              <Route path="statistiques"               element={<Statistiques />} />
              <Route path="activite"                   element={<ActivityLogs />} />
              <Route path="conseiller-ia"              element={<ConseillerIA />} />
              <Route path="parametres"                 element={<Parametres />} />
              <Route path="parametres/modeles-prestations" element={<ModelesPrestations />} />
              <Route path="securite"                   element={<AdminSecurity />} />
              <Route path="automatisations"            element={<Automatisations />} />
              <Route path="rapports"                   element={<Rapports />} />
              <Route path="sop"                        element={<SOP />} />
              <Route path="guides"                     element={<Guides />} />
              <Route path="guides/:stepKey"            element={<GuideStep />} />
              <Route path="vision"                     element={<Vision />} />
              <Route path="bientot"                    element={<ComingSoon />} />
              <Route path="*"                          element={<Navigate to="" replace />} />
            </Route>

            {/* ── Catch-all ─────────────────────────────────────── */}
            <Route path="*" element={<Navigate to="/auth" replace />} />
          </Routes>
        </Suspense>
        </ErrorBoundary>
      </BrowserRouter>

      <Toaster
        position="bottom-right"
        toastOptions={{
          style: {
            background: '#0f172a',
            border: '1px solid #1e293b',
            color: '#f1f5f9',
            fontSize: '14px',
          },
        }}
      />
    </QueryClientProvider>
    </ThemeProvider>
  )
}
