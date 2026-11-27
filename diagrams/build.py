#!/usr/bin/env python3
"""
Build the CampusCycle data-flow diagrams.

Every diagram in the report is generated from this one file, so the notation
stays consistent and a diagram can be corrected by editing a label rather than
by redrawing a picture.

    python3 build.py            # writes dot/ and pdf/ next to this file
    python3 build.py --png      # also writes png/ for quick inspection

Gane-Sarson notation:

    external entity   square box, bold outline
    process           rounded box, numbered band at the top left
    data store        open-ended box, D-number in the left cell
    green flow        a flow that carries or enforces a system invariant
"""

import os
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
DOT_DIR = os.path.join(HERE, "dot")
PDF_DIR = os.path.join(HERE, "pdf")
PNG_DIR = os.path.join(HERE, "png")

INK = "#1F2A27"        # external entities, store outlines
GREY = "#5B6B66"       # ordinary process outlines
LINE = "#8A9A95"       # ordinary flows
TEXT = "#3C4A46"       # flow labels
ACCENT = "#0B6B4F"     # invariant-carrying flows and processes
FILL = "#F6F8F7"
FILL_ACCENT = "#EAF3EF"

HEADER = f"""  bgcolor="white";
  node [fontname="Helvetica", fontsize=10.5, color="{GREY}"];
  edge [fontname="Helvetica", fontsize=8.5, color="{LINE}", fontcolor="{TEXT}", arrowsize=0.65];
"""


# --- node constructors -----------------------------------------------------

def entity(name, label, dashed=False, note=None):
    """An external entity: square box, bold outline."""
    body = f"<B>{label}</B>"
    if note:
        body += f'<BR/><FONT POINT-SIZE="8.5">{note}</FONT>'
    style = "filled,dashed" if dashed else "filled"
    colour = LINE if dashed else INK
    fill = "#FAFAFA" if dashed else "#FFFFFF"
    return (f'  {name} [shape=box, style="{style}", fillcolor="{fill}", '
            f'color="{colour}", penwidth=1.5, label=<{body}>];\n')


def process(name, number, label, accent=False, dashed=False):
    """A process: rounded box with a numbered band."""
    band = ACCENT if accent else "#9AA8A3"
    outline = ACCENT if accent else GREY
    fill = FILL_ACCENT if accent else FILL
    pen = 1.5 if accent else 1.1
    style = "rounded,filled,dashed" if dashed else "rounded,filled"
    if dashed:
        outline, fill, pen = "#9AA8A3", "#FFFFFF", 1.0
    return (
        f'  {name} [shape=box, style="{style}", fillcolor="{fill}", '
        f'color="{outline}", penwidth={pen}, label=<'
        '<TABLE BORDER="0" CELLBORDER="0" CELLSPACING="0" CELLPADDING="4">'
        f'<TR><TD ALIGN="LEFT" BORDER="1" SIDES="B" COLOR="{band}">'
        f'<FONT FACE="Courier" POINT-SIZE="9">{number}</FONT></TD></TR>'
        f'<TR><TD>{label}</TD></TR></TABLE>>];\n'
    )


def store(name, number, label, note=None, secondary=False):
    """A data store: open-ended box with the D-number in the left cell."""
    colour = GREY if secondary else INK
    body = f'<FONT FACE="Courier">{label}</FONT>'
    if note:
        body += f'<BR/><FONT POINT-SIZE="8">{note}</FONT>'
    return (
        f'  {name} [shape=plaintext, label=<'
        f'<TABLE BORDER="1" CELLBORDER="0" CELLSPACING="0" CELLPADDING="5" COLOR="{colour}">'
        f'<TR><TD BORDER="1" SIDES="R" COLOR="{colour}">'
        f'<FONT FACE="Courier" POINT-SIZE="10">{number}</FONT></TD>'
        f'<TD>{body}</TD></TR></TABLE>>];\n'
    )


