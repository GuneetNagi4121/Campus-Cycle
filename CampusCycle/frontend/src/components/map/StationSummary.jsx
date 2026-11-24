import { MapPin } from 'lucide-react';
import StatusBadge from '../ui/StatusBadge';
import { AVAILABILITY_STYLE } from '../../utils/domain';

/**
 * Compact facts about one station: availability, capacity, free docks and
 * operational status. Shared by the map side panel and the station list.
 */
export default function StationSummary({ station, children }) {
  const style = AVAILABILITY_STYLE[station.availability_level] || AVAILABILITY_STYLE.INACTIVE;
  const occupiedPct = station.capacity
    ? Math.min(100, Math.round((station.bikes_at_station / station.capacity) * 100))
    : 0;
  const availablePct = station.capacity
    ? Math.min(100, Math.round((station.available_count / station.capacity) * 100))
    : 0;

  return (
    <div>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
            {station.code || 'Station'}
          </p>
          <h3 className="mt-0.5 text-base font-semibold text-slate-900">{station.name}</h3>
          <p className="mt-0.5 flex items-start gap-1 text-sm text-slate-500">
            <MapPin size={14} className="mt-0.5 shrink-0" /> {station.location}
          </p>
        </div>
      </div>

      <div className="mt-3">
        <StatusBadge kind="availability" status={station.availability_level} />
      </div>

      <dl className="mt-4 grid grid-cols-3 gap-2 text-center">
        <div className="rounded-lg bg-slate-50 px-2 py-2.5">
          <dt className="text-[11px] text-slate-500">Available</dt>
          <dd className={`mt-0.5 text-lg font-semibold tabular-nums ${style.text}`}>
            {station.available_count}
          </dd>
        </div>
        <div className="rounded-lg bg-slate-50 px-2 py-2.5">
          <dt className="text-[11px] text-slate-500">Free docks</dt>
          <dd className="mt-0.5 text-lg font-semibold tabular-nums text-slate-900">
            {station.free_docks}
          </dd>
        </div>
        <div className="rounded-lg bg-slate-50 px-2 py-2.5">
          <dt className="text-[11px] text-slate-500">Capacity</dt>
          <dd className="mt-0.5 text-lg font-semibold tabular-nums text-slate-900">
            {station.capacity}
          </dd>
        </div>
      </dl>

      <div className="mt-3" aria-hidden>
        <div className="relative h-2 overflow-hidden rounded-full bg-slate-100">
          <div
            className="absolute inset-y-0 left-0 bg-slate-300"
            style={{ width: `${occupiedPct}%` }}
          />
          <div
            className={`absolute inset-y-0 left-0 ${style.bar}`}
            style={{ width: `${availablePct}%` }}
          />
        </div>
        <p className="mt-1.5 text-xs text-slate-500">
          {station.bikes_at_station} of {station.capacity} docks occupied
          {station.bikes_at_station > station.available_count &&
            ` · ${station.bikes_at_station - station.available_count} out of service`}
        </p>
      </div>

      {station.status !== 'ACTIVE' && (
        <p className="mt-3 rounded-lg bg-slate-100 px-3 py-2 text-xs text-slate-600">
          This station is temporarily unavailable. Cycles cannot be picked up or returned here.
        </p>
      )}

      {children && <div className="mt-4">{children}</div>}
    </div>
  );
}
