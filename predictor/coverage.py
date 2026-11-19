#!/usr/bin/env python3
"""Cobertura 202620: demanda estimada (rango) vs capacidad publicada, por materia.

Definiciones de negocio:
- planned_courses  = prerregistro: intención de tomar la materia en el periodo objetivo.
- in_progress      = se cursa ahora; el estudiante necesitará las sucesoras (1 salto) en el objetivo.
- Demanda histórica = matrícula proxy = total - available por NRC de Teoría (NO `total`, que es cupo).
- Capacidad publicada = suma de `total` por materia en course_offer (available/enrolled son NULL).

Uso: .venv/bin/python coverage.py [--skip-model-eval]
"""

from __future__ import annotations

import argparse
import json
import math
import re
import statistics
from collections import Counter, defaultdict
from datetime import datetime, timezone

import numpy as np

from config import OUTPUT_DIR
from features.codes import _E_SUFFIX, canonical_course_code, normalize_course_code
from graph.curriculum import iter_curricula, parse_prereq_group
from graph.propagation import build_curriculum_graph, default_transition_probability

TARGET = "202620"
REGULARS = ["202410", "202420", "202510", "202520", "202610"]
SEASON_OF = {"202510": "202410", "202520": "202420", "202610": "202510", TARGET: "202520"}
PREV_OF = {"202510": "202420", "202520": "202510", "202610": "202520", TARGET: "202610"}
FRESH_SINCE = "2026-10-15"  # progreso editado tras publicarse la oferta 202620 (rollover 16-nov)
SHRINK_K = 5.0  # n observaciones de señal para pesar 50% señal / 50% histórico
PASS_RATE = (0.80, 0.95)  # aprobar la materia que se cursa ahora (supuesto)
TRANS_SCALE = (0.7, 1.0)  # factor sobre prioris 0.8/0.5/0.25 de default_transition_probability
CENSOR_UPLIFT = 0.25  # secciones llenas: demanda real >= cupo; techo = +25% del cupo de esas secciones
DEFAULT_SECTION = 25


ALIASES: dict[str, set[str]] = defaultdict(set)  # codigo canonico -> variantes originales vistas


def canon(code: str) -> str:
    """Normaliza y quita el sufijo E final (CMP-5006E == CMP-5006), como offerMatching.ts (exacto, luego base)."""
    base = canonical_course_code(code)
    ALIASES[base].add(normalize_course_code(str(code)))
    return base


def load(name):
    with open(OUTPUT_DIR / name, encoding="utf-8") as f:
        return json.load(f)


def teoria(rows):
    return [r for r in rows if r.get("type") == "Teoría"]


def enrollment_by_period(history):
    """{(code, period): dict(cap, enr, sections, full, ...)} sobre Teoría con total y available."""
    out: dict[tuple[str, str], dict] = {}
    for r in teoria(history):
        total, avail = r.get("total"), r.get("available")
        if total is None or total <= 0:
            continue
        code = canon(r["course_code"])
        d = out.setdefault(
            (code, r["period_code"]),
            {"cap": 0, "enr": 0, "sections": 0, "full": 0, "full_cap": 0, "no_avail": 0, "sizes": []},
        )
        d["cap"] += total
        d["sections"] += 1
        d["sizes"].append(total)
        if avail is None:
            d["no_avail"] += 1
            continue
        d["enr"] += max(0, total - avail)
        if avail <= 0:
            d["full"] += 1
            d["full_cap"] += total
    return out


def metrics(y, p):
    y, p = np.asarray(y, float), np.asarray(p, float)
    ae = np.abs(y - p)
    m = y > 0
    return {
        "n": int(len(y)),
        "mae": round(float(ae.mean()), 2),
        "median_ae": round(float(np.median(ae)), 2),
        "wape_pct": round(float(ae.sum() / y.sum() * 100), 1),
        "mape_pct": round(float((ae[m] / y[m]).mean() * 100), 1),
        "bias": round(float((p - y).mean()), 2),
    }


def history_backtest(enr):
    """Baselines solo-historia contra matrícula proxy (y capacidad) en periodos holdout."""
    res = []
    for t in ["202510", "202520", "202610"]:
        prev, seas = PREV_OF[t], SEASON_OF[t]
        codes = [c for (c, p) in enr if p == t and enr[(c, p)]["enr"] > 0
                 and ((c, prev) in enr or (c, seas) in enr)]
        y = [enr[(c, t)]["enr"] for c in codes]
        cap_t = [enr[(c, t)]["cap"] for c in codes]

        def get(c, p, k="enr"):
            return enr[(c, p)][k] if (c, p) in enr else None

        def mix(c):
            a, b = get(c, prev), get(c, seas)
            return np.mean([x for x in (a, b) if x is not None])

        def blend(c, w):
            a, b = get(c, seas), get(c, prev)
            if a is None or b is None:
                return a if a is not None else b
            return w * a + (1 - w) * b

        preds = {
            "naive_semestre_anterior": [get(c, prev) if get(c, prev) is not None else get(c, seas) for c in codes],
            "naive_misma_estacion": [get(c, seas) if get(c, seas) is not None else get(c, prev) for c in codes],
            "promedio_anterior_y_estacion": [mix(c) for c in codes],
            "mezcla_75estacion_25anterior": [blend(c, 0.75) for c in codes],
            "capacidad_publicada_del_periodo": cap_t,
        }
        res.append({
            "target": t, "n_courses": len(codes), "truth": "matricula_proxy(total-available)",
            "models": {k: metrics(y, v) for k, v in preds.items()},
        })
    return res


