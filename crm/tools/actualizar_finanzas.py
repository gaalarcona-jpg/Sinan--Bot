#!/usr/bin/env python3
"""Regenera crm/data/finanzas.json y crm/data/obras_resumen.json desde las fuentes.

Fuentes (archivos que entrega la tarea programada):
  --gastos   export de texto del Google Sheet "Control de Gastos Sinan 2025"
             (formato del conector de Drive: secciones "## Sheet name: ...", CSV adentro).
             Solo se usa la pestaña "Pagos Mensuales Sinan".
  --ingresos CSV del dataset `ingresos` del dashboard de cobranza (abonos de cartola).
  --hitos    CSV del dataset `hitos` del dashboard de cobranza (contratos).
Reglas de negocio: crm/data/finanzas_config.json.

Sale con código 2 y no escribe nada si los datos no cuadran (ver --check).
Uso: python3 crm/tools/actualizar_finanzas.py --gastos G --ingresos I --hitos H [--corte YYYY-MM-DD]
"""
import argparse, calendar, collections, csv, io, json, os, re, sys, datetime as dt

AQUI = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(AQUI, "..", "data")
MES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"]
MESES_LARGO = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto",
               "septiembre", "octubre", "noviembre", "diciembre"]
OTRAS = "Otras obras 2024 y preventa"
OTROS_ING = "Otros ingresos de clientes (sin obra asignada, mecánica de suelos Walter)"
alertas = []


def lab(ym):
    return f"{ym} {MES[int(ym[5:7]) - 1]}"


def rango(desde, hasta):
    y, m = map(int, desde.split("-"))
    out = []
    while f"{y}-{m:02d}" <= hasta:
        out.append(f"{y}-{m:02d}")
        m += 1
        if m == 13:
            y, m = y + 1, 1
    return out


def fin_mes(ym):
    y, m = map(int, ym.split("-"))
    return dt.date(y, m, calendar.monthrange(y, m)[1])


def money(s):
    s = s.replace("$", "").replace(".", "").replace(",", ".").strip()
    return round(float(s)) if s else 0


# ---------------------------------------------------------------- costos
def opex_sub(d):
    d = d.lower()
    reglas = [
        ("Créditos (cuotas)", ["credito", "crédito", "cuxo", "marcos castro"]),
        ("Sueldos", ["sueldo", "pago mensual rodrigo", "claudio tuma", "pago semanal claudio", "ejecutiva comercial"]),
        ("Casa piloto Génova", ["genova", "espejo", "pecera", "plantas_espejo", "filtro-estanque"]),
        ("Marketing y web", ["mkt", "instagram", "german", "campaña", "google ads", "meta tc", "pagina web", "hosting", "grabacion", "microfono", "letrero", "cascos"]),
        ("Software y telefonía", ["wasapi", "zolutium", "telefono"]),
        ("Oficina", ["oficina", "estacionamiento"]),
        ("Vehículos (cuota, TAG, mantención)", ["maxus", "tag"]),
        ("Contador, abogado, banco e impuestos", ["contador", "abogado", "santander", "ppm"]),
    ]
    for nombre, claves in reglas:
        if any(k in d for k in claves):
            return nombre
    return "Otros gastos generales"