def flow(src, dst, label="", accent=False, both=False, dashed=False, weight=None):
    attrs = []
    if label:
        attrs.append(f'label="{label}"')
    if accent:
        attrs.append(f'color="{ACCENT}", fontcolor="{ACCENT}"')
    if dashed:
        attrs.append('style=dashed')
    if both:
        attrs.append('dir=both')
    if weight:
        attrs.append(f'weight={weight}')
    return f'  {src} -> {dst} [{", ".join(attrs)}];\n'


def order(*names):
    """Invisible edges that fix the vertical order inside a column."""
    chain = " -> ".join(names)
    return (f'  edge [style=invis, label="", weight=100];\n'
            f'  {chain};\n'
            f'  edge [style=solid, weight=1];\n')


def same(*names):
    return "  { rank=same; " + "; ".join(names) + "; }\n"


def graph(name, body, rankdir="LR", nodesep=0.32, ranksep=1.5):
    return (f"digraph {name} {{\n"
            f"  rankdir={rankdir};\n"
            f"  nodesep={nodesep}; ranksep={ranksep};\n"
            f"{HEADER}\n{body}}}\n")


# ---------------------------------------------------------------------------
# Level 2.3 - Process rentals and returns
# ---------------------------------------------------------------------------

def dfd_rental():
    b = ""
    b += entity("student", "Student")
    b += process("p31", "3.1", "Resolve QR code<br/>to a bicycle".replace("<br/>", "<BR/>"))
    b += process("p32", "3.2", "Check the rider holds<BR/>no open ride", accent=True)
    b += process("p33", "3.3", "Lock the cycle row<BR/>SELECT &#8230; FOR UPDATE", accent=True)
    b += process("p34", "3.4", "Consult the<BR/>safety hold", accent=True)
    b += process("p35", "3.5", "Open the rental<BR/>set cycle IN_USE")
    b += process("p36", "3.6", "Validate the<BR/>return station")
    b += process("p37", "3.7", "Complete the ride<BR/>park the cycle")
    b += process("p38", "3.8", "Apply a hold deferred<BR/>from mid-ride", accent=True)
    b += process("p50", "5.0", "Manage maintenance<BR/>(level 1)", dashed=True)
    b += store("d3", "D3", "bicycles")
    b += store("d4", "D4", "rentals")
    b += store("d5", "D5", "maintenance_reports")
    b += store("d2", "D2", "stations")

    b += flow("student", "p31", "scanned QR code")
    b += flow("p31", "d3", "lookup by qr_code", both=True)
    b += flow("p31", "p32", "bicycle id")
    b += flow("p32", "d4", "any ACTIVE rental\\nfor this rider", both=True)
    b += flow("p32", "p33", "rider is free", accent=True)
    b += flow("p33", "d3", "row lock held for\\nthe transaction", accent=True, both=True)
    b += flow("p33", "p34", "status AVAILABLE")
    b += flow("p34", "d5", "unresolved HIGH or\\nCRITICAL report?", both=True)
    b += flow("p34", "p35", "no hold", accent=True)
    b += flow("p34", "student", "409 refusal:\\ncycle on safety hold", accent=True)
    b += flow("p32", "student", "409 refusal:\\nride already open", accent=True)
    b += flow("p35", "d4", "insert ACTIVE rental")
    b += flow("p35", "d3", "IN_USE, station_id NULL")
    b += flow("p35", "student", "active ride")

    b += flow("student", "p36", "return station id")
    b += flow("p36", "d2", "station is ACTIVE", both=True)
    b += flow("p36", "p37", "accepted; capacity\\nis never enforced here")
    b += flow("p37", "d4", "COMPLETED, ended_at")
    b += flow("p37", "p38", "cycle being parked")
    b += flow("p38", "d5", "hold filed during\\nthe ride?", both=True)
    b += flow("p38", "d3", "park MAINTENANCE if held,\\notherwise AVAILABLE", accent=True)
    b += flow("p38", "student", "ride summary\\nand duration")
    b += flow("p50", "p34", "hold state", accent=True, dashed=True)

    return graph("dfd2rental", b, rankdir="TB", nodesep=0.45, ranksep=0.85)


