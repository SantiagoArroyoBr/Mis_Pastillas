# PLAN-011 · Validación y estabilidad financiera

Ciclo local del 11 de noviembre de 2026. Pendiente de revisión del propietario y de autorización para publicar PREVIEW-010.

La decisión sobre DATA-006 se implementó en FIX-FECHA-002. Los recibos históricos conservan fecha original, importe, referencia y estado. PREVIEW-011 reúne la revisión pendiente de los tres ciclos. [Evidencia y checklist actualizado](FIX-FECHA-002-integridad-recibos.md).

## Punto de partida

Se trabajó en `C:/Users/santi/Documents/Mis_Pastillas`, en `development` a partir de `c12be38351cf38768c6cb28abb9aa103c52bf966`. El fetch inicial confirmó `origin/development` en `6968fec78c6c2944d54cdc69e1569d92aab3c6fd` y una relación de 0 commits remotos pendientes y 4 locales. PLAN-010 comprende `fc2ff6f` (corte), `095fb1b` (interfaz y estado de cuenta), `d2c931b` (pruebas) y `c12be38` (documentación). La referencia de `main` era `92c4034085e13bb38fd0a7ff2622c46ef797873d`. Los cuatro documentos locales de COB-001, UX-004, PLAN-005 y QA-008 quedaron fuera del ciclo.

## QA-019 · Validación financiera

| Caso ficticio | Resultado comprobado |
| --- | --- |
| Corte por fecha local | Las jornadas de ayer y hoy aportan su costo guardado. Mañana, la semana siguiente y el mes siguiente quedan fuera hasta su fecha. Fechas imposibles de jornada se conservan y se excluyen. |
| Modalidades y referencias | La jornada completa y la media jornada usan el importe registrado. Dos personas en una fecha conservan sus servicios separados. Cero es un costo guardado válido. Una tarifa ausente no habilita una modalidad. La ficha archivada y el enfermero inactivo conservan sus referencias y costos. |
| Abonos y cancelación | El motor cubrió deuda sin abonos, abono parcial, abono exacto, varios abonos, anticipo sin jornadas y cancelación. La cancelación retira del total activo el recibo vinculado y conserva ambos movimientos. |
| Cambio de saldo por fecha | Con $800 devengados y $1,000 en abonos, se obtuvieron $200 a favor. Al avanzar el reloj del navegador, el cargo de $400 produjo $200 pendientes. El JSON y el movimiento original permanecieron idénticos durante el cambio. |
| Prepago e historial | El prepago de la ficha conserva su propio conteo de fechas. Los pagos históricos y los movimientos individuales PAG-001 se conservan en su historial. En los casos probados ninguno se restó una segunda vez del saldo general. |
| Respaldo y recarga | La regresión restauró, recargó y exportó deuda, saldo cero y crédito con fichas archivadas, personal inactivo y jornadas futuras. También verificó un anticipo sin jornadas. Se mantuvo el rechazo de referencias y cancelaciones corruptas cubiertas por la suite. |

## UX-016 · Asignaciones y estado de cuenta

Se contrastó la interfaz con la [descripción aprobada de PLAN-010](PLAN-010-turnos-pagos-abonos.md). Se conservaron el encabezado con fecha y ficha, las asignaciones registradas, el selector nativo, la repetición, la selección de modalidad, el costo unitario y las acciones existentes. Las tarjetas de modalidad comparten altura y línea de precio cuando están en dos columnas. Los importes usan cifras tabulares y los del historial pueden ajustarse a pantallas estrechas.

Los tres encabezados de saldo conservan el importe principal, jornadas hasta hoy, abonos registrados, acción de registro e historial. Los costos futuros se consultan en el calendario. La suite cubrió ocultación de importes, controles deshabilitados, tarifa cero y navegación de modalidad con Tab, flechas y Escape. Se comprobó el reflujo de Pagos y del diálogo a 320, 360, 390, 430, 768, 1024 y 1280 px. No se contó con el mockup original para una comparación visual lado a lado.

## DATA-006 · Integridad y decisiones pendientes

