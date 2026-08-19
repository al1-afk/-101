/**
 * Matrice d'Eisenhower — quatre quadrants, glisser-déposer.
 *
 * L'écran ne sert pas à ranger mais à DÉCIDER : chaque quadrant porte
 * un verbe (Faire, Planifier, Déléguer, Supprimer), pas une étiquette.
 * Déplacer une carte, c'est trancher — et ce geste est enregistré.
 *
 * Une tâche jamais classée apparaît quand même, dans le quadrant déduit
 * de sa priorité et de son échéance, signalée par un liseré : on voit
 * ainsi d'un coup d'œil ce qui a été arbitré et ce qui ne l'a pas encore
 * été, au lieu de partir d'une matrice vide que personne ne remplit.
 */
import { useRef, useState } from 'react'
import { DragDropContext, Droppable, Draggable, type DropResult } from '@hello-pangea/dnd'
import { Briefcase, Calendar, AlertTriangle, Plus, X } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import {
  QUADRANTS, QUADRANT_ORDER, quadrantOf, isSuggested, isQuadrant, type Quadrant,
} from '@/lib/eisenhower'
import type { TeamMemberTask } from '@/hooks/useTeamMemberTasks'
import type { Projet } from '@/hooks/useProjets'

export function EisenhowerMatrix({
  tasks, projets, onMove, onOpen, onAdd,
}: {
  tasks:   TeamMemberTask[]
  projets: Projet[]
  onMove:  (taskId: string, quadrant: Quadrant) => void
  onOpen:  (taskId: string) => void
  /** Crée une tâche DANS ce quadrant — le classement est alors décidé,
   *  pas déduit : on a choisi la case en y écrivant. */
  onAdd:   (quadrant: Quadrant, title: string) => Promise<unknown> | void
}) {
  /* Un seul quadrant en saisie à la fois : deux champs ouverts côte à
     côte laisseraient croire qu'on remplit une ligne, pas une case. */
  const [saisie, setSaisie] = useState<Quadrant | null>(null)
  const [titre, setTitre] = useState('')
  const [envoi, setEnvoi] = useState(false)
  const champ = useRef<HTMLInputElement>(null)

  /* Changer de case ne jette pas ce qui est en train d'être écrit : la
     saisie suit la personne dans la case qu'elle vient d'ouvrir. */
  const ouvrirSaisie = (q: Quadrant) => {
    setSaisie(q)
    requestAnimationFrame(() => champ.current?.focus())
  }

  const fermerSaisie = () => {
    setSaisie(null)
    setTitre('')
  }

  const valider = async (q: Quadrant) => {
    const t = titre.trim()
    if (!t || envoi) return
    setEnvoi(true)
    try {
      await onAdd(q, t)
      /* Le champ n'est vidé qu'une fois la tâche RÉELLEMENT créée :
         l'effacer avant ferait perdre le texte si l'écriture échoue.
         Il reste ouvert pour enchaîner les tâches d'une même case. */
      setTitre('')
      champ.current?.focus()
    } catch {
      /* La mutation a déjà signalé l'échec ; le texte reste en place. */
    } finally {
      setEnvoi(false)
    }
  }
  /* Réparti une fois par rendu : chaque tâche apparaît dans un seul
     quadrant, choisi ou déduit. */
  const parQuadrant = QUADRANT_ORDER.reduce((acc, q) => {
    acc[q] = tasks.filter(t => quadrantOf(t) === q)
    return acc
  }, {} as Record<Quadrant, TeamMemberTask[]>)

  const onDragEnd = (result: DropResult) => {
    const dest = result.destination?.droppableId
    if (!isQuadrant(dest)) return
    const task = tasks.find(t => t.id === result.draggableId)
    /* Reposer une carte dans son quadrant d'origine n'est pas une
       décision — sauf si elle n'y était que par déduction : dans ce cas
       le geste vaut confirmation, et on l'enregistre. */
    if (task && quadrantOf(task) === dest && !isSuggested(task)) return
    onMove(result.draggableId, dest)
  }

  return (
    <DragDropContext onDragEnd={onDragEnd}>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {QUADRANT_ORDER.map(q => {
          const meta = QUADRANTS[q]
          const liste = parQuadrant[q]
          return (
            <Droppable droppableId={q} key={q}>
              {(provided, snapshot) => (
                <div
                  ref={provided.innerRef}
                  {...provided.droppableProps}
                  className={cn(
                    'rounded-2xl border p-3 min-h-[150px] transition-colors',
                    meta.surface,
                    snapshot.isDraggingOver && 'ring-2 ring-offset-1 ring-blue-400',
                  )}
                >
                  <div className="flex items-baseline justify-between gap-2 mb-2">
                    <div className="min-w-0">
                      <p className="text-sm font-extrabold tracking-tight" style={{ color: meta.color }}>
                        {meta.emoji} {meta.action}
                      </p>
                      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{meta.axes}</p>
                    </div>
                    <span className="text-xs font-bold tabular-nums text-muted-foreground shrink-0">
                      {liste.length}
                    </span>
                  </div>

                  {liste.length === 0 && saisie !== q ? (
                    <p className="text-[11px] text-muted-foreground italic py-3 text-center">
                      {meta.hint}
                    </p>
                  ) : (
                    <div className="space-y-1.5">
                      {liste.map((t, i) => {
                        const projet = projets.find(p => p.id === t.project_id)
                        const suppose = isSuggested(t)
                        return (
                          <Draggable draggableId={t.id} index={i} key={t.id}>
                            {(drag, dragSnap) => (
                              <div
                                ref={drag.innerRef}
                                {...drag.draggableProps}
                                {...drag.dragHandleProps}
                                className={cn(
                                  'rounded-lg border bg-card px-2.5 py-2 cursor-grab active:cursor-grabbing',
                                  'border-border hover:border-blue-300 dark:hover:border-blue-700 transition-colors',
                                  dragSnap.isDragging && 'shadow-lg rotate-1',
                                  /* Liseré = placement déduit, pas décidé. */
                                  suppose && 'border-dashed',
                                )}
                                style={drag.draggableProps.style}
                              >
                                <button
                                  type="button"
                                  onClick={() => onOpen(t.id)}
                                  className="text-[13px] font-medium text-foreground text-left w-full truncate hover:text-blue-600 dark:hover:text-blue-400"
                                  title="Ouvrir la fiche"
                                >
                                  {t.title}
                                </button>
                                <div className="flex items-center gap-2 mt-0.5 text-[10px] text-muted-foreground flex-wrap">
                                  <span className="flex items-center gap-0.5 truncate">
                                    <Briefcase className="w-2.5 h-2.5" /> {projet ? projet.nom : 'Sans projet'}
                                  </span>
                                  {t.due_date && (
                                    <span className="flex items-center gap-0.5">
                                      <Calendar className="w-2.5 h-2.5" />
                                      {new Date(String(t.due_date).slice(0, 10) + 'T12:00')
                                        .toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}
                                      {t.due_time && ` ${String(t.due_time).slice(0, 5)}`}
                                    </span>
                                  )}
                                  {t.priority === 'urgent' && (
                                    <span className="text-red-600 dark:text-red-400 font-bold flex items-center gap-0.5">
                                      <AlertTriangle className="w-2.5 h-2.5" /> URGENT
                                    </span>
                                  )}
                                  {suppose && <span className="italic">supposé</span>}
                                </div>
                              </div>
                            )}
                          </Draggable>
                        )
                      })}
                    </div>
                  )}
                  {provided.placeholder}

                  {/* Ajouter directement dans cette case : le quadrant
                      est choisi par le geste, pas déduit après coup. */}
                  {saisie === q ? (
                    <form
                      onSubmit={e => { e.preventDefault(); valider(q) }}
                      className="mt-1.5 flex items-center gap-1"
                    >
                      <Input
                        ref={champ}
                        value={titre}
                        onChange={e => setTitre(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Escape') fermerSaisie() }}
                        disabled={envoi}
                        placeholder={`Nouvelle tâche à ${meta.action.toLowerCase()}…`}
                        className="h-7 text-[12px]"
                      />
                      <button
                        type="submit"
                        disabled={!titre.trim() || envoi}
                        className="h-7 px-2 rounded-lg text-[11px] font-semibold text-white disabled:opacity-40 shrink-0"
                        style={{ backgroundColor: meta.color }}
                      >
                        Ajouter
                      </button>
                      <button
                        type="button"
                        onClick={fermerSaisie}
                        className="p-1 rounded text-muted-foreground hover:text-foreground shrink-0"
                        title="Fermer"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </form>
                  ) : (
                    <button
                      type="button"
                      onClick={() => ouvrirSaisie(q)}
                      className="mt-1.5 w-full py-1.5 rounded-lg border border-dashed border-border text-[11px] text-muted-foreground hover:text-foreground hover:border-blue-400 transition-colors inline-flex items-center justify-center gap-1"
                    >
                      <Plus className="w-3 h-3" /> Ajouter
                    </button>
                  )}
                </div>
              )}
            </Droppable>
          )
        })}
      </div>
    </DragDropContext>
  )
}
