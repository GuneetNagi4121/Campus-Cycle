import { useEffect, useState } from 'react';
import Modal from '../ui/Modal';
import Button from '../ui/Button';
import { Field, Input, Select } from '../ui/Field';
import { bicyclesApi } from '../../services';
import { useToast } from '../../context/ToastContext';

const STATUS_OPTIONS = [
  { value: 'AVAILABLE', label: 'Available' },
  { value: 'RESERVED', label: 'Reserved' },
  { value: 'MAINTENANCE', label: 'Maintenance' },
  { value: 'RETIRED', label: 'Retired (out of fleet)' },
];

const empty = { cycle_code: '', qr_code: '', model: '', station_id: '', status: 'AVAILABLE' };

/** A random, unambiguous QR value (no 0/O/1/I). */
function generateQr() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  return `CC-QR-${[...bytes].map((b) => alphabet[b % alphabet.length]).join('')}`;
}

export default function BicycleFormModal({ open, onClose, onSaved, bicycle, stations }) {
  const toast = useToast();
  const isEdit = !!bicycle;
  const [form, setForm] = useState(empty);
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setErrors({});
    setForm(
      bicycle
        ? {
            cycle_code: bicycle.cycle_code || '',
            qr_code: bicycle.qr_code || '',
            model: bicycle.model || '',
            station_id: bicycle.station_id ? String(bicycle.station_id) : '',
            status: bicycle.status === 'IN_USE' ? 'AVAILABLE' : bicycle.status || 'AVAILABLE',
          }
        : empty
    );
  }, [open, bicycle]);

  const stationRequired = form.status === 'AVAILABLE' || form.status === 'RESERVED';
  const stationDisabled = form.status === 'RETIRED';

  function update(key) {
    return (e) => setForm((f) => ({ ...f, [key]: e.target.value }));
  }

  async function onSubmit(e) {
    e.preventDefault();
    setErrors({});
    const payload = {
      cycle_code: form.cycle_code.trim(),
      qr_code: form.qr_code.trim(),
      model: form.model.trim(),
      status: form.status,
      station_id:
        form.status === 'RETIRED' || form.station_id === '' ? null : Number(form.station_id),
    };
    setSaving(true);
    try {
      if (isEdit) {
        await bicyclesApi.update(bicycle.id, payload);
        toast.success(`${payload.cycle_code} updated.`);
      } else {
        await bicyclesApi.create(payload);
        toast.success(`${payload.cycle_code} added to the fleet.`);
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

  return (
    <Modal
      open={open}
      onClose={saving ? undefined : onClose}
      title={isEdit ? 'Edit bicycle' : 'Add bicycle'}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button type="submit" form="bike-form" loading={saving}>
            {isEdit ? 'Save changes' : 'Add bicycle'}
          </Button>
        </>
      }
    >
      <form id="bike-form" className="space-y-4" onSubmit={onSubmit}>
        <Field label="Cycle code" htmlFor="cycle_code" error={errors.cycle_code} required>
          <Input
            id="cycle_code"
            value={form.cycle_code}
            onChange={update('cycle_code')}
            placeholder="CC-20-1"
            invalid={!!errors.cycle_code}
            className="font-mono"
            required
          />
        </Field>

        <Field
          label="QR code value"
          htmlFor="qr_code"
          error={errors.qr_code}
          hint="Encoded in the printed label. Must be unique."
          required
        >
          <div className="flex gap-2">
            <Input
              id="qr_code"
              value={form.qr_code}
              onChange={update('qr_code')}
              placeholder="CC-QR-7K3M9PQX"
              invalid={!!errors.qr_code}
              className="font-mono"
              required
            />
            <Button
              type="button"
              variant="secondary"
              onClick={() => setForm((f) => ({ ...f, qr_code: generateQr() }))}
            >
              Generate
            </Button>
          </div>
        </Field>

        <Field label="Model" htmlFor="model" error={errors.model} hint="Optional">
          <Input
            id="model"
            value={form.model}
            onChange={update('model')}
            placeholder="Btwin MyBike City"
            maxLength={80}
            invalid={!!errors.model}
          />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Status" htmlFor="status" error={errors.status}>
            <Select id="status" value={form.status} onChange={update('status')}>
              {STATUS_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </Select>
          </Field>

          <Field
            label="Station"
            htmlFor="station_id"
            error={errors.station_id}
            required={stationRequired}
            hint={
              stationDisabled
                ? 'Retired cycles are not parked at a station'
                : stationRequired
                  ? undefined
                  : 'Optional for maintenance'
            }
          >
            <Select
              id="station_id"
              value={stationDisabled ? '' : form.station_id}
              onChange={update('station_id')}
              invalid={!!errors.station_id}
              disabled={stationDisabled}
            >
              <option value="">— None —</option>
              {stations.map((s) => {
                const isCurrent = bicycle && bicycle.station_id === s.id;
                const full = s.free_docks === 0 && !isCurrent;
                return (
                  <option key={s.id} value={s.id} disabled={full}>
                    {s.name} — {full ? 'full' : `${s.free_docks} free`}
                  </option>
                );
              })}
            </Select>
          </Field>
        </div>
      </form>
    </Modal>
  );
}
