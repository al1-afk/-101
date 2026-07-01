import { useEffect, useRef, useState } from 'react'
import { setOptions, importLibrary } from '@googlemaps/js-api-loader'
import type { VehiclePosition } from '@/hooks/useVehicles'

const API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string | undefined

/* ── Cached, deduplicated loader (one promise per page load) ──── */
let _mapsPromise: Promise<void> | null = null

function loadMaps() {
  if (_mapsPromise) return _mapsPromise
  if (!API_KEY) return Promise.reject(new Error('VITE_GOOGLE_MAPS_API_KEY manquant'))
  setOptions({ key: API_KEY, v: 'weekly' })
  /* `core` carries LatLngBounds, LatLng, Settings…
     `maps` carries Map, Polyline, etc.
     `marker` carries AdvancedMarkerElement.
     Once these resolve, `google.maps.*` is fully populated globally. */
  _mapsPromise = Promise.all([
    importLibrary('core'),
    importLibrary('maps'),
    importLibrary('marker'),
  ]).then(() => undefined)
  return _mapsPromise
}

/* Default view: Oujda centre when no positions yet */
const DEFAULT_CENTER = { lat: 33.5731, lng: -7.5898 }
const DEFAULT_ZOOM   = 11

interface Trail { lat: number; lng: number }

interface Props {
  positions: VehiclePosition[]
  trail?:     Trail[]
  selectedId?: string | null
  onSelect?:  (vehicleId: string) => void
  height?:    string | number
}

export function FleetMap({ positions, trail, selectedId, onSelect, height = 480 }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef       = useRef<google.maps.Map | null>(null)
  const markersRef   = useRef<Record<string, google.maps.marker.AdvancedMarkerElement>>({})
  const trailRef     = useRef<google.maps.Polyline | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [ready, setReady] = useState(false)

  /* Init map once */
  useEffect(() => {
    if (!containerRef.current) return
    let cancelled = false

    loadMaps()
      .then(() => {
        if (cancelled || !containerRef.current) return
        mapRef.current = new google.maps.Map(containerRef.current, {
          center:    DEFAULT_CENTER,
          zoom:      DEFAULT_ZOOM,
          mapId:     'GESTIQ_FLEET',
          disableDefaultUI: false,
          zoomControl: true,
          mapTypeControl: false,
          streetViewControl: false,
          fullscreenControl: true,
        })
        setReady(true)
      })
      .catch((e) => setError(e?.message ?? 'Erreur de chargement Google Maps'))

    return () => { cancelled = true }
  }, [])

  /* Sync markers */
  useEffect(() => {
    const map = mapRef.current
    if (!map || !ready) return

    const seen = new Set<string>()

    for (const p of positions) {
      if (!p.vehicle_id || !Number.isFinite(p.lat) || !Number.isFinite(p.lng)) continue
      seen.add(p.vehicle_id)

      const isStale  = (p.seconds_ago ?? 0) > 1800   // > 30 min
      const isRecent = (p.seconds_ago ?? 0) < 300    // < 5 min
      const color = isStale ? '#ef4444' : isRecent ? '#10b981' : '#f59e0b'
      const isSelected = selectedId === p.vehicle_id

      const dot = document.createElement('div')
      dot.className = 'fleet-marker'
      dot.style.cssText = `
        width: ${isSelected ? 36 : 28}px;
        height: ${isSelected ? 36 : 28}px;
        border-radius: 9999px;
        background: ${color};
        border: 3px solid white;
        box-shadow: 0 4px 12px rgba(0,0,0,0.25), 0 0 0 ${isSelected ? '4px' : '2px'} ${color}55;
        display: flex; align-items: center; justify-content: center;
        font-size: ${isSelected ? 16 : 12}px;
        cursor: pointer;
        transform-origin: center bottom;
        transition: transform 0.15s ease;
      `
      dot.textContent = (p.immatriculation ?? '?').split('-')[0].slice(-2)
      dot.style.color = 'white'
      dot.style.fontWeight = '800'

      const existing = markersRef.current[p.vehicle_id]
      if (existing) {
        existing.position = { lat: Number(p.lat), lng: Number(p.lng) }
        existing.content  = dot
      } else {
        const marker = new google.maps.marker.AdvancedMarkerElement({
          map,
          position: { lat: Number(p.lat), lng: Number(p.lng) },
          content:  dot,
          title:    `${p.marque ?? ''} ${p.modele ?? ''} — ${p.immatriculation ?? ''}`,
        })
        marker.addListener('click', () => onSelect?.(p.vehicle_id))
        markersRef.current[p.vehicle_id] = marker
      }
    }

    /* Remove markers no longer present */
    for (const [id, m] of Object.entries(markersRef.current)) {
      if (!seen.has(id)) {
        m.map = null
        delete markersRef.current[id]
      }
    }

    /* Auto-fit when markers exist */
    if (positions.length > 0) {
      const bounds = new google.maps.LatLngBounds()
      for (const p of positions) {
        if (Number.isFinite(p.lat) && Number.isFinite(p.lng)) {
          bounds.extend({ lat: Number(p.lat), lng: Number(p.lng) })
        }
      }
      if (!bounds.isEmpty()) {
        if (positions.length === 1) {
          map.setCenter(bounds.getCenter())
          map.setZoom(15)
        } else {
          map.fitBounds(bounds, 80)
        }
      }
    }
  }, [positions, selectedId, onSelect, ready])

  /* Sync trail polyline */
  useEffect(() => {
    const map = mapRef.current
    if (!map || !ready) return
    if (trailRef.current) { trailRef.current.setMap(null); trailRef.current = null }
    if (!trail || trail.length < 2) return

    const path = trail.filter(p => Number.isFinite(p.lat) && Number.isFinite(p.lng))
    if (path.length < 2) return

    trailRef.current = new google.maps.Polyline({
      path,
      geodesic: true,
      strokeColor: '#3b82f6',
      strokeOpacity: 0.85,
      strokeWeight: 4,
      map,
    })
  }, [trail, ready])

  if (error) {
    return (
      <div className="rounded-md border border-red-200 dark:border-red-900/40 bg-red-50 dark:bg-red-950/20 p-4 text-sm text-red-700 dark:text-red-300">
        <div className="font-semibold mb-1">Carte indisponible</div>
        <div className="text-xs">{error}</div>
        <div className="text-[11px] text-red-600/80 mt-2">
          Vérifiez la clé Google Maps et les restrictions HTTP referrer.
        </div>
      </div>
    )
  }

  return (
    <div
      ref={containerRef}
      className="w-full rounded-md overflow-hidden border border-border bg-slate-100 dark:bg-slate-900"
      style={{ height }}
    />
  )
}