# ---------------------------------------------------------------------------
# Level 2.5 - Manage maintenance and the safety hold
# ---------------------------------------------------------------------------

def dfd_maintenance():
    b = ""
    b += entity("student", "Student")
    b += entity("admin", "Administrator")
    b += process("p51", "5.1", "Validate the report<BR/>cycle, category, text")
    b += process("p52", "5.2", "Record the report<BR/>status OPEN")
    b += process("p53", "5.3", "Classify severity<BR/>and decide the hold", accent=True)
    b += process("p54", "5.4", "Take the cycle out<BR/>of service now", accent=True)
    b += process("p55", "5.5", "Defer the hold to<BR/>the end of the ride", accent=True)
    b += process("p56", "5.6", "Validate the<BR/>status transition")
    b += process("p57", "5.7", "Record resolution<BR/>and notes")
    b += process("p58", "5.8", "Return the cycle<BR/>to service", accent=True)
    b += process("p30", "3.0", "Process rentals<BR/>(level 1)", dashed=True)
    b += store("d5", "D5", "maintenance_reports")
    b += store("d3", "D3", "bicycles")
    b += store("d4", "D4", "rentals")

    b += flow("student", "p51", "category, description,\\nseverity")
    b += flow("admin", "p51", "report filed on\\na student's behalf")
    b += flow("p51", "p52", "valid report")
    b += flow("p51", "student", "400 with the\\nfailing field")
    b += flow("p52", "d5", "insert OPEN")
    b += flow("p52", "student", "acknowledgement")
    b += flow("p52", "p53", "severity")
    b += flow("p53", "d4", "is the cycle\\nout on a ride?", both=True)
    b += flow("p53", "p54", "HIGH or CRITICAL,\\ncycle is parked", accent=True)
    b += flow("p53", "p55", "HIGH or CRITICAL,\\nride in progress", accent=True)
    b += flow("p54", "d3", "status MAINTENANCE", accent=True)
    b += flow("p55", "p30", "park as MAINTENANCE\\non return", accent=True, dashed=True)

    b += flow("admin", "p56", "new status, notes")
    b += flow("p56", "d5", "current status", both=True)
    b += flow("p56", "admin", "409 on an invalid\\ntransition")
    b += flow("p56", "p57", "OPEN -> IN_PROGRESS\\n-> RESOLVED -> CLOSED")
    b += flow("p57", "d5", "resolved_at, notes")
    b += flow("p57", "admin", "updated queue")
    b += flow("admin", "p58", "explicit return-to-\\nservice action")
    b += flow("p58", "d5", "any hold left?", both=True)
    b += flow("p58", "d3", "status AVAILABLE,\\nonly if no hold remains", accent=True)
    b += flow("p58", "admin", "409 while a hold\\nremains", accent=True)
    b += flow("p30", "p53", "rental attempt\\nblocked by a hold", accent=True, dashed=True)

    return graph("dfd2maint", b, rankdir="TB", nodesep=0.45, ranksep=0.85)


# ---------------------------------------------------------------------------
# Level 2.7 - Monitor geofence
# ---------------------------------------------------------------------------

