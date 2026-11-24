import { useEffect, useState } from 'react';
import { Crosshair, Trash2 } from 'lucide-react';
import Modal from '../ui/Modal';
import Button from '../ui/Button';
import { Field, Input, Select } from '../ui/Field';
import CampusMap from '../map/CampusMap';
import { mapApi, stationsApi } from '../../services';
import { useToast } from '../../context/ToastContext';

const empty = {
  code: '',
  name: '',
  location: '',
  capacity: 10,
  status: 'ACTIVE',
  map_x: '',
  map_y: '',
};

/**
 * Create / edit a station, including its position on the campus map.
 *
 * Position is set by clicking the map (or dragging the marker) and stored as
 * a percentage of the map image — no frontend code changes are needed to move
 * a station.
 */
export default function StationFormModal({ open, onClose, onSaved, station, stations = [] }) {
  const toast = useToast();
  const isEdit = !!station;
  const [form, setForm] = useState(empty);
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [mapConfig, setMapConfig] = useState(null);

  useEffect(() => {
    if (!open) return;
    setErrors({});
    setForm(
      station
        ? {
            code: station.code || '',
            name: station.name || '',
            location: station.location || '',
            capacity: station.capacity ?? 10,
            status: station.status || 'ACTIVE',
            map_x: station.map_x ?? '',
            map_y: station.map_y ?? '',
          }
        : empty
    );
    if (!mapConfig) mapApi.config().then(setMapConfig).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, station]);

  function update(key) {
    return (e) => setForm((f) => ({ ...f, [key]: e.target.value }));
  }

  function place(x, y) {
    setForm((f) => ({ ...f, map_x: x, map_y: y }));
    setErrors((e) => ({ ...e, map_x: undefined, map_y: undefined }));
  }

  async function onSubmit(e) {
    e.preventDefault();
    setErrors({});
    const payload = {
      code: form.code.trim().toUpperCase(),
      name: form.name.trim(),
      location: form.location.trim(),
      capacity: Number(form.capacity),
      status: form.status,
      // Optional, but always sent as a pair. Empty clears the position, which
      // takes the station off the map.
      map_x: form.map_x === '' ? '' : Number(form.map_x),
      map_y: form.map_y === '' ? '' : Number(form.map_y),
    };
    setSaving(true);
    try {
      if (isEdit) {
        await stationsApi.update(station.id, payload);
        toast.success(`${payload.name} updated.`);
      } else {
        await stationsApi.create(payload);
        toast.success(`${payload.name} created.`);
      }
      onSaved?.();
      onClose?.();
    } catch (err) {
      if (err.details && typeof err.details === 'object') setErrors(err.details);
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  }

  const hasPos = form.map_x !== '' && form.map_y !== '';
  const draftPin = hasPos ? { x: Number(form.map_x), y: Number(form.map_y) } : null;
  // Show the other stations for context, and this one at its draft position.
  const context = stations.filter((s) => !station || s.id !== station.id);
  const editingStation =
    isEdit && hasPos ? [{ ...station, map_x: draftPin.x, map_y: draftPin.y }] : [];

  return (
    <Modal
      open={open}
      onClose={saving ? undefined : onClose}
      title={isEdit ? `Edit ${station.name}` : 'Add station'}
      size="xl"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button type="submit" form="station-form" loading={saving}>
            {isEdit ? 'Save changes' : 'Add station'}
          </Button>
        </>
      }
    >
      <form id="station-form" className="space-y-4" onSubmit={onSubmit}>
        <div className="grid gap-3 sm:grid-cols-[120px_1fr]">
          <Field label="Stop code" htmlFor="code" error={errors.code} hint="e.g. ST20">
            <Input
              id="code"
              value={form.code}
              onChange={update('code')}
              placeholder="ST20"
              className="font-mono uppercase"
              maxLength={12}
              invalid={!!errors.code}
            />
          </Field>
          <Field label="Station name" htmlFor="name" error={errors.name} required>
            <Input
              id="name"
              value={form.name}
              onChange={update('name')}
              placeholder="Library Stop"
              invalid={!!errors.name}
              maxLength={120}
              required
            />
          </Field>
        </div>

        <Field label="Location" htmlFor="location" error={errors.location} required>
          <Input
            id="location"
            value={form.location}
            onChange={update('location')}
            placeholder="In front of the Library"
            invalid={!!errors.location}
            maxLength={255}
            required
          />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field
            label="Capacity (docks)"
            htmlFor="capacity"
            error={errors.capacity}
            hint={isEdit ? `${station.bikes_at_station ?? 0} cycle(s) parked now` : undefined}
            required
          >
            <Input
              id="capacity"
              type="number"
              min={1}
              max={1000}
              value={form.capacity}
              onChange={update('capacity')}
              invalid={!!errors.capacity}
              required
            />
          </Field>

          <Field label="Status" htmlFor="status" error={errors.status}>
            <Select id="status" value={form.status} onChange={update('status')}>
              <option value="ACTIVE">Active</option>
              <option value="INACTIVE">Inactive (temporarily unavailable)</option>
            </Select>
          </Field>
        </div>

        <fieldset className="rounded-lg border border-slate-200 p-3">
          <legend className="px-1 text-xs font-medium text-slate-600">Position on the campus map</legend>
          <p className="mb-3 flex items-start gap-1.5 text-xs text-slate-500">
            <Crosshair size={14} className="mt-0.5 shrink-0" />
            Click the map to place the station{isEdit ? ', or drag its marker' : ''}. Place it on a
            road beside its building so routes start and end correctly.
          </p>
          <CampusMap
            map={mapConfig}
            stations={[...context.map((s) => ({ ...s })), ...editingStation]}
            selectedId={isEdit ? station.id : null}
            editable={{ stationId: isEdit ? station.id : '__new', onMove: place }}
            draftPin={draftPin}
            onMapClick={place}
            showRoads
            heightClass="h-[260px] sm:h-[320px]"
            markerSize={22}
            ariaLabel="Click to choose the station position"
          />
          <div className="mt-3 grid grid-cols-[1fr_1fr_auto] items-end gap-2">
            <Field label="X (% of width)" htmlFor="map_x" error={errors.map_x}>
              <Input
                id="map_x"
                value={form.map_x}
                onChange={update('map_x')}
                inputMode="decimal"
                placeholder="—"
                className="font-mono"
                invalid={!!errors.map_x}
              />
            </Field>
            <Field label="Y (% of height)" htmlFor="map_y" error={errors.map_y}>
              <Input
                id="map_y"
                value={form.map_y}
                onChange={update('map_y')}
                inputMode="decimal"
                placeholder="—"
                className="font-mono"
                invalid={!!errors.map_y}
              />
            </Field>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => place('', '')}
              disabled={!hasPos}
              title="Take this station off the map"
            >
              <Trash2 size={14} /> Clear
            </Button>
          </div>
          <p className="mt-2 text-[11px] text-slate-400">
            Positions are percentages of the illustrated map image, not GPS coordinates.
          </p>
        </fieldset>
      </form>
    </Modal>
  );
}
