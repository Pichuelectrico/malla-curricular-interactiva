# USFQ Curriculum Scraper

Extrae mallas curriculares desde el portal externo de la USFQ y genera archivos `Malla-{CODIGO}.json` compatibles con el frontend.

## Requisitos

- [Bun](https://bun.sh) 1.0+
- Conexión a internet (el sitio `wsexternal.usfq.edu.ec` puede ser lento)

## Setup (solo la primera vez)

Desde la raíz del monorepo:

```bash
bun run scraper:setup
```

O desde esta carpeta:

```bash
cd scraper
bun run setup
```

Esto instala dependencias y descarga Chromium en `scraper/browsers/` (no se commitea a git).

## Uso

Desde la carpeta `scraper/`:

```bash
bun run scrape:dry              # ver URLs sin descargar
bun run scrape:career CMP       # una carrera
bun run scrape                  # las 37 carreras
```

Desde la raíz del monorepo:

```bash
bun run scraper:career CMP
bun run scraper
```

Los JSON se guardan en `scraper/output/Malla-{CODIGO}.json`.

## Problemas comunes

| Error | Solución |
|-------|----------|
| `Script not found` / `Cannot find module` | Ejecuta `bun run setup` dentro de `scraper/` |
| `Playwright browsers not found` | Ejecuta `bun run install-browsers` |
| `Failed to fetch` / timeout | El sitio USFQ está lento o caído; reintenta más tarde |
| `No career found with code` | Usa el código corto (ej. `CMP`, `ADM`), no el slug completo |

## Códigos de carrera disponibles

ADM, ANT, ARQ, ART, BIO, CMP, COM, DER, DIS, ECN, EDU, ENF, FIL, FIS, GEO, HIS, ING, LIT, MAT, MED, MUS, NUT, ODON, PSI, QUI, SOC, TUR, VET, y más — ver `KNOWN_CAREERS` en `scrape.ts`.
