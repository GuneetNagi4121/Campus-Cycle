# CampusCycle — UCS 503 Software Engineering Project

Smart campus bicycle sharing and mobility management system.

**Guneet Singh Nagi** (`1024030014`) · **Prabhnoor Oberoi** (`1024031153`)
BE Third Year, Computer Science and Engineering
Thapar Institute of Engineering and Technology, Patiala

---

## Repository layout

| Folder | What it holds |
|---|---|
| `CampusCycle/` | The application: Express + PostgreSQL backend, React frontend, SQL schema, migrations, seeds and test suites. See its own `README.md`. |
| `Project-Proposal/` | The project proposal, in the TIET report template. |
| `Project-Prototype/` | The mid-semester report, in the TIET report template. |
| `Project-Report-Final/` | The final end-semester report, in the TIET report template. |
| `diagrams/` | Sources for every data-flow diagram used in the three reports, plus the script that builds them. |
| `assets-source/` | Original material the campus-map artwork was derived from. Not served by the application. |

Each report folder is self-contained: it carries its own copy of
`tietreport.cls`, its own `references.bib` and its own `figures/`, so the folder
can be uploaded to Overleaf on its own and compiled without anything else.

## Deliverables

| Document | File |
|---|---|
| Proposal | `Project-Proposal/CampusCycle-Proposal.pdf` |
| Mid-semester report | `Project-Prototype/CampusCycle-Prototype-Report.pdf` |
| Final report | `Project-Report-Final/CampusCycle-Final-Report.pdf` |

## Compiling a report

**Overleaf:** upload the folder, set the main document to `main.tex`, compile.
The template expects pdfLaTeX with Biber, which is Overleaf's default.

**Locally**, with a TeX Live installation that includes `biblatex` and `biber`:

```bash
cd Project-Report-Final
latexmk -pdf main.tex
```

`main.pdf` is git-ignored; the committed PDF beside it is the named copy from
the table above. Refresh it after a rebuild with, for example:

```bash
cp main.pdf CampusCycle-Final-Report.pdf
```

## Running the application

See `CampusCycle/README.md`. In short:

```bash
cd CampusCycle
npm run install:all
npm run db:setup      # migrations + seed data
npm run dev           # backend and frontend together
npm run test:all      # 285 automated checks against a _test database
```

## Rebuilding the diagrams

```bash
cd diagrams
python3 build.py          # writes pdf/
python3 build.py --png    # also writes png/ for quick inspection
```

Graphviz (`dot`) must be on the PATH. Copy the rebuilt PDFs into the `figures/`
folder of whichever report uses them — `diagrams/README.md` lists which diagram
belongs to which report.
