# grabado

**grabado** is a browser-based ER diagram and database design tool. Draw a schema, export DDL for
eight database profiles, or point it at an existing database and get the diagram back. A design is
a plain JSON file that lives in your git repository — there is no database behind the editor.

**Try it: <https://grabado.dev/>** — a **read-only public demo** (saving, introspection
and AI are disabled). **Editing happens entirely in the browser**, so you can draw a schema
and export DDL right there.

It is a fork of [ondras/wwwsqldesigner](https://github.com/ondras/wwwsqldesigner) by Ondrej Zara
(BSD-3-Clause). The drawing engine is kept; everything around it was rewritten in TypeScript, the
PHP backend was replaced with Kotlin/Spring Boot, and the whole thing ships as a single Docker image.

> **The documentation is written in Japanese.** This README is the only English document —
> everything under [`docs/`](docs/), [`CLAUDE.md`](CLAUDE.md) and [`CUSTOMIZATIONS.md`](CUSTOMIZATIONS.md)
> is Japanese. 日本語版 README は [`README.md`](README.md)。

## What it does

- **Draw** — tables, columns, keys, foreign key constraints, indexes and comments, in the browser
- **Export DDL** — eight database profiles from one design (see the table below)
- **Export ORM models** — JPA (Kotlin), Prisma and Drizzle
- **Import an existing database** — introspection reads `information_schema` and returns JSON
- **AI suggestions** — optional, bring your own key. Suggestions are reviewed and applied through
  the same deterministic path as everything else; **nothing is applied automatically**
- **Designs are files** — deterministic JSON (stable key and array order, one table per block),
  so a schema change is a readable diff and sharing is a pull request

## Supported databases

| Profile | DDL export | Introspection |
|---|---|---|
| `postgresql` | yes | yes |
| `mysql` | yes | yes |
| `mariadb` | yes | yes |
| `h2` | yes | yes |
| `mssql` | yes | — |
| `oracle` | yes | — |
| `sqlite` | yes | — |
| `sql-standard` | yes | — |

PostgreSQL 18 is the default palette: designs are drawn with PostgreSQL types and converted at
export time, so the saved file is identical whichever profile you export to.
[`docs/TYPE-MAPPING.md`](docs/TYPE-MAPPING.md) shows what each type becomes in every profile —
that table is generated from the implementation and verified by a test, not written by hand.

## Designs are files, not rows in a database

The editor keeps its working state in the browser. Saving writes through to a mounted directory,
so the source of truth is the JSON file in your repository — reviewed and merged like code.
The format is documented in [`docs/FORMAT.md`](docs/FORMAT.md). XML designs from upstream
wwwsqldesigner can still be read; grabado only writes JSON.

## Quick start

The image is not published to any registry — **build it yourself**.

### With Docker Compose

```bash
cp .env.example .env      # uncomment only the lines you need; it starts with none of them
docker compose up --build
```

Then open <http://127.0.0.1:8080>.

- Designs are written to `schema/` on the host. To put them somewhere else, change the **left**
  side of the mount in [`compose.yaml`](compose.yaml)
- `.env` is **not** copied into the container. Only the variables listed under `environment:` in
  [`compose.yaml`](compose.yaml) are passed through (`env_file:` is not used)
- **Do not leave a key with an empty value** in `.env`. An empty string does not fall back to the
  default — it is passed through and the container fails to start (e.g. `GRABADO_READONLY=`)

### Without Compose

```bash
docker build -t grabado .
docker run --rm -p 8080:8080 -v "$PWD/schema:/data/schema" grabado
```

The left side of `-v` is the host directory holding your design files.

### Read-only mode

```bash
GRABADO_READONLY=true docker compose up
```

Saving, introspection and AI are disabled; listing and loading still work. This is the mode a
public demo runs in — AI calls cost money and introspection is an SSRF pivot, so neither belongs
on a deployment strangers can reach.

### Note for Linux hosts

**It just works.** The container figures out who owns the mount at startup and drops to that
user, so files it writes are owned by you — you can `git add` your designs directly.

Details are in `docker-entrypoint.sh`. Nothing to configure; `docker compose up` is enough.

### Local development

```bash
npm install
npm run dev               # Vite dev server
```

Then open <http://127.0.0.1:4173/index.html>. To check the built assets, `npm run build`
(produces `dist/`) followed by `npm run preview` (<http://127.0.0.1:4174>).

## Configuration

Every variable is listed with a one-line description in [`.env.example`](.env.example);
the contract is [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) §7.3 (backend), §8.4 (AI) and §9.3
(image). The defaults live in `server/src/main/resources/application.yaml` — they are deliberately
not repeated anywhere else.

Two things are worth knowing before you start:

- **AI is off unless both an API key and a model name are set.** The key is injected as an
  environment variable into your own container; it is never stored in the browser
- **Introspection targets are named in configuration, never sent in a request.** There is no way
  to hand grabado a JDBC URL from the outside

## Documentation

| Document | What it holds |
|---|---|
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) | Layout, backend and AI contracts, the image |
| [`docs/FORMAT.md`](docs/FORMAT.md) | The design JSON format |
| [`docs/TYPE-MAPPING.md`](docs/TYPE-MAPPING.md) | What each type becomes in each profile |
| [`docs/TESTING.md`](docs/TESTING.md) | Test layout and how to run it |
| [`docs/BRANCHING.md`](docs/BRANCHING.md) | Branching model |
| [`CUSTOMIZATIONS.md`](CUSTOMIZATIONS.md) | Every decision made since the fork, with its reasoning |
| [`CLAUDE.md`](CLAUDE.md) | Working rules and hard constraints |

## Tests

```bash
npm ci
npx playwright install chromium   # first time only

npm test              # Node side (jsdom). Fast; this is the everyday one
npm run test:browser  # Real browser (Chromium). The authority for the DDL golden files
npm run known-issues  # Reproduces known defects on purpose
npm run test:server   # Kotlin backend over real HTTP
npm run test:image    # Builds the image, starts the container and drives it end to end
```

The golden files pin the bytes the tool actually emits. A change that moves them is either a bug
or a decision that has to be recorded — see [`docs/TESTING.md`](docs/TESTING.md).

## Origin and license

BSD-3-Clause, inherited from upstream — see [`LICENSE`](LICENSE). grabado does not follow
upstream; every difference is recorded in [`CUSTOMIZATIONS.md`](CUSTOMIZATIONS.md) as it is made.

---

Issues and pull requests are accepted, but a response is not guaranteed.
