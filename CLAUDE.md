# SINAN Bot

Bot de WhatsApp para registrar y controlar gastos de obras de construcción, vía la API de 360dialog (WhatsApp Business API). Aplicación Node.js de un solo archivo (`index.js`), sin base de datos: todo el estado vive en memoria y se pierde al reiniciar el proceso.

## Stack

- Node.js + Express (servidor HTTP / webhook receiver)
- axios (cliente HTTP para enviar mensajes vía 360dialog)
- Sin base de datos, sin framework de testing, sin build step

## Cómo correrlo

```
npm install
node index.js
```

Escucha en `process.env.PORT` (default 3000). Requiere las variables de entorno:

- `WHATSAPP_API_KEY` — API key de 360dialog (header `D360-API-KEY`)
- `GARY_NUMBER_1`, `GARY_NUMBER_2` — números de WhatsApp autorizados como "Gary" (admin)
- `RODRIGO_NUMBER` — número de WhatsApp autorizado como "Rodrigo" (operador)

No existe `.env.example` en el repo; estas variables deben configurarse manualmente donde se despliegue.

## Arquitectura (todo en `index.js`)

- **Webhook GET `/webhook`** — verificación de 360dialog. El verify token está hardcodeado como `"sinan2024"` (línea ~99).
- **Webhook POST `/webhook`** — recibe mensajes entrantes de WhatsApp, responde `200` inmediatamente y procesa de forma asíncrona.
- **`GET /gastos`** — devuelve el array `gastos` completo en JSON (sin auth).
- **`GET /`** — healthcheck simple.

### Modelo de datos

`gastos` es un array en memoria de objetos:

```js
{ id, obra, etapa, proveedor, monto, descripcion, fecha, registradoPor, estado, montoPagado?, fechaPago? }
```

`estado` es `"pendiente"` o `"pagado"`. `gastoIdCounter` autoincrementa el `id`.

### Autorización

Solo dos roles, identificados por número de teléfono de origen (`from`):

- **Gary** (`isGary`) — uno de `GARY_NUMBERS`. Es el admin: puede marcar pagos y recibe notificación automática de cada gasto que registra Rodrigo.
- **Rodrigo** (`isRodrigo`) — operador. Puede registrar gastos pero no marcarlos como pagados.

Cualquier número fuera de esa lista es ignorado silenciosamente (`isAuthorized`).

### Comandos de WhatsApp (texto plano, case-insensitive)

| Comando | Quién | Acción |
|---|---|---|
| `ayuda` / `help` | todos | Muestra menú de ayuda (`msgAyuda`) |
| `resumen` | todos | Resumen de gastos por obra/etapa (`generarResumen`) |
| `pendientes` | todos | Lista gastos sin pagar (`listarPendientes`) |
| `pago / ID / monto` | solo Gary | Marca un gasto como pagado (`parsearPago`) |
| `Obra / Etapa / Proveedor / Monto / Descripción` | todos | Registra un gasto nuevo (`parsearGasto`) |

El registro de gasto y el pago se parsean dividiendo el texto por `/`. El formato es estricto y posicional — no hay parser tolerante a orden distinto de campos.

### Reglas de negocio específicas

- **Obras válidas** (hardcodeadas en `parsearGasto`): `codegua`, `rancagua`, `peñaflor`, `maribel`, `islevy`, `adela`, `mardones`. Cualquier otra obra es rechazada.
- **Presupuesto de Codegua Etapa 1**: hardcodeado en `$31.000.000` (línea ~149). Al registrar un gasto en `codegua` + etapa `E1`, el bot calcula automáticamente gastado/saldo/% y alerta visualmente (🟢 <70%, 🟡 70-89%, 🔴 ≥90%, ⚠️ si se excede). No hay presupuestos configurados para otras obras/etapas.
- Cuando Rodrigo registra un gasto, el bot notifica automáticamente a ambos `GARY_NUMBERS` con los datos y el comando de pago listo para copiar.
- Los montos se formatean en formato moneda chilena (`$1.166.311`, vía `toLocaleString("es-CL")`); al parsear se limpian `$` y `.`.

## Limitaciones conocidas / deuda técnica

- **Sin persistencia**: `gastos` vive solo en memoria del proceso Node. Un reinicio (deploy, crash, restart de Render/Railway/etc.) borra todo el historial.
- **Verify token hardcodeado** (`"sinan2024"`) en el código fuente, no en variable de entorno.
- **`GET /gastos` sin autenticación** — cualquiera con la URL puede leer todos los gastos registrados.
- **Sin tests** y sin linter configurado.
- El historial de git muestra commits sucesivos de tipo "Update index.js" sin mensajes descriptivos — para entender la evolución real de una regla de negocio, es mejor leer el código actual que el log.

## Convenciones al modificar este código

- Mantener el estilo: un solo archivo, funciones puras pequeñas (`parsearX`, `generarX`, `listarX`) que el handler del webhook orquesta.
- Los mensajes de respuesta a WhatsApp usan formato Markdown de WhatsApp (`*negrita*`, `_cursiva_`) y emojis — seguir ese tono si se agregan mensajes nuevos.
- Si se agrega una obra o presupuesto nuevo, hoy implica editar arrays/constantes hardcodeadas (`obrasValidas`, `PPTO`) directamente en `index.js`; no hay capa de configuración separada.