def old_models_eval(history, enr):
    """Reproduce el pipeline previo (hibrido de formula + GBR sobre pseudoetiquetas) con corte temporal."""
    from features.build import build_feature_frame
    from models.demand import apply_model, train_demand_model

    out = []
    for t in ["202510", "202520", "202610"]:
        train_rows = [r for r in history if (r.get("period_code") or "") < t]
        df = build_feature_frame(use_calibrated_rates=False, target_period_code=t, history_rows=train_rows)
        model = train_demand_model(df)  # igual que en produccion: sin actuales => pseudoetiquetas
        res = apply_model(df, model, prefer_gbr=True)
        first = res.drop_duplicates("offer_code").set_index("offer_code")
        prev, seas = PREV_OF[t], SEASON_OF[t]
        codes = [c for (c, p) in enr if p == t and enr[(c, p)]["enr"] > 0 and c in first.index
                 and first.loc[c, "num_periods"] > 0 and ((c, prev) in enr or (c, seas) in enr)]
        y_enr = [enr[(c, t)]["enr"] for c in codes]
        y_cap = [enr[(c, t)]["cap"] for c in codes]
        naive = [enr[(c, prev)]["enr"] if (c, prev) in enr else enr[(c, seas)]["enr"] for c in codes]
        naive_cap = [enr[(c, prev)]["cap"] if (c, prev) in enr else enr[(c, seas)]["cap"] for c in codes]
        hyb = [float(first.loc[c, "estimated_students"]) for c in codes]
        gbr = [float(first.loc[c, "gbr_estimated_students"]) if first.loc[c, "gbr_available"]
               else float(first.loc[c, "estimated_students"]) for c in codes]
        out.append({
            "target": t, "n_courses": len(codes),
            "vs_matricula_proxy": {
                "hibrido_formula": metrics(y_enr, hyb), "gbr_pseudoetiquetas": metrics(y_enr, gbr),
                "baseline_semestre_anterior": metrics(y_enr, naive),
            },
            "vs_capacidad_(verdad_usada_por_backtest_viejo)": {
                "hibrido_formula": metrics(y_cap, hyb), "gbr_pseudoetiquetas": metrics(y_cap, gbr),
                "baseline_capacidad_semestre_anterior": metrics(y_cap, naive_cap),
            },
            "gbr_vs_hibrido_mae_entre_si": round(float(np.mean(np.abs(np.array(gbr) - np.array(hyb)))), 2),
        })
    return out


def history_estimate(code, enr):
    """Demanda base y rango de un curso para TARGET desde historia de matricula proxy."""
    e = {p: enr[(code, p)] for p in REGULARS if (code, p) in enr and enr[(code, p)]["enr"] > 0}
    if not e:
        return None
    seas, prev = SEASON_OF[TARGET], PREV_OF[TARGET]
    # backtest: la misma estacion domina; mezcla 75/25 con el semestre anterior si ambos existen
    if seas in e and prev in e:
        central = 0.75 * e[seas]["enr"] + 0.25 * e[prev]["enr"]
    elif seas in e or prev in e:
        central = float(e[seas if seas in e else prev]["enr"])
    else:
        central = float(np.mean([v["enr"] for v in e.values()]))
    lows = [v["enr"] for v in e.values()]
    highs = [v["enr"] + CENSOR_UPLIFT * v["full_cap"] for v in e.values()]
    low = min(lows)
    high = max(highs)
    return {
        "central": central, "low": float(low), "high": float(max(high, central)),
        "periods_used": sorted(e), "by_period": {p: e[p]["enr"] for p in sorted(e)},
        "censored_share": round(sum(v["full"] for v in e.values()) / max(1, sum(v["sections"] for v in e.values())), 2),
    }


REAL_MALLA_ID = re.compile(r"^Malla-(academica-)?[A-Za-z0-9]+$")
MIN_FRESH_OFFER_SHARE = 0.9  # guarda: solo se descartan NRC obsoletos si el lote más reciente cubre >=90% de filas
MIN_MEASURED_SHARE = 0.5  # avance de matrícula: solo si >=50% de las secciones de Teoría tienen `available`


def is_real_progress_row(row: dict) -> bool:
    """False para filas fantasma (curriculum_id tipo 'cmp-usfq' que creaba el reset antiguo)."""
    return bool(REAL_MALLA_ID.match(str(row.get("curriculum_id", ""))))


