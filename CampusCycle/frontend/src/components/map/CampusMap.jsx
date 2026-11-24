import { useEffect, useMemo, useRef, useState } from 'react';
import {
  MapContainer,
  ImageOverlay,
  Marker,
  Polyline,
  Tooltip,
  useMapEvents,
} from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Minus, Plus, RotateCcw } from 'lucide-react';
import { AVAILABILITY_STYLE } from '../../utils/domain';
import { cn } from '../../utils/format';

/**
 * Interactive campus map drawn on the supplied illustrated campus map.
 *
 * The artwork is NOT a georeferenced image, so this deliberately does not use
 * latitude/longitude. Leaflet runs in its non-geographic CRS.Simple mode with
 * the image as the only layer, and every position (stations, route vertices)
 * is a percentage of the image width/height — exactly what the backend
 * stores in stations.map_x / map_y. Markers therefore stay on their building
 * at any container size and zoom level.
 *
 * Layer order (bottom -> top): map image, road overlay, route, markers.
 */

const FALLBACK_IMAGE = { url: '/images/campus-map.png', width: 1280, height: 720 };

/** percent (0–100) -> Leaflet [lat, lng] in CRS.Simple image units. */
export function toLatLng(x, y, image = FALLBACK_IMAGE) {
  return [image.height * (1 - y / 100), (image.width * x) / 100];
}

/** Leaflet latlng -> percent, clamped to the image. */
export function toPercent(latlng, image = FALLBACK_IMAGE) {
  const clamp = (v) => Math.min(100, Math.max(0, Math.round(v * 1000) / 1000));
  return {
    x: clamp((latlng.lng / image.width) * 100),
    y: clamp((1 - latlng.lat / image.height) * 100),
  };
}

function markerIcon(station, { selected, tag, dimmed, size }) {
  const style = AVAILABILITY_STYLE[station.availability_level] || AVAILABILITY_STYLE.INACTIVE;
  const label = station.availability_level === 'INACTIVE' ? '–' : String(station.available_count);
  const px = selected ? size + 8 : size;
  const tagHtml = tag
    ? `<span class="cc-marker-tag ${tag === 'B' ? 'is-end' : ''}">${tag}</span>`
    : '';
  return L.divIcon({
    className: '',
    html: `<div class="cc-marker ${selected ? 'is-selected' : ''} ${dimmed ? 'is-dimmed' : ''}" style="--c:${style.dot}">
             <span class="cc-marker-dot">${label}</span>${tagHtml}
           </div>`,
    iconSize: [px, px],
    iconAnchor: [px / 2, px / 2],
    tooltipAnchor: [0, -px / 2 - 2],
  });
}

const PIN_ICON = L.divIcon({
  className: '',
  html: '<div class="cc-marker-pin"></div>',
  iconSize: [18, 18],
  iconAnchor: [9, 9],
});

function MapClicks({ onClick }) {
  useMapEvents({
    click(e) {
      onClick?.(e.latlng);
    },
  });
  return null;
}

