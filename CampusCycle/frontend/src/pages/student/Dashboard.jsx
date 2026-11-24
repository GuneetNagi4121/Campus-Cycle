import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Bike,
  MapPin,
  History,
  Plus,
  ArrowRight,
  Building2,
  Map as MapIcon,
  Wrench,
} from 'lucide-react';
import PageHeader from '../../components/ui/PageHeader';
import StatCard from '../../components/ui/StatCard';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import Spinner from '../../components/ui/Spinner';
import EmptyState from '../../components/ui/EmptyState';
import StatusBadge from '../../components/ui/StatusBadge';
import StationCard from '../../components/StationCard';
import CampusMap from '../../components/map/CampusMap';
import MapLegend from '../../components/map/MapLegend';
import ActiveRideCard from '../../components/ActiveRideCard';
import RentDialog from '../../components/RentDialog';
import ReturnDialog from '../../components/ReturnDialog';
import { useAuth } from '../../context/AuthContext';
import { rentalsApi, stationsApi } from '../../services';
import { formatDate, formatSeconds } from '../../utils/format';

export default function StudentDashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [active, setActive] = useState(null);
  const [stations, setStations] = useState([]);
  const [mapConfig, setMapConfig] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [rides, setRides] = useState([]);
  const [rentOpen, setRentOpen] = useState(false);
  const [returnOpen, setReturnOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setLoadError('');
      const [activeRental, stationList, myRides, mapData] = await Promise.all([
        rentalsApi.active(),
        stationsApi.list(),
        rentalsApi.mine(),
        stationsApi.map().catch(() => null),
      ]);
      setActive(activeRental);
      setStations(stationList);
      setRides(myRides);
      setMapConfig(mapData?.map || null);
    } catch (err) {
      setLoadError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const availableCycles = stations.reduce((sum, s) => sum + (Number(s.available_count) || 0), 0);
  const activeStations = stations.filter((s) => s.status === 'ACTIVE');
  const recentRides = rides.slice(0, 4);
  const completedRides = rides.filter((r) => r.status === 'COMPLETED').length;

  // "Your stations": the ones you have actually used, most recent first. The
  // app has no GPS, so it cannot know which stations are physically nearest;
  // fall back to the stations with the most cycles when there is no history.
  const usedIds = [];
  for (const r of rides) {
    for (const id of [r.end_station_id, r.start_station_id]) {
      if (id && !usedIds.includes(id)) usedIds.push(id);
    }
  }
  const recentStations = usedIds
    .map((id) => stations.find((s) => s.id === id))
    .filter(Boolean)
    .slice(0, 3);
  const suggested =
    recentStations.length > 0
      ? recentStations
      : [...activeStations].sort((a, b) => b.available_count - a.available_count).slice(0, 3);

  if (loading) {
    return (
      <div className="grid place-items-center py-24 text-slate-400">
        <Spinner size={28} />
      </div>
    );
  }

  if (loadError) {
    return (
      <Card className="mx-auto max-w-md p-6 text-center">
        <p className="font-semibold text-slate-900">Could not load your dashboard</p>
        <p className="mt-1 text-sm text-slate-500">{loadError}</p>
        <Button className="mt-4" variant="secondary" onClick={load}>
          Try again
        </Button>
      </Card>
    );
  }

  return (
    <div>
      <PageHeader
        title={`Hi, ${user?.name?.split(' ')[0] || 'there'} 👋`}
        subtitle="Here's your campus mobility at a glance."
        actions={
          <div className="flex items-center gap-2">
            <Button variant="secondary" onClick={() => navigate('/app/map')}>
              <MapIcon size={16} /> Campus map
            </Button>
            {!active && (
              <Button onClick={() => setRentOpen(true)}>
                <Plus size={16} /> Find a cycle
              </Button>
            )}
          </div>
        }
      />

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Left / main column */}
        <div className="space-y-6 lg:col-span-2">
          {active ? (
            <ActiveRideCard rental={active} onEnd={() => setReturnOpen(true)} />
          ) : (
            <Card className="flex flex-col items-start gap-4 p-6 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h3 className="text-lg font-semibold text-slate-900">Ready to ride?</h3>
                <p className="mt-1 text-sm text-slate-500">
                  {availableCycles > 0
                    ? `${availableCycles} cycles are available across campus right now.`
                    : 'No cycles are available at the moment — check back soon.'}
                </p>
              </div>
              <Button onClick={() => setRentOpen(true)} disabled={availableCycles === 0}>
                <Bike size={16} /> Start a ride
              </Button>
            </Card>
          )}

          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            <StatCard label="Available cycles" value={availableCycles} icon={Bike} tone="emerald" />
            <StatCard
              label="Stations"
              value={stations.length}
              icon={Building2}
              tone="blue"
              hint={`${activeStations.length} in service`}
            />
            <StatCard
              label="Completed rides"
              value={completedRides}
              icon={History}
              tone="violet"
            />
          </div>

          {/* Campus map preview */}
          <Card className="p-4">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="font-semibold text-slate-900">Campus map</h3>
              <button
                onClick={() => navigate('/app/map')}
                className="inline-flex items-center gap-1 text-sm font-medium text-brand-600 hover:text-brand-700"
              >
                Open full map <ArrowRight size={14} />
              </button>
            </div>
            <CampusMap
              map={mapConfig}
              stations={stations}
              onSelect={(s) => navigate(`/app/map?station=${s.id}`)}
              heightClass="aspect-[3/2] sm:aspect-auto sm:h-[360px]"
              markerSize={26}
            />
            <MapLegend compact className="mt-3" />
          </Card>

          {/* Recent rides */}
          <Card>
            <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
              <h3 className="font-semibold text-slate-900">Recent rides</h3>
              <button
                onClick={() => navigate('/app/rides')}
                className="inline-flex items-center gap-1 text-sm font-medium text-brand-600 hover:text-brand-700"
              >
                View all <ArrowRight size={14} />
              </button>
            </div>
            {recentRides.length === 0 ? (
              <div className="p-5">
                <EmptyState
                  icon={History}
                  title="No rides yet"
                  description="Your completed and active rides will appear here."
                />
              </div>
            ) : (
              <ul className="divide-y divide-slate-100">
                {recentRides.map((r) => (
                  <li key={r.id} className="flex items-center justify-between gap-3 px-5 py-3">
                    <div className="flex items-center gap-3">
                      <span className="grid h-9 w-9 place-items-center rounded-lg bg-slate-100 text-slate-500">
                        <Bike size={16} />
                      </span>
                      <div>
                        <p className="text-sm font-medium text-slate-900">{r.bicycle_code}</p>
                        <p className="text-xs text-slate-500">
                          {r.start_station_name || '—'}
                          {r.end_station_name ? ` → ${r.end_station_name}` : ''} ·{' '}
                          {formatDate(r.started_at)}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="hidden text-sm tabular-nums text-slate-500 sm:block">
                        {formatSeconds(r.duration_seconds)}
                      </span>
                      <StatusBadge kind="rental" status={r.status} />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        {/* Right column: nearby stations */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-slate-900">
              {recentStations.length > 0 ? 'Your recent stations' : 'Stations with most cycles'}
            </h3>
            <button
              onClick={() => navigate('/app/stations')}
              className="inline-flex items-center gap-1 text-sm font-medium text-brand-600 hover:text-brand-700"
            >
              All <ArrowRight size={14} />
            </button>
          </div>
          {suggested.length === 0 ? (
            <EmptyState icon={MapPin} title="No active stations" />
          ) : (
            suggested.map((s) => (
              <StationCard
                key={s.id}
                station={s}
                onView={() => navigate(`/app/stations/${s.id}`)}
              />
            ))
          )}

          <Card className="p-4">
            <h4 className="flex items-center gap-1.5 text-sm font-semibold text-slate-900">
              <Wrench size={15} className="text-slate-400" /> Something wrong with a cycle?
            </h4>
            <p className="mt-1 text-sm text-slate-500">
              Report it and the maintenance team will take a look.
            </p>
            <div className="mt-3 flex gap-2">
              <Button size="sm" variant="secondary" onClick={() => navigate('/app/report')}>
                Report an issue
              </Button>
              <Button size="sm" variant="ghost" onClick={() => navigate('/app/reports')}>
                My reports
              </Button>
            </div>
          </Card>
        </div>
      </div>

      <RentDialog open={rentOpen} onClose={() => setRentOpen(false)} onRented={load} />
      {active && (
        <ReturnDialog
          open={returnOpen}
          onClose={() => setReturnOpen(false)}
          onReturned={load}
          rental={active}
        />
      )}
    </div>
  );
}