def planned_applies(row: dict, target: str = TARGET) -> str:
    """'target' | 'legacy' | 'other' según planned_period_code (None = fila previa a la columna)."""
    code = row.get("planned_period_code")
    if not code:
        return "legacy"
    return "target" if code == target else "other"


def split_obsolete_offer(offer: list[dict], min_share: float = MIN_FRESH_OFFER_SHARE) -> tuple[list[dict], list[dict]]:
    """Separa NRC obsoletos: los que no llevan el `last_updated` del último scrape.

    Guardas (iguales a las del cron): el lote más reciente debe ser >0 y >= `min_share` de las filas;
    si no, no se descarta nada.
    """
    stamps = Counter(r.get("last_updated") for r in offer if r.get("last_updated"))
    if not stamps:
        return list(offer), []
    latest = max(stamps)
    fresh = [r for r in offer if r.get("last_updated") == latest]
    if not fresh or len(fresh) < min_share * len(offer):
        return list(offer), []
    return fresh, [r for r in offer if r.get("last_updated") != latest]


def enrollment_progress_by_code(offer: list[dict]) -> dict[str, dict]:
    """Matrícula observada en la oferta actual (total−available) por materia, con cobertura de secciones."""
    acc: dict[str, dict] = {}
    for r in teoria(offer):
        if r.get("total") is None or r["total"] <= 0:
            continue
        d = acc.setdefault(canon(r["course_code"]), {"enr": 0, "measured": 0, "sections": 0})
        d["sections"] += 1
        if r.get("available") is not None:
            d["measured"] += 1
            d["enr"] += max(0, r["total"] - r["available"])
    return {
        c: {"matriculados": d["enr"], "secciones_medidas": d["measured"], "secciones": d["sections"],
            "cobertura_secciones": round(d["measured"] / d["sections"], 2),
            "informativo": d["measured"] / d["sections"] >= MIN_MEASURED_SHARE}
        for c, d in acc.items() if d["measured"] > 0
    }


def user_signals(progress):
    """Contadores de señales por materia (codigo oferta) + propagación 1 salto desde cursando."""
    planned, cursando = Counter(), Counter()
    planned_fresh = Counter()
    succ_lo, succ_hi = defaultdict(float), defaultdict(float)
    curricula = {cid: data for cid, data in iter_curricula()}
    graphs = {cid: (build_curriculum_graph(d["courses"]), d["courses"]) for cid, d in curricula.items()}
    unmapped = Counter()
    used_users = 0
    planned_legacy = Counter()
    ghost_rows = 0
    for u in progress:
        cid = u["curriculum_id"]
        if not is_real_progress_row(u):
            ghost_rows += 1
            continue
        if cid not in graphs:
            continue
        g, courses = graphs[cid]
        ids = set(g.nodes)
        cur = set(u.get("in_progress_courses") or [])
        pln = set(u.get("planned_courses") or [])
        done = set(u.get("completed_courses") or [])
        if not (cur or pln):
            continue
        used_users += 1
        scope = planned_applies(u)
        for x in pln:
            if x in ids:
                if scope == "other":  # planeada para otro período: no es demanda de 202620
                    continue
                planned[canon(x)] += 1
                if scope == "legacy":
                    planned_legacy[canon(x)] += 1
                # «fresca» = sellada con el período objetivo (o, sin sello, editada tras publicarse 202620)
                if scope == "target" or (scope == "legacy" and u["updated_at"][:10] >= FRESH_SINCE):
                    planned_fresh[canon(x)] += 1
            else:
                unmapped[x] += 1
        for x in cur:
            if x in ids:
                cursando[canon(x)] += 1
            else:
                unmapped[x] += 1
        have = done | cur
        for x in cur & ids:
            for y in g.successors.get(x, []):
                if y in done or y in cur or y in pln:
                    continue
                exprs = g.prerequisites.get(y, [])
                if not all(any(a in have for a in parse_prereq_group(e)) for e in exprs):
                    continue
                p = default_transition_probability(g, x, y)
                yy = canon(y)
                succ_lo[yy] += PASS_RATE[0] * TRANS_SCALE[0] * p
                succ_hi[yy] += PASS_RATE[1] * TRANS_SCALE[1] * p
    return {
        "planned": planned, "planned_fresh": planned_fresh, "planned_legacy": planned_legacy, "ghost_rows": ghost_rows,
        "cursando": cursando,
        "succ_lo": succ_lo, "succ_hi": succ_hi, "unmapped": unmapped, "users_with_signal": used_users,
    }


