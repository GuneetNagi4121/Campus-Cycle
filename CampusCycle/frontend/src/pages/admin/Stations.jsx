import { useCallback, useEffect, useState } from 'react';
import { Bike, MapPin, Plus, Pencil, Trash2, Power, PowerOff } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import PageHeader from '../../components/ui/PageHeader';
import Button from '../../components/ui/Button';
import Spinner from '../../components/ui/Spinner';
import EmptyState from '../../components/ui/EmptyState';
import StatusBadge from '../../components/ui/StatusBadge';
import ConfirmDialog from '../../components/ui/ConfirmDialog';
import { Table, THead, TBody, Tr, Th, Td } from '../../components/ui/Table';
import StationFormModal from '../../components/admin/StationFormModal';
import Modal from '../../components/ui/Modal';
import { bicyclesApi, stationsApi } from '../../services';
import { useToast } from '../../context/ToastContext';

export default function AdminStations() {
  const toast = useToast();
  const [stations, setStations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [busyId, setBusyId] = useState(null);
  const [viewing, setViewing] = useState(null);
  const [viewBikes, setViewBikes] = useState(null);
  const navigate = useNavigate();

  async function openBikes(station) {
    setViewing(station);
    setViewBikes(null);
    try {
      setViewBikes(await bicyclesApi.list({ station_id: station.id }));
    } catch (err) {
      toast.error(err.message);
      setViewing(null);
    }
  }

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setStations(await stationsApi.list());
    } catch (err) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    load();
  }, [load]);

  function openCreate() {
    setEditing(null);
    setFormOpen(true);
  }

  function openEdit(station) {
    setEditing(station);
    setFormOpen(true);
  }

  async function toggleStatus(station) {
    const next = station.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';
    setBusyId(station.id);
    try {
      await stationsApi.setStatus(station.id, next);
      toast.success(`${station.name} ${next === 'ACTIVE' ? 'activated' : 'deactivated'}.`);
      load();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusyId(null);
    }
  }

  async function confirmDelete() {
    setDeleteLoading(true);
    try {
      await stationsApi.remove(deleting.id);
      toast.success(`${deleting.name} deleted.`);
      setDeleting(null);
      load();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setDeleteLoading(false);
    }
  }

  return (
    <div>
      <PageHeader
        title="Stations"
        subtitle="Docking stations, capacity, occupancy and position on the campus map."
        actions={
          <>
            <Button variant="secondary" onClick={() => navigate('/admin/map')}>
              <MapPin size={16} /> Edit on map
            </Button>
            <Button onClick={openCreate}>
              <Plus size={16} /> Add station
            </Button>
          </>
        }
      />

      {loading ? (
        <div className="grid place-items-center py-24 text-slate-400">
          <Spinner size={28} />
        </div>
      ) : stations.length === 0 ? (
        <EmptyState
          icon={MapPin}
          title="No stations yet"
          description="Add your first docking station to get started."
          action={
            <Button onClick={openCreate}>
              <Plus size={16} /> Add station
            </Button>
          }
        />
      ) : (
        <Table>
          <THead>
            <Tr>
              <Th>Code</Th>
              <Th>Station</Th>
              <Th>Occupancy</Th>
              <Th>Availability</Th>
              <Th>Map</Th>
              <Th>Status</Th>
              <Th className="text-right">Actions</Th>
            </Tr>
          </THead>
          <TBody>
            {stations.map((s) => {
              const busy = busyId === s.id;
              const active = s.status === 'ACTIVE';
              return (
                <Tr key={s.id}>
                  <Td className="font-mono text-xs text-slate-500">{s.code || '—'}</Td>
                  <Td>
                    <p className="font-medium text-slate-900">{s.name}</p>
                    <p className="text-xs text-slate-500">{s.location}</p>
                  </Td>
                  <Td className="min-w-[140px]">
                    <p className="tabular-nums text-slate-700">
                      {s.bikes_at_station} / {s.capacity} docks
                    </p>
                    <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                      <div
                        className="h-full bg-slate-400"
                        style={{ width: `${Math.min(100, (s.bikes_at_station / s.capacity) * 100)}%` }}
                      />
                    </div>
                    <p className="mt-0.5 text-[11px] text-slate-400">
                      {s.available_count} available · {s.free_docks} free
                    </p>
                  </Td>
                  <Td>
                    <StatusBadge kind="availability" status={s.availability_level} />
                  </Td>
                  <Td className="text-xs">
                    {s.has_coordinates ? (
                      <span className="text-emerald-700">Placed</span>
                    ) : (
                      <span className="text-amber-700">Not placed</span>
                    )}
                  </Td>
                  <Td>
                    <StatusBadge kind="station" status={s.status} />
                  </Td>
                  <Td>
                    <div className="flex items-center justify-end gap-1">
                      <button
                        onClick={() => openBikes(s)}
                        title="Bicycles at this station"
                        aria-label={`Bicycles at ${s.name}`}
                        className="rounded-md p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
                      >
                        <Bike size={15} />
                      </button>
                      <button
                        onClick={() => toggleStatus(s)}
                        disabled={busy}
                        title={active ? 'Deactivate' : 'Activate'}
                        className="rounded-md p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 disabled:opacity-50"
                      >
                        {busy ? (
                          <Spinner size={15} />
                        ) : active ? (
                          <PowerOff size={15} />
                        ) : (
                          <Power size={15} />
                        )}
                      </button>
                      <button
                        onClick={() => openEdit(s)}
                        title="Edit"
                        className="rounded-md p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
                      >
                        <Pencil size={15} />
                      </button>
                      <button
                        onClick={() => setDeleting(s)}
                        title="Delete"
                        className="rounded-md p-1.5 text-slate-400 transition hover:bg-rose-50 hover:text-rose-600"
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </Td>
                </Tr>
              );
            })}
          </TBody>
        </Table>
      )}

      <StationFormModal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        onSaved={load}
        station={editing}
        stations={stations}
      />

      <Modal
        open={!!viewing}
        onClose={() => setViewing(null)}
        title={viewing ? `Bicycles at ${viewing.name}` : ''}
        description={
          viewing
            ? `${viewing.bikes_at_station} of ${viewing.capacity} docks occupied · ${viewing.available_count} available`
            : undefined
        }
      >
        {viewBikes === null ? (
          <div className="grid place-items-center py-8 text-slate-400">
            <Spinner size={22} />
          </div>
        ) : viewBikes.length === 0 ? (
          <p className="py-6 text-center text-sm text-slate-500">No bicycles are parked here.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {viewBikes.map((b) => (
              <li key={b.id} className="flex items-center justify-between gap-3 py-2.5">
                <div>
                  <p className="text-sm font-medium text-slate-900">{b.cycle_code}</p>
                  <p className="font-mono text-xs text-slate-400">{b.qr_code}</p>
                </div>
                <StatusBadge kind="bicycle" status={b.status} />
              </li>
            ))}
          </ul>
        )}
      </Modal>

      <ConfirmDialog
        open={!!deleting}
        onClose={() => setDeleting(null)}
        onConfirm={confirmDelete}
        loading={deleteLoading}
        title="Delete station"
        message={`Delete ${deleting?.name}? Stations with assigned cycles or active rides cannot be deleted.`}
        confirmLabel="Delete"
      />
    </div>
  );
}
