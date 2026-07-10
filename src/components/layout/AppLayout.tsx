import { useState, useEffect } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'
import Sidebar from './Sidebar'
import Header  from './Header'
import GlobalSearch from '@/components/GlobalSearch'
import { useRealtime } from '@/hooks/useRealtime'
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts'
import { useNetworkStatus } from '@/hooks/useNetworkStatus'
import { useOfflineSync } from '@/hooks/useOfflineSync'
import { useEventReminders } from '@/hooks/useEventReminders'
import { useValidationNotifier } from '@/hooks/useValidationNotifier'
import { maybeRequestPermissionOnce } from '@/lib/browserNotifications'
import PwaInstallBanner from '@/components/PwaInstallBanner'
import ShortcutsModal from '@/components/ShortcutsModal'
import OfflineBanner from '@/components/OfflineBanner'

function getSavedCollapsed(): boolean {
  try { return localStorage.getItem('sidebar-collapsed') === 'true' }
  catch { return false }
}

export default function AppLayout() {
  const location  = useLocation()
  const [collapsed,      setCollapsed]      = useState(getSavedCollapsed)
  const [mobileOpen,     setMobileOpen]     = useState(false)

  useRealtime()
  useKeyboardShortcuts()
  useNetworkStatus()
  useOfflineSync()
  useEventReminders()
  /* Toast manager when a team member completes a task → status validation */
  useValidationNotifier()

  /* Demande gentiment la permission pour les notifs navigateur (1ère visite). */
  useEffect(() => { maybeRequestPermissionOnce() }, [])

  const handleToggle = () => {
    setCollapsed(prev => {
      const next = !prev
      try { localStorage.setItem('sidebar-collapsed', String(next)) } catch {}
      return next
    })
  }

  return (
    <div className="min-h-[100dvh] bg-background">
      {/* ── Desktop sidebar ── */}
      <div className="hidden md:block">
        <Sidebar collapsed={collapsed} onToggle={handleToggle} />
      </div>

      {/* ── Mobile sidebar drawer ── */}
      <AnimatePresence>
        {mobileOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="fixed inset-0 z-40 bg-black/60 md:hidden"
              onClick={() => setMobileOpen(false)}
            />
            <motion.div
              initial={{ x: -280 }} animate={{ x: 0 }} exit={{ x: -280 }}
              transition={{ type: 'spring', stiffness: 320, damping: 32 }}
              className="fixed left-0 top-0 h-[100dvh] z-50 md:hidden"
            >
              <Sidebar collapsed={false} onToggle={() => setMobileOpen(false)} />
              <button
                onClick={() => setMobileOpen(false)}
                className="absolute top-4 right-4 p-1.5 rounded-lg bg-slate-800 text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      <Header
        onMenuToggle={() => {
          if (window.innerWidth < 768) setMobileOpen(v => !v)
          else handleToggle()
        }}
        collapsed={collapsed}
      />

      {/* Global search palette — mounted once, listens to Cmd+K globally */}
      <GlobalSearch />

      {/* PWA install prompt */}
      <PwaInstallBanner />
      {/* Keyboard shortcuts help modal */}
      <ShortcutsModal />

      <main
        className={cn(
          'pt-14 md:pt-16 transition-[padding] duration-300 min-h-[100dvh]',
          'pl-0 md:pl-[260px]',
          collapsed && 'md:pl-[68px]',
        )}
      >
        <OfflineBanner />
        <motion.div
          key={location.pathname}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.22, ease: 'easeOut' }}
          className="p-4 sm:p-6 md:p-8 pb-[calc(1rem+env(safe-area-inset-bottom))]"
        >
          <Outlet />
        </motion.div>
      </main>
    </div>
  )
}