def dfd_geofence():
    b = ""
    b += entity("admin", "Administrator")
    b += entity("gps", "Telemetry source", dashed=True, note="not yet built")
    b += process("p71", "7.1", "Authorise the caller<BR/>admin role only", accent=True)
    b += process("p72", "7.2", "Validate the position<BR/>source and range", accent=True)
    b += process("p73", "7.3", "Store the ping<BR/>with its provenance")
    b += process("p74", "7.4", "Load the active<BR/>boundary polygon")
    b += process("p75", "7.5", "Test the point<BR/>against the polygon")
    b += process("p76", "7.6", "Open or increment<BR/>the alert", accent=True)
    b += process("p77", "7.7", "Record a<BR/>re-entry")
    b += process("p78", "7.8", "Acknowledge or<BR/>resolve an alert")
    b += process("p79", "7.9", "Replace the<BR/>boundary")
    b += store("d7", "D7", "bicycle_location_pings")
    b += store("d6", "D6", "geofence_config")
    b += store("d8", "D8", "geofence_events")
    b += store("d4", "D4", "rentals")

    b += flow("admin", "p71", "cycle id, latitude,\\nlongitude, source")
    b += flow("gps", "p71", "device position", dashed=True)
    b += flow("p71", "gps", "401 until device\\ntraffic is trusted", dashed=True)
    b += flow("p71", "p72", "admin token verified", accent=True)
    b += flow("p72", "admin", "400: source must be\\nSIMULATED", accent=True)
    b += flow("p72", "p73", "accepted position", accent=True)
    b += flow("p73", "d7", "insert with\\nsource = SIMULATED")
    b += flow("p73", "p74", "position")
    b += flow("p74", "d6", "active polygon", both=True)
    b += flow("p74", "p75", "polygon vertices")
    b += flow("p75", "p76", "outside: ray-casting\\ntest returns false", accent=True)
    b += flow("p75", "p77", "inside")
    b += flow("p75", "admin", "no boundary configured")
    b += flow("p76", "d4", "ride in progress\\nat that moment", both=True)
    b += flow("p76", "d8", "one open event per cycle;\\na repeat increments\\nping_count", accent=True, both=True)
    b += flow("p76", "admin", "alert raised once", accent=True)
    b += flow("p77", "d8", "last position updated,\\nalert stays open for\\na person to judge", both=True)
    b += flow("admin", "p78", "acknowledge or resolve")
    b += flow("p78", "d8", "status, resolved_at", both=True)
    b += flow("p78", "admin", "updated alert list")
    b += flow("admin", "p79", "new polygon")
    b += flow("p79", "d6", "deactivate old,\\ninsert new; exactly one\\nmay be active", accent=True, both=True)

    return graph("dfd2geo", b, rankdir="TB", nodesep=0.45, ranksep=0.85)


# ---------------------------------------------------------------------------
# Level 2.8 - Generate analytics
# ---------------------------------------------------------------------------

def dfd_analytics():
    b = ""
    b += entity("admin", "Administrator")
    b += process("p81", "8.1", "Validate the period<BR/>and reporting timezone", accent=True)
    b += process("p82", "8.2", "Fleet snapshot<BR/>period-independent")
    b += process("p83", "8.3", "Period ride counts<BR/>and durations")
    b += process("p84", "8.4", "Build a continuous<BR/>date axis", accent=True)
    b += process("p85", "8.5", "Demand by station<BR/>and by hour")
    b += process("p86", "8.6", "Maintenance load<BR/>by severity")
    b += process("p87", "8.7", "Assemble the<BR/>response")
    b += store("d3", "D3", "bicycles")
    b += store("d2", "D2", "stations")
    b += store("d4", "D4", "rentals")
    b += store("d5", "D5", "maintenance_reports")

    b += flow("admin", "p81", "from, to")
    b += flow("p81", "admin", "400 on an\\ninverted range")
    b += flow("p81", "p82", "validated window", accent=True)
    b += flow("p81", "p83", "window in the campus\\ntimezone, not the\\ndatabase session's", accent=True)
    b += flow("p82", "d3", "COUNT &#8230; FILTER\\nby status", both=True)
    b += flow("p82", "d2", "active stations,\\ntotal capacity", both=True)
    b += flow("p82", "p87", "snapshot and\\nall-time totals")
    b += flow("p83", "d4", "rides started inside\\nthe window", both=True)
    b += flow("p83", "p84", "counts per day")
    b += flow("p84", "p87", "zeros on quiet days,\\nnot gaps", accent=True)
    b += flow("p85", "d4", "GROUP BY station,\\nhour of day", both=True)
    b += flow("p85", "d2", "station names", both=True)
    b += flow("p81", "p85", "window")
    b += flow("p85", "p87", "ranked stations,\\nhourly profile")
    b += flow("p81", "p86", "window")
    b += flow("p86", "d5", "open and resolved\\nby severity", both=True)
    b += flow("p86", "p87", "maintenance figures")
    b += flow("p87", "admin", "one payload; an average\\nover no rides is absent,\\nnot zero", accent=True)

    return graph("dfd2analytics", b, rankdir="TB", nodesep=0.45, ranksep=0.85)


