# SINAN Bot v2

Bot de WhatsApp para rendiciones y control financiero de obras de construcción, vía 360dialog (WhatsApp Business / Meta Cloud API). v2 reemplaza el sistema v1 en memoria (ver `v1-final` tag) por persistencia real en Postgres, extracción de boletas con IA, conversación en lenguaje natural con estado persistente, y separación estructural de roles para proteger margen/utilidad de la empresa.

## Stack

- Node.js + Express (servidor HTTP / webhook receiver)
- Postgres (Railway addon) vía `pg`
- Claude API (`@anthropic-ai/sdk`) con visión, para clasificar intención y extraer datos de boletas/comprobantes
- Google Drive API (`googleapis`, cuenta de servicio) para almacenar imágenes y backups — Railway tiene disco efímero
- `exceljs` para reportes, `node-cron` para backup diario y resumen diario
- axios (llamadas REST a 360dialog)

## Estructura de archivos

- `index.js` — servidor Express, webhook GET/POST, healthcheck, arranque de crons
- `config.js` — valida env vars al boot, expone objeto congelado
- `db.js` — pool pg + queries de dominio (usuarios, obras, etapas, items, gastos, proveedores, acuerdos, estado conversacional)
- `db_comercial.js` — **aislado**: única fuente de queries sobre precio de venta/margen. Solo lo importan `reports.js` (sección `gary`) y `flows.js` dentro de bloques `rol === 'gary'/'admin'`
- `claude.js` — extracción de boleta (visión) + clasificación de intención en una sola llamada (tool-use forzado)
- `drive.js` — cliente Drive autenticado al boot: `subirImagen`, `subirBackup`, `subirReporte`
- `excel.js` — construye workbooks a partir de filas ya armadas; no conoce roles ni hace queries
- `reports.js` — namespaces `reports.rodrigo.*` / `reports.gary.*` disjuntos
- `flows.js` — router de intención + máquina de estados conversacional + handlers de los 6 flujos + comandos admin
- `whatsapp.js` — `sendText`, `downloadMedia` sobre la API de 360dialog
- `backup.js` — export JSON de todas las tablas a Drive, invocado por cron
- `format.js` — helpers puros (`fmtMonto`, `normalizarTel`, `fmtFecha`, `contieneRazonSocialValida`)
- `migrate.js` + `migrations/*.sql` — runner de migraciones propio (sin Knex/Prisma)

## Cómo correrlo

```
npm install
npm run migrate   # o: node migrate.js
node index.js     # "npm start" ya encadena migrate.js && index.js
```

Variables de entorno — ver `.env.example`. Obligatorias: `DATABASE_URL`, `WHATSAPP_API_KEY`, `WEBHOOK_VERIFY_TOKEN`, `ANTHROPIC_API_KEY`, `GOOGLE_SERVICE_ACCOUNT_JSON_BASE64`, `GOOGLE_DRIVE_FOLDER_ID_BOLETAS/BACKUPS/REPORTES`. `config.js` falla rápido (`process.exit(1)`) si falta alguna.

`GARY_NUMBER_1/2` y `RODRIGO_NUMBER` de v1 ya no existen — los usuarios autorizados viven en la tabla `usuarios` (columna `rol`: `gary`/`rodrigo`/`finanzas`/`admin`). Se agregan con el comando admin `agregar usuario / Nombre / Teléfono / rol` (solo Gary/admin) o insertando directo en Postgres.

## La regla crítica: margen/utilidad nunca visible para Rodrigo

`gastos` no tiene ninguna columna de margen — se calcula agregado en `reports.gary.*` contra `obras_comercial`/`etapas_comercial` (tablas separadas con el precio de venta, que Rodrigo nunca toca). La separación es por **ausencia de código**, no un filtro en runtime: `reports.rodrigo` nunca llama a `db_comercial.js`. `excel.js` solo genera la hoja de margen si alguien le pasa explícitamente el parámetro `filasMargen` (solo lo construye `reports.gary.exportarObraConMargen`).

Antes de tocar cualquier flujo de Rodrigo: grep de `obras_comercial`/`etapas_comercial`/`db_comercial` en el repo — las únicas apariciones válidas son `db_comercial.js`, `reports.js` (dentro del objeto `gary`), `flows.js` (dentro de `intentarComandoAdmin`, gateado por rol), y `backup.js` (lista de tablas a respaldar, no expone nada por WhatsApp).

## Flujos (en `flows.js`)

Router de intención: una llamada a Claude (`claude.extraerYClasificar`) clasifica el mensaje en un intent (`REGISTRAR_RENDICION`, `REGISTRAR_ACUERDO`, `CONSULTAR_SALDO_PROVEEDOR`, `REGISTRAR_PAGO`, `COMPLETAR_ETAPA`, `EXPORTAR_REPORTE`, `CONSULTAR_RESUMEN`, `PEDIR_AYUDA`, `RESPONDER_PREGUNTA_PENDIENTE`, `DESCONOCIDO`) y extrae entidades libres (obra/etapa/item/proveedor/monto/iva/razón social), en la misma llamada que lee la imagen si hay una adjunta. El estado conversacional pendiente (`estado_conversacional`, TTL 30 min, un solo estado activo por usuario) persiste en Postgres — sobrevive a un redeploy de Railway, a diferencia de v1.

Comandos administrativos (`intentarComandoAdmin`, solo `gary`/`admin`, formato rígido con `/` intencional porque son operaciones de setup, no conversación con Rodrigo): `agregar usuario`, `agregar proveedor`, `obra nueva`, `etapa nueva`, `presupuesto` (carga manual de presupuesto por ítem — nunca se infiere), `precio venta` (alimenta `obras_comercial`/`etapas_comercial`, gary-only).

## Convenciones al modificar este código

- Mantener el patrón de namespaces disjuntos `reports.rodrigo`/`reports.gary` — no fusionar en un objeto único filtrado en runtime.
- Cualquier columna o tabla nueva relacionada a precio de venta, margen o utilidad va en `db_comercial.js`, nunca en `db.js`.
- El tono de los mensajes a WhatsApp usa Markdown de WhatsApp (`*negrita*`) y emojis, igual que v1.
- `excel.js` no debe empezar a hacer queries — recibe filas ya armadas por `reports.js`.
- v1 queda taggeado como `v1-final` en git como ancla de rollback; no borrar ese tag.
