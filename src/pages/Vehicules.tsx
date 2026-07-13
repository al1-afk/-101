import { useState, useMemo, useEffect, useRef } from 'react'
import {
  Plus, Search, Pencil, Trash2, Car, Truck, Bike, Fuel, Wrench, FileText,
  AlertTriangle, Gauge, X, Calendar, Eye, ImageIcon, Activity, MapPin,
  TrendingUp, Coins, Drill, ShieldCheck, Stamp, Map, Radio, RadioTower,
  Pause, Play, Navigation,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { AutocorrectInput, AutocorrectTextarea } from '@/components/ui/AutocorrectInput'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  useVehicles, useCreateVehicle, useUpdateVehicle, useDeleteVehicle,
  useVehicle, useVehicleStats,
  useAllFuelLogs, useVehicleFuel, useCreateFuelLog,
  useAllMaintenance, useVehicleMaintenance, useCreateMaintenance,
  useAllDocuments, useVehicleDocuments, useCreateDocument,
  useVehicleAlerts,
  useFleetPositions, useVehiclePositions, usePushPosition,
  type Vehicle, type VehicleType, type FuelType, type VehicleStatut,
  type MaintType, type DocType,
} from '@/hooks/useVehicles'
import { cn, formatCurrency } from '@/lib/utils'
import { FleetMap } from '@/components/FleetMap'
import { toast } from 'sonner'

