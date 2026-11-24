import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  ArrowDownUp,
  ArrowRight,
  Bike,
  Info,
  List,
  Map as MapIcon,
  MapPin,
  Navigation,
  RefreshCw,
  Route as RouteIcon,
  Search,
  X,
} from 'lucide-react';
import PageHeader from '../../components/ui/PageHeader';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import DataState from '../../components/ui/DataState';
import StatusBadge from '../../components/ui/StatusBadge';
import { Input, Select, Field } from '../../components/ui/Field';
import CampusMap from '../../components/map/CampusMap';
import MapLegend from '../../components/map/MapLegend';
import StationSummary from '../../components/map/StationSummary';
import RentDialog from '../../components/RentDialog';
import ReturnDialog from '../../components/ReturnDialog';
import { mapApi, rentalsApi, stationsApi } from '../../services';
import { AVAILABILITY_LEVELS, AVAILABILITY_STYLE } from '../../utils/domain';
import { cn } from '../../utils/format';

const TABS = [
  { id: 'station', label: 'Station', icon: MapPin },
  { id: 'route', label: 'Route', icon: RouteIcon },
  { id: 'list', label: 'All stations', icon: List },
];

const REFRESH_MS = 30_000;

/**
 * Student campus map — the illustrated campus map with live station markers,
 * station details, pickup/return actions and road-following route planning.
 * Every figure comes from the API; positions come from stations.map_x/map_y.
 */
