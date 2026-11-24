import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Archive,
  ArchiveRestore,
  Bike,
  CircleCheck,
  History,
  Pencil,
  Plus,
  QrCode,
  Search,
  ShieldAlert,
  Trash2,
  Wrench,
} from 'lucide-react';
import PageHeader from '../../components/ui/PageHeader';
import Button from '../../components/ui/Button';
import Spinner from '../../components/ui/Spinner';
import EmptyState from '../../components/ui/EmptyState';
import StatusBadge from '../../components/ui/StatusBadge';
import ConfirmDialog from '../../components/ui/ConfirmDialog';
import { Table, THead, TBody, Tr, Th, Td } from '../../components/ui/Table';
import { Input, Select } from '../../components/ui/Field';
import BicycleFormModal from '../../components/admin/BicycleFormModal';
import BicycleQrModal from '../../components/admin/BicycleQrModal';
import BicycleHistoryModal from '../../components/admin/BicycleHistoryModal';
import { bicyclesApi, stationsApi } from '../../services';
import { useToast } from '../../context/ToastContext';
import { formatDate } from '../../utils/format';
import { BICYCLE_STATUSES, statusLabel } from '../../utils/domain';

function IconButton({ title, onClick, disabled, tone = 'slate', children }) {
  const tones = {
    slate: 'hover:bg-slate-100 hover:text-slate-700',
    emerald: 'hover:bg-emerald-50 hover:text-emerald-600',
    amber: 'hover:bg-amber-50 hover:text-amber-600',
    rose: 'hover:bg-rose-50 hover:text-rose-600',
  };
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-label={title}
      className={`rounded-md p-1.5 text-slate-400 transition disabled:opacity-40 ${tones[tone]}`}
    >
      {children}
    </button>
  );
}

