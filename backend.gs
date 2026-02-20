function doGet(e) {
  // Abre la hoja activa (asegúrate de que los datos estén en la primera pestaña)
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  var data = sheet.getDataRange().getValues();
  
  // Se asume que la fila 1 contiene los encabezados: ID_QR, ESTANQUE, ESPECIE, etc.
  var headers = data[0];
  var result = [];
  
  for (var i = 1; i < data.length; i++) {
    var row = data[i];
    var obj = {};
    for (var j = 0; j < headers.length; j++) {
      // Normaliza los nombres de encabezado si lo deseas (opcional)
      obj[headers[j]] = row[j];
    }
    result.push(obj);
  }
  
  // Retorna el array como JSON
  return ContentService.createTextOutput(JSON.stringify(result))
    .setMimeType(ContentService.MimeType.JSON);
}