export default function CampusMap({
  map: mapConfig,
  stations = [],
  selectedId = null,
  onSelect,
  route = null, // { path: [[x,y],...], from: {id}, to: {id} }
  showRoads = false,
  editable = null, // { stationId, onMove(x, y) } — admin placement
  draftPin = null, // { x, y } — a not-yet-saved position (admin)
  onMapClick, // (x, y) => void
  className = '',
  heightClass = 'h-[420px] sm:h-[520px]',
  markerSize = 30,
  ariaLabel = 'Campus map with bicycle stations',
}) {
  const image = mapConfig?.image || FALLBACK_IMAGE;
  const [map, setMap] = useState(null);
  const [narrow, setNarrow] = useState(false);
  const wrapperRef = useRef(null);
  // Smaller markers on phone-sized maps so neighbouring stops do not overlap.
  const size = narrow ? Math.min(markerSize, 22) : markerSize;

  const bounds = useMemo(
    () =>
      L.latLngBounds(
        [0, 0],
        [image.height, image.width]
      ),
    [image.height, image.width]
  );

  // Fit the whole image, and keep the user from zooming out past it.
  const fit = useMemo(
    () => () => {
      if (!map) return;
      map.invalidateSize();
      map.fitBounds(bounds, { padding: [4, 4], animate: false });
      const fitted = map.getZoom();
      map.setMinZoom(fitted - 0.25);
    },
    [map, bounds]
  );

  useEffect(() => {
    if (!map) return undefined;
    fit();
    const el = wrapperRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return undefined;
    let last = el.clientWidth;
    setNarrow(el.clientWidth < 560);
    const ro = new ResizeObserver(() => {
      setNarrow(el.clientWidth < 560);
      if (Math.abs(el.clientWidth - last) > 2) {
        last = el.clientWidth;
        fit();
      } else {
        map.invalidateSize();
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [map, fit]);

  // Bring a newly selected station into view if it is off-screen.
  useEffect(() => {
    if (!map || !selectedId) return;
    const s = stations.find((st) => st.id === selectedId);
    if (!s || s.map_x === null || s.map_x === undefined) return;
    const ll = L.latLng(toLatLng(s.map_x, s.map_y, image));
    if (!map.getBounds().pad(-0.1).contains(ll)) map.panTo(ll);
  }, [map, selectedId, stations, image]);

  // Frame a freshly planned route.
  const routeKey = route?.path ? route.path.map((p) => p.join(',')).join(';') : '';
  useEffect(() => {
    if (!map || !route?.path?.length) return;
    const latlngs = route.path.map(([x, y]) => toLatLng(x, y, image));
    map.fitBounds(L.latLngBounds(latlngs), { padding: [48, 48], maxZoom: map.getZoom() + 1.5 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, routeKey]);

  const routeLatLngs = useMemo(
    () => (route?.path ? route.path.map(([x, y]) => toLatLng(x, y, image)) : null),
    [route, image]
  );

  const roads = useMemo(
    () =>
      showRoads && mapConfig?.roads
        ? mapConfig.roads.map((r) => ({
            name: r.name,
            positions: r.points.map(([x, y]) => toLatLng(x, y, image)),
          }))
        : [],
    [showRoads, mapConfig, image]
  );

  const placed = stations.filter(
    (s) => s.map_x !== null && s.map_x !== undefined && s.map_y !== null && s.map_y !== undefined
  );

  const zoomBy = (d) => map && map.setZoom(map.getZoom() + d);

  return (
    <div
      ref={wrapperRef}
      className={cn(
        // `isolate` contains Leaflet's internal z-indexes (400–700) so the map
        // never paints over modals, toasts or the sticky header.
        'relative isolate overflow-hidden rounded-xl border border-slate-200 bg-[#c6e0b0] shadow-card',
        heightClass,
        className
      )}
    >
      <MapContainer
        ref={setMap}
        className="campus-map h-full w-full"
        crs={L.CRS.Simple}
        bounds={bounds}
        maxBounds={bounds.pad(0.15)}
        maxBoundsViscosity={0.9}
        minZoom={-3}
        maxZoom={2.5}
        zoomSnap={0.25}
        zoomDelta={0.5}
        wheelPxPerZoomLevel={90}
        zoomControl={false}
        attributionControl={false}
        doubleClickZoom
        scrollWheelZoom
        aria-label={ariaLabel}
      >
        <ImageOverlay url={image.url} bounds={bounds} alt="Illustrated campus map" />

        {(onMapClick || editable) && (
          <MapClicks
            onClick={(latlng) => {
              const { x, y } = toPercent(latlng, image);
              onMapClick?.(x, y);
            }}
          />
        )}

        {roads.map((r) => (
          <Polyline
            key={r.name}
            positions={r.positions}
            pathOptions={{ color: '#c026d3', weight: 2.5, opacity: 0.75, dashArray: '5 6' }}
          >
            <Tooltip sticky className="cc-tooltip">
              {r.name}
            </Tooltip>
          </Polyline>
        ))}

        {routeLatLngs && (
          <>
            <Polyline
              positions={routeLatLngs}
              pathOptions={{ color: '#ffffff', weight: 10, opacity: 0.95, lineCap: 'round', lineJoin: 'round' }}
              interactive={false}
            />
            <Polyline
              positions={routeLatLngs}
              pathOptions={{ color: '#047857', weight: 5.5, opacity: 1, lineCap: 'round', lineJoin: 'round' }}
              interactive={false}
            />
          </>
        )}

        {placed.map((station) => {
          const selected = station.id === selectedId;
          const tag =
            route?.from?.id === station.id ? 'A' : route?.to?.id === station.id ? 'B' : null;
          const isEditing = editable && editable.stationId === station.id;
          const position = isEditing && draftPin
            ? toLatLng(draftPin.x, draftPin.y, image)
            : toLatLng(station.map_x, station.map_y, image);
          return (
            <Marker
              key={station.id}
              position={position}
              icon={markerIcon(station, {
                selected: selected || isEditing,
                tag,
                dimmed: !!route && !tag && !selected,
                size,
              })}
              title={`${station.name}: ${station.available_count} of ${station.capacity} cycles available`}
              alt={station.name}
              keyboard
              draggable={!!isEditing}
              zIndexOffset={selected || tag || isEditing ? 1000 : 0}
              eventHandlers={{
                click: () => onSelect?.(station),
                keypress: (e) => {
                  if (e.originalEvent?.key === 'Enter') onSelect?.(station);
                },
                dragend: (e) => {
                  if (!isEditing) return;
                  const { x, y } = toPercent(e.target.getLatLng(), image);
                  editable.onMove?.(x, y);
                },
              }}
            >
              <Tooltip
                className="cc-tooltip"
                direction="top"
                permanent={selected || !!tag || !!isEditing}
                opacity={1}
              >
                {station.name}
              </Tooltip>
            </Marker>
          );
        })}

        {draftPin && !(editable && placed.some((s) => s.id === editable.stationId)) && (
          <Marker
            position={toLatLng(draftPin.x, draftPin.y, image)}
            icon={PIN_ICON}
            draggable
            eventHandlers={{
              dragend: (e) => {
                const { x, y } = toPercent(e.target.getLatLng(), image);
                editable?.onMove?.(x, y);
                onMapClick?.(x, y);
              },
            }}
          >
            <Tooltip className="cc-tooltip" direction="top" permanent offset={[0, -10]}>
              New position
            </Tooltip>
          </Marker>
        )}
      </MapContainer>

      {/* Map controls — rendered outside Leaflet so they share the app's styling. */}
      <div className="absolute right-3 top-3 z-[500] flex flex-col overflow-hidden rounded-lg bg-white shadow-md ring-1 ring-slate-200">
        <button
          type="button"
          onClick={() => zoomBy(0.5)}
          className="grid h-9 w-9 place-items-center text-slate-600 hover:bg-slate-50"
          aria-label="Zoom in"
          title="Zoom in"
        >
          <Plus size={17} />
        </button>
        <button
          type="button"
          onClick={() => zoomBy(-0.5)}
          className="grid h-9 w-9 place-items-center border-t border-slate-100 text-slate-600 hover:bg-slate-50"
          aria-label="Zoom out"
          title="Zoom out"
        >
          <Minus size={17} />
        </button>
        <button
          type="button"
          onClick={fit}
          className="grid h-9 w-9 place-items-center border-t border-slate-100 text-slate-600 hover:bg-slate-50"
          aria-label="Reset map view"
          title="Reset view"
        >
          <RotateCcw size={16} />
        </button>
      </div>
    </div>
  );
}
