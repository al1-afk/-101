import { useState, useMemo, useCallback } from 'react'
import {
  DragDropContext, Droppable, Draggable,
  type DropResult,
} from '@hello-pangea/dnd'
import { Building2, Bell, Loader2, Calendar } from 'lucide-react'
import { useQueryClient } from '@tanstack/react-query'
import { formatCurrency, formatDate } from '@/lib/utils'
import { useOutboundProspects, useUpdateOutboundProspect } from '@/hooks/useOutbound'
import { OUTBOUND_STATUS, OUTBOUND_PIPELINE_STAGES, type OutboundProspect, type OutboundStatut } from '@/lib/outboundApi'
import { statusAccent, statusLabel } from './utils'

const TODAY = new Date().toISOString().slice(0, 10)

export default function OutboundPipeline() {
  const { data: prospects = [], isLoading } = useOutboundProspects({ converted: 'false' })
  const update = useUpdateOutboundProspect()
  const qc = useQueryClient()

  /* Pipeline: on affiche uniquement les statuts actifs (pas refuse/non_qualifie/converti) */
  const stagesToShow = useMemo(
    () => OUTBOUND_STATUS.filter(s => OUTBOUND_PIPELINE_STAGES.includes(s.id)),
    []
  )

  const byStage = useMemo(() => {
    const map: Record<string, OutboundProspect[]> = {}
    stagesToShow.forEach(s => { map[s.id] = [] })
    prospects.forEach(p => {
      if (map[p.statut]) map[p.statut].push(p)
    })
    return map
  }, [prospects, stagesToShow])

  const onDragEnd = useCallback((result: DropResult) => {
    const { draggableId, destination } = result
    if (!destination) return
    const newStatut = destination.droppableId as OutboundStatut
    const prospect = prospects.find(p => p.id === draggableId)
    if (!prospect || prospect.statut === newStatut) return

    /* Optimistic */
    qc.setQueriesData<OutboundProspect[]>({ queryKey: ['outbound', 'prospects'] }, old =>
      (old ?? []).map(p => p.id === draggableId ? { ...p, statut: newStatut } : p)
    )
    update.mutate({ id: draggableId, statut: newStatut })
  }, [prospects, qc, update])

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="page-header">
        <div>
          <h1 className="page-title">Pipeline Outbound</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Glissez-déposez les prospects pour changer leur statut · {prospects.length} prospects actifs
          </p>
        </div>
      </div>

      <DragDropContext onDragEnd={onDragEnd}>
        <div className="flex gap-3 overflow-x-auto pb-4" style={{ minHeight: 500 }}>
          {stagesToShow.map(stage => {
            const cards = byStage[stage.id] ?? []
            const total = cards.reduce((s, p) => s + Number(p.valeur_potentielle ?? 0), 0)
            return (
              <div
                key={stage.id}
                className="flex-shrink-0 flex flex-col rounded-xl border bg-[var(--surface-card)] overflow-hidden"
                style={{ width: 250, borderColor: 'hsl(var(--border))' }}
              >
                <div
                  className="px-3 py-2.5 border-b border-border"
                  style={{ borderTop: `3px solid ${stage.accent}` }}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-foreground">{stage.label}</span>
                    <span
                      className="text-xs font-bold px-1.5 py-0.5 rounded-full text-white"
                      style={{ backgroundColor: stage.accent }}
                    >
                      {cards.length}
                    </span>
                  </div>
                  {total > 0 && (
                    <p className="text-xs text-muted-foreground mt-0.5">{formatCurrency(total)}</p>
                  )}
                </div>

                <Droppable droppableId={stage.id}>
                  {(provided, snapshot) => (
                    <div
                      ref={provided.innerRef}
                      {...provided.droppableProps}
                      className="flex-1 p-2 space-y-2"
                      style={{
                        minHeight: 80,
                        backgroundColor: snapshot.isDraggingOver ? `${stage.accent}14` : 'transparent',
                        transition: 'background-color 180ms ease',
                      }}
                    >
                      {cards.map((p, i) => (
                        <Draggable key={p.id} draggableId={p.id} index={i}>
                          {(prov, snap) => (
                            <div
                              ref={prov.innerRef}
                              {...prov.draggableProps}
                              {...prov.dragHandleProps}
                              style={{
                                ...prov.draggableProps.style,
                                borderLeft: `3px solid ${stage.accent}`,
                              }}
                              className={`bg-[var(--surface-card)] border border-border rounded-lg p-3 select-none ${
                                snap.isDragging ? 'shadow-xl' : 'hover:shadow-md'
                              }`}
                            >
                              <p className="text-sm font-medium text-foreground leading-snug mb-1 flex items-center gap-1">
                                <Building2 className="w-3 h-3 flex-shrink-0 text-muted-foreground" />
                                {p.entreprise}
                              </p>
                              <div className="flex items-center justify-between gap-2 flex-wrap mt-2">
                                {p.valeur_potentielle > 0 && (
                                  <span className="text-xs font-semibold text-emerald-600">
                                    {formatCurrency(Number(p.valeur_potentielle))}
                                  </span>
                                )}
                                {p.date_prochaine_relance && (
                                  <span className={`text-xs flex items-center gap-0.5 ${p.date_prochaine_relance === TODAY ? 'text-amber-600' : 'text-muted-foreground'}`}>
                                    <Calendar className="w-3 h-3" />
                                    {p.date_prochaine_relance === TODAY ? 'Auj.' : formatDate(p.date_prochaine_relance)}
                                  </span>
                                )}
                              </div>
                            </div>
                          )}
                        </Draggable>
                      ))}
                      {provided.placeholder}
                    </div>
                  )}
                </Droppable>
              </div>
            )
          })}
        </div>
      </DragDropContext>
    </div>
  )
}
