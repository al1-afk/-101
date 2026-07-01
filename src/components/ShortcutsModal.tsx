import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Keyboard, X } from 'lucide-react'

const SECTIONS = [
  {
    title: 'Navigation',
    shortcuts: [
      { keys: ['G', 'D'],  desc: 'Dashboard'        },
      { keys: ['G', 'P'],  desc: 'Prospects / CRM'  },
      { keys: ['G', 'C'],  desc: 'Clients'          },
      { keys: ['G', 'F'],  desc: 'Factures'         },
      { keys: ['G', 'V'],  desc: 'Devis'            },
      { keys: ['G', 'T'],  desc: 'Tâches'           },
      { keys: ['G', 'A'],  desc: 'Cash Flow'        },
      { keys: ['G', 'S'],  desc: 'Statistiques'     },
      { keys: ['G', 'E'],  desc: 'Équipe'           },
      { keys: ['G', 'R'],  desc: 'Rapports'         },
      { keys: ['G', 'I'],  desc: 'Conseiller IA'    },
    ],
  },
  {
    title: 'Global',
    shortcuts: [
      { keys: ['⌘', 'K'],  desc: 'Recherche globale'    },
      { keys: ['?'],        desc: 'Aide raccourcis'       },
      { keys: ['Esc'],      desc: 'Fermer les modales'    },
    ],
  },
]

function Key({ children }: { children: string }) {
  return (
    <kbd className="inline-flex items-center justify-center min-w-[26px] h-[26px] px-1.5 rounded-lg
      bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600
      text-[11px] font-bold text-slate-600 dark:text-slate-300
      shadow-[0_2px_0_0_rgba(0,0,0,0.12)] dark:shadow-[0_2px_0_0_rgba(0,0,0,0.3)]">
      {children}
    </kbd>
  )
}

// Global singleton — dispatched by useKeyboardShortcuts
export const SHORTCUTS_MODAL_EVENT = 'gestiq:shortcuts-open'

export default function ShortcutsModal() {
  const [open, setOpen] = useState(false)

  useEffect(() => {
    const handler = () => setOpen(v => !v)
    window.addEventListener(SHORTCUTS_MODAL_EVENT, handler)
    return () => window.removeEventListener(SHORTCUTS_MODAL_EVENT, handler)
  }, [])

  useEffect(() => {
    if (!open) return
    const close = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    window.addEventListener('keydown', close)
    return () => window.removeEventListener('keydown', close)
  }, [open])

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-[70] bg-black/60 backdrop-blur-sm"
            onClick={() => setOpen(false)}
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.94, y: -12 }}
            animate={{ opacity: 1, scale: 1,    y: 0    }}
            exit={{    opacity: 0, scale: 0.94, y: -12  }}
            transition={{ duration: 0.18, ease: 'easeOut' }}
            className="fixed inset-0 z-[71] flex items-center justify-center p-4 pointer-events-none"
          >
            <div className="pointer-events-auto bg-white dark:bg-[#0d1829] rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-700/80 w-full max-w-lg overflow-hidden">
              {/* Header */}
              <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-800">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-blue-50 dark:bg-blue-500/10 flex items-center justify-center">
                    <Keyboard className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                  </div>
                  <div>
                    <p className="font-bold text-sm text-foreground">Raccourcis clavier</p>
                    <p className="text-[11px] text-muted-foreground">NEXT GITAL shortcuts</p>
                  </div>
                </div>
                <button onClick={() => setOpen(false)}
                  className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors">
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Content */}
              <div className="p-5 grid grid-cols-1 sm:grid-cols-2 gap-6">
                {SECTIONS.map(section => (
                  <div key={section.title}>
                    <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-3">
                      {section.title}
                    </p>
                    <div className="space-y-2">
                      {section.shortcuts.map((s, i) => (
                        <div key={i} className="flex items-center justify-between gap-4">
                          <span className="text-sm text-foreground">{s.desc}</span>
                          <div className="flex items-center gap-1 flex-shrink-0">
                            {s.keys.map((k, j) => (
                              <span key={j} className="flex items-center gap-1">
                                {j > 0 && s.keys.length > 1 && j === s.keys.length - 1 && s.keys[0] === 'G' && (
                                  <span className="text-[10px] text-muted-foreground">puis</span>
                                )}
                                <Key>{k}</Key>
                              </span>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>

              <div className="px-5 py-3 border-t border-slate-100 dark:border-slate-800 text-center">
                <p className="text-[11px] text-muted-foreground">Appuyez sur <Key>?</Key> pour ouvrir / fermer</p>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
