# MACRO-004 · Preparación de la validación de RC 1.0

El propietario aprobó la revisión local documentada en `90a15be1e6cb5801e0c9825f884020076337c143` y pidió agrupar el trabajo en lotes mayores. La propuesta agrupa Preview, dispositivos, accesibilidad y recuperación de la misma candidata. El inicio depende del acceso a esos entornos y la clasificación sigue en [B · Candidata condicionada](RC-1.0-criterios-lanzamiento.md).

## Paquete de publicación

La consulta de solo lectura a GitHub devolvió `6ea578c1dad72f1fb2a43f00cf870819d4dfa6c4` para `development` y `92c4034085e13bb38fd0a7ff2622c46ef797873d` para `main`. El primero es ancestro directo del paquete propuesto para `origin/development`, que contiene estos cuatro commits:

| SHA | Contenido |
| --- | --- |
| `d31b2892fe74fa353deb000c36c61e48ff5dc8ee` | Protección de compras y proyección de existencias. |
| `c75e3364cb405f0baf5cba63719be3e737e09e4f` | Accesibilidad de formularios y revisión previa de Calendar. |
| `d59b4f9b8f7692af105afc4c8f57bb9e0a91cf0c` | Regresión integral, escala y cuota. |
| `6b0d84c046e82c05eb0a7910d296b50811d88817` | Evidencia de MACRO-003 y criterios de la candidata. |

El paquete termina en `6b0d84c`. Los commits posteriores de coordinación y QA permanecen locales. La [validación de la candidata](QA-RC-LOCAL-001-candidata.md) acredita 101/101 pruebas y una actualización exacta v17 → v18. Antes de publicar, confirmar autorización específica de ese SHA y destino y volver a leer la referencia remota. Tras la publicación autorizada, registrar por separado SHA remoto, check de Vercel, autenticación y resultado funcional.

## Lote de validación

Ejecutar cada recorrido con datos ficticios en un perfil aislado. Registrar SHA o deployment confirmado, dispositivo, navegador, tecnología de asistencia cuando corresponda, caso, resultado y pasos de reproducción de cualquier fallo.

| Orden | Entorno y dependencia | Recorrido y aceptación |
| --- | --- | --- |
| 1 | Preview autenticada con SHA acreditado. MACRO-002 puede probarse si se recupera acceso al deployment de `6ea578c`. La candidata depende de PUB-M003. | Crear ficha, medicamento con dos pautas, compra, personal con ambas tarifas, cita y abono. Tras recargar, comprobar referencias, existencias e importes. Exportar el JSON, cancelar una restauración y después confirmarla. Comparar el estado restaurado. |
| 2 | Computadora y móvil físicos con instalación desde el navegador. Para oferta de actualización, comprobar versión inicial y final. | Abrir, editar, exportar y recargar offline. Actualizar con un borrador abierto, verificar la espera y volver a exportar tras reconectar. Probar recuperación con el conjunto de escala y registrar tamaño, tiempos y comportamiento ante cuota, con comparación v17/v18 en el mismo equipo cuando esté disponible. |
| 3 | Navegador con teclado, zoom 200 % y 400 % y lector de pantalla. | Recorrer calendario, pautas, estado de cuenta y restauración. Registrar etiquetas y mensajes anunciados, orden del foco, apertura y cierre de diálogos y si se puede completar la acción. |
| 4 | Dos pestañas del mismo origen. | Editar en ambas, guardar en una y comprobar que la otra conserva el borrador al detectar el conflicto. Recargar y verificar cuál estado persiste. Ante pérdida o corrupción, conservar el respaldo ficticio y abrir un defecto de integridad. |

Al cerrar el lote, presentar los resultados frente a los [criterios de salida](RC-1.0-criterios-lanzamiento.md#criterios-de-salida) para la decisión del propietario.

### Zoom efectivo en flujos críticos

Se repitieron cuatro escenarios existentes de `tests/persistence.spec.js` a cada nivel de zoom en Edge 157.0.4341.60. Un arnés temporal aplicó zoom por origen mediante `chrome.tabs.setZoom` y lo confirmó con `getZoom` y `devicePixelRatio`. Con una ventana inicial de 1320 × 900, Edge reportó 647 CSS px al 200 % y 323 CSS px al 400 %. Pasaron **4/4 en cada nivel**. Se verificaron foco al validar una cita y al cambiar de mes, nombres accesibles y foco al añadir o quitar horas, cancelación de restauración con Escape y confirmación de un solo uso, y conservación de saldo, cancelaciones y recibos históricos tras exportar y restaurar. Quedan pendientes la inspección visual de esos flujos ampliados y la experiencia con lector de pantalla.

## Datos históricos y coexistencia

- **Respaldos ambiguos.** `compatibility.js` detiene la importación de `pay.w` cuando la fecha histórica `paid` de una ficha difiere de la global o cuando otros metadatos o asignaciones entrarían en conflicto. La prueba con `pay.w[0].paid = "2020-02-30"` y sin fecha global comprobó que el estado activo sigue idéntico y que no aparece la confirmación. La decisión pendiente es si mantener el rechazo o definir una representación por ficha con significado explícito. Una regla futura debe verificar el original, índices, fechas, importes, ausencia de duplicados y restauración antes de adoptar el formato.
- **Recibos con fecha imposible.** Sigue vigente [FIX-FECHA-002](FIX-FECHA-002-integridad-recibos.md). El recibo conserva texto, importe y vínculos. Una cancelación explícita mantiene su trazabilidad y el saldo se comprueba por ID.
- **Concurrencia.** La candidata compara el valor esperado y preserva el borrador al detectar una escritura externa. Si el propietario requiere edición simultánea, la especificación debe cubrir escrituras y restauraciones en dos clientes cooperativos, convivencia con v17/v18, pérdida del cliente que posee el bloqueo y navegador sin soporte. La alternativa para la candidata es operar con una sola pestaña editable y someter el riesgo residual a decisión explícita. [Evidencia de concurrencia](MACRO-003-validacion-integral.md#conc-002)

Se repitieron seis casos de `tests/persistence.spec.js` en Edge 157.0.4341.60 con datos ficticios. Pasaron **6/6**: turnos y textos legados, rechazo de metadatos ambiguos, recibos históricos, verificación antes y después de escribir, pestaña obsoleta y retorno a una pestaña con borrador abierto.
