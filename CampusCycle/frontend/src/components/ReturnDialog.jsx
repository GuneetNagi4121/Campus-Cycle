import { useEffect, useMemo, useState } from 'react';
import { ArrowRight, CheckCircle2, Clock, Info, MapPin, Route, Wrench } from 'lucide-react';
import Modal from './ui/Modal';
import Button from './ui/Button';
import Spinner from './ui/Spinner';
import { Field, Select } from './ui/Field';
import { stationsApi, rentalsApi, mapApi } from '../services';
import { useToast } from '../context/ToastContext';
import { formatSeconds, formatTime } from '../utils/format';

/**
 * Return flow: choose a destination station, complete the rental, then show
 * a ride summary. Used by students (their own ride) and admins (force-return).
 *
 * Stations that are closed or have no free dock are listed but disabled, so
 * the rider sees why they cannot be chosen.
 */
export default function ReturnDialog({ open, onClose, onReturned, rental, defaultStationId = null }) {
  const toast = useToast();
  const [stations, setStations] = useState([]);
  const [loading, setLoading] = useState(false);
  const [stationId, setStationId] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [summary, setSummary] = useState(null); // completed rental
  const [distance, setDistance] = useState(null);

  useEffect(() => {
    if (!open) return;
    setSummary(null);
    setDistance(null);
    setStationId(defaultStationId ? String(defaultStationId) : '');
    (async () => {
      setLoading(true);
      try {
        setStations(await stationsApi.list());
      } catch (err) {
        toast.error(err.message);
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const chosen = useMemo(
    () => stations.find((s) => String(s.id) === String(stationId)) || null,
    [stations, stationId]
  );
  const chosenBlocked = chosen && !chosen.accepts_returns;

  async function confirm() {
    if (!stationId) {
      toast.error('Choose the station you are returning the cycle to.');
      return;
    }
    setSubmitting(true);
    try {
      const completed = await rentalsApi.returnRide(rental.id, Number(stationId));
      setSummary(completed);
      toast.success('Ride ended. Thanks for riding with CampusCycle!');
      onReturned?.(completed);
      // Shortest road distance between the two stations, when both are mapped.
      if (completed.start_station_id && completed.start_station_id !== completed.end_station_id) {
        mapApi
          .route(completed.start_station_id, completed.end_station_id)
          .then((r) => setDistance(r.distance))
          .catch(() => setDistance(null));
      }
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  if (summary) {
    return (
      <Modal
        open={open}
        onClose={onClose}
        title="Ride complete"
        description={`${summary.bicycle_code} has been returned.`}
        footer={<Button onClick={onClose}>Done</Button>}
      >
        <div className="space-y-4">
          <div className="flex items-center gap-3 rounded-xl bg-emerald-50 p-4 text-emerald-800">
            <CheckCircle2 size={22} className="shrink-0" />
            <p className="text-sm">The cycle is docked and available for the next rider.</p>
          </div>

          <div className="flex items-center gap-2 text-sm font-medium text-slate-800">
            <span className="truncate">{summary.start_station_name || 'Unknown'}</span>
            <ArrowRight size={15} className="shrink-0 text-slate-400" />
            <span className="truncate">{summary.end_station_name}</span>
          </div>

          <dl className="grid grid-cols-3 gap-2 text-center">
            <div className="rounded-lg bg-slate-50 p-3">
              <dt className="flex items-center justify-center gap-1 text-[11px] text-slate-500">
                <Clock size={12} /> Duration
              </dt>
              <dd className="mt-1 font-semibold tabular-nums text-slate-900">
                {formatSeconds(summary.duration_seconds)}
              </dd>
            </div>
            <div className="rounded-lg bg-slate-50 p-3">
              <dt className="text-[11px] text-slate-500">Started</dt>
              <dd className="mt-1 font-semibold text-slate-900">{formatTime(summary.started_at)}</dd>
            </div>
            <div className="rounded-lg bg-slate-50 p-3">
              <dt className="text-[11px] text-slate-500">Ended</dt>
              <dd className="mt-1 font-semibold text-slate-900">{formatTime(summary.ended_at)}</dd>
            </div>
          </dl>

          {distance && (
            <p className="flex items-start gap-1.5 text-xs text-slate-500">
              <Route size={13} className="mt-0.5 shrink-0" />
              Shortest road distance between these stations ≈ {distance.approx_metres} m
              (estimated from the campus map; not the path you actually rode).
            </p>
          )}

          {summary.held_for_maintenance && (
            <p className="flex items-start gap-1.5 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
              <Wrench size={13} className="mt-0.5 shrink-0" />
              {summary.maintenance_notice}
            </p>
          )}
        </div>
      </Modal>
    );
  }

  return (
    <Modal
      open={open}
      onClose={submitting ? undefined : onClose}
      title="End your ride"
      description={rental ? `Returning ${rental.bicycle_code}` : undefined}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button onClick={confirm} loading={submitting} disabled={loading || !stationId || chosenBlocked}>
            End ride here
          </Button>
        </>
      }
    >
      {loading ? (
        <div className="grid place-items-center py-8 text-slate-400">
          <Spinner size={22} />
        </div>
      ) : (
        <div className="space-y-3">
          <Field label="Return station" htmlFor="return-station" required>
            <Select
              id="return-station"
              value={stationId}
              onChange={(e) => setStationId(e.target.value)}
            >
              <option value="">Select a station…</option>
              {stations.map((s) => (
                <option key={s.id} value={s.id} disabled={!s.accepts_returns}>
                  {s.name} —{' '}
                  {s.status !== 'ACTIVE'
                    ? 'temporarily unavailable'
                    : s.free_docks === 0
                      ? 'full'
                      : `${s.free_docks} free dock${s.free_docks === 1 ? '' : 's'}`}
                </option>
              ))}
            </Select>
          </Field>
          {chosen && (
            <p className="flex items-start gap-1.5 text-xs text-slate-500">
              <MapPin size={13} className="mt-0.5 shrink-0" />
              {chosen.location}
            </p>
          )}
        </div>
      )}
      <p className="mt-4 flex items-start gap-1.5 text-xs text-slate-400">
        <Info size={13} className="mt-0.5 shrink-0" />
        Park the cycle in a free dock at the chosen station before ending the ride. Docking is
        recorded in software; no physical lock is controlled.
      </p>
    </Modal>
  );
}
