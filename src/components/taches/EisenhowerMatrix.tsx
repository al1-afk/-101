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
import { DragDropContext, Droppable, Draggable, type DropResult } from '@hello-pangea/dnd'
import { Briefcase, Calendar, AlertTriangle } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  QUADRANTS, QUADRANT_ORDER, quadrantOf, isSuggested, type Quadrant,
} from '@/lib/eisenhower'
import type { TeamMemberTask } from '@/hooks/useTeamMemberTasks'
import type { Projet } from '@/hooks/useProjets'

export function EisenhowerMatrix({
  tasks, projets, onMove, onOpen,
}: {
  tasks:   TeamMemberTask[]
  projets: Projet[]
  onMove:  (taskId: string, quadrant: Quadrant) => void
  onOpen:  (taskId: string) => void
}) {
  /* Réparti une fois par rendu : chaque tâche apparaît dans un seul
     quadrant, choisi ou déduit. */
  const parQuadrant = QUADRANT_ORDER.reduce((acc, q) => {
    acc[q] = tasks.filter(t => quadrantOf(t) === q)
    return acc
  }, {} as Record<Quadrant, TeamMemberTask[]>)

  const onDragEnd = (result: DropResult) => {
    const dest = result.destination?.droppableId as Quadrant | undefined
    if (!dest || !(dest in QUADRANTS)) return
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

                  {liste.length === 0 ? (
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
                </div>
              )}
            </Droppable>
          )
        })}
      </div>
    </DragDropContext>
  )
}
