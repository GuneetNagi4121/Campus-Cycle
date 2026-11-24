import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Bike,
  CheckCircle2,
  Wrench,
  Route,
  Building2,
  ArrowRight,
  Activity,
  ShieldAlert,
  BarChart3,
  Map as MapIcon,
  AlertTriangle,
  Users,
} from 'lucide-react';
import PageHeader from '../../components/ui/PageHeader';
import StatCard from '../../components/ui/StatCard';
import Card from '../../components/ui/Card';
import Spinner from '../../components/ui/Spinner';
import EmptyState from '../../components/ui/EmptyState';
import StatusBadge from '../../components/ui/StatusBadge';
import { Table, THead, TBody, Tr, Th, Td } from '../../components/ui/Table';
import { adminApi } from '../../services';
import { useToast } from '../../context/ToastContext';
import Button from '../../components/ui/Button';
import { formatDateTime, formatSeconds } from '../../utils/format';

export default function AdminDashboard() {
  const navigate = useNavigate();
  const toast = useToast();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setData(await adminApi.overview());
    } catch (err) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    load();
  }, [load]);

  if (!loading && !data) {
    return (
      <Card className="mx-auto max-w-md p-6 text-center">
        <p className="font-semibold text-slate-900">Could not load the overview</p>
        <Button className="mt-4" variant="secondary" onClick={load}>
          Try again
        </Button>
      </Card>
    );
  }

  if (loading || !data) {
    return (
      <div className="grid place-items-center py-24 text-slate-400">
        <Spinner size={28} />
      </div>
    );
  }

  const b = data.bicycles;

  return (
    <div>
      <PageHeader
        title="Campus overview"
        subtitle="Live snapshot of fleet, stations and rides."
        actions={
          <div className="flex items-center gap-2">
            <Button variant="secondary" onClick={() => navigate('/admin/map')}>
              <MapIcon size={15} /> Campus map
            </Button>
            <Button variant="secondary" onClick={() => navigate('/admin/analytics')}>
              <BarChart3 size={15} /> Analytics
            </Button>
          </div>
        }
      />

      {(data.maintenance?.OPEN > 0 || data.geofence?.OPEN > 0) && (
        <div className="mb-6 grid gap-3 sm:grid-cols-2">
          {data.maintenance?.OPEN > 0 && (
            <Card className="flex items-center justify-between gap-3 border-amber-200 bg-amber-50/60 p-4">
              <p className="flex items-start gap-2 text-sm text-amber-900">
                <Wrench size={17} className="mt-0.5 shrink-0" />
                <span>
                  <span className="font-semibold">{data.maintenance.OPEN}</span> maintenance
                  report(s) need attention
                  {data.maintenance.IN_PROGRESS > 0
                    ? `, ${data.maintenance.IN_PROGRESS} in progress`
                    : ''}
                  .
                </span>
              </p>
              <Button size="sm" variant="secondary" onClick={() => navigate('/admin/maintenance')}>
                Review
              </Button>
            </Card>
          )}
          {data.geofence?.OPEN > 0 && (
            <Card className="flex items-center justify-between gap-3 border-rose-200 bg-rose-50/60 p-4">
              <p className="flex items-start gap-2 text-sm text-rose-900">
                <AlertTriangle size={17} className="mt-0.5 shrink-0" />
                <span>
                  <span className="font-semibold">{data.geofence.OPEN}</span> open geofence
                  alert(s).
                </span>
              </p>
              <Button size="sm" variant="secondary" onClick={() => navigate('/admin/geofence')}>
                Review
              </Button>
            </Card>
          )}
        </div>
      )}

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard label="Registered students" value={data.students} icon={Users} tone="violet" />
        <StatCard
          label="Total bicycles"
          value={b.FLEET ?? b.TOTAL}
          icon={Bike}
          tone="slate"
          hint={b.RETIRED ? `${b.RETIRED} retired not counted` : 'Working fleet'}
        />
        <StatCard
          label="Available bicycles"
          value={b.AVAILABLE}
          icon={CheckCircle2}
          tone="emerald"
          hint={`${b.MAINTENANCE} in maintenance`}
        />
        <StatCard label="Currently rented" value={b.IN_USE} icon={Activity} tone="blue" />
        <StatCard
          label="Stations"
          value={data.stations.total}
          icon={Building2}
          tone="violet"
          hint={`${data.stations.active} active · ${data.stations.full} full · ${data.stations.empty} empty`}
        />
        <StatCard label="Active rides" value={data.rides.active} icon={Route} tone="blue" />
        <StatCard
          label="Completed rides"
          value={data.rides.completed}
          icon={CheckCircle2}
          tone="emerald"
          hint={`${data.rides.total} rides in total`}
        />
        <StatCard
          label="Pending maintenance"
          value={data.pendingMaintenance}
          icon={Wrench}
          tone="amber"
          hint={`${data.maintenance?.OPEN ?? 0} open · ${data.maintenance?.IN_PROGRESS ?? 0} in progress`}
        />
      </div>

      <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard
          label="Maintenance reports (all time)"
          value={data.maintenance?.TOTAL ?? 0}
          icon={Wrench}
          tone="slate"
          hint={`${(data.maintenance?.RESOLVED ?? 0) + (data.maintenance?.CLOSED ?? 0)} resolved or closed`}
        />
        <StatCard
          label="Dock capacity"
          value={data.stations.capacity}
          icon={Building2}
          tone="slate"
          hint="Across all stations"
        />
        <StatCard
          label="Open geofence alerts"
          value={data.geofence?.OPEN ?? 0}
          icon={ShieldAlert}
          tone="rose"
          hint="Simulated GPS readings"
        />
        <StatCard
          label="Stations on the map"
          value={data.stations.mapped}
          icon={MapIcon}
          tone="emerald"
          hint={`of ${data.stations.total}`}
        />
      </div>

      <Card className="mt-6">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <h3 className="font-semibold text-slate-900">Recent rentals</h3>
          <button
            onClick={() => navigate('/admin/rentals')}
            className="inline-flex items-center gap-1 text-sm font-medium text-brand-600 hover:text-brand-700"
          >
            View all <ArrowRight size={14} />
          </button>
        </div>

        {data.recentRentals.length === 0 ? (
          <div className="p-5">
            <EmptyState icon={Route} title="No rentals yet" />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <THead>
                <Tr>
                  <Th>Student</Th>
                  <Th>Cycle</Th>
                  <Th>Route</Th>
                  <Th>Started</Th>
                  <Th>Duration</Th>
                  <Th>Status</Th>
                </Tr>
              </THead>
              <TBody>
                {data.recentRentals.map((r) => (
                  <Tr
                    key={r.id}
                    className="cursor-pointer"
                    onClick={() => navigate(`/admin/rentals/${r.id}`)}
                  >
                    <Td className="font-medium text-slate-900">{r.user_name}</Td>
                    <Td>{r.bicycle_code}</Td>
                    <Td className="text-slate-600">
                      {r.start_station_name || '—'}
                      {r.end_station_name ? ` → ${r.end_station_name}` : ''}
                    </Td>
                    <Td className="text-slate-600">{formatDateTime(r.started_at)}</Td>
                    <Td className="tabular-nums text-slate-600">
                      {formatSeconds(r.duration_seconds)}
                    </Td>
                    <Td>
                      <StatusBadge kind="rental" status={r.status} />
                    </Td>
                  </Tr>
                ))}
              </TBody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