# ---------------------------------------------------------------------------
# Level 2.9 - Plan a campus route
# ---------------------------------------------------------------------------

def dfd_route():
    b = ""
    b += entity("student", "Student")
    b += entity("admin", "Administrator")
    b += process("p91", "9.1", "Load the traced<BR/>road network")
    b += process("p92", "9.2", "Build the weighted<BR/>graph once at start-up")
    b += process("p93", "9.3", "Resolve the two<BR/>stations")
    b += process("p94", "9.4", "Snap each station<BR/>onto the nearest road")
    b += process("p95", "9.5", "Shortest path<BR/>Dijkstra over roads", accent=True)
    b += process("p96", "9.6", "Convert pixels to<BR/>percentages of the image")
    b += process("p97", "9.7", "Attach live<BR/>availability")
    b += store("d9", "D9", "campus-map.json", note="junctions, roads, scale", secondary=True)
    b += store("d2", "D2", "stations")
    b += store("d3", "D3", "bicycles")

    b += flow("p91", "d9", "junctions, roads,\\nmetres per pixel", both=True)
    b += flow("p91", "p92", "nodes and segments")
    b += flow("p92", "p95", "adjacency with\\npixel-length weights")
    b += flow("student", "p93", "from station,\\nto station")
    b += flow("admin", "p93", "same endpoint,\\nadmin map view")
    b += flow("p93", "d2", "map_x, map_y", both=True)
    b += flow("p93", "student", "404 for an\\nunknown station")
    b += flow("p93", "p94", "two map positions")
    b += flow("p94", "p95", "access legs onto\\nthe network")
    b += flow("p94", "student", "warning when a station\\nsits far from any road")
    b += flow("p95", "p96", "ordered junction path;\\nnever cuts through\\nbuildings", accent=True)
    b += flow("p96", "p97", "polyline as percentages,\\nzoom-independent")
    b += flow("p97", "d3", "cycles parked at\\neach endpoint", both=True)
    b += flow("p97", "d2", "capacity", both=True)
    b += flow("p97", "student", "polyline, approximate\\ndistance, endpoint\\navailability")
    b += flow("p97", "admin", "same route for the\\nadmin map")

    return graph("dfd2route", b, rankdir="TB", nodesep=0.45, ranksep=0.85)


DIAGRAMS = {
    "dfd-l2-rental": dfd_rental,
    "dfd-l2-maintenance": dfd_maintenance,
    "dfd-l2-geofence": dfd_geofence,
    "dfd-l2-analytics": dfd_analytics,
    "dfd-l2-route": dfd_route,
}

# Hand-written sources that live in dot/ already (level 0 and level 1).
STATIC = ["dfd-l0", "dfd-l1", "dfd-l0-p2", "dfd-l1-p2", "dfd-l0-proposal"]


def main():
    want_png = "--png" in sys.argv
    os.makedirs(DOT_DIR, exist_ok=True)
    os.makedirs(PDF_DIR, exist_ok=True)
    if want_png:
        os.makedirs(PNG_DIR, exist_ok=True)

    for name, fn in DIAGRAMS.items():
        with open(os.path.join(DOT_DIR, name + ".dot"), "w") as fh:
            fh.write(fn())

    for name in list(DIAGRAMS) + STATIC:
        src = os.path.join(DOT_DIR, name + ".dot")
        if not os.path.exists(src):
            print(f"  missing source: {src}", file=sys.stderr)
            continue
        pdf = os.path.join(PDF_DIR, name + ".pdf")
        subprocess.run(["dot", "-Tpdf", src, "-o", pdf], check=True)
        print(f"  {name}.pdf")
        if want_png:
            subprocess.run(["dot", "-Tpng", "-Gdpi=110", src, "-o",
                            os.path.join(PNG_DIR, name + ".png")], check=True)


if __name__ == "__main__":
    main()