export default function StudentCampusMap() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();

  const [data, setData] = useState(null);
  const [active, setActive] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const [tab, setTab] = useState(params.get('from') || params.get('to') ? 'route' : 'station');
  const [selectedId, setSelectedId] = useState(Number(params.get('station')) || null);
  const [fromId, setFromId] = useState(params.get('from') || '');
  const [toId, setToId] = useState(params.get('to') || '');
  const [route, setRoute] = useState(null);
  const [routeError, setRouteError] = useState('');
  const [routing, setRouting] = useState(false);

  const [search, setSearch] = useState('');
  const [levelFilter, setLevelFilter] = useState('');

  const [rentAt, setRentAt] = useState(null); // station id | 'any' | null
  const [returnAt, setReturnAt] = useState(null); // station id | null
  const panelRef = useRef(null);

  const load = useCallback(async ({ quiet = false } = {}) => {
    if (quiet) setRefreshing(true);
    else setLoading(true);
    setError('');
    try {
      const [mapData, activeRide] = await Promise.all([
        stationsApi.map(),
        rentalsApi.active().catch(() => null),
      ]);
      setData(mapData);
      setActive(activeRide);
    } catch (err) {
      if (!quiet) setError(err.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Keep availability current while the page is open.
  useEffect(() => {
    const id = setInterval(() => {
      if (document.visibilityState === 'visible') load({ quiet: true });
    }, REFRESH_MS);
    return () => clearInterval(id);
  }, [load]);

  const stations = useMemo(() => data?.stations || [], [data]);
  const selected = stations.find((s) => s.id === selectedId) || null;

  // Plan a route whenever both ends are chosen.
  useEffect(() => {
    if (!fromId || !toId) {
      setRoute(null);
      setRouteError('');
      return;
    }
    if (fromId === toId) {
      setRoute(null);
      setRouteError('Choose two different stations.');
      return;
    }
    let cancelled = false;
    setRouting(true);
    setRouteError('');
    mapApi
      .route(fromId, toId)
      .then((r) => !cancelled && setRoute(r))
      .catch((err) => {
        if (cancelled) return;
        setRoute(null);
        setRouteError(err.message);
      })
      .finally(() => !cancelled && setRouting(false));
    return () => {
      cancelled = true;
    };
  }, [fromId, toId]);

  // Mirror selection / route in the URL so it can be shared or refreshed.
  useEffect(() => {
    const next = new URLSearchParams();
    if (selectedId) next.set('station', String(selectedId));
    if (fromId) next.set('from', fromId);
    if (toId) next.set('to', toId);
    setParams(next, { replace: true });
  }, [selectedId, fromId, toId, setParams]);

  function selectStation(station) {
    setSelectedId(station.id);
    setTab('station');
    // On phones the panel sits under the map: bring it into view.
    if (window.matchMedia('(max-width: 1023px)').matches) {
      requestAnimationFrame(() =>
        panelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      );
    }
  }

  function routeFrom(station) {
    setFromId(String(station.id));
    if (toId === String(station.id)) setToId('');
    setTab('route');
  }

  function routeTo(station) {
    setToId(String(station.id));
    if (fromId === String(station.id)) setFromId('');
    setTab('route');
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return stations.filter((s) => {
      if (levelFilter && s.availability_level !== levelFilter) return false;
      if (!q) return true;
      return (
        s.name.toLowerCase().includes(q) ||
        s.location.toLowerCase().includes(q) ||
        (s.code || '').toLowerCase().includes(q)
      );
    });
  }, [stations, search, levelFilter]);

  const routeForMap = route
    ? { path: route.path, from: route.from, to: route.to }
    : null;

  return (
    <div>
      <PageHeader
        title="Campus map"
        subtitle="Live cycle availability at every CampusCycle stop. Select a marker for details."
        actions={
          <>
            <Button
              variant="secondary"
              onClick={() => load({ quiet: true })}
              loading={refreshing}
              aria-label="Refresh availability"
            >
              {!refreshing && <RefreshCw size={16} />}
              <span className="hidden sm:inline">Refresh</span>
            </Button>
            {!active && (
              <Button onClick={() => setRentAt('any')}>
                <Bike size={16} /> Rent a cycle
              </Button>
            )}
          </>
        }
      />

      {active && (
        <Card className="mb-4 flex flex-col gap-3 border-brand-200 bg-brand-50/70 p-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-slate-700">
            You are riding <span className="font-semibold">{active.bicycle_code}</span> from{' '}
            {active.start_station_name || 'an unknown station'}. Pick a station with free docks to
            return it.
          </p>
          <Button size="sm" onClick={() => setReturnAt(selected?.accepts_returns ? selected.id : 'pick')}>
            End ride
          </Button>
        </Card>
      )}

      <DataState
        loading={loading}
        error={error}
        onRetry={() => load()}
        isEmpty={stations.length === 0 && (data?.unmapped_stations || []).length === 0}
        emptyIcon={MapIcon}
        emptyTitle="No stations yet"
        emptyDescription="Once an administrator adds stations they will appear on this map."
      >
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
          {/* ---------------- Map ---------------- */}
          <div className="lg:col-start-1 lg:row-start-1">
            <CampusMap
              map={data?.map}
              stations={stations}
              selectedId={selectedId}
              onSelect={selectStation}
              route={routeForMap}
              heightClass="aspect-[3/2] sm:aspect-auto sm:h-[60vh] sm:min-h-[380px] sm:max-h-[640px]"
            />
          </div>

          {/* Legend: below the map on desktop, below the panel on phones. */}
          <Card className="p-4 lg:col-start-1 lg:row-start-2">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-semibold text-slate-900">Legend</h3>
              <p className="text-xs text-slate-500">
                {data?.totals?.available_bicycles ?? 0} cycles available across{' '}
                {data?.totals?.mapped ?? 0} stations
              </p>
            </div>
            <MapLegend showRoute={!!route} />
          </Card>

          {/* ---------------- Side panel ---------------- */}
          <Card
            ref={panelRef}
            className="flex scroll-mt-20 flex-col self-start lg:sticky lg:top-4 lg:col-start-2 lg:row-span-2 lg:row-start-1 max-lg:row-start-2"
          >
            <div role="tablist" aria-label="Map panel" className="flex border-b border-slate-100 p-1.5">
              {TABS.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  role="tab"
                  aria-selected={tab === t.id}
                  onClick={() => setTab(t.id)}
                  className={cn(
                    'flex flex-1 items-center justify-center gap-1.5 rounded-lg px-2 py-2 text-sm font-medium transition',
                    tab === t.id ? 'bg-brand-50 text-brand-700' : 'text-slate-500 hover:bg-slate-50'
                  )}
                >
                  <t.icon size={15} /> {t.label}
                </button>
              ))}
            </div>

            <div className="p-4">
              {tab === 'station' &&
                (selected ? (
                  <StationSummary station={selected}>
                    <div className="grid gap-2">
                      {active ? (
                        <Button
                          onClick={() => setReturnAt(selected.id)}
                          disabled={!selected.accepts_returns}
                        >
                          {selected.accepts_returns ? 'Return my cycle here' : 'Cannot return here'}
                        </Button>
                      ) : (
                        <Button
                          onClick={() => setRentAt(selected.id)}
                          disabled={selected.status !== 'ACTIVE' || selected.available_count === 0}
                        >
                          <Bike size={16} /> Rent a cycle here
                        </Button>
                      )}
                      <div className="grid grid-cols-2 gap-2">
                        <Button variant="secondary" size="sm" onClick={() => routeFrom(selected)}>
                          <Navigation size={14} /> Start here
                        </Button>
                        <Button variant="secondary" size="sm" onClick={() => routeTo(selected)}>
                          <MapPin size={14} /> Go here
                        </Button>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => navigate(`/app/stations/${selected.id}`)}
                      >
                        View cycles at this station <ArrowRight size={14} />
                      </Button>
                    </div>
                  </StationSummary>
                ) : (
                  <div className="py-6 text-center">
                    <span className="mx-auto grid h-11 w-11 place-items-center rounded-full bg-slate-100 text-slate-500">
                      <MapPin size={20} />
                    </span>
                    <p className="mt-3 text-sm font-medium text-slate-800">Select a station</p>
                    <p className="mt-1 text-sm text-slate-500">
                      Tap a marker on the map, or pick one from the{' '}
                      <button
                        type="button"
                        className="font-medium text-brand-700 underline underline-offset-2"
                        onClick={() => setTab('list')}
                      >
                        station list
                      </button>
                      .
                    </p>
                  </div>
                ))}

              {tab === 'route' && (
                <div className="space-y-3">
                  <Field label="Start (pickup)" htmlFor="route-from">
                    <Select id="route-from" value={fromId} onChange={(e) => setFromId(e.target.value)}>
                      <option value="">Choose a station…</option>
                      {stations.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name} — {s.available_count} cycle{s.available_count === 1 ? '' : 's'}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <div className="flex justify-center">
                    <button
                      type="button"
                      onClick={() => {
                        setFromId(toId);
                        setToId(fromId);
                      }}
                      className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-slate-500 hover:bg-slate-100"
                      aria-label="Swap start and destination"
                    >
                      <ArrowDownUp size={14} /> Swap
                    </button>
                  </div>
                  <Field label="Destination (return)" htmlFor="route-to">
                    <Select id="route-to" value={toId} onChange={(e) => setToId(e.target.value)}>
                      <option value="">Choose a station…</option>
                      {stations.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name} — {s.status !== 'ACTIVE' ? 'unavailable' : `${s.free_docks} free dock${s.free_docks === 1 ? '' : 's'}`}
                        </option>
                      ))}
                    </Select>
                  </Field>

                  {routing && <p className="text-sm text-slate-500">Finding a route…</p>}
                  {routeError && (
                    <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{routeError}</p>
                  )}

                  {route && !routing && (
                    <div className="space-y-3 rounded-xl border border-slate-200 p-3">
                      <div className="flex items-start gap-2 text-sm">
                        <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-slate-900 text-[10px] font-bold text-white">A</span>
                        <div className="min-w-0">
                          <p className="font-medium text-slate-900">{route.from.name}</p>
                          <p className="text-xs text-slate-500">
                            {route.from.available_count} cycle(s) to pick up
                          </p>
                        </div>
                      </div>
                      <div className="flex items-start gap-2 text-sm">
                        <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-rose-700 text-[10px] font-bold text-white">B</span>
                        <div className="min-w-0">
                          <p className="font-medium text-slate-900">{route.to.name}</p>
                          <p className="text-xs text-slate-500">
                            {route.to.status !== 'ACTIVE'
                              ? 'Temporarily unavailable for returns'
                              : `${route.to.free_docks} free dock(s) for returns`}
                          </p>
                        </div>
                      </div>
                      <div className="rounded-lg bg-slate-50 px-3 py-2">
                        <p className="text-xs text-slate-500">Distance along campus roads</p>
                        <p className="text-lg font-semibold tabular-nums text-slate-900">
                          ≈ {route.distance.approx_metres} m
                        </p>
                        <p className="mt-1 text-[11px] leading-snug text-slate-400">
                          Approximate — estimated from the illustrated map&apos;s scale. No travel
                          time is estimated.
                        </p>
                      </div>
                      {route.roads.length > 0 && (
                        <p className="text-xs text-slate-500">
                          <span className="font-medium text-slate-600">Via:</span>{' '}
                          {route.roads.join(' → ')}
                        </p>
                      )}
                      {route.warnings.map((w) => (
                        <p key={w} className="flex gap-1.5 text-xs text-amber-700">
                          <Info size={13} className="mt-0.5 shrink-0" /> {w}
                        </p>
                      ))}
                      <Button
                        variant="ghost"
                        size="sm"
                        className="w-full"
                        onClick={() => {
                          setFromId('');
                          setToId('');
                        }}
                      >
                        <X size={14} /> Clear route
                      </Button>
                    </div>
                  )}

                  {!route && !routing && !routeError && (
                    <p className="text-sm text-slate-500">
                      Choose a start and a destination. The route follows the roads drawn on the
                      campus map.
                    </p>
                  )}
                </div>
              )}

              {tab === 'list' && (
                <div>
                  <div className="mb-3 grid gap-2">
                    <div className="relative">
                      <Search
                        size={16}
                        className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                      />
                      <Input
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="Search stations"
                        className="pl-9"
                        aria-label="Search stations"
                      />
                    </div>
                    <Select
                      value={levelFilter}
                      onChange={(e) => setLevelFilter(e.target.value)}
                      aria-label="Filter by availability"
                    >
                      <option value="">Any availability</option>
                      {AVAILABILITY_LEVELS.map((l) => (
                        <option key={l.value} value={l.value}>
                          {l.label}
                        </option>
                      ))}
                    </Select>
                  </div>
                  {filtered.length === 0 ? (
                    <p className="py-6 text-center text-sm text-slate-500">No stations match.</p>
                  ) : (
                    <ul className="-mx-1 max-h-[440px] space-y-1 overflow-y-auto px-1">
                      {filtered.map((s) => (
                        <li key={s.id}>
                          <button
                            type="button"
                            onClick={() => selectStation(s)}
                            className={cn(
                              'flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left transition hover:bg-slate-50',
                              s.id === selectedId && 'bg-brand-50/70'
                            )}
                          >
                            <span
                              className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-xs font-semibold text-white"
                              style={{ background: AVAILABILITY_STYLE[s.availability_level].dot }}
                            >
                              {s.availability_level === 'INACTIVE' ? '–' : s.available_count}
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-sm font-medium text-slate-900">
                                {s.name}
                              </span>
                              <span className="block truncate text-xs text-slate-500">
                                {s.available_count}/{s.capacity} cycles · {s.free_docks} free docks
                              </span>
                            </span>
                            <StatusBadge kind="availability" status={s.availability_level} withDot={false} />
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </div>
          </Card>
        </div>

        {(data?.unmapped_stations || []).length > 0 && (
          <Card className="mt-4 flex items-start gap-3 p-4 text-sm text-slate-600">
            <Info size={17} className="mt-0.5 shrink-0 text-amber-500" />
            <p>
              Not on the map yet (no position set):{' '}
              {data.unmapped_stations.map((s) => s.name).join(', ')}. They are still listed on the{' '}
              <button
                type="button"
                className="font-medium text-brand-700 underline underline-offset-2"
                onClick={() => navigate('/app/stations')}
              >
                Stations
              </button>{' '}
              page.
            </p>
          </Card>
        )}
      </DataState>

      <RentDialog
        open={rentAt !== null}
        stationId={rentAt === 'any' ? null : rentAt}
        onClose={() => setRentAt(null)}
        onRented={() => {
          setRentAt(null);
          load({ quiet: true });
        }}
      />
      {active && (
        <ReturnDialog
          open={returnAt !== null}
          rental={active}
          defaultStationId={returnAt === 'pick' ? null : returnAt}
          onClose={() => {
            setReturnAt(null);
            load({ quiet: true });
          }}
        />
      )}
    </div>
  );
}
