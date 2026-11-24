import { useEffect, useMemo, useState } from 'react';
import { Bike, ChevronLeft, Info, MapPin, ScanLine, Search } from 'lucide-react';
import Modal from './ui/Modal';
import Button from './ui/Button';
import Spinner from './ui/Spinner';
import EmptyState from './ui/EmptyState';
import { Input, Select } from './ui/Field';
import QrPanel from './QrPanel';
import { bicyclesApi, rentalsApi, stationsApi } from '../services';
import { useToast } from '../context/ToastContext';

/**
 * Guided rental flow.
 *
 *   1. (optional) pick an available cycle to walk to — filtered by station,
 *   2. scan its QR label (camera) or type the printed code,
 *   3. the backend validates the code and starts the ride.
 *
 * The QR value is never shown or pre-filled: the student has to read it off
 * the bicycle, so the code proves they are standing next to it.
 */
export default function RentDialog({
  open,
  onClose,
  onRented,
  stationId = null,
  preselectedBike = null,
}) {
  const toast = useToast();
  const [step, setStep] = useState('select'); // 'select' | 'scan'
  const [bikes, setBikes] = useState([]);
  const [stations, setStations] = useState([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [stationFilter, setStationFilter] = useState('');
  const [selected, setSelected] = useState(null);
  const [qr, setQr] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    setSelected(preselectedBike);
    setQr('');
    setSearch('');
    setStep(preselectedBike ? 'scan' : 'select');
    setStationFilter(stationId ? String(stationId) : '');
    (async () => {
      setLoading(true);
      try {
        const [bikeList, stationList] = await Promise.all([
          bicyclesApi.list({ status: 'AVAILABLE' }),
          stationsApi.list({ status: 'ACTIVE' }),
        ]);
        const activeIds = new Set(stationList.map((s) => s.id));
        setBikes(bikeList.filter((b) => !b.on_safety_hold && activeIds.has(b.station_id)));
        setStations(stationList);
      } catch (err) {
        toast.error(err.message);
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return bikes.filter((b) => {
      if (stationFilter && String(b.station_id) !== stationFilter) return false;
      if (!q) return true;
      return (
        b.cycle_code?.toLowerCase().includes(q) || b.station_name?.toLowerCase().includes(q)
      );
    });
  }, [bikes, search, stationFilter]);

  async function confirm() {
    const code = qr.trim();
    if (!code) {
      toast.error('Scan the QR label or type the code printed on it.');
      return;
    }
    setSubmitting(true);
    try {
      const rental = await rentalsApi.start(code);
      if (selected && rental.bicycle_code !== selected.cycle_code) {
        toast.info(`That QR belongs to ${rental.bicycle_code}, so the ride started on it.`);
      }
      toast.success(`Ride started on ${rental.bicycle_code}. Enjoy the ride!`);
      onRented?.(rental);
      onClose?.();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  const stationName = stationFilter
    ? stations.find((s) => String(s.id) === stationFilter)?.name
    : null;

  return (
    <Modal
      open={open}
      onClose={submitting ? undefined : onClose}
      title={step === 'select' ? 'Rent a cycle' : 'Scan to unlock'}
      description={
        step === 'select'
          ? 'Choose a cycle to walk to, or scan one you are already standing next to.'
          : 'Scan the QR label on the cycle, or type the code printed under it.'
      }
      footer={
        step === 'scan' ? (
          <>
            <Button variant="ghost" onClick={() => setStep('select')} disabled={submitting}>
              <ChevronLeft size={16} /> Back
            </Button>
            <Button onClick={confirm} loading={submitting} disabled={!qr.trim()}>
              Unlock &amp; start ride
            </Button>
          </>
        ) : (
          <Button
            variant="secondary"
            onClick={() => {
              setSelected(null);
              setStep('scan');
            }}
          >
            <ScanLine size={16} /> I&apos;m at a cycle — scan now
          </Button>
        )
      }
    >
      {step === 'select' ? (
        <div>
          <div className="mb-3 grid gap-2 sm:grid-cols-2">
            <div className="relative">
              <Search
                size={16}
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
              />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search cycle or station"
                className="pl-9"
                aria-label="Search cycles"
              />
            </div>
            <Select
              value={stationFilter}
              onChange={(e) => setStationFilter(e.target.value)}
              aria-label="Filter by station"
            >
              <option value="">All stations</option>
              {stations.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} ({s.available_count})
                </option>
              ))}
            </Select>
          </div>

          {loading ? (
            <div className="grid place-items-center py-10 text-slate-400">
              <Spinner size={24} />
            </div>
          ) : filtered.length === 0 ? (
            <EmptyState
              icon={Bike}
              title={stationName ? `No cycles at ${stationName}` : 'No cycles available'}
              description={
                stationName
                  ? 'Try another station, or clear the station filter.'
                  : 'There are no available cycles right now. Please check back shortly.'
              }
            />
          ) : (
            <ul className="max-h-80 space-y-2 overflow-y-auto pr-1">
              {filtered.map((bike) => (
                <li key={bike.id}>
                  <button
                    type="button"
                    onClick={() => {
                      setSelected(bike);
                      setQr('');
                      setStep('scan');
                    }}
                    className="flex w-full items-center justify-between rounded-lg border border-slate-200 bg-white p-3 text-left transition hover:border-brand-300 hover:bg-brand-50/40"
                  >
                    <span className="flex items-center gap-3">
                      <span className="grid h-9 w-9 place-items-center rounded-lg bg-brand-50 text-brand-600">
                        <Bike size={18} />
                      </span>
                      <span>
                        <span className="block font-medium text-slate-900">{bike.cycle_code}</span>
                        <span className="mt-0.5 flex items-center gap-1 text-xs text-slate-500">
                          <MapPin size={12} /> {bike.station_name || 'Unassigned'}
                          {bike.model ? ` · ${bike.model}` : ''}
                        </span>
                      </span>
                    </span>
                    <span className="text-xs font-medium text-brand-700">Select</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          {selected && (
            <div className="flex items-center gap-3 rounded-lg bg-slate-50 p-3">
              <span className="grid h-10 w-10 place-items-center rounded-lg bg-brand-600 text-white">
                <Bike size={20} />
              </span>
              <div>
                <p className="font-medium text-slate-900">{selected.cycle_code}</p>
                <p className="flex items-center gap-1 text-xs text-slate-500">
                  <MapPin size={12} /> Parked at {selected.station_name}
                </p>
              </div>
            </div>
          )}
          <QrPanel value={qr} onChange={setQr} disabled={submitting} />
          <p className="flex items-start gap-1.5 rounded-lg bg-blue-50 px-3 py-2 text-xs text-blue-800">
            <Info size={14} className="mt-0.5 shrink-0" />
            Unlocking is simulated in software for this project — the ride is recorded, but no
            physical lock is opened.
          </p>
        </div>
      )}
    </Modal>
  );
}