def leer_pagos(texto, cfg):
    # Acepta el texto del conector de Drive ("## Sheet name: ...") o el CSV exportado de la pestaña.
    if "## Sheet name: " in texto:
        sec = next((p for p in texto.split("## Sheet name: ") if p.startswith("Pagos Mensuales")), None)
        if sec is None:
            sys.exit("No encontré la pestaña 'Pagos Mensuales Sinan' en el export de gastos")
        texto = sec.split("\n", 1)[1]
    filas_csv = list(csv.reader(io.StringIO(texto.lstrip("\ufeff"))))
    h = next((k for k, r in enumerate(filas_csv) if "Fecha" in r and any(c.startswith("Detalle") for c in r)), None)
    if h is None:
        sys.exit("No encontré la fila de títulos (Fecha / Detalle Gastos) en la hoja de pagos")
    hdr = filas_csv[h]
    col = lambda pref: next(k for k, c in enumerate(hdr) if c.strip().startswith(pref))
    C = [col("Fecha"), col("Detalle"), col("Mes de Gest"), col("Valor"), col("Etapa"), col("Casa"), col("Categor")]
    raw = [[r[k].strip() if k < len(r) else "" for k in C] for r in filas_csv[h + 1:] if len(r) > C[1] and r[C[0]].strip()]
    casa_obra = {}
    for o in cfg["obras_resultado"]:
        for c in o["casas"]:
            casa_obra[c] = ("er", o["nombre"])
    for nombre, x in cfg["obras_fuera_resultado"].items():
        if nombre.startswith("_"):
            continue
        for c in x["casas"]:
            casa_obra[c] = ("fuera", nombre)
    for c, n in cfg["otras_obras_casas"].items():
        casa_obra[c] = ("otra", n)
    filas = []
    for i, r in enumerate(raw, start=h + 2):
        fecha_txt, det, mesg, val, etapa, casa, cat = r
        monto = money(val)
        try:
            d, m, y = map(int, fecha_txt.split("-"))
        except ValueError:
            alertas.append(f"Fila {i}: fecha ilegible '{fecha_txt}' ({det}, {monto}); se omitió")
            continue
        if y < 2025:  # error de digitación: se toma el año del mes de gestión
            try:
                y = int(mesg.split()[1])
            except Exception:
                y = 2025
            alertas.append(f"Fila {i}: fecha {fecha_txt} con año antiguo; se usó {y} ({det})")
        fecha = dt.date(y, m, d)
        dl = det.lower()
        obra, sub, grupo = "", "", ""
        if etapa == "Proyecto Arquitectura":
            area = "Arquitectura"
        elif casa == "Maquinaria inversión" or cat == "Inversión":
            area = "Gasto operacional" if ("mantenci" in dl or "arreglo" in dl) else "Inversión (activo)"
            sub = "Vehículos (cuota, TAG, mantención)" if area == "Gasto operacional" else ""
        elif casa in ("Operación Mensual", "Genova", "Reparación casa Genova"):
            sub = opex_sub(det)
            area = "Gasto financiero" if sub == "Créditos (cuotas)" else "Gasto operacional"
            if "cabaña olmue" in dl:
                area, grupo, obra = "Costo de obra", "fuera", "Olmué (Ricardo)"
        else:
            area = "Costo de obra"
            if casa in casa_obra:
                grupo, obra = casa_obra[casa]
            else:
                grupo, obra = "otra", casa
                alertas.append(f"Fila {i}: obra nueva '{casa}' no está en la configuración; quedó en '{OTRAS}' ({det}, ${monto:,})")
        filas.append(dict(fecha=fecha, ym=fecha.strftime("%Y-%m"), detalle=det, monto=monto, area=area, sub=sub, grupo=grupo, obra=obra))
    return filas


# ---------------------------------------------------------------- ingresos
def leer_ingresos(path, cfg):
    reglas = cfg["ingresos_reglas"]
    proy_obra = {p: o["nombre"] for o in cfg["obras_resultado"] for p in o["proyectos"]}
    fuera = {k: v for k, v in cfg["obras_fuera_resultado"].items() if not k.startswith("_")}
    out = []
    for x in sorted(csv.DictReader(open(path, encoding="utf-8")), key=lambda x: (x["fecha"], x["id"])):
        m, p, t, pag = int(x["monto"]), x["proyecto"], x["tipo"], x["pagador"]
        clas, obra = "", ""
        if t not in ("Cliente", "Por identificar"):
            clas = "no_ingreso"
        elif p in proy_obra:
            clas, obra = "obra", proy_obra[p]
            rc, rp = reglas["arquitectura_codegua"], reglas["arquitectura_parraguez"]
            if p == rc["proyecto"] and (x["mes"] in rc["meses"] or x["id"] in rc["ids"]):
                clas, obra = "arquitectura", ""
            if p == rp["proyecto"] and x["fecha"] <= rp["hasta"] and m < rp["monto_menor_a"]:
                clas, obra = "arquitectura", ""
        elif p == reglas["walter"]["proyecto"]:
            clas = "otros" if m in reglas["walter"]["mecanica_suelos_montos"] else "arquitectura"
        elif p.startswith("Arquitectura"):
            clas = "arquitectura"
        else:
            hit = next((n for n, v in fuera.items() if any(s in pag for s in v["pagadores"])), None)
            if hit:
                clas, obra = "fuera", hit
            else:
                clas = "otros"
        out.append(dict(fecha=x["fecha"], ym=x["mes"], monto=m, clas=clas, obra=obra, tipo=t))
    return out


