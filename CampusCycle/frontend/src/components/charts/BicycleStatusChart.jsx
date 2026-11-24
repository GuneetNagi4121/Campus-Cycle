import {
  ResponsiveContainer,
  BarChart,
  Bar,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from 'recharts';
import ChartCard from './ChartCard';
import { BICYCLE_STATUS_COLORS, GRID, AXIS_TEXT, TOOLTIP_STYLE } from './palette';

const LABELS = {
  AVAILABLE: 'Available',
  IN_USE: 'In use',
  RESERVED: 'Reserved',
  MAINTENANCE: 'Maintenance',
};

/**
 * Fleet by status. A current snapshot, not a range figure — the note says so.
 * Each bar is directly labelled, so the reserved status colours are never the
 * only thing carrying meaning.
 */
export default function BicycleStatusChart({ data = [], loading }) {
  // Retired cycles have left the working fleet; they are counted in the note
  // rather than given a bar (and a colour) of their own.
  const retired = data.find((d) => d.status === 'RETIRED')?.count || 0;
  const rows = data.filter((d) => d.status !== 'RETIRED').map((d) => ({
    status: d.status,
    label: LABELS[d.status] || d.status,
    count: d.count,
  }));
  const hasData = rows.some((r) => r.count > 0);

  return (
    <ChartCard
      title="Fleet by status"
      note={`Current snapshot of the working fleet — not affected by the date range.${
        retired ? ` ${retired} retired cycle(s) not shown.` : ''
      }`}
      loading={loading}
      isEmpty={!loading && !hasData}
      emptyMessage="No bicycles have been added yet."
      height={240}
    >
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={rows} margin={{ top: 16, right: 8, bottom: 0, left: -20 }}>
          <CartesianGrid stroke={GRID} strokeDasharray="3 3" vertical={false} />
          <XAxis
            dataKey="label"
            tick={{ fill: AXIS_TEXT, fontSize: 11 }}
            stroke={GRID}
            tickLine={false}
          />
          <YAxis
            allowDecimals={false}
            tick={{ fill: AXIS_TEXT, fontSize: 11 }}
            stroke={GRID}
            tickLine={false}
            width={44}
          />
          <Tooltip {...TOOLTIP_STYLE} formatter={(value) => [`${value} cycles`, 'Count']} />
          <Bar
            dataKey="count"
            radius={[4, 4, 0, 0]}
            barSize={44}
            label={{ position: 'top', fill: AXIS_TEXT, fontSize: 11 }}
          >
            {rows.map((row) => (
              <Cell key={row.status} fill={BICYCLE_STATUS_COLORS[row.status] || AXIS_TEXT} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}