/* ═══════════════════════════════════════════════════════════════
   PAGE
═══════════════════════════════════════════════════════════════ */
export default function Vehicules() {
  const { data: vehicles = [] }   = useVehicles()
  const { data: alerts }          = useVehicleAlerts()
  const alertCount = (alerts?.documents.length ?? 0) + (alerts?.maintenance.length ?? 0)

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="page-header">
        <div>
          <h1 className="page-title flex items-center gap-2">
            <Car className="w-6 h-6 text-blue-500" />
            Véhicules de service
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Parc auto, carburant, entretien et documents — tout sous contrôle.
          </p>
        </div>
        {alertCount > 0 && (
          <Badge variant="destructive" className="gap-1.5 py-1.5 px-3">
            <AlertTriangle className="w-3.5 h-3.5" />
            {alertCount} alerte{alertCount > 1 ? 's' : ''}
          </Badge>
        )}
      </div>

      {/* Quick stats */}
      <FleetStats vehicles={vehicles} />

      <Tabs defaultValue="fleet" className="space-y-4">
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="fleet"    className="gap-1.5"><Car className="w-4 h-4" /> Flotte</TabsTrigger>
          <TabsTrigger value="map"      className="gap-1.5"><Map className="w-4 h-4" /> Carte GPS</TabsTrigger>
          <TabsTrigger value="fuel"     className="gap-1.5"><Fuel className="w-4 h-4" /> Carburant</TabsTrigger>
          <TabsTrigger value="maint"    className="gap-1.5"><Wrench className="w-4 h-4" /> Entretien</TabsTrigger>
          <TabsTrigger value="docs"     className="gap-1.5"><FileText className="w-4 h-4" /> Documents</TabsTrigger>
          <TabsTrigger value="alerts"   className="gap-1.5">
            <AlertTriangle className="w-4 h-4" /> Alertes
            {alertCount > 0 && (
              <span className="ml-1 px-1.5 rounded-full bg-red-500 text-white text-[10px] font-bold">
                {alertCount}
              </span>
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="fleet"><FleetTab /></TabsContent>
        <TabsContent value="map"><MapTab /></TabsContent>
        <TabsContent value="fuel"><FuelTab /></TabsContent>
        <TabsContent value="maint"><MaintTab /></TabsContent>
        <TabsContent value="docs"><DocsTab /></TabsContent>
        <TabsContent value="alerts"><AlertsTab /></TabsContent>
      </Tabs>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════
   FLEET STATS
═══════════════════════════════════════════════════════════════ */
function FleetStats({ vehicles }: { vehicles: Vehicle[] }) {
  const actifs   = vehicles.filter(v => v.statut === 'actif').length
  const fuelCost = vehicles.reduce((s, v) => s + Number(v.fuel_month_cost ?? 0), 0)
  const maintCost = vehicles.reduce((s, v) => s + Number(v.maint_month_cost ?? 0), 0)
  const totalKm  = vehicles.reduce((s, v) => s + Number(v.kilometrage), 0)

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      <StatCard label="Véhicules actifs" value={`${actifs} / ${vehicles.length}`} icon={<Car className="w-4 h-4 text-blue-500" />} />
      <StatCard label="Km cumulés"       value={totalKm.toLocaleString('fr-FR')}  icon={<Gauge className="w-4 h-4 text-violet-500" />} />
      <StatCard label="Carburant (mois)" value={formatCurrency(fuelCost)}         icon={<Fuel className="w-4 h-4 text-amber-500" />} />
      <StatCard label="Entretien (mois)" value={formatCurrency(maintCost)}        icon={<Wrench className="w-4 h-4 text-emerald-500" />} />
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════
   FLEET TAB — vehicle cards + form
═══════════════════════════════════════════════════════════════ */
const EMPTY_VEHICLE: Partial<Vehicle> = {
  immatriculation: '', marque: '', modele: '',
  type: 'voiture', annee: new Date().getFullYear(),
  carburant_type: 'diesel', kilometrage: 0,
  statut: 'actif',
}

function FleetTab() {
  const { data: vehicles = [], isLoading } = useVehicles()
  const create = useCreateVehicle()
  const update = useUpdateVehicle()
  const remove = useDeleteVehicle()
  const [form,   setForm]   = useState<(Partial<Vehicle> & { id?: string }) | null>(null)
  const [openId, setOpenId] = useState<string | null>(null)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form) return
    if (form.id) await update.mutateAsync({ id: form.id, ...form })
    else         await create.mutateAsync(form)
    setForm(null)
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button size="sm" onClick={() => setForm({ ...EMPTY_VEHICLE })}>
          <Plus className="w-4 h-4" /> Nouveau véhicule
        </Button>
      </div>

      {isLoading ? (
        <LoadingBlock label="Chargement…" />
      ) : vehicles.length === 0 ? (
        <EmptyState icon={<Car className="w-8 h-8" />} label="Aucun véhicule">
          Ajoutez votre premier véhicule pour commencer le suivi.
        </EmptyState>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {vehicles.map(v => (
            <VehicleCard
              key={v.id} vehicle={v}
              onView={() => setOpenId(v.id)}
              onEdit={() => setForm(v)}
              onDelete={() => { if (confirm(`Supprimer ${v.marque} ${v.modele} ?`)) remove.mutate(v.id) }}
            />
          ))}
        </div>
      )}

      <VehicleFormDialog
        open={!!form}
        form={form}
        setForm={setForm}
        onSubmit={submit}
        loading={create.isPending || update.isPending}
      />

      <VehicleDetailDialog id={openId} onClose={() => setOpenId(null)} />
    </div>
  )
}

const TYPE_ICON: Record<VehicleType, React.ElementType> = {
  voiture: Car, utilitaire: Truck, fourgon: Truck,
  moto: Bike, camion: Truck, autre: Car,
}

const STATUT_COLORS: Record<VehicleStatut, string> = {
  actif:   'bg-emerald-500',
  panne:   'bg-red-500',
  vendu:   'bg-slate-400',
  reforme: 'bg-amber-500',
}

function VehicleCard({
  vehicle, onView, onEdit, onDelete,
}: {
  vehicle: Vehicle
  onView:  () => void
  onEdit:  () => void
  onDelete:() => void
}) {
  const TypeIcon = TYPE_ICON[vehicle.type] ?? Car
  const monthCost = Number(vehicle.fuel_month_cost ?? 0) + Number(vehicle.maint_month_cost ?? 0)

  return (
    <Card className="overflow-hidden flex flex-col">
      <div className="relative aspect-[16/9] bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-blue-950/40 dark:to-indigo-950/40 flex items-center justify-center">
        {vehicle.image_url ? (
          <img src={vehicle.image_url} alt={vehicle.modele} className="w-full h-full object-cover" loading="lazy" />
        ) : (
          <TypeIcon className="w-16 h-16 text-blue-400 dark:text-blue-700" />
        )}
        <Badge className={cn('absolute top-2 right-2 text-[10px]', STATUT_COLORS[vehicle.statut])}>
          {vehicle.statut}
        </Badge>
      </div>
      <div className="p-4 flex-1 flex flex-col gap-3">
        <div>
          <div className="flex items-center justify-between gap-2">
            <h3 className="font-semibold truncate">{vehicle.marque} {vehicle.modele}</h3>
            <span className="font-mono text-[10px] bg-muted px-1.5 py-0.5 rounded">{vehicle.immatriculation}</span>
          </div>
          <p className="text-xs text-muted-foreground">
            {vehicle.annee && `${vehicle.annee} · `}
            <span className="capitalize">{vehicle.type}</span>
            {' · '}
            <span className="capitalize">{vehicle.carburant_type}</span>
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
          <div className="rounded-md bg-muted/40 p-2">
            <div className="text-muted-foreground text-[10px] uppercase">Kilométrage</div>
            <div className="font-bold flex items-center gap-1"><Gauge className="w-3 h-3" />{Number(vehicle.kilometrage).toLocaleString('fr-FR')} km</div>
          </div>
          <div className="rounded-md bg-muted/40 p-2">
            <div className="text-muted-foreground text-[10px] uppercase">Coût ce mois</div>
            <div className="font-bold flex items-center gap-1"><Coins className="w-3 h-3" />{formatCurrency(monthCost)}</div>
          </div>
        </div>

        {vehicle.conducteur_principal && (
          <div className="text-xs text-muted-foreground flex items-center gap-1.5">
            <Activity className="w-3 h-3" /> {vehicle.conducteur_principal}
          </div>
        )}

        <div className="flex gap-1.5 mt-auto">
          <Button size="sm" variant="secondary" className="flex-1" onClick={onView}>
            <Eye className="w-3.5 h-3.5" /> Détails
          </Button>
          <button onClick={onEdit} className="p-2 rounded-md border border-border hover:bg-muted" title="Modifier">
            <Pencil className="w-3.5 h-3.5 text-muted-foreground" />
          </button>
          <button onClick={onDelete} className="p-2 rounded-md border border-border hover:bg-red-50 dark:hover:bg-red-950/40" title="Supprimer">
            <Trash2 className="w-3.5 h-3.5 text-red-500" />
          </button>
        </div>
      </div>
    </Card>
  )
}

function VehicleFormDialog({
  open, form, setForm, onSubmit, loading,
}: {
  open:     boolean
  form:     (Partial<Vehicle> & { id?: string }) | null
  setForm:  (f: (Partial<Vehicle> & { id?: string }) | null) => void
  onSubmit: (e: React.FormEvent) => void
  loading:  boolean
}) {
  if (!form) return null
  const set = <K extends keyof Vehicle>(k: K, v: Vehicle[K] | null) =>
    setForm({ ...form, [k]: v })

  return (
    <Dialog open={open} onOpenChange={(o) => !o && setForm(null)}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader className="relative">
          <DialogTitle>{form.id ? 'Modifier le véhicule' : 'Nouveau véhicule'}</DialogTitle>
          {/* Bouton primaire centré horizontalement dans le header */}
          <div className="absolute left-1/2 -translate-x-1/2 -top-0.5">
            <Button
              type="submit"
              form="vehicle-form"
              size="sm"
              disabled={loading}
              className="h-8 px-5 text-xs font-semibold shadow-sm"
            >
              {form.id ? '💾 Enregistrer' : '➕ Créer'}
            </Button>
          </div>
        </DialogHeader>
        <form id="vehicle-form" onSubmit={onSubmit} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field label="Immatriculation *">
              <Input value={form.immatriculation ?? ''} onChange={(e) => set('immatriculation', e.target.value)} placeholder="12345-A-67" required />
            </Field>
            <Field label="Type">
              <Select value={form.type ?? 'voiture'} onValueChange={(v) => set('type', v as VehicleType)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="voiture">Voiture</SelectItem>
                  <SelectItem value="utilitaire">Utilitaire</SelectItem>
                  <SelectItem value="fourgon">Fourgon</SelectItem>
                  <SelectItem value="moto">Moto</SelectItem>
                  <SelectItem value="camion">Camion</SelectItem>
                  <SelectItem value="autre">Autre</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field label="Marque *">
              <AutocorrectInput value={form.marque ?? ''} onChange={(e) => set('marque', e.target.value)} placeholder="Renault" required />
            </Field>
            <Field label="Modèle *">
              <AutocorrectInput value={form.modele ?? ''} onChange={(e) => set('modele', e.target.value)} placeholder="Kangoo" required />
            </Field>
            <Field label="Année">
              <Input type="number" value={form.annee ?? ''} onChange={(e) => set('annee', e.target.value ? Number(e.target.value) : null)} />
            </Field>
            <Field label="VIN (n° châssis)">
              <Input value={form.vin ?? ''} onChange={(e) => set('vin', e.target.value)} />
            </Field>
            <Field label="Carburant">
              <Select value={form.carburant_type ?? 'diesel'} onValueChange={(v) => set('carburant_type', v as FuelType)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="diesel">Diesel</SelectItem>
                  <SelectItem value="essence">Essence</SelectItem>
                  <SelectItem value="hybride">Hybride</SelectItem>
                  <SelectItem value="electrique">Électrique</SelectItem>
                  <SelectItem value="autre">Autre</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field label="Statut">
              <Select value={form.statut ?? 'actif'} onValueChange={(v) => set('statut', v as VehicleStatut)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="actif">Actif</SelectItem>
                  <SelectItem value="panne">En panne</SelectItem>
                  <SelectItem value="vendu">Vendu</SelectItem>
                  <SelectItem value="reforme">Réformé</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field label="Date d'achat">
              <Input type="date" value={form.date_achat ?? ''} onChange={(e) => set('date_achat', e.target.value)} />
            </Field>
            <Field label="Prix d'achat (MAD)">
              <Input type="number" step="0.01" value={form.prix_achat ?? ''} onChange={(e) => set('prix_achat', e.target.value ? Number(e.target.value) : null)} />
            </Field>
            <Field label="Kilométrage actuel">
              <Input type="number" value={form.kilometrage ?? 0} onChange={(e) => set('kilometrage', Number(e.target.value) || 0)} />
            </Field>
            <Field label="Conducteur principal">
              <AutocorrectInput value={form.conducteur_principal ?? ''} onChange={(e) => set('conducteur_principal', e.target.value)} />
            </Field>
            <Field label="Image URL" hint="aperçu sur la fiche">
              <Input value={form.image_url ?? ''} onChange={(e) => set('image_url', e.target.value)} placeholder="https://…" />
            </Field>
          </div>
          <Field label="Notes">
            <AutocorrectTextarea
              className="w-full min-h-[60px] rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={form.notes ?? ''}
              onChange={(e) => set('notes', e.target.value)}
            />
          </Field>
          <DialogFooter>
            <Button type="button" variant="secondary" onClick={() => setForm(null)}>Annuler</Button>
            <Button type="submit" disabled={loading}>{form.id ? 'Enregistrer' : 'Créer'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

/* ═══════════════════════════════════════════════════════════════
   VEHICLE DETAIL DIALOG (timeline + stats + quick log)
═══════════════════════════════════════════════════════════════ */
function VehicleDetailDialog({ id, onClose }: { id: string | null; onClose: () => void }) {
  const { data: vehicle }                = useVehicle(id)
  const { data: stats }                  = useVehicleStats(id)
  const { data: fuel = [] }              = useVehicleFuel(id)
  const { data: maint = [] }             = useVehicleMaintenance(id)
  const { data: docs = [] }              = useVehicleDocuments(id)

  return (
    <Dialog open={!!id} onOpenChange={(o) => !o && onClose()}>
      {id && (
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          {!vehicle ? <LoadingBlock label="Chargement…" /> : (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-3">
                  {(() => {
                    const Icon = TYPE_ICON[vehicle.type] ?? Car
                    return <Icon className="w-6 h-6 text-blue-500" />
                  })()}
                  <span>{vehicle.marque} {vehicle.modele}</span>
                  <span className="text-muted-foreground font-mono text-sm">{vehicle.immatriculation}</span>
                </DialogTitle>
              </DialogHeader>

              {/* Stats */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                <MiniStat label="Km actuel"     value={`${Number(vehicle.kilometrage).toLocaleString('fr-FR')} km`} />
                <MiniStat label="Conso. moy."   value={`${stats?.conso_l_100km ?? 0} L/100`} />
                <MiniStat label="Coût/km"       value={`${stats?.cost_per_km ?? 0} MAD`} />
                <MiniStat label="Pleins"        value={String(stats?.pleins ?? 0)} />
              </div>

              <Tabs defaultValue="fuel" className="mt-2">
                <TabsList className="flex-wrap h-auto">
                  <TabsTrigger value="fuel"  className="gap-1.5"><Fuel className="w-3.5 h-3.5" /> Carburant ({fuel.length})</TabsTrigger>
                  <TabsTrigger value="maint" className="gap-1.5"><Wrench className="w-3.5 h-3.5" /> Entretien ({maint.length})</TabsTrigger>
                  <TabsTrigger value="docs"  className="gap-1.5"><FileText className="w-3.5 h-3.5" /> Documents ({docs.length})</TabsTrigger>
                  <TabsTrigger value="gps"   className="gap-1.5"><RadioTower className="w-3.5 h-3.5" /> GPS</TabsTrigger>
                </TabsList>

                <TabsContent value="fuel" className="space-y-3 mt-3">
                  <QuickFuelForm vehicleId={vehicle.id} kmCurrent={Number(vehicle.kilometrage)} />
                  <FuelList items={fuel} />
                </TabsContent>

                <TabsContent value="maint" className="space-y-3 mt-3">
                  <QuickMaintForm vehicleId={vehicle.id} kmCurrent={Number(vehicle.kilometrage)} />
                  <MaintList items={maint} />
                </TabsContent>

                <TabsContent value="docs" className="space-y-3 mt-3">
                  <QuickDocForm vehicleId={vehicle.id} />
                  <DocsList items={docs} />
                </TabsContent>

                <TabsContent value="gps" className="space-y-3 mt-3">
                  <TrackingButton vehicleId={vehicle.id} driver={vehicle.conducteur_principal ?? undefined} />
                  <VehicleMiniMap vehicleId={vehicle.id} />
                </TabsContent>
              </Tabs>
            </>
          )}
        </DialogContent>
      )}
    </Dialog>
  )
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border p-2 text-center">
      <div className="text-[10px] uppercase text-muted-foreground tracking-wide">{label}</div>
      <div className="text-sm font-bold">{value}</div>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════
   QUICK FORMS (inside detail dialog)
═══════════════════════════════════════════════════════════════ */
function QuickFuelForm({ vehicleId, kmCurrent }: { vehicleId: string; kmCurrent: number }) {
  const create = useCreateFuelLog()
  const [km, setKm]         = useState(kmCurrent)
  const [litres, setLitres] = useState(0)
  const [prix, setPrix]     = useState(0)
  const [station, setStation] = useState('')

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!litres || !prix) return
    await create.mutateAsync({ vehicle_id: vehicleId, kilometrage: km, litres, prix_total: prix, station, is_full: true })
    setLitres(0); setPrix(0); setStation('')
  }

  return (
    <Card className="p-3 bg-amber-50/40 dark:bg-amber-950/10 border-amber-200/60 dark:border-amber-900/40">
      <form onSubmit={submit} className="grid grid-cols-2 md:grid-cols-5 gap-2 items-end">
        <Field label="Km" small>
          <Input type="number" value={km} onChange={(e) => setKm(Number(e.target.value) || 0)} className="h-8" />
        </Field>
        <Field label="Litres" small>
          <Input type="number" step="0.01" value={litres} onChange={(e) => setLitres(Number(e.target.value) || 0)} className="h-8" required />
        </Field>
        <Field label="Total MAD" small>
          <Input type="number" step="0.01" value={prix} onChange={(e) => setPrix(Number(e.target.value) || 0)} className="h-8" required />
        </Field>
        <Field label="Station" small>
          <AutocorrectInput value={station} onChange={(e) => setStation(e.target.value)} className="h-8" placeholder="Afriquia…" />
        </Field>
        <Button type="submit" size="sm" disabled={create.isPending} className="h-8">
          <Plus className="w-3.5 h-3.5" /> Plein
        </Button>
      </form>
    </Card>
  )
}

function FuelList({ items }: { items: ReturnType<typeof useVehicleFuel>['data'] extends infer T ? T extends Array<infer U> ? U[] : never : never }) {
  if (!items || items.length === 0) {
    return <div className="text-xs text-muted-foreground italic text-center py-4">Aucun plein enregistré</div>
  }
  return (
    <div className="rounded-md border border-border overflow-hidden">
      <table className="w-full text-xs">
        <thead className="bg-muted/40 text-[10px] uppercase">
          <tr>
            <th className="text-left px-2 py-1.5">Date</th>
            <th className="text-right px-2 py-1.5">Km</th>
            <th className="text-right px-2 py-1.5">L</th>
            <th className="text-right px-2 py-1.5">Total</th>
            <th className="text-right px-2 py-1.5">PU</th>
            <th className="text-left px-2 py-1.5">Station</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {items.map(f => (
            <tr key={f.id}>
              <td className="px-2 py-1.5 whitespace-nowrap">{new Date(f.date).toLocaleDateString('fr-FR')}</td>
              <td className="px-2 py-1.5 text-right">{Number(f.kilometrage).toLocaleString('fr-FR')}</td>
              <td className="px-2 py-1.5 text-right">{Number(f.litres).toFixed(2)}</td>
              <td className="px-2 py-1.5 text-right font-semibold">{formatCurrency(Number(f.prix_total))}</td>
              <td className="px-2 py-1.5 text-right text-muted-foreground">{Number(f.prix_litre).toFixed(3)}</td>
              <td className="px-2 py-1.5 text-muted-foreground truncate max-w-[120px]">{f.station ?? '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function QuickMaintForm({ vehicleId, kmCurrent }: { vehicleId: string; kmCurrent: number }) {
  const create = useCreateMaintenance()
  const [type, setType]     = useState<MaintType>('vidange')
  const [desc, setDesc]     = useState('')
  const [montant, setMontant] = useState(0)
  const [garage, setGarage] = useState('')
  const [proxKm, setProxKm] = useState<number | null>(null)
  const [proxDate, setProxDate] = useState('')

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!desc) return
    await create.mutateAsync({
      vehicle_id: vehicleId, type, description: desc,
      montant, garage, kilometrage: kmCurrent,
      prochaine_km: proxKm, prochaine_date: proxDate || null,
    } as any)
    setDesc(''); setMontant(0); setGarage(''); setProxKm(null); setProxDate('')
  }

  return (
    <Card className="p-3 bg-emerald-50/40 dark:bg-emerald-950/10 border-emerald-200/60 dark:border-emerald-900/40">
      <form onSubmit={submit} className="space-y-2">
        <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
          <Field label="Type" small>
            <Select value={type} onValueChange={(v) => setType(v as MaintType)}>
              <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="vidange">Vidange</SelectItem>
                <SelectItem value="revision">Révision</SelectItem>
                <SelectItem value="reparation">Réparation</SelectItem>
                <SelectItem value="pneus">Pneus</SelectItem>
                <SelectItem value="freins">Freins</SelectItem>
                <SelectItem value="batterie">Batterie</SelectItem>
                <SelectItem value="autre">Autre</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field label="Montant MAD" small>
            <Input type="number" step="0.01" value={montant} onChange={(e) => setMontant(Number(e.target.value) || 0)} className="h-8" />
          </Field>
          <Field label="Garage" small>
            <AutocorrectInput value={garage} onChange={(e) => setGarage(e.target.value)} className="h-8" />
          </Field>
        </div>
        <Field label="Description" small>
          <AutocorrectInput value={desc} onChange={(e) => setDesc(e.target.value)} className="h-8" placeholder="Vidange + filtres" required />
        </Field>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <Field label="Prochain km" small>
            <Input type="number" value={proxKm ?? ''} onChange={(e) => setProxKm(e.target.value ? Number(e.target.value) : null)} className="h-8" placeholder={`${kmCurrent + 10000}`} />
          </Field>
          <Field label="Prochaine date" small>
            <Input type="date" value={proxDate} onChange={(e) => setProxDate(e.target.value)} className="h-8" />
          </Field>
        </div>
        <Button type="submit" size="sm" disabled={create.isPending}>
          <Plus className="w-3.5 h-3.5" /> Ajouter intervention
        </Button>
      </form>
    </Card>
  )
}

function MaintList({ items }: { items: ReturnType<typeof useVehicleMaintenance>['data'] extends infer T ? T extends Array<infer U> ? U[] : never : never }) {
  if (!items || items.length === 0) {
    return <div className="text-xs text-muted-foreground italic text-center py-4">Aucune intervention</div>
  }
  return (
    <div className="space-y-2">
      {items.map(m => (
        <Card key={m.id} className="p-3 flex items-start gap-3">
          <div className="w-9 h-9 rounded-md bg-emerald-100 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 flex items-center justify-center flex-shrink-0">
            <Drill className="w-4 h-4" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-medium text-sm">{m.description}</span>
              <Badge variant="outline" className="text-[10px] capitalize">{m.type}</Badge>
            </div>
            <div className="text-xs text-muted-foreground mt-0.5">
              {new Date(m.date).toLocaleDateString('fr-FR')}
              {m.garage && ` · ${m.garage}`}
              {m.kilometrage && ` · ${Number(m.kilometrage).toLocaleString('fr-FR')} km`}
            </div>
            {(m.prochaine_date || m.prochaine_km) && (
              <div className="text-[10px] text-amber-700 dark:text-amber-400 mt-0.5 flex items-center gap-1">
                <Calendar className="w-3 h-3" />
                Prochain: {m.prochaine_date ? new Date(m.prochaine_date).toLocaleDateString('fr-FR') : ''}
                {m.prochaine_km ? ` / ${Number(m.prochaine_km).toLocaleString('fr-FR')} km` : ''}
              </div>
            )}
          </div>
          <div className="text-sm font-bold text-emerald-600">{formatCurrency(Number(m.montant))}</div>
        </Card>
      ))}
    </div>
  )
}

function QuickDocForm({ vehicleId }: { vehicleId: string }) {
  const create = useCreateDocument()
  const [type, setType]   = useState<DocType>('assurance')
  const [emetteur, setEmetteur] = useState('')
  const [numero, setNumero] = useState('')
  const [debut, setDebut]   = useState('')
  const [fin, setFin]       = useState('')
  const [montant, setMontant] = useState<number | null>(null)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!fin) return
    await create.mutateAsync({
      vehicle_id: vehicleId, type, emetteur, numero,
      date_debut: debut || null, date_fin: fin, montant,
    } as any)
    setEmetteur(''); setNumero(''); setDebut(''); setFin(''); setMontant(null)
  }

  return (
    <Card className="p-3 bg-blue-50/40 dark:bg-blue-950/10 border-blue-200/60 dark:border-blue-900/40">
      <form onSubmit={submit} className="space-y-2">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          <Field label="Type" small>
            <Select value={type} onValueChange={(v) => setType(v as DocType)}>
              <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="assurance">Assurance</SelectItem>
                <SelectItem value="visite_technique">Visite technique</SelectItem>
                <SelectItem value="vignette">Vignette</SelectItem>
                <SelectItem value="carte_grise">Carte grise</SelectItem>
                <SelectItem value="autre">Autre</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field label="Émetteur" small>
            <AutocorrectInput value={emetteur} onChange={(e) => setEmetteur(e.target.value)} className="h-8" placeholder="Atlanta…" />
          </Field>
          <Field label="N°" small>
            <Input value={numero} onChange={(e) => setNumero(e.target.value)} className="h-8" />
          </Field>
          <Field label="Montant" small>
            <Input type="number" step="0.01" value={montant ?? ''} onChange={(e) => setMontant(e.target.value ? Number(e.target.value) : null)} className="h-8" />
          </Field>
          <Field label="Début" small>
            <Input type="date" value={debut} onChange={(e) => setDebut(e.target.value)} className="h-8" />
          </Field>
          <Field label="Échéance *" small>
            <Input type="date" value={fin} onChange={(e) => setFin(e.target.value)} className="h-8" required />
          </Field>
        </div>
        <Button type="submit" size="sm" disabled={create.isPending}>
          <Plus className="w-3.5 h-3.5" /> Ajouter document
        </Button>
      </form>
    </Card>
  )
}

const DOC_ICON: Record<DocType, React.ElementType> = {
  assurance:        ShieldCheck,
  visite_technique: Drill,
  vignette:         Stamp,
  carte_grise:      FileText,
  autre:            FileText,
}

const DOC_LABEL: Record<DocType, string> = {
  assurance:        'Assurance',
  visite_technique: 'Visite technique',
  vignette:         'Vignette',
  carte_grise:      'Carte grise',
  autre:            'Autre',
}

function DocsList({ items }: { items: ReturnType<typeof useVehicleDocuments>['data'] extends infer T ? T extends Array<infer U> ? U[] : never : never }) {
  if (!items || items.length === 0) {
    return <div className="text-xs text-muted-foreground italic text-center py-4">Aucun document</div>
  }
  return (
    <div className="space-y-2">
      {items.map(d => {
        const Icon = DOC_ICON[d.type] ?? FileText
        const days = Number(d.days_left ?? 0)
        const expired = days < 0
        const soon    = !expired && days <= 30
        return (
          <Card key={d.id} className={cn(
            'p-3 flex items-start gap-3 border-l-4',
            expired ? 'border-l-red-500' : soon ? 'border-l-amber-500' : 'border-l-emerald-500',
          )}>
            <div className={cn(
              'w-9 h-9 rounded-md flex items-center justify-center flex-shrink-0',
              expired ? 'bg-red-100 text-red-600 dark:bg-red-950/40 dark:text-red-400' :
              soon    ? 'bg-amber-100 text-amber-600 dark:bg-amber-950/40 dark:text-amber-400' :
                        'bg-emerald-100 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400',
            )}>
              <Icon className="w-4 h-4" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-medium text-sm">{DOC_LABEL[d.type]}</span>
                {d.numero && <span className="text-[10px] font-mono text-muted-foreground">{d.numero}</span>}
              </div>
              <div className="text-xs text-muted-foreground mt-0.5">
                {d.emetteur ?? '—'}
                {d.date_debut && ` · du ${new Date(d.date_debut).toLocaleDateString('fr-FR')}`}
                {' au '}
                <strong>{new Date(d.date_fin).toLocaleDateString('fr-FR')}</strong>
              </div>
              <div className={cn(
                'text-[11px] mt-0.5 font-semibold',
                expired ? 'text-red-600' : soon ? 'text-amber-600' : 'text-emerald-600',
              )}>
                {expired ? `Expiré depuis ${Math.abs(days)} j` : `Encore ${days} j`}
              </div>
            </div>
            {d.montant != null && (
              <div className="text-sm font-bold">{formatCurrency(Number(d.montant))}</div>
            )}
          </Card>
        )
      })}
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════
   FUEL TAB (all vehicles)
═══════════════════════════════════════════════════════════════ */
function FuelTab() {
  const { data: items = [], isLoading } = useAllFuelLogs()
  const totalCost   = items.reduce((s, f) => s + Number(f.prix_total), 0)
  const totalLitres = items.reduce((s, f) => s + Number(f.litres), 0)

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <StatCard label="Pleins"        value={items.length} icon={<Fuel className="w-4 h-4 text-amber-500" />} />
        <StatCard label="Litres totaux" value={`${totalLitres.toFixed(0)} L`} icon={<TrendingUp className="w-4 h-4 text-blue-500" />} />
        <StatCard label="Coût total"    value={formatCurrency(totalCost)} icon={<Coins className="w-4 h-4 text-emerald-500" />} />
      </div>
      {isLoading ? (
        <LoadingBlock label="Chargement…" />
      ) : items.length === 0 ? (
        <EmptyState icon={<Fuel className="w-8 h-8" />} label="Aucun plein">
          Ouvrez un véhicule pour enregistrer un plein.
        </EmptyState>
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="text-left px-3 py-2">Date</th>
                  <th className="text-left px-3 py-2">Véhicule</th>
                  <th className="text-right px-3 py-2">Km</th>
                  <th className="text-right px-3 py-2">Litres</th>
                  <th className="text-right px-3 py-2">Total</th>
                  <th className="text-right px-3 py-2">PU</th>
                  <th className="text-left px-3 py-2">Station</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {items.map(f => (
                  <tr key={f.id} className="hover:bg-muted/30">
                    <td className="px-3 py-2 text-xs whitespace-nowrap">{new Date(f.date).toLocaleDateString('fr-FR')}</td>
                    <td className="px-3 py-2">
                      <div className="font-medium text-xs">{f.marque} {f.modele}</div>
                      <div className="font-mono text-[10px] text-muted-foreground">{f.immatriculation}</div>
                    </td>
                    <td className="px-3 py-2 text-right">{Number(f.kilometrage).toLocaleString('fr-FR')}</td>
                    <td className="px-3 py-2 text-right">{Number(f.litres).toFixed(2)}</td>
                    <td className="px-3 py-2 text-right font-semibold">{formatCurrency(Number(f.prix_total))}</td>
                    <td className="px-3 py-2 text-right text-xs text-muted-foreground">{Number(f.prix_litre).toFixed(3)}</td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">{f.station ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════
   MAINT TAB
═══════════════════════════════════════════════════════════════ */
function MaintTab() {
  const { data: items = [], isLoading } = useAllMaintenance()
  const totalCost = items.reduce((s, m) => s + Number(m.montant), 0)

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-2 gap-3">
        <StatCard label="Interventions" value={items.length} icon={<Wrench className="w-4 h-4 text-emerald-500" />} />
        <StatCard label="Coût total"    value={formatCurrency(totalCost)} icon={<Coins className="w-4 h-4 text-emerald-500" />} />
      </div>
      {isLoading ? (
        <LoadingBlock label="Chargement…" />
      ) : items.length === 0 ? (
        <EmptyState icon={<Wrench className="w-8 h-8" />} label="Aucune intervention">
          L'historique d'entretien apparaîtra ici.
        </EmptyState>
      ) : (
        <div className="space-y-2">
          {items.map(m => (
            <Card key={m.id} className="p-3 flex items-start gap-3">
              <div className="w-9 h-9 rounded-md bg-emerald-100 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 flex items-center justify-center flex-shrink-0">
                <Drill className="w-4 h-4" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium text-sm">{m.description}</span>
                  <Badge variant="outline" className="text-[10px] capitalize">{m.type}</Badge>
                </div>
                <div className="text-xs text-muted-foreground mt-0.5">
                  {new Date(m.date).toLocaleDateString('fr-FR')} · {m.marque} {m.modele} ({m.immatriculation})
                  {m.garage && ` · ${m.garage}`}
                </div>
              </div>
              <div className="text-sm font-bold text-emerald-600 whitespace-nowrap">{formatCurrency(Number(m.montant))}</div>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════
   DOCS TAB
═══════════════════════════════════════════════════════════════ */
function DocsTab() {
  const { data: items = [], isLoading } = useAllDocuments()
  if (isLoading) return <LoadingBlock label="Chargement…" />
  if (items.length === 0) {
    return <EmptyState icon={<FileText className="w-8 h-8" />} label="Aucun document">
      Ajoutez les assurances et vignettes via la fiche véhicule.
    </EmptyState>
  }
  return (
    <div className="space-y-2">
      {items.map(d => {
        const Icon = DOC_ICON[d.type] ?? FileText
        const days = Number(d.days_left ?? 0)
        const expired = days < 0
        const soon    = !expired && days <= 30
        return (
          <Card key={d.id} className={cn(
            'p-3 flex items-start gap-3 border-l-4',
            expired ? 'border-l-red-500' : soon ? 'border-l-amber-500' : 'border-l-emerald-500',
          )}>
            <div className={cn(
              'w-9 h-9 rounded-md flex items-center justify-center flex-shrink-0',
              expired ? 'bg-red-100 text-red-600 dark:bg-red-950/40 dark:text-red-400' :
              soon    ? 'bg-amber-100 text-amber-600 dark:bg-amber-950/40 dark:text-amber-400' :
                        'bg-emerald-100 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400',
            )}>
              <Icon className="w-4 h-4" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-medium text-sm">{DOC_LABEL[d.type]}</span>
                <span className="font-mono text-[10px] bg-muted px-1.5 rounded">{d.immatriculation}</span>
              </div>
              <div className="text-xs text-muted-foreground mt-0.5">
                {d.marque} {d.modele} · {d.emetteur ?? '—'}
                {' · échéance '}<strong>{new Date(d.date_fin).toLocaleDateString('fr-FR')}</strong>
              </div>
              <div className={cn(
                'text-[11px] mt-0.5 font-semibold',
                expired ? 'text-red-600' : soon ? 'text-amber-600' : 'text-emerald-600',
              )}>
                {expired ? `⚠ Expiré depuis ${Math.abs(days)} j` : `Encore ${days} j`}
              </div>
            </div>
            {d.montant != null && (
              <div className="text-sm font-bold whitespace-nowrap">{formatCurrency(Number(d.montant))}</div>
            )}
          </Card>
        )
      })}
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════
   ALERTS TAB
═══════════════════════════════════════════════════════════════ */
function AlertsTab() {
  const { data: alerts, isLoading } = useVehicleAlerts()
  if (isLoading) return <LoadingBlock label="Chargement…" />
  const docs  = alerts?.documents ?? []
  const maint = alerts?.maintenance ?? []
  if (docs.length === 0 && maint.length === 0) {
    return <EmptyState icon={<ShieldCheck className="w-8 h-8 text-emerald-500" />} label="Aucune alerte">
      Tous les documents sont à jour et l'entretien est planifié.
    </EmptyState>
  }
  return (
    <div className="space-y-4">
      {docs.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-semibold text-muted-foreground">Documents</h3>
          {docs.map(d => {
            const Icon = DOC_ICON[d.type as DocType] ?? FileText
            const days = Number(d.days_left ?? 0)
            const expired = days < 0
            return (
              <Card key={d.id} className={cn('p-3 flex items-start gap-3 border-l-4',
                expired ? 'border-l-red-500' : 'border-l-amber-500')}>
                <div className={cn('w-9 h-9 rounded-md flex items-center justify-center flex-shrink-0',
                  expired ? 'bg-red-100 text-red-600' : 'bg-amber-100 text-amber-600')}>
                  <Icon className="w-4 h-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-sm">{DOC_LABEL[d.type as DocType]} · {d.marque} {d.modele}</div>
                  <div className="text-xs text-muted-foreground">{d.immatriculation} · échéance {new Date(d.date_fin).toLocaleDateString('fr-FR')}</div>
                </div>
                <div className={cn('text-sm font-bold whitespace-nowrap',
                  expired ? 'text-red-600' : 'text-amber-600')}>
                  {expired ? `Expiré ${Math.abs(days)}j` : `${days}j`}
                </div>
              </Card>
            )
          })}
        </div>
      )}

      {maint.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-semibold text-muted-foreground">Entretien à prévoir</h3>
          {maint.map(m => {
            const days = m.days_left
            const km   = m.km_left
            const expired = (days != null && days < 0) || (km != null && km < 0)
            return (
              <Card key={m.id} className={cn('p-3 flex items-start gap-3 border-l-4',
                expired ? 'border-l-red-500' : 'border-l-amber-500')}>
                <div className={cn('w-9 h-9 rounded-md flex items-center justify-center flex-shrink-0',
                  expired ? 'bg-red-100 text-red-600' : 'bg-amber-100 text-amber-600')}>
                  <Wrench className="w-4 h-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-sm">{m.description}</div>
                  <div className="text-xs text-muted-foreground">{m.marque} {m.modele} · {m.immatriculation}</div>
                </div>
                <div className={cn('text-xs font-semibold whitespace-nowrap text-right',
                  expired ? 'text-red-600' : 'text-amber-600')}>
                  {days != null && <div>{days < 0 ? `Retard ${Math.abs(days)}j` : `${days}j`}</div>}
                  {km != null && <div>{km < 0 ? `Retard ${Math.abs(km)}km` : `${km}km`}</div>}
                </div>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════
   MAP TAB — fleet live map (Google Maps)
═══════════════════════════════════════════════════════════════ */
function MapTab() {
  const { data: positions = [], isFetching } = useFleetPositions(15_000)
  const { data: vehicles = [] } = useVehicles()
  const [selected, setSelected] = useState<string | null>(null)
  const { data: trail = [] } = useVehiclePositions(
    selected,
    new Date(Date.now() - 24 * 3600 * 1000).toISOString(),
  )

  const noPositions = positions.length === 0

  const recent = positions.filter(p => (p.seconds_ago ?? 0) < 300).length
  const stale  = positions.filter(p => (p.seconds_ago ?? 0) > 1800).length

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="Véhicules tracés" value={`${positions.length} / ${vehicles.length}`} icon={<RadioTower className="w-4 h-4 text-blue-500" />} />
        <StatCard label="Positions récentes" value={recent} icon={<Radio className="w-4 h-4 text-emerald-500" />} />
        <StatCard label="Inactifs (>30 min)" value={stale} icon={<Activity className="w-4 h-4 text-red-500" />} />
        <StatCard label={isFetching ? 'Actualisation…' : 'Auto-refresh'} value={isFetching ? '⟳' : '15 s'} icon={<Navigation className="w-4 h-4 text-violet-500" />} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-4">
        <FleetMap
          positions={positions as any}
          trail={selected ? (trail.map(p => ({ lat: Number(p.lat), lng: Number(p.lng) }))) : undefined}
          selectedId={selected}
          onSelect={setSelected}
          height={520}
        />

        <Card className="p-3 max-h-[520px] overflow-y-auto">
          <div className="text-xs font-semibold text-muted-foreground uppercase mb-2 flex items-center gap-1.5">
            <Car className="w-3.5 h-3.5" /> Flotte ({positions.length})
          </div>
          {noPositions ? (
            <div className="text-xs text-muted-foreground italic py-4 text-center">
              Aucune position GPS encore enregistrée. <br />
              Activez le suivi depuis la fiche véhicule.
            </div>
          ) : (
            <div className="space-y-1.5">
              {positions.map(p => {
                const ago = p.seconds_ago ?? 0
                const color = ago > 1800 ? 'text-red-600' : ago < 300 ? 'text-emerald-600' : 'text-amber-600'
                return (
                  <button
                    key={p.vehicle_id}
                    onClick={() => setSelected(p.vehicle_id === selected ? null : p.vehicle_id)}
                    className={cn(
                      'w-full text-left p-2 rounded-md border transition-colors',
                      selected === p.vehicle_id
                        ? 'border-blue-400 bg-blue-50 dark:bg-blue-950/30'
                        : 'border-border hover:border-blue-300 hover:bg-muted/30',
                    )}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold truncate">{p.marque} {p.modele}</span>
                      <span className={cn('w-2 h-2 rounded-full', ago > 1800 ? 'bg-red-500' : ago < 300 ? 'bg-emerald-500' : 'bg-amber-500')} />
                    </div>
                    <div className="text-[10px] font-mono text-muted-foreground">{p.immatriculation}</div>
                    <div className={cn('text-[10px] font-medium mt-0.5', color)}>
                      {ago < 60   ? `${ago}s` :
                       ago < 3600 ? `${Math.floor(ago/60)} min` :
                                    `${Math.floor(ago/3600)}h ${Math.floor((ago%3600)/60)}min`} ago
                    </div>
                    {p.driver && (
                      <div className="text-[10px] text-muted-foreground truncate">{p.driver}</div>
                    )}
                  </button>
                )
              })}
            </div>
          )}
        </Card>
      </div>

      {selected && (
        <div className="text-xs text-muted-foreground">
          📍 Trajectoire des dernières 24h affichée en bleu. Cliquez à nouveau le véhicule pour masquer.
        </div>
      )}
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════
   VEHICLE MINI MAP — inside detail dialog (last position + trail)
═══════════════════════════════════════════════════════════════ */
function VehicleMiniMap({ vehicleId }: { vehicleId: string }) {
  const { data: history = [] } = useVehiclePositions(
    vehicleId,
    new Date(Date.now() - 24 * 3600 * 1000).toISOString(),
  )

  const positions = useMemo(() => {
    if (history.length === 0) return []
    const last = history[0]
    return [{
      vehicle_id: vehicleId,
      lat:        Number(last.lat),
      lng:        Number(last.lng),
      recorded_at: last.recorded_at,
      seconds_ago: Math.floor((Date.now() - new Date(last.recorded_at).getTime()) / 1000),
    } as any]
  }, [history, vehicleId])

  if (history.length === 0) {
    return (
      <div className="rounded-md border border-dashed border-border bg-muted/30 p-6 text-center">
        <MapPin className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
        <div className="text-sm font-semibold">Aucune position enregistrée</div>
        <p className="text-xs text-muted-foreground mt-1">
          Démarrez le suivi ci-dessus pour voir le véhicule sur la carte.
        </p>
      </div>
    )
  }

  return (
    <FleetMap
      positions={positions}
      trail={history.map(p => ({ lat: Number(p.lat), lng: Number(p.lng) }))}
      height={320}
    />
  )
}

/* ═══════════════════════════════════════════════════════════════
   TRACKING BUTTON — uses navigator.geolocation
═══════════════════════════════════════════════════════════════ */
function TrackingButton({ vehicleId, driver }: { vehicleId: string; driver?: string }) {
  const push = usePushPosition()
  const watchRef    = useRef<number | null>(null)
  const intervalRef = useRef<number | null>(null)
  const [tracking, setTracking] = useState(false)
  const [lastPos, setLastPos]   = useState<{ lat: number; lng: number; accuracy: number } | null>(null)

  const stop = () => {
    if (watchRef.current != null) {
      navigator.geolocation.clearWatch(watchRef.current)
      watchRef.current = null
    }
    if (intervalRef.current != null) {
      window.clearInterval(intervalRef.current)
      intervalRef.current = null
    }
    setTracking(false)
  }

  useEffect(() => () => stop(), [])

  const start = () => {
    if (!('geolocation' in navigator)) {
      toast.error('Géolocalisation non disponible sur ce navigateur')
      return
    }

    let lastSentAt = 0
    let latest: GeolocationPosition | null = null

    watchRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        latest = pos
        setLastPos({ lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy })
      },
      (err) => {
        toast.error(`GPS: ${err.message}`)
        stop()
      },
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 },
    )

    /* Push every 20s when we have a fresh position */
    intervalRef.current = window.setInterval(() => {
      if (!latest) return
      const now = Date.now()
      if (now - lastSentAt < 19_000) return
      lastSentAt = now
      push.mutate({
        vehicle_id: vehicleId,
        lat:        latest.coords.latitude,
        lng:        latest.coords.longitude,
        accuracy:   latest.coords.accuracy ?? null,
        speed:      latest.coords.speed != null ? latest.coords.speed * 3.6 : null,  // m/s → km/h
        heading:    latest.coords.heading ?? null,
        altitude:   latest.coords.altitude ?? null,
        source:     'browser',
        driver:     driver ?? null,
        recorded_at: new Date(latest.timestamp).toISOString(),
      })
    }, 5_000)

    setTracking(true)
    toast.success('Suivi GPS activé — votre position est envoyée toutes les 20s')
  }

  return (
    <Card className={cn(
      'p-3 flex items-center gap-3',
      tracking ? 'bg-emerald-50/50 dark:bg-emerald-950/20 border-emerald-200/60 dark:border-emerald-900/40'
               : 'bg-blue-50/30 dark:bg-blue-950/10 border-blue-200/60 dark:border-blue-900/40'
    )}>
      <div className={cn(
        'w-9 h-9 rounded-md flex items-center justify-center flex-shrink-0',
        tracking ? 'bg-emerald-500 text-white animate-pulse' : 'bg-blue-100 text-blue-600 dark:bg-blue-950/40 dark:text-blue-400'
      )}>
        <RadioTower className="w-4 h-4" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="font-medium text-sm">
          {tracking ? 'Suivi GPS actif' : 'Suivi GPS désactivé'}
        </div>
        <div className="text-[11px] text-muted-foreground">
          {tracking
            ? lastPos
                ? `📍 ${lastPos.lat.toFixed(5)}, ${lastPos.lng.toFixed(5)} (±${Math.round(lastPos.accuracy)}m)`
                : 'En attente de la première position…'
            : 'Active la géolocalisation du navigateur et envoie la position toutes les 20s'}
        </div>
      </div>
      <Button
        size="sm"
        variant={tracking ? 'destructive' : 'default'}
        onClick={tracking ? stop : start}
      >
        {tracking ? <><Pause className="w-3.5 h-3.5" /> Arrêter</> : <><Play className="w-3.5 h-3.5" /> Démarrer</>}
      </Button>
    </Card>
  )
}

/* ═══════════════════════════════════════════════════════════════
   Shared bits
═══════════════════════════════════════════════════════════════ */
function Field({ label, hint, small, children }: { label: string; hint?: string; small?: boolean; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <label className={cn('font-medium text-muted-foreground flex items-center gap-2',
        small ? 'text-[10px]' : 'text-xs')}>
        {label}
        {hint && <span className="italic text-muted-foreground/70">— {hint}</span>}
      </label>
      {children}
    </div>
  )
}

function StatCard({ label, value, icon }: { label: string; value: React.ReactNode; icon: React.ReactNode }) {
  return (
    <Card className="p-4">
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">{label}</span>
        <span>{icon}</span>
      </div>
      <div className="text-xl font-bold mt-1">{value}</div>
    </Card>
  )
}

function LoadingBlock({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-3 text-sm text-muted-foreground py-10 justify-center">
      <div className="w-5 h-5 rounded-full border-2 border-blue-500 border-t-transparent animate-spin" />
      {label}
    </div>
  )
}

function EmptyState({ icon, label, children }: { icon: React.ReactNode; label: string; children?: React.ReactNode }) {
  return (
    <Card className="p-10 text-center">
      <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-muted mb-3 text-muted-foreground">{icon}</div>
      <h3 className="font-semibold">{label}</h3>
      {children && <p className="text-sm text-muted-foreground mt-1 max-w-md mx-auto">{children}</p>}
    </Card>
  )
}
