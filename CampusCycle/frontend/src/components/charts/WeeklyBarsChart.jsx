import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts';
import ChartCard from './ChartCard';
import { SERIES, GRID, AXIS_TEXT, TOOLTIP_STYLE } from './palette';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "w/c 3 Nov" from a YYYY-MM-DD week start, without timezone re-parsing. */
function weekLabel(day) {
  if (!day) return '';
  const [, m, d] = day.split('-');
  return `${Number(d)} ${MONTHS[Number(m) - 1] || ''}`;
}

/**
 * Two measures per ISO week (Mon–Sun) as grouped bars.
 *
 * Uses the project's validated two-series pair. The second series is also
 * hatched, so the pair is distinguishable without relying on colour alone.
 *
 * @param {{ title, note, data, series: [{key, name}, {key, name}], emptyMessage }} props
 */
export default function WeeklyBarsChart({ title, note, data = [], series, loading, emptyMessage, id }) {
  const hasData = data.some((row) => series.some((s) => row[s.key] > 0));
  const patternId = `hatch-${id}`;

  return (
    <ChartCard
      title={title}
      note={note}
      loading={loading}
      isEmpty={!loading && !hasData}
      emptyMessage={emptyMessage}
      height={260}
    >
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 6, right: 8, bottom: 0, left: -18 }} barGap={2} barCategoryGap="28%">
          <defs>
            <pattern id={patternId} width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
              <rect width="6" height="6" fill={SERIES[1]} fillOpacity="0.35" />
              <line x1="0" y1="0" x2="0" y2="6" stroke={SERIES[1]} strokeWidth="3" />
            </pattern>
          </defs>
          <CartesianGrid stroke={GRID} strokeDasharray="3 3" vertical={false} />
          <XAxis
            dataKey="week_start"
            tickFormatter={weekLabel}
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
          <Tooltip
            {...TOOLTIP_STYLE}
            cursor={{ fill: 'rgb(148 163 184 / 0.12)' }}
            labelFormatter={(d) => `Week of ${weekLabel(d)}`}
          />
          <Legend
            verticalAlign="top"
            align="right"
            height={28}
            iconType="square"
            wrapperStyle={{ fontSize: 12, color: AXIS_TEXT }}
          />
          <Bar
            dataKey={series[0].key}
            name={series[0].name}
            fill={SERIES[0]}
            radius={[4, 4, 0, 0]}
            maxBarSize={22}
          />
          <Bar
            dataKey={series[1].key}
            name={series[1].name}
            fill={`url(#${patternId})`}
            stroke={SERIES[1]}
            strokeWidth={1}
            radius={[4, 4, 0, 0]}
            maxBarSize={22}
          />
        </BarChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}
