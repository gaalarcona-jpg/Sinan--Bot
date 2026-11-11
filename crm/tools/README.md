# Actualización automática de Finanzas (CRM SINAN CHILE)

`actualizar_finanzas.py` regenera `crm/data/finanzas.json` y `crm/data/obras_resumen.json`.
Lo corre todos los días la tarea programada "Actualizar Finanzas CRM SINAN CHILE (nube)".

Entradas:
- Hoja "Control de Gastos Sinan 2025" (Drive id 1m8_4xGWT1JUQynzG9WbYvx82odxS5eHH0KDQcU-rrw4), pestaña "Pagos Mensuales Sinan": texto de `read_file_content` o CSV exportado.
- Dashboard de cobranza https://claude.ai/artifact/7RMePzm5mhjFFvnbV3LZZx: datasets `ingresos` y `hitos` (CSV).

Reglas de negocio (obras del resultado, obras fuera, deudas confirmadas, tasas): `crm/data/finanzas_config.json`.
Si la hoja trae una obra nueva, el script la deja en "Otras obras 2024 y preventa" y la informa en `alertas`: hay que agregarla a la config.
Sale con código 2 sin escribir nada si los costos del período no cuadran o la hoja viene incompleta.

```
python3 crm/tools/actualizar_finanzas.py --gastos gastos.txt --ingresos ingresos.csv --hitos hitos.csv --corte AAAA-MM-DD
```
