import { useEffect, useState } from 'react';
import { ArrowRight, History } from 'lucide-react';
import Modal from '../ui/Modal';
import Spinner from '../ui/Spinner';
import Pagination from '../ui/Pagination';
import StatusBadge from '../ui/StatusBadge';
import EmptyState from '../ui/EmptyState';
import { rentalsApi } from '../../services';
import { formatDateTime, formatSeconds } from '../../utils/format';

const PAGE_SIZE = 10;

/** Rental history of one bicycle (admin), newest first, paginated. */
export default function BicycleHistoryModal({ open, onClose, bicycle }) {
  const [offset, setOffset] = useState(0);
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (open) setOffset(0);
  }, [open, bicycle]);

  useEffect(() => {
    if (!open || !bicycle) return;
    let cancelled = false;
    setData(null);
    setError('');
    rentalsApi
      .listAll({ bicycle_id: bicycle.id, offset, limit: PAGE_SIZE })
      .then((d) => !cancelled && setData(d))
      .catch((err) => !cancelled && setError(err.message));
    return () => {
      cancelled = true;
    };
  }, [open, bicycle, offset]);

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="xl"
      title={bicycle ? `Ride history — ${bicycle.cycle_code}` : 'Ride history'}
      description={data ? `${data.pagination.total} ride(s) in total` : undefined}
    >
      {error ? (
        <p className="py-6 text-center text-sm text-rose-600">{error}</p>
      ) : !data ? (
        <div className="grid place-items-center py-10 text-slate-400">
          <Spinner size={24} />
        </div>
      ) : data.rentals.length === 0 ? (
        <EmptyState icon={History} title="No rides yet" description="This cycle has not been rented." />
      ) : (
        <>
          <ul className="divide-y divide-slate-100">
            {data.rentals.map((r) => (
              <li key={r.id} className="flex flex-col gap-1 py-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-slate-900">
                    {r.user_name} <span className="font-normal text-slate-400">· {r.user_email}</span>
                  </p>
                  <p className="mt-0.5 flex items-center gap-1 text-xs text-slate-500">
                    {r.start_station_name || '—'} <ArrowRight size={12} /> {r.end_station_name || '…'}
                    <span className="text-slate-300">·</span> {formatDateTime(r.started_at)}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-sm tabular-nums text-slate-600">
                    {formatSeconds(r.duration_seconds)}
                  </span>
                  <StatusBadge kind="rental" status={r.status} />
                </div>
              </li>
            ))}
          </ul>
          <Pagination pagination={data.pagination} onChange={setOffset} />
        </>
      )}
    </Modal>
  );
}