def audit_signals(progress, sig):
    all_rows = len(progress)
    progress = [u for u in progress if is_real_progress_row(u)]
    states = Counter()
    by_fac = defaultdict(lambda: {"users": 0, "con_planeada": 0, "con_cursando": 0, "con_completadas": 0})
    for u in progress:
        fac = u["curriculum_id"].replace("Malla-academica-", "").split("-")[0].upper()
        s = by_fac[fac]
        s["users"] += 1
        has_p, has_c, has_d = bool(u.get("planned_courses")), bool(u.get("in_progress_courses")), bool(u.get("completed_courses"))
        s["con_planeada"] += has_p
        s["con_cursando"] += has_c
        s["con_completadas"] += has_d
        states["planeada" if has_p else "sin_planeada"] += 1
        states["cursando" if has_c else "sin_cursando"] += 1
        states["completadas" if has_d else "sin_completadas"] += 1
        states["cualquier_senal(plan|curs)"] += has_p or has_c
    fresh = sum(1 for u in progress if u["updated_at"][:10] >= FRESH_SINCE)
    fresh_sig = sum(1 for u in progress if u["updated_at"][:10] >= FRESH_SINCE and (u.get("planned_courses") or u.get("in_progress_courses")))
    top_fac = sorted(((v["users"], k) for k, v in by_fac.items() if v["con_planeada"] or v["con_cursando"]), reverse=True)
    return {
        "filas_totales_user_progress": all_rows, "filas_fantasma_excluidas": all_rows - len(progress),
        "usuarios_totales": len({u["user_id"] for u in progress}), "filas_reales": len(progress), "estados": dict(states),
        "planeada_por_periodo": dict(Counter(planned_applies(u) for u in progress if u.get("planned_courses"))),
        "usuarios_editados_desde_" + FRESH_SINCE: fresh,
        "usuarios_fresh_con_senal": fresh_sig,
        "materias_con_planeada": len(sig["planned"]), "materias_con_cursando": len(sig["cursando"]),
        "entradas_planeada": sum(sig["planned"].values()), "entradas_cursando": sum(sig["cursando"].values()),
        "ids_no_mapeables_a_oferta(placeholders: ARTE, CCSS, OPT*, ELECTIVA*, HUM...)": dict(sig["unmapped"].most_common(15)),
        "carreras_con_alguna_senal": {k: by_fac[k] for _, k in top_fac},
        "usuarios_totales_por_carrera_top": dict(Counter({k: v["users"] for k, v in by_fac.items()}).most_common(8)),
    }


def classify(low, central, high, cap):
    """critico: central supera cupo por >=15% (o el piso ya lo supera) y faltan >=max(10, 10% cupo);
    leve: central > cupo; equilibrado: central<=cupo (riesgo_techo aparte); exceso: central<50% y techo<75% del cupo."""
    if cap <= 0:
        return "sin_capacidad"
    short = central - cap
    if (low > cap or central / cap >= 1.15) and short >= max(10, 0.10 * cap):
        return "deficit_critico"
    if short > 0:
        return "deficit_leve"
    if central / cap < 0.50 and high < cap * 0.75:
        return "exceso"
    return "equilibrado"


