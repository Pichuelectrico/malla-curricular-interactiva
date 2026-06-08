# Joiner

Copia los JSON generados por el scraper al frontend y regenera `availableCurricula.ts`.

## Flujo

```
scraper/output/Malla-*.json
        ↓
  join.py (este script)
        ↓
  frontend/data/
  frontend/public/data/
  frontend/dist/data/      (si existe)
  frontend/src/data/       (si existe)
        ↓
  frontend/data/availableCurricula.ts  (regenerado)
```

## Uso

```bash
# Desde la raíz del repo
python joiner/join.py

# Solo una carrera
python joiner/join.py --code CMP

# Vista previa sin escribir
python joiner/join.py --dry-run

# Solo regenerar availableCurricula.ts (sin copiar del scraper)
python joiner/join.py --regenerate-only
```

## Pipeline completo

```bash
cd scraper && bun run scrape:career CMP && cd ..
python joiner/join.py --code CMP
cd frontend && bun run build
```

No requiere dependencias externas (solo Python 3.10+).