export default function AdminBicycles() {
  const toast = useToast();
  const [bikes, setBikes] = useState([]);
  const [stations, setStations] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [stationFilter, setStationFilter] = useState('');
  const [search, setSearch] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [qrBike, setQrBike] = useState(null);
  const [historyBike, setHistoryBike] = useState(null);
  const [confirm, setConfirm] = useState(null); // { type: 'delete'|'retire', bike }
  const [confirmLoading, setConfirmLoading] = useState(false);
  const [busyId, setBusyId] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = {};
      if (statusFilter !== 'ALL') params.status = statusFilter;
      if (stationFilter) params.station_id = stationFilter;
      const [bikeList, stationList, fleet] = await Promise.all([
        bicyclesApi.list(params),
        stationsApi.list(),
        bicyclesApi.stats(),
      ]);
      setBikes(bikeList);
      setStations(stationList);
      setStats(fleet);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  }, [statusFilter, stationFilter, toast]);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return bikes;
    return bikes.filter(
      (b) =>
        b.cycle_code?.toLowerCase().includes(q) ||
        b.qr_code?.toLowerCase().includes(q) ||
        b.model?.toLowerCase().includes(q) ||
        b.station_name?.toLowerCase().includes(q)
    );
  }, [bikes, search]);

  async function changeStatus(bike, status, message) {
    setBusyId(bike.id);
    try {
      await bicyclesApi.changeStatus(bike.id, status, bike.station_id ?? undefined);
      toast.success(message);
      load();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusyId(null);
    }
  }

  async function runConfirm() {
    const { type, bike } = confirm;
    setConfirmLoading(true);
    try {
      if (type === 'delete') {
        await bicyclesApi.remove(bike.id);
        toast.success(`${bike.cycle_code} deleted.`);
      } else {
        await bicyclesApi.changeStatus(bike.id, 'RETIRED', null);
        toast.success(`${bike.cycle_code} retired from the fleet.`);
      }
      setConfirm(null);
      load();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setConfirmLoading(false);
    }
  }

  return (
    <div>
      <PageHeader
        title="Bicycles"
        subtitle="The campus fleet: status, location, QR labels and ride history."
        actions={
          <Button
            onClick={() => {
              setEditing(null);
              setFormOpen(true);
            }}
          >
            <Plus size={16} /> Add bicycle
          </Button>
        }
      />

      {stats && (
        <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
          {[
            ['Fleet', stats.FLEET, 'text-slate-900'],
            ['Available', stats.AVAILABLE, 'text-emerald-700'],
            ['In use', stats.IN_USE, 'text-blue-700'],
            ['Maintenance', stats.MAINTENANCE, 'text-amber-700'],
            ['Reserved', stats.RESERVED, 'text-violet-700'],
            ['Retired', stats.RETIRED, 'text-slate-500'],
          ].map(([label, value, tone]) => (
            <div key={label} className="rounded-lg border border-slate-200 bg-white px-3 py-2">
              <p className="text-xs text-slate-500">{label}</p>
              <p className={`text-lg font-semibold tabular-nums ${tone}`}>{value}</p>
            </div>
          ))}
        </div>
      )}

      <div className="mb-4 grid gap-2 sm:grid-cols-[minmax(0,1fr)_200px_220px]">
        <div className="relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search code, QR, model or station"
            className="pl-9"
            aria-label="Search bicycles"
          />
        </div>
        <Select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          aria-label="Filter by status"
        >
          <option value="ALL">All statuses</option>
          {BICYCLE_STATUSES.map((s) => (
            <option key={s} value={s}>
              {statusLabel(s)}
            </option>
          ))}
        </Select>
        <Select
          value={stationFilter}
          onChange={(e) => setStationFilter(e.target.value)}
          aria-label="Filter by station"
        >
          <option value="">All stations</option>
          {stations.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </Select>
      </div>

      {loading ? (
        <div className="grid place-items-center py-24 text-slate-400">
          <Spinner size={28} />
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={Bike}
          title="No bicycles found"
          description="Adjust your filters or add a new bicycle to the fleet."
        />
      ) : (
        <Table>
          <THead>
            <Tr>
              <Th>Cycle</Th>
              <Th>QR value</Th>
              <Th>Station</Th>
              <Th>Status</Th>
              <Th>Rides</Th>
              <Th className="text-right">Actions</Th>
            </Tr>
          </THead>
          <TBody>
            {filtered.map((bike) => {
              const onRide = bike.status === 'IN_USE';
              const retired = bike.status === 'RETIRED';
              const busy = busyId === bike.id;
              return (
                <Tr key={bike.id}>
                  <Td>
                    <p className="inline-flex items-center gap-2 font-medium text-slate-900">
                      <Bike size={15} className="text-slate-400" />
                      {bike.cycle_code}
                    </p>
                    {bike.model && <p className="ml-6 text-xs text-slate-400">{bike.model}</p>}
                  </Td>
                  <Td className="font-mono text-xs text-slate-500">{bike.qr_code}</Td>
                  <Td className="text-slate-600">
                    {bike.station_name || <span className="text-slate-300">—</span>}
                  </Td>
                  <Td>
                    <div className="flex flex-col items-start gap-1">
                      <StatusBadge kind="bicycle" status={bike.status} />
                      {bike.on_safety_hold && (
                        <span className="inline-flex items-center gap-1 text-[11px] text-rose-600">
                          <ShieldAlert size={12} /> Safety hold
                        </span>
                      )}
                    </div>
                  </Td>
                  <Td className="text-sm tabular-nums text-slate-600">
                    {bike.total_rides}
                    {bike.last_ride_at && (
                      <span className="block text-[11px] text-slate-400">
                        last {formatDate(bike.last_ride_at)}
                      </span>
                    )}
                  </Td>
                  <Td>
                    <div className="flex items-center justify-end gap-0.5">
                      <IconButton title="QR label" onClick={() => setQrBike(bike)}>
                        <QrCode size={15} />
                      </IconButton>
                      <IconButton title="Ride history" onClick={() => setHistoryBike(bike)}>
                        <History size={15} />
                      </IconButton>
                      {onRide ? (
                        <span className="px-1.5 text-xs text-slate-400">On a ride</span>
                      ) : (
                        <>
                          {bike.status === 'MAINTENANCE' && (
                            <IconButton
                              title="Return to service"
                              tone="emerald"
                              disabled={busy || bike.on_safety_hold || !bike.station_id}
                              onClick={() =>
                                changeStatus(bike, 'AVAILABLE', `${bike.cycle_code} is back in service.`)
                              }
                            >
                              {busy ? <Spinner size={15} /> : <CircleCheck size={15} />}
                            </IconButton>
                          )}
                          {(bike.status === 'AVAILABLE' || bike.status === 'RESERVED') && (
                            <IconButton
                              title="Send to maintenance"
                              tone="amber"
                              disabled={busy}
                              onClick={() =>
                                changeStatus(bike, 'MAINTENANCE', `${bike.cycle_code} sent to maintenance.`)
                              }
                            >
                              {busy ? <Spinner size={15} /> : <Wrench size={15} />}
                            </IconButton>
                          )}
                          {retired ? (
                            <IconButton
                              title="Reinstate (edit to choose a station)"
                              tone="emerald"
                              onClick={() => {
                                setEditing({ ...bike, status: 'AVAILABLE' });
                                setFormOpen(true);
                              }}
                            >
                              <ArchiveRestore size={15} />
                            </IconButton>
                          ) : (
                            <IconButton
                              title="Retire from fleet"
                              tone="amber"
                              onClick={() => setConfirm({ type: 'retire', bike })}
                            >
                              <Archive size={15} />
                            </IconButton>
                          )}
                          <IconButton
                            title="Edit"
                            onClick={() => {
                              setEditing(bike);
                              setFormOpen(true);
                            }}
                          >
                            <Pencil size={15} />
                          </IconButton>
                          <IconButton
                            title={bike.total_rides > 0 ? 'Has ride history — retire instead' : 'Delete'}
                            tone="rose"
                            disabled={bike.total_rides > 0}
                            onClick={() => setConfirm({ type: 'delete', bike })}
                          >
                            <Trash2 size={15} />
                          </IconButton>
                        </>
                      )}
                    </div>
                  </Td>
                </Tr>
              );
            })}
          </TBody>
        </Table>
      )}

      <BicycleFormModal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        onSaved={load}
        bicycle={editing}
        stations={stations}
      />
      <BicycleQrModal open={!!qrBike} onClose={() => setQrBike(null)} bicycle={qrBike} />
      <BicycleHistoryModal
        open={!!historyBike}
        onClose={() => setHistoryBike(null)}
        bicycle={historyBike}
      />

      <ConfirmDialog
        open={!!confirm}
        onClose={() => setConfirm(null)}
        onConfirm={runConfirm}
        loading={confirmLoading}
        title={confirm?.type === 'delete' ? 'Delete bicycle' : 'Retire bicycle'}
        message={
          confirm?.type === 'delete'
            ? `Permanently delete ${confirm?.bike.cycle_code}? This cannot be undone.`
            : `Retire ${confirm?.bike.cycle_code}? It leaves its station, can no longer be rented, and keeps its ride and maintenance history.`
        }
        confirmLabel={confirm?.type === 'delete' ? 'Delete' : 'Retire'}
      />
    </div>
  );
}