def recommend(cls, low, central, high, cap, sections, sizes):
    size = int(statistics.median(sizes)) if sizes else DEFAULT_SECTION
    size = size or DEFAULT_SECTION
    if cls in ("deficit_critico", "deficit_leve"):
        short = max(central - cap, 0)
        n = max(1, math.ceil(short / size)) if short > 0 else 1
        if cls == "deficit_leve" and short <= 0:
            return f"Vigilar: techo {high:.0f} supera cupo {cap}; reservar 1 sección de ~{size} cupos si el prerregistro crece."
        return f"Añadir {n} sección(es) de ~{size} cupos (faltan ~{short:.0f} en el central; hasta ~{max(high-cap,0):.0f} en el techo)."
    if cls == "exceso":
        spare = cap - high
        merge = int(spare // size)
        if sections >= 2 and merge >= 1:
            return f"Fusión viable: liberar {min(merge, sections-1)} sección(es) (~{size} cupos c/u); aún cubre el techo {high:.0f}."
        return f"Cupo holgado (techo {high:.0f} vs {cap}); sin acción necesaria."
    return "Mantener."


def build_report(history, offer, progress, enr):
    sig = user_signals(progress)
    offer, obsolete = split_obsolete_offer(offer)
    now_enr = enrollment_progress_by_code(offer)
    cap_by_code, sections_by_code, sizes_by_code, null_total = defaultdict(int), Counter(), defaultdict(list), Counter()
    for r in teoria(offer):
        code = canon(r["course_code"])
        if r.get("total") is None:
            null_total[code] += 1
            continue
        cap_by_code[code] += r["total"]
        sections_by_code[code] += 1
        sizes_by_code[code].append(r["total"])

    # cobertura implicita de la muestra: planeada / historia (solo materias con >=2 planeadas y historia)
    ratios = []
    for code, n in sig["planned"].items():
        h = history_estimate(code, enr)
        if h and n >= 2 and h["central"] > 0:
            ratios.append(n / h["central"])
    if ratios:
        r_lo, r_med, r_hi = (float(np.percentile(ratios, q)) for q in (25, 50, 75))
    else:
        r_lo = r_med = r_hi = 0.05
    r_lo, r_med, r_hi = max(r_lo, 1e-3), max(r_med, 1e-3), max(r_hi, 1e-3)

    rows = []
    for code in sorted(set(cap_by_code) | set(null_total)):
        cap = cap_by_code.get(code, 0)
        hist = history_estimate(code, enr)
        p, pf = sig["planned"].get(code, 0), sig["planned_fresh"].get(code, 0)
        c = sig["cursando"].get(code, 0)
        s_lo, s_hi = sig["succ_lo"].get(code, 0.0), sig["succ_hi"].get(code, 0.0)
        s_mid = (s_lo + s_hi) / 2
        n_obs = p + s_mid
        row = {
            "nrc_obsoletos_excluidos": sum(1 for r in obsolete if canon(r["course_code"]) == code and r.get("type") == "Teoría"),
            "offer_code": code, "alias_variantes": sorted(ALIASES.get(code, {code})), "capacidad_publicada": cap, "secciones_publicadas": sections_by_code.get(code, 0),
            "nrc_sin_total": null_total.get(code, 0),
            "senales": {"planeada": p, "planeada_fresca": pf, "cursando_ahora": c,
                        "sucesoras_esperadas_muestra": round(s_mid, 2)},
        }
        live = now_enr.get(code)
        if live:
            row["avance_matricula"] = live
        if hist is None:
            row.update({"base_historica": False, "clasificacion": "sin_base_historica",
                        "demanda": None, "recomendacion":
                        (f"Materia nueva/sin historial de matrícula. Muestra: {p} planeada(s), {s_mid:.1f} sucesores esperados "
                         f"(sin escalar). Capacidad {cap}. Monitorear prerregistro real.") if cap else "Sin capacidad publicada ni historial."})
            rows.append(row)
            continue
        # señal escalada a población (supuesto: la muestra es una fracción r estable de la población)
        sig_central = n_obs / r_med
        sig_floor = (p + s_lo) / r_hi
        sig_ceil = (p + s_hi) / r_lo
        lam = n_obs / (n_obs + SHRINK_K)
        central = hist["central"] + lam * (sig_central - hist["central"])
        low = min(hist["low"], central) if lam == 0 else min(central, max(hist["low"], sig_floor * 0.5 + hist["low"] * 0.5))
        high = max(hist["high"], central) if lam == 0 else max(central, min(hist["high"] * 1.5 + 1, max(hist["high"], sig_ceil)))
        low, high = min(low, central), max(high, central)
        if live and live["informativo"]:
            # Matrícula ya observada en la oferta actual: es un piso real de la demanda.
            low, central, high = max(low, live["matriculados"]), max(central, live["matriculados"]), max(high, live["matriculados"])
        cls = classify(low, central, high, cap)
        row.update({
            "base_historica": True, "historia": hist, "peso_senal": round(lam, 2),
            "demanda": {"piso": round(low), "central": round(central), "techo": round(high)},
            "utilizacion_central": round(central / cap, 2) if cap else None,
            "clasificacion": cls,
            "riesgo_techo": bool(high > cap),
            "confianza": ("alta" if (SEASON_OF[TARGET] in hist["by_period"] and len(hist["by_period"]) >= 2) else
                          "media" if len(hist["by_period"]) >= 2 else "baja_un_solo_periodo"),
            "recomendacion": recommend(cls, low, central, high, cap, sections_by_code.get(code, 0), sizes_by_code.get(code, [])),
            "oferta_posiblemente_parcial": bool((code, "202520") in enr and cap < 0.6 * enr[(code, "202520")]["cap"]),
            "cupo_publicado_vs_estacion_previa": (
                {"cap_202520": enr[(code, "202520")]["cap"], "cap_202610": enr[(code, "202610")]["cap"] if (code, "202610") in enr else None}
                if (code, "202520") in enr else None),
        })
        rows.append(row)
    scale = {"cobertura_muestra_implicita": {"p25": round(r_lo, 3), "mediana": round(r_med, 3), "p75": round(r_hi, 3),
                                              "n_materias": len(ratios)}}
    sig["obsolete_nrc"] = len(obsolete)
    return rows, sig, scale


def write_md(path, rep):
    rows = [r for r in rep["materias"] if r["clasificacion"] not in ("sin_base_historica", "sin_capacidad")]
    cnt = Counter(r["clasificacion"] for r in rep["materias"])
    d = sorted([r for r in rows if r["clasificacion"].startswith("deficit")],
               key=lambda r: -(r["demanda"]["central"] - r["capacidad_publicada"]))
    ex = sorted([r for r in rows if r["clasificacion"] == "exceso"],
                key=lambda r: -(r["capacidad_publicada"] - r["demanda"]["techo"]))
    new = [r for r in rep["materias"] if r["clasificacion"] == "sin_base_historica" and r["capacidad_publicada"]]
    L = ["# Cobertura de la oferta 202620 (Segundo Semestre 2026/2027)", "",
         f"Generado: {rep['generated_at']}", "",
         "## Resumen", "",
         f"- Materias con oferta publicada: {len(rep['materias'])} | clasificación: {dict(cnt)}",
         f"- Agregado (materias con base): {json.dumps(rep['agregado_materias_con_base'], ensure_ascii=False)}",
         "- **La demanda histórica usada es matrícula (cupo − disponibles), no cupo total.** El predictor anterior "
         "trataba el cupo (`total`) como demanda: era circular.",
         f"- Capacidad total publicada (Teoría): {rep['capacidad_total_teoria']} cupos en {rep['secciones_teoria']} secciones.",
         f"- Muestra de señales: {rep['auditoria_senales']['usuarios_totales']} usuarios, solo "
         f"{rep['auditoria_senales']['estados'].get('cualquier_senal(plan|curs)', 0)} con planeada/cursando; "
         "no es representativa (autoseleccionada, CMP sobrerrepresentada). Las señales ajustan, no mandan.", "",
         f"- **Normalización de códigos (sufijo E):** {rep['normalizacion_codigos']['regla']}. Detalle: {json.dumps(rep['normalizacion_codigos'], ensure_ascii=False)}", "",
         "## Top déficits (demanda central − capacidad)", "",
         "| Materia | Cupo | Piso–Central–Techo | Clase | Confianza | Recomendación |", "|---|---|---|---|---|---|"]
    for r in d[:20]:
        x = r["demanda"]
        flag = " ⚠ cupo <60% del de 202520 (¿oferta parcial?)" if r.get("oferta_posiblemente_parcial") else ""
        L.append(f"| {r['offer_code']} | {r['capacidad_publicada']} | {x['piso']}–{x['central']}–{x['techo']} | {r['clasificacion']} | {r['confianza']} | {r['recomendacion']}{flag} |")
    L += ["", "## Top excesos de cupo", "", "| Materia | Cupo | Piso–Central–Techo | Recomendación |", "|---|---|---|---|"]
    for r in ex[:10]:
        x = r["demanda"]
        L.append(f"| {r['offer_code']} | {r['capacidad_publicada']} | {x['piso']}–{x['central']}–{x['techo']} | {r['recomendacion']} |")
    L += ["", "## Materias sin base histórica (tratadas aparte)", ""]
    L += [f"- {r['offer_code']}: cupo {r['capacidad_publicada']}; señales {r['senales']}" for r in sorted(new, key=lambda r: -r['capacidad_publicada'])[:20]]
    L += ["", "## Validación honesta del modelo", ""]
    for k, v in rep["notas_modelo"].items():
        L.append(f"- **{k}**: {v}")
    L += ["", "## Supuestos y límites", ""] + [f"- {s}" for s in rep["supuestos"]]
    path.write_text("\n".join(L) + "\n", encoding="utf-8")


def run_coverage(*, skip_model_eval: bool = True, hb: list | None = None) -> dict:
    """Estimador de produccion: lee los exports de predictor/output y devuelve el reporte completo."""
    ALIASES.clear()
    history, offer, progress = load("course_offer_history.json"), load("course_offer.json"), load("user_progress.json")
    enr = enrollment_by_period(history)

    hb = hb if hb is not None else history_backtest(enr)
    old = None if skip_model_eval else old_models_eval(history, enr)
    rows, sig, scale = build_report(history, offer, progress, enr)
    audit = audit_signals(progress, sig)

    summary_util = {}
    for p in REGULARS:
        T = sum(v["cap"] for (c, q), v in enr.items() if q == p)
        E = sum(v["enr"] for (c, q), v in enr.items() if q == p)
        F = sum(v["full"] for (c, q), v in enr.items() if q == p)
        S = sum(v["sections"] for (c, q), v in enr.items() if q == p)
        summary_util[p] = {"capacidad": T, "matricula_proxy": E, "utilizacion": round(E / T, 3), "secciones_llenas_pct": round(F / S * 100, 1)}

    best = {r["target"]: min(r["models"], key=lambda k: r["models"][k]["mae"] if k != "capacidad_publicada_del_periodo" else 1e9)
            for r in hb}
    def variants(rows):
        raw = {normalize_course_code(str(r["course_code"])) for r in teoria(rows)}
        e = {c for c in raw if _E_SUFFIX.search(c)}
        return raw, e

    h_raw, h_e = variants(history)
    o_raw, o_e = variants(offer)
    h_base = {_E_SUFFIX.sub("", c) for c in h_raw}
    norm_audit = {
        "regla": "codigo normalizado (normalize_course_code) y sin 'E' final tras un digito; alias originales en 'alias_variantes'",
        "oferta_202620": {"codigos_con_E": len(o_e), "con_base_tambien_en_oferta": sum(1 for c in o_e if _E_SUFFIX.sub("", c) in o_raw),
                          "solo_variante_E": sum(1 for c in o_e if _E_SUFFIX.sub("", c) not in o_raw)},
        "historial": {"codigos_con_E": len(h_e), "con_base_tambien_en_historial": sum(1 for c in h_e if _E_SUFFIX.sub("", c) in h_raw)},
        "cruce_oferta_vs_historial": {
            "E_en_oferta_cuyo_base_solo_esta_en_historial": sum(1 for c in o_e if _E_SUFFIX.sub("", c) not in o_raw and _E_SUFFIX.sub("", c) in h_base),
            "base_en_oferta_con_variante_E_solo_en_historial": sum(1 for c in o_raw if not _E_SUFFIX.search(c) and (c + "E") in h_raw and (c + "E") not in o_raw),
        },
        "materias_canonicas_con_2_o_mas_variantes": sum(1 for v in ALIASES.values() if len(v) > 1),
    }
    rep = {
        "normalizacion_codigos": norm_audit,
        "generated_at": datetime.now(timezone.utc).isoformat(), "target_period": TARGET,
        "agregado_materias_con_base": {
            "n": sum(1 for r in rows if r.get("demanda")),
            "capacidad": sum(r["capacidad_publicada"] for r in rows if r.get("demanda")),
            "demanda_piso": sum(r["demanda"]["piso"] for r in rows if r.get("demanda")),
            "demanda_central": sum(r["demanda"]["central"] for r in rows if r.get("demanda")),
            "demanda_techo": sum(r["demanda"]["techo"] for r in rows if r.get("demanda")),
            "por_clasificacion": dict(Counter(r["clasificacion"] for r in rows)),
            "criticos_con_oferta_posiblemente_parcial": sum(1 for r in rows if r.get("clasificacion") == "deficit_critico" and r.get("oferta_posiblemente_parcial")),
        },
        "capacidad_total_teoria": sum(r["capacidad_publicada"] for r in rows),
        "secciones_teoria": sum(r["secciones_publicadas"] for r in rows),
        "auditoria_senales": audit, "escalado_muestra": scale,
        "utilizacion_historica": summary_util,
        "backtest_solo_historia": hb, "backtest_modelos_previos": old,
        "materias": rows,
    }
    rep["notas_modelo"] = {
        "Calibración de transiciones": "ELIMINADA de este flujo (empeoraba: MAE 40.88 vs 34.31 de prioris fijas). Se usan prioris fijas 0.8/0.5/0.25 con rango.",
        "Mejor baseline en backtest": json.dumps(best),
        "GBR": "Sin demanda observada del periodo objetivo, el GBR de producción se entrena con pseudoetiquetas = su propia fórmula híbrida (ver backtest_modelos_previos: MAE entre GBR e híbrido). No aporta información nueva.",
        "Truth": "Backtest previo medía contra cupo (total); aquí contra matrícula proxy y contra cupo, ambas.",
    }
    rep["supuestos"] = [
        "Matrícula proxy = total − available al momento del snapshot (202410–202530 raspados el 27-jun-2026; 202610 el 17-nov-2026): incluye retiros/ajustes posteriores. Secciones con available=0 están censuradas (demanda ≥ cupo); techo = +25% del cupo de esas secciones.",
        "Códigos con sufijo E se unifican con el base en historia, oferta, planeada y cursando (los NRC de ambas variantes suman en capacidad y matrícula).",
        "Solo se modelan NRC de Teoría con total/available; labs/ejercicios/prácticas no se evalúan por separado.",
        f"Demanda central = 75% matrícula de la misma estación (202520) + 25% semestre anterior (202610), ajustada hacia la señal (planeada + sucesoras 1 salto, escalada por cobertura implícita de la muestra) con peso n/(n+{SHRINK_K:g}).",
        f"Cobertura de la muestra r estimada empíricamente (planeada/histórico en materias con ≥2 planeadas): P25/mediana/P75 = {scale['cobertura_muestra_implicita']['p25']}/{scale['cobertura_muestra_implicita']['mediana']}/{scale['cobertura_muestra_implicita']['p75']}. Muy ruidosa.",
        f"Cursando→sucesoras: 1 salto, solo si los demás prerrequisitos están cumplidos/en curso; prob. = prioris × {TRANS_SCALE} × aprobar {PASS_RATE}. Prioris no validadas con datos reales.",
        f"Planeadas editadas antes de {FRESH_SINCE} (la mayoría, julio) pudieron ser para 202610; se cuentan pero se reporta 'planeada_fresca'.",
        "Placeholders de malla (ARTE, CCSS, OPT*, ELECTIVA*, HUM) no mapean a materias de oferta: se excluyen.",
        "NRC con total NULL en 202620 no suman capacidad (campo nrc_sin_total).",
    ]
    return rep


def save_coverage(rep: dict) -> None:
    (OUTPUT_DIR / "coverage_202620.json").write_text(json.dumps(rep, indent=2, ensure_ascii=False, default=str), encoding="utf-8")
    write_md(OUTPUT_DIR / "coverage_202620_resumen.md", rep)


MODEL_NAME = "enrollment-proxy-v4"


def _trend(central: float, last_reg: float | None) -> str:
    if not last_reg:
        return "stable"
    return "up" if central > 1.1 * last_reg else "down" if central < 0.9 * last_reg else "stable"


def build_dashboard(rep: dict, backtest_summary: dict | None = None) -> dict:
    """Indice publico (aditivo): conserva campos v3 y agrega demanda/cobertura/metadatos."""
    by_code: dict[str, dict] = {}
    for _cid, data in iter_curricula():
        fac = data.get("source_file", "").replace("Malla-academica-", "").upper()[:3] or None
        for c in data.get("courses", []):
            by_code.setdefault(canon(c["id"]), {"course_id": c["id"], "faculty": fac})
    titles = {r["course_code"]: r.get("title") for r in load("course_offer.json") if r.get("type") == "Teoría"}
    title_by_canon = {canonical_course_code(k): v for k, v in titles.items()}

    by_offer: dict[str, dict] = {}
    by_faculty: dict[str, list[str]] = {}
    for m in rep["materias"]:
        code = m["offer_code"]
        meta = by_code.get(code, {})
        fac = meta.get("faculty") or code.split("-")[0]
        d = m.get("demanda")
        central = d["central"] if d else 0
        last = (m.get("historia") or {}).get("by_period", {}).get("202610")
        sections = max(1, math.ceil(central / DEFAULT_SECTION)) if central else 1
        sig = m["senales"]
        entry = {
            "offer_code": code, "course_id": meta.get("course_id", code.replace("-", "")),
            "title": title_by_canon.get(code) or code, "faculty": fac,
            "estimated_students": central, "suggested_sections": sections,
            "gbr_estimated_students": None, "gbr_suggested_sections": None,
            "primary_students": central, "primary_sections": sections,
            "trend": _trend(central, last),
            "inflow_from_history": 0.0, "inflow_from_cursando": float(sig["sucesoras_esperadas_muestra"]),
            "planned_count": sig["planeada"], "in_progress_count": sig["cursando_ahora"],
            "model": MODEL_NAME, "gbr_available": False,
            # --- campos nuevos (v4) ---
            "demand_low": d["piso"] if d else None, "demand_central": d["central"] if d else None,
            "demand_high": d["techo"] if d else None,
            "published_capacity": m["capacidad_publicada"], "published_sections": m["secciones_publicadas"],
            "coverage_class": m["clasificacion"], "utilization_central": m.get("utilizacion_central"),
            "risk_above_high": m.get("riesgo_techo"), "confidence": m.get("confianza"),
            "has_history": bool(m.get("base_historica")),
            "possibly_partial_offer": m.get("oferta_posiblemente_parcial", False),
            "recommendation": m["recomendacion"], "aliases": m["alias_variantes"],
            "nrc_without_total": m["nrc_sin_total"],
            "enrolled_so_far": (m.get("avance_matricula") or {}).get("matriculados"),
            "enrollment_measured_share": (m.get("avance_matricula") or {}).get("cobertura_secciones"),
        }
        by_offer[code] = entry
        by_faculty.setdefault(fac, []).append(code)
        for alias in m["alias_variantes"]:  # lookup con sufijo E (frontend busca exacto primero)
            if alias != code and alias not in by_offer:
                by_offer[alias] = {**entry, "offer_code": alias, "alias_of": code}
    agg = rep["agregado_materias_con_base"]
    return {
        "generated_at": rep["generated_at"], "version": 4,
        "target_period_code": TARGET, "target_period_label": "Segundo Semestre 2026/2027",
        "current_period_code": TARGET,
        "model_meta": {
            "name": MODEL_NAME, "generated_at": rep["generated_at"],
            "method": "Demanda proxy = total-available por NRC de Teoria (no cupo); central = 75% matricula misma estacion (202520) + 25% semestre previo (202610), "
                      "ajustada por señales planeada + cursando->sucesoras (peso n/(n+5)); piso/techo con historial 202410-202610 y censura de secciones llenas (+25%). "
                      "Codigos con sufijo E unificados con el base. Sin calibracion de transiciones ni GBR.",
            "backtest_summary": backtest_summary or {},
            "coverage_thresholds": "critico: central>=1.15*cupo (o piso>cupo) y faltante>=max(10,10% cupo); leve: central>cupo; exceso: central<50% y techo<75% del cupo",
            "caveats": ["Muestra de progreso de usuarios pequeña y sesgada: las señales solo ajustan.",
                        "Matricula proxy es un snapshot posterior (incluye retiros); secciones llenas censuradas.",
                        "Materias sin historial (has_history=false) no se clasifican."],
            "aggregate": {k: agg[k] for k in ("n", "capacidad", "demanda_piso", "demanda_central", "demanda_techo")},
            "classification_counts": agg["por_clasificacion"],
        },
        "by_offer_code": by_offer, "by_faculty": by_faculty,
    }


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--skip-model-eval", action="store_true")
    args = ap.parse_args()
    rep = run_coverage(skip_model_eval=args.skip_model_eval)
    save_coverage(rep)
    print(Counter(r["clasificacion"] for r in rep["materias"]))


if __name__ == "__main__":
    main()
