import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Crosshair,
  Info,
  Map as MapIcon,
  Move,
  Pencil,
  RefreshCw,
  Save,
  ShieldAlert,
  X,
} from 'lucide-react';
import PageHeader from '../../components/ui/PageHeader';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import DataState from '../../components/ui/DataState';
import CampusMap from '../../components/map/CampusMap';
import MapLegend from '../../components/map/MapLegend';
import StationSummary from '../../components/map/StationSummary';
import StationFormModal from '../../components/admin/StationFormModal';
import { stationsApi } from '../../services';
import { useToast } from '../../context/ToastContext';
import { cn } from '../../utils/format';

/**
 * Admin campus map: live station availability on the illustrated map, plus
 * in-place editing of station positions. Positions are saved to the database
 * (stations.map_x / map_y), so stations can be moved without touching code.
 */
export default function AdminCampusMap() {
  const navigate = useNavigate();
  const toast = useToast();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedId, setSelectedId] = useState(null);
  const [showRoads, setShowRoads] = useState(false);

  // Placement mode: { station, x, y } while an admin is moving/placing a stop.
  const [placing, setPlacing] = useState(null);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setData(await stationsApi.map());
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const stations = useMemo(() => data?.stations || [], [data]);
  const unmapped = data?.unmapped_stations || [];
  const selected = stations.find((s) => s.id === selectedId) || null;

  function startPlacing(station) {
    setPlacing({
      station,
      x: station.map_x ?? null,
      y: station.map_y ?? null,
    });
    setSelectedId(station.id);
  }

  async function savePlacement() {
    if (!placing || placing.x === null) return;
    setSaving(true);
    try {
      await stationsApi.update(placing.station.id, { map_x: placing.x, map_y: placing.y });
      toast.success(`${placing.station.name} moved.`);
      setPlacing(null);
      await load();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  }

  // While placing an unmapped station, include it so its marker can be shown.
  const mapStations = useMemo(() => {
    if (!placing || placing.x === null) return stations;
    const others = stations.filter((s) => s.id !== placing.station.id);
    const fullStation =
      stations.find((s) => s.id === placing.station.id) || {
        ...placing.station,
        available_count: 0,
        capacity: 0,
        availability_level: 'INACTIVE',
      };
    return [...others, { ...fullStation, map_x: placing.x, map_y: placing.y }];
  }, [stations, placing]);

  return (
    <div>
      <PageHeader
        title="Campus map"
        subtitle="Live station availability. Select a station to inspect or move it."
        actions={
          <>
            <Button
              variant="secondary"
              onClick={() => setShowRoads((v) => !v)}
              aria-pressed={showRoads}
            >
              <MapIcon size={15} /> {showRoads ? 'Hide' : 'Show'} road network
            </Button>
            <Button variant="secondary" onClick={load} disabled={loading}>
              <RefreshCw size={15} /> Refresh
            </Button>
          </>
        }
      />

      <DataState
        loading={loading}
        error={error}
        onRetry={load}
        isEmpty={stations.length === 0 && unmapped.length === 0}
        emptyIcon={MapIcon}
        emptyTitle="No stations yet"
        emptyDescription="Add a station from the Stations screen, then place it on the map."
      >
        {placing && (
          <Card className="mb-4 flex flex-col gap-3 border-brand-300 bg-brand-50/70 p-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="flex items-start gap-2 text-sm text-slate-700">
              <Crosshair size={16} className="mt-0.5 shrink-0 text-brand-700" />
              <span>
                Placing <span className="font-semibold">{placing.station.name}</span>: click the
                map or drag its marker to a spot on the road beside the building.
                {placing.x !== null && (
                  <span className="ml-1 font-mono text-xs text-slate-500">
                    ({placing.x.toFixed(2)}%, {placing.y.toFixed(2)}%)
                  </span>
                )}
              </span>
            </p>
            <div className="flex shrink-0 gap-2">
              <Button variant="secondary" size="sm" onClick={() => setPlacing(null)} disabled={saving}>
                <X size={14} /> Cancel
              </Button>
              <Button size="sm" onClick={savePlacement} loading={saving} disabled={placing.x === null}>
                <Save size={14} /> Save position
              </Button>
            </div>
          </Card>
        )}

        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
          <div className="space-y-4">
            <CampusMap
              map={data?.map}
              stations={mapStations}
              selectedId={selectedId}
              onSelect={(s) => !placing && setSelectedId(s.id)}
              showRoads={showRoads || !!placing}
              editable={
                placing
                  ? {
                      stationId: placing.station.id,
                      onMove: (x, y) => setPlacing((p) => ({ ...p, x, y })),
                    }
                  : null
              }
              draftPin={placing && placing.x !== null ? { x: placing.x, y: placing.y } : null}
              onMapClick={
                placing ? (x, y) => setPlacing((p) => ({ ...p, x, y })) : undefined
              }
              heightClass="aspect-[3/2] sm:aspect-auto sm:h-[60vh] sm:min-h-[380px] sm:max-h-[640px]"
            />
            <Card className="p-4">
              <MapLegend showRoads={showRoads || !!placing} />
            </Card>
          </div>

          <div className="space-y-4">
            <Card className="p-4">
              {selected ? (
                <StationSummary station={selected}>
                  <div className="grid grid-cols-2 gap-2">
                    <Button size="sm" variant="secondary" onClick={() => startPlacing(selected)} disabled={!!placing}>
                      <Move size={14} /> Move
                    </Button>
                    <Button size="sm" variant="secondary" onClick={() => setEditing(selected)} disabled={!!placing}>
                      <Pencil size={14} /> Edit details
                    </Button>
                  </div>
                  <p className="mt-3 font-mono text-[11px] text-slate-400">
                    Map position: {selected.map_x?.toFixed(2)}% , {selected.map_y?.toFixed(2)}%
                  </p>
                </StationSummary>
              ) : (
                <p className="py-4 text-center text-sm text-slate-500">
                  Select a station marker to see its occupancy or move it.
                </p>
              )}
            </Card>

            <Card className="p-4">
              <h3 className="text-sm font-semibold text-slate-900">
                Not on the map ({unmapped.length})
              </h3>
              {unmapped.length === 0 ? (
                <p className="mt-1 text-sm text-slate-500">Every station has a map position.</p>
              ) : (
                <ul className="mt-2 divide-y divide-slate-100">
                  {unmapped.map((s) => (
                    <li key={s.id} className="flex items-center justify-between gap-2 py-2">
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium text-slate-800">{s.name}</span>
                        <span className="block truncate text-xs text-slate-500">{s.location}</span>
                      </span>
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => startPlacing(s)}
                        disabled={!!placing}
                      >
                        Place
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </Card>

            <Card className={cn('flex items-start gap-3 p-4 text-sm text-slate-600')}>
              <ShieldAlert size={17} className="mt-0.5 shrink-0 text-slate-400" />
              <p>
                The campus geofence works on simulated GPS readings, which cannot be drawn on this
                illustrated (non-GPS) map.{' '}
                <button
                  type="button"
                  className="font-medium text-brand-700 underline underline-offset-2"
                  onClick={() => navigate('/admin/geofence')}
                >
                  Open geofence alerts
                </button>
              </p>
            </Card>

            <Card className="flex items-start gap-3 p-4 text-xs text-slate-500">
              <Info size={15} className="mt-0.5 shrink-0" />
              <p>
                Positions are stored as percentages of the map image, so markers stay on their
                building at any screen size. Routes follow the traced road network — keep stations
                on a road.
              </p>
            </Card>
          </div>
        </div>
      </DataState>

      <StationFormModal
        open={!!editing}
        onClose={() => setEditing(null)}
        onSaved={load}
        station={editing}
        stations={stations}
      />
    </div>
  );
}
