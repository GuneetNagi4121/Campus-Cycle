import { AVAILABILITY_STYLE, MAP_LEGEND } from '../../utils/domain';
import { cn } from '../../utils/format';

/**
 * Legend for the campus map markers. The number inside each marker is the
 * count of cycles available to pick up at that station right now.
 */
export default function MapLegend({ showRoute = false, showRoads = false, compact = false, className }) {
  return (
    <div className={cn('text-xs text-slate-600', className)}>
      <ul
        className={cn(
          'grid gap-x-5 gap-y-2',
          compact ? 'grid-cols-2 sm:flex sm:flex-wrap' : 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3'
        )}
      >
        {MAP_LEGEND.map((item) => (
          <li key={item.level} className="flex items-start gap-2">
            <span
              aria-hidden
              className="mt-0.5 inline-block h-3.5 w-3.5 shrink-0 rounded-full ring-2 ring-white"
              style={{ background: AVAILABILITY_STYLE[item.level].dot, boxShadow: '0 0 0 1px rgb(15 23 42 / .15)' }}
            />
            <span>
              <span className="font-medium text-slate-700">{item.label}</span>
              {!compact && <span className="block text-slate-400">{item.hint}</span>}
            </span>
          </li>
        ))}
        {showRoute && (
          <li className="flex items-start gap-2">
            <span aria-hidden className="mt-1.5 inline-block h-1 w-5 shrink-0 rounded bg-emerald-700 ring-2 ring-white" />
            <span>
              <span className="font-medium text-slate-700">Route along campus roads</span>
              {!compact && <span className="block text-slate-400">A = start, B = destination</span>}
            </span>
          </li>
        )}
        {showRoads && (
          <li className="flex items-start gap-2">
            <span aria-hidden className="mt-1.5 inline-block h-0 w-5 shrink-0 border-t-2 border-dashed border-fuchsia-600" />
            <span className="font-medium text-slate-700">Traced road network</span>
          </li>
        )}
      </ul>
      <p className="mt-3 text-slate-400">
        The number on each marker is the count of cycles available to pick up.
      </p>
    </div>
  );
}
