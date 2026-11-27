# Data-flow diagrams

Every DFD in the three CampusCycle reports is generated from this folder, so a
diagram is corrected by editing a label and re-running the build rather than by
redrawing a picture.

```bash
python3 build.py          # writes pdf/
python3 build.py --png    # also writes png/ for quick inspection
```

Graphviz (`dot`) must be on the PATH. Nothing else is required.

`pdf/` is what the reports include; `png/` is committed too, so a diagram can
be viewed, pasted into a slide or linked from a chat without a LaTeX build.
Both are regenerated from `dot/`, which is the only source of truth — edit a
`.dot` file, re-run the build, and copy the refreshed PDF into the `figures/`
folder of whichever report uses it.

## Notation

Gane–Sarson, used consistently across the whole set:

| Element | Drawn as |
|---|---|
| External entity | square box, bold outline |
| Process | rounded box with a numbered band at the top left |
| Data store | open-ended box, D-number in the left cell |
| Invariant flow | drawn in green |

The green highlight is the one departure from plain Gane–Sarson, and it is
deliberate: it separates flows that merely carry data from flows that carry or
enforce a rule the system must never break — one active ride per student, one
open geofence alert per cycle, no rental of a cycle on a safety hold.

## Where each diagram is used

| Source | Built as | Used in |
|---|---|---|
| `dot/dfd-l0-proposal.dot` | `dfd-l0.pdf` | Proposal — context diagram for the proposed system, including the demand-prediction outputs |
| `dot/dfd-l0-p2.dot` | `dfd-l0.pdf` | Prototype report — context diagram as the system stood at mid-semester, with OpenStreetMap tiles |
| `dot/dfd-l1-p2.dot` | `dfd-l1.pdf` | Prototype report — eight processes, eight stores |
| `dot/dfd-l0.dot` | `dfd-l0.pdf` | Final report — context diagram; no tile service, since the map is now an illustration |
| `dot/dfd-l1.dot` | `dfd-l1.pdf` | Final report — nine processes, nine stores |
| `dot/dfd-l2-rental.dot` | `dfd-l2-rental.pdf` | Prototype (`dfd-l2r.pdf`) and final report — process 3.0 |
| `dot/dfd-l2-maintenance.dot` | `dfd-l2-maintenance.pdf` | Prototype (`dfd-l2m.pdf`) and final report — process 5.0 |
| `dot/dfd-l2-geofence.dot` | `dfd-l2-geofence.pdf` | Prototype (`dfd-l2g.pdf`) and final report — process 7.0 |
| `dot/dfd-l2-analytics.dot` | `dfd-l2-analytics.pdf` | Prototype (`dfd-l2a.pdf`) and final report — process 8.0 |
| `dot/dfd-l2-route.dot` | `dfd-l2-route.pdf` | Final report only — process 9.0, added in Phase 3 |

The proposal and the prototype report keep context and level-1 diagrams scoped
to the system **as it was at that submission**: the prototype's diagrams have no
route-planning process because route planning did not exist then, and they still
show the OpenStreetMap tile service because that is what the prototype used.
Only the level-2 diagrams are shared between reports, because the modules they
describe did not change.

## Layout notes

`dfd-l0*` and `dfd-l1*` are laid out left-to-right in fixed columns — entities,
processes, stores — with invisible edges pinning the vertical order so that
flows run roughly straight instead of sweeping across the page. The level-2
diagrams are staged top-to-bottom, because they are sequences rather than
column structures, and the resulting portrait aspect fits a report page.

When adding a diagram, check the page it lands on: a diagram wider than it is
tall belongs in a `sidewaysfigure`, and one taller than it is wide is larger
upright. `build.py` prints each page size.