- Se corrigió un error de presentación en `care-ui.js`. Al comparar identificadores ausentes, las jornadas antiguas podían contarse en tarjetas de otras personas. También se permitía coincidir por nombre aunque existiera un ID de servicio. El conteo usa el mismo criterio que el historial: ID cuando existe y nombre en registros legados sin ID. La regresión incluye dos enfermeros legados y una jornada cuyo nombre guardado difiere del titular identificado. El saldo monetario, las asignaciones y los IDs se conservan.
- La inspección confirmó validación de IDs duplicados, vínculo al servicio y a la ficha, cancelación única con mismo importe, referencia a recibo anterior y precisión en centavos. Las jornadas usan el costo guardado y editar una tarifa solo afecta nuevas asignaciones. La separación entre cobertura, PAG-001 y abonos generales no cambió.
- **Decisión pendiente sobre fechas de movimientos legados.** Una prueba aislada pasó a `prepareMigratedState` una ficha ficticia, sin jornadas, con `pay.generalLedger: [{id: 'fixture', type: 'receipt', date: '2020-02-30', amountCents: 1200}]`. El validador de calendario devolvió falso, el respaldo conservó la fecha y el saldo derivado fue de $12 a favor. La validación de importación del libro comprueba la forma de la fecha. Excluir el movimiento o rechazar el respaldo cambiaría el saldo o impediría recuperar datos existentes. Se propone decidir primero cómo presentar y conciliar los movimientos legados con fecha inválida, conservando el JSON original. El mismo criterio debe cubrir cancelaciones.
- **Conciliación histórica.** Los importes de prepagos globales no identifican servicios monetarios. PAG-001 conserva aplicaciones individuales, pero las reglas aprobadas separan sus movimientos del libro general. Si una familia identifica un servicio cobrado por ambos modelos, hace falta una decisión explícita de conciliación basada en evidencia, sin atribuir pagos por coincidencia de fecha o importe.
- **Compatibilidad hacia atrás.** Un respaldo con abonos activos superiores a todos los costos guardados requiere PLAN-010 o posterior. La limitación ya existía en PLAN-010. Antes de evaluar una reversión de versión, conservar la exportación y verificar su restauración con una versión compatible.

## PWA-004 · Actualización y trabajo offline

La versión de caché pasó de `acompanha-v12` a `acompanha-v13` para distribuir juntos HTML, JavaScript y CSS. Se conservó la espera del nuevo service worker mientras permanezca abierta una pestaña de la versión anterior.

Se probó el paso desde los archivos exactos de `c12be38` a PLAN-011 en el mismo origen local y un perfil aislado. La versión nueva quedó en espera mientras se conservaba un borrador. Tras cerrar el cliente anterior se activó, sirvió el nuevo JavaScript y CSS, conservó `pastillas-v1`, retiró cachés viejas de la aplicación y mantuvo una caché de prueba ajena. Abrió y recargó sin conexión, guardó una ficha ficticia offline, la leyó tras recargar y conservó el mismo JSON al reconectar. El precaché cubrió las rutas, el manifest, las fuentes e iconos locales. La suite completa también probó una actualización simulada desde v13.

## PERF-003 · Renderizado de Pagos

El estado de cuenta y las tarjetas de enfermería se actualizan por separado. En el mismo caso ficticio con cuatro historiales y un abono que cambia el saldo, PLAN-010 reemplazó los 4 nodos de historial y reconstruyó el elemento enfocado. PLAN-011 reemplazó 0 nodos de enfermería, mantuvo el historial abierto y conservó el foco en el mismo elemento. Se observó una mutación estructural en Pagos en cada versión, con un alcance menor en PLAN-011. Veinte refrescos sin cambios mantuvieron cero mutaciones. Se reutilizan la delegación de eventos y el intervalo existente. La medición cuenta reemplazos de nodos y no estima tiempos en otros dispositivos.

## QA-020 · Regresión integral

En Microsoft Edge **157.0.4341.42**, con perfil temporal, servidor local y datos ficticios, la referencia pasó **73/73**. La revisión final pasó **76/76** (10 de motor y 66 de navegador). Se agregaron tres casos y se ampliaron las comprobaciones de reflujo, alineación, actualización y escritura offline. La ejecución separada de la actualización real v12 → v13 pasó **1/1**.

Comando habitual: `node --test tests/payments.spec.js tests/persistence.spec.js`. Para repetir la actualización real, exporta `c12be38` a una carpeta temporal, apunta `ACOMPANHA_PREVIOUS_ASSETS` a esa copia y ejecuta solo `node --test --test-name-pattern="la PWA abre y recarga offline" tests/persistence.spec.js`.

La suite mantuvo las regresiones de inventario, pautas, reposición y alertas, citas, alta y gestión de enfermería, tarifas y repetición, archivo y reactivación de fichas, privacidad, restauración, errores y concurrencia. También se comprobó sintaxis JavaScript, manifest, diff y ausencia de errores de consola en los flujos instrumentados. La comprobación fue local. Quedan pendientes el contraste visual con el diseño original, lectores de pantalla, hardware físico y la comprobación funcional en Vercel Preview.

## PREVIEW-010 · Checklist del propietario

- [ ] En un perfil aislado, probar con una ficha ficticia las modalidades, las tarifas cero y ausente, la repetición y el guardado por teclado.
- [ ] Revisar los tres estados del saldo, ocultar importes, registrar un excedente y cancelar un recibo. Confirmar que el historial conserva ambos movimientos.
- [ ] Comprobar que una jornada futura aparece en el calendario y que los importes históricos se conservan al editar tarifas.
- [ ] Exportar un respaldo ficticio con crédito, restaurarlo y recargar. Verificar fichas archivadas y personal inactivo.
- [ ] Revisar presentación en móvil, lector de pantalla, actualización y recarga offline. En una futura Preview, comprobar que corresponde a la rama y al SHA autorizados.

**PLAN-010 y PLAN-011 están preparados para revisión del propietario. No se ha realizado push ni despliegue. Su publicación requiere aprobación explícita.**