# ---------------------------------------------------------------- deudas
def deudas(cfg, pagos, ingresos, corte):
    meses = rango(cfg["inicio_deudas"], corte[:7])
    hoy = fin_mes(corte[:7])
    pagos_deuda = collections.defaultdict(list)  # deuda -> [(fecha, monto)]
    for f in pagos:
        if f["area"] not in ("Gasto financiero", "Gasto operacional"):
            continue
        for d in cfg["deudas"]:
            if any(k in f["detalle"] for k in d.get("claves", [])) and not any(e in f["detalle"] for e in d.get("excluir", ["Mantención", "Transferencia"])):
                pagos_deuda[d["deuda"]].append((f["fecha"], f["monto"], f))
                break
    for v in pagos_deuda.values():
        v.sort(key=lambda z: z[0])

    def saldo(d, fin):
        ini = dt.date.fromisoformat(d["inicio"])
        ter = dt.date.fromisoformat(d["termino"]) if d.get("termino") else None
        if fin < ini or (ter and fin >= ter):
            return 0
        if d.get("cuota"):
            n = d["pagadas_antes"] + sum(1 for f, _, _ in pagos_deuda[d["deuda"]] if f <= fin)
            return max(0, d["cuotas_total"] - n) * d["cuota"]
        meses_int = (fin.year - ini.year) * 12 + fin.month - ini.month
        return d["capital"] + (d.get("interes_mes") or 0) * max(0, meses_int)

    registro, por_deuda = [], []
    for d in cfg["deudas"]:
        s = saldo(d, hoy)
        pag = d["pagadas_antes"] + sum(1 for f, _, _ in pagos_deuda[d["deuda"]] if f <= hoy) if d.get("cuota") else None
        registro.append(dict(deuda=d["deuda"], tipo=d["tipo"], suma=bool(d["suma"] and s > 0), saldo=s if d["suma"] else 0,
                             cuota=d.get("cuota"), cuotas_total=d.get("cuotas_total"), cuotas_pagadas=pag,
                             interes_mes=d.get("interes_mes"), nota=d["nota"]))
        por_deuda.append(dict(deuda=d["deuda"], valores=[saldo(d, fin_mes(m)) if d["suma"] else 0 for m in meses]))
    total = [sum(p["valores"][k] for p in por_deuda) for k in range(len(meses))]
    aportes = [sum(i["monto"] for i in ingresos if i["tipo"] == "Aporte socio" and dt.date.fromisoformat(i["fecha"]) <= fin_mes(m)) for m in meses]
    interes_informal = sum(d.get("interes_mes") or 0 for d in cfg["deudas"] if d["suma"] and not d.get("cuota") and saldo(d, hoy) > 0)

    # interés vs capital de cada cuota de crédito (estimado con la tasa)
    capital_mes = collections.defaultdict(int)
    for d in cfg["deudas"]:
        r = d.get("tasa_mensual")
        for k, (f, monto, fila) in enumerate(pagos_deuda[d["deuda"]]):
            if fila["area"] != "Gasto financiero" or not r:
                continue
            nro = d["pagadas_antes"] + k + 1
            bal = d["cuota"] * (1 - (1 + r) ** -(d["cuotas_total"] - nro + 1)) / r
            i = round(bal * r)
            capital_mes[fila["ym"]] += round(monto - i)
    return dict(registro=registro, evolucion=dict(meses=[lab(m) for m in meses], total=total, aportes_gary=aportes, por_deuda=por_deuda),
                interes_informal_mes=interes_informal), capital_mes


