const ExcelJS = require("exceljs");

// Construye un workbook a partir de filas YA armadas — este módulo no conoce
// roles ni hace queries a la base de datos. La hoja "Margen" solo se genera
// si alguien le pasa explícitamente `filasMargen` (eso solo lo hace reports.gary.*).
async function construirReporteObra({ nombreObra, filasGastos, filasEficiencia, filasMargen }) {
  const wb = new ExcelJS.Workbook();
  wb.creator = "SINAN Bot";
  wb.created = new Date();

  const hojaGastos = wb.addWorksheet("Rendiciones");
  hojaGastos.columns = [
    { header: "ID", key: "id", width: 8 },
    { header: "Tipo", key: "tipo", width: 12 },
    { header: "Etapa", key: "etapa", width: 14 },
    { header: "Ítem", key: "item", width: 18 },
    { header: "Proveedor", key: "proveedor", width: 20 },
    { header: "Monto", key: "monto", width: 14 },
    { header: "Estado", key: "estado", width: 12 },
    { header: "Fecha", key: "fecha", width: 14 },
    { header: "Descripción", key: "descripcion", width: 30 },
  ];
  hojaGastos.addRows(filasGastos || []);

  const hojaEficiencia = wb.addWorksheet("Eficiencia por ítem");
  hojaEficiencia.columns = [
    { header: "Ítem", key: "item", width: 18 },
    { header: "Presupuesto", key: "presupuesto", width: 16 },
    { header: "Gastado", key: "gastado", width: 16 },
    { header: "% Ejecutado", key: "pct", width: 14 },
  ];
  hojaEficiencia.addRows(filasEficiencia || []);

  if (filasMargen) {
    const hojaMargen = wb.addWorksheet("Margen");
    hojaMargen.columns = [
      { header: "Etapa", key: "etapa", width: 14 },
      { header: "Precio venta", key: "precioVenta", width: 16 },
      { header: "Gastado", key: "gastado", width: 16 },
      { header: "Margen", key: "margen", width: 16 },
      { header: "Utilidad Rodrigo (10%)", key: "utilidadRodrigo", width: 20 },
    ];
    hojaMargen.addRows(filasMargen);
  }

  hojaGastos.getRow(1).font = { bold: true };
  hojaEficiencia.getRow(1).font = { bold: true };
  if (filasMargen) wb.getWorksheet("Margen").getRow(1).font = { bold: true };

  return wb.xlsx.writeBuffer();
}

module.exports = { construirReporteObra };