# ---------------------------------------------------------------- armado
def construir(cfg, pagos, ingresos, hitos_path, corte):
    meses = rango(cfg["inicio_resultado"], corte[:7])
    idx = {m: k for k, m in enumerate(meses)}
    z = lambda: [0] * len(meses)
    ER = [o["nombre"] for o in cfg["obras_resultado"]]
    fuera = [k for k in cfg["obras_fuera_resultado"] if not k.startswith("_")]

    ing_obra = {o: z() for o in ER}; ing_otros = z(); ing_arq = z(); no_ing = z(); ing_fuera = z()
    for i in ingresos:
        k = idx.get(i["ym"])
        if k is None:
            continue
        if i["clas"] == "obra":
            ing_obra[i["obra"]][k] += i["monto"]
        elif i["clas"] == "otros":
            ing_otros[k] += i["monto"]
        elif i["clas"] == "arquitectura":
            ing_arq[k] += i["monto"]
        elif i["clas"] == "fuera":
            ing_fuera[k] += i["monto"]
        else:
            no_ing[k] += i["monto"]

    gop_sub = collections.defaultdict(z)
    cos_obra = {o: z() for o in ER}; cos_otras = z(); cos_fuera = z(); gop = z(); gfin = z(); arq = z(); inv = z()
    for f in pagos:
        k = idx.get(f["ym"])
        if k is None:
            continue
        a = f["area"]
        if a == "Costo de obra":
            if f["grupo"] == "er":
                cos_obra[f["obra"]][k] += f["monto"]
            elif f["grupo"] == "fuera":
                cos_fuera[k] += f["monto"]
            else:
                cos_otras[k] += f["monto"]
        elif a == "Gasto operacional":
            gop[k] += f["monto"]
            gop_sub[f["sub"] or "Otros gastos generales"][k] += f["monto"]
        elif a == "Gasto financiero":
            gfin[k] += f["monto"]
        elif a == "Arquitectura":
            arq[k] += f["monto"]
        elif a == "Inversión (activo)":
            inv[k] += f["monto"]

    deu, capital_mes = deudas(cfg, pagos, ingresos, corte)
    cap = [capital_mes.get(m, 0) for m in meses]
    interes = [g - c for g, c in zip(gfin, cap)]
    det_ing = [dict(label=o, valores=ing_obra[o]) for o in ER] + [dict(label=OTROS_ING, valores=ing_otros)]
    det_cos = [dict(label=o, valores=cos_obra[o]) for o in ER] + [dict(label=OTRAS, valores=cos_otras)]
    tot_ing = [sum(x["valores"][k] for x in det_ing) for k in range(len(meses))]
    tot_cos = [sum(x["valores"][k] for x in det_cos) for k in range(len(meses))]
    mb = [a - b for a, b in zip(tot_ing, tot_cos)]
    rop = [a - b for a, b in zip(mb, gop)]
    neto = [a - b for a, b in zip(rop, interes)]
    nombres_fuera = " y ".join(n.split(" (")[0] for n in fuera)

    fin = dict(
        corte=corte,
        fuente=("Costos: hoja \"Pagos Mensuales Sinan\"; ingresos: cartola Santander desde sep-2025 (dashboard de cobranza). "
                "Arquitectura fuera del resultado. Deudas confirmadas por Gary el 11-11-2026. Intereses de créditos estimados con la tasa "
                f"implícita de cada crédito. {nombres_fuera} quedan fuera del resultado (ingresos no registrados completos). "
                "Se actualiza sola todos los días."),
        meses=[lab(m) for m in meses],
        resultado=[
            dict(clave="ingresos", label="Ingresos de obras", tipo="total", valores=tot_ing),
            dict(clave="costo_obras", label="Costo de obras", tipo="linea", valores=tot_cos),
            dict(clave="margen_bruto", label="Margen bruto", tipo="clave", valores=mb),
            dict(clave="gastos_op", label="Gastos operacionales", tipo="linea", valores=gop),
            dict(clave="resultado_op", label="Resultado operacional", tipo="clave", valores=rop),
            dict(clave="creditos", label="Intereses de créditos (estimado)", tipo="linea", valores=interes),
            dict(clave="resultado_neto", label="Resultado neto", tipo="clave", valores=neto),
        ],
        detalle_ingresos=det_ing,
        detalle_costos=det_cos,
        informativo=[
            dict(label="Ingresos por arquitectura", valores=ing_arq),
            dict(label="Pagos a arquitectos", valores=arq),
            dict(label="Aportes de socio, préstamos y movimientos internos (no es ingreso)", valores=no_ing),
            dict(label="Inversiones en activos", valores=inv),
            dict(label="Abono a capital de créditos (estimado; baja la deuda, no es gasto)", valores=cap),
            dict(label=f"Cobros {nombres_fuera} (fuera del resultado: ingresos no registrados completos)", valores=ing_fuera),
            dict(label=f"Pagos {nombres_fuera} (fuera del resultado)", valores=cos_fuera),
        ],
        obras=[dict(obra=o, ingresos=sum(ing_obra[o]), costos=sum(cos_obra[o]),
                    costos_antes_sep25=sum(f["monto"] for f in pagos if f["area"] == "Costo de obra" and f["obra"] == o and f["ym"] < meses[0]))
               for o in ER],
        deudas=deu,
        costos_fijos=sorted([dict(label=k, valores=v) for k, v in gop_sub.items()], key=lambda x: -sum(x["valores"])),
    )

    # contratos (dataset hitos): suma de contratos distintos de construcción + adicionales por proyecto
    contratos = collections.defaultdict(int)
    vistos = set()
    for h in csv.DictReader(open(hitos_path, encoding="utf-8")):
        if h["linea"] not in ("Construcción", "Adicional"):
            continue
        key = (h["proyecto"], h["linea"], h["fecha_contrato"], h["valor_contrato"])
        if key in vistos:
            continue
        vistos.add(key)
        contratos[h["proyecto"]] += int(float(h["valor_contrato"]))
    resumen = dict(
        corte=corte,
        fuente=("Contrato: proyecto Ingresos (contratos firmados, incluye adicionales). Cobrado: abonos de la cartola sin arquitectura. "
                "Gastado: hoja Pagos Mensuales Sinan (costo de obra). Lo que registre el bot después del corte se suma encima."),
        obras=[]
    )
    for o in cfg["obras_resultado"]:
        c = sum(contratos.get(p, 0) for p in o["proyectos"]) or None
        if "contrato" in o:
            c = o["contrato"]
        resumen["obras"].append(dict(grupo=o["tarjeta"], db=o["db"], contrato=c,
                                     cobrado=sum(i["monto"] for i in ingresos if i["clas"] == "obra" and i["obra"] == o["nombre"]),
                                     gastado=sum(f["monto"] for f in pagos if f["area"] == "Costo de obra" and f["obra"] == o["nombre"])))
    return fin, resumen


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--gastos", required=True)
    ap.add_argument("--ingresos", required=True)
    ap.add_argument("--hitos", required=True)
    ap.add_argument("--corte", default=dt.date.today().isoformat())
    ap.add_argument("--salida", default=DATA)
    ap.add_argument("--check", action="store_true", help="solo valida, no escribe")
    a = ap.parse_args()
    cfg = json.load(open(os.path.join(DATA, "finanzas_config.json"), encoding="utf-8"))
    pagos = leer_pagos(open(a.gastos, encoding="utf-8").read(), cfg)
    ingresos = leer_ingresos(a.ingresos, cfg)
    fin, resumen = construir(cfg, pagos, ingresos, a.hitos, a.corte)

    # ---- controles: si algo no cuadra, no se publica
    errores = []
    total_hoja = sum(f["monto"] for f in pagos)
    meses = [m.split()[0] for m in fin["meses"]]
    en_rango = sum(f["monto"] for f in pagos if meses[0] <= f["ym"] <= meses[-1])
    clasif = sum(sum(x["valores"]) for x in fin["detalle_costos"]) + sum(fin["resultado"][3]["valores"]) + \
        sum(fin["resultado"][5]["valores"]) + sum(sum(x["valores"]) for x in fin["informativo"] if x["label"].startswith(("Pagos", "Inversiones", "Abono")))
    if clasif != en_rango:
        errores.append(f"Costos del período no cuadran: hoja {en_rango:,} vs clasificado {clasif:,}")
    if len(pagos) < 1000:
        errores.append(f"La hoja trae solo {len(pagos)} pagos: posible export incompleto")
    print(json.dumps(dict(pagos=len(pagos), total_hoja=total_hoja, ingresos=len(ingresos),
                          neto_ultimos_12=sum(fin["resultado"][6]["valores"][-13:-1]),
                          deuda_total=fin["deudas"]["evolucion"]["total"][-1], alertas=alertas, errores=errores),
                     ensure_ascii=False, indent=1))
    if errores:
        sys.exit(2)
    if not a.check:
        json.dump(fin, open(os.path.join(a.salida, "finanzas.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1)
        json.dump(resumen, open(os.path.join(a.salida, "obras_resumen.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1)


if __name__ == "__main__":
    main()
