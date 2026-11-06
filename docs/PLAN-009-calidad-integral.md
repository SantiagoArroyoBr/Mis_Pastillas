# PLAN-009 · Calidad integral

Trabajo local en `development` del 6 de noviembre de 2026. Todas las pruebas usaron datos ficticios y un perfil aislado de Microsoft Edge.

## Estado inicial y PREVIEW-008

- HEAD inicial `8b49a7380a260a6475f8064e0ff5cc99f9b692cd`. Tras `git fetch origin`, `development` llevaba cuatro commits por delante y cero por detrás de `e79a95f98dabab7348deb17e7231c344da6322ef`.
- Se revisaron los cuatro commits y sus archivos y se repitió QA-014 con **65/65**. El push avanzó exclusivamente `development` mediante fast-forward con `0e5a952`, `149f11d`, `8bab21f` y `8b49a73`. Se confirmó el SHA remoto. `main` local y remota se verificaron en `92c4034085e13bb38fd0a7ff2622c46ef797873d`.
- GitHub registró **Vercel success** y **Vercel Preview Comments completed/success**. La URL respondió HTTP 302 en la consulta sin credenciales. La revisión funcional del despliegue corresponde al propietario y está pendiente. [Commit publicado](https://github.com/SantiagoArroyoBr/Mis_Pastillas/commit/8b49a7380a260a6475f8064e0ff5cc99f9b692cd) · [Preview](https://pastillas-1-git-development-dinamita20.vercel.app/) · [Vercel](https://vercel.com/dinamita20/pastillas-1/9QtkRsexr6VPaicvTJRartPc3aTq).
- PLAN-009 queda en commits locales. Los documentos preexistentes `docs/COB-001-propuesta-cobertura.md`, `docs/UX-004-propuesta-gestion-fichas.md`, `docs/PLAN-005-cobertura-gestion-fichas.md` y `docs/QA-008-casos-cobertura-fichas.md` quedaron fuera.

## UX-011, QA-015 y UX-012

El historial de enfermería se identifica con `.nurse-history`. Dentro de la tarjeta tiene margen superior de 8 px, borde de 1 px, radio de 12 px, relleno lateral de 10 px y separadores discretos. La variante activa usa crema y la inactiva usa gris `#E4E7E2` sobre la tarjeta `#EEEFEA`. El indicador nativo distingue apertura y cierre. Se conservaron el orden, las fechas, las modalidades y los costos históricos, así como las claves que mantienen la apertura y el foco durante el render periódico.

| Área revisada | Hallazgo o verificación |
| --- | --- |
| Inicio, Medicinas, Fichas, Pagos, Enfermería, historiales y respaldos | Reflujo automatizado a 320, 360, 390, 430, 768 y 1280 px. Geometría de paneles activos e inactivos con cero, uno y dos registros, y regresión existente de nombres largos, botones y montos. Se revisaron capturas a 390 px con historiales activos e inactivos abiertos. |
| Fichas | El resumen de Retirar ficha usaba el mismo verde que el encabezado, 1:1. Ahora hereda blanco, 7.66:1, y muestra el marcador de expansión. |
| Calendario | Las etiquetas pequeñas usaban texto blanco sobre colores de enfermería variables. El texto carbón sobre crema da 10.16:1 y una franja conserva el color de la persona. La prueba conserva modalidad, nombre accesible y estado legado/inactivo. |
| Historial y foco | El encabezado verde alcanza 6.48:1 sobre el panel activo y 6.13:1 sobre el inactivo. El texto secundario inactivo alcanza 5.51:1. Se usa el verde para el contorno de foco en superficies claras y se conserva el dorado en el encabezado oscuro. Se probó abrir y cerrar con Espacio y conservar el foco al actualizar. |
| Formularios, diálogos y respaldos | El diálogo se nombra por su título actual. La vista previa y la confirmación de respaldo enfocan el título al cambiar de pantalla, y el texto de ayuda se asocia al botón de exportación. Escape devuelve el foco y deja intactos los datos. La suite cubre errores, etiquetas y foco de formularios comunes. |
| Glass y preferencias | Se conservó el acento selectivo. La suite mantiene la comprobación de preferencias reducidas y del filtro Glass. |

El contraste de pares seleccionados se calculó con luminancia relativa. Se usó la referencia de reflujo y contraste de WCAG 2.2. Quedan pendientes zoom real de navegador al 200 % y 400 %, lectores de pantalla, contraste exhaustivo y teléfonos físicos. [WCAG 2.2](https://www.w3.org/TR/WCAG22/).

## DATA-003 · Persistencia y recuperación

- Se revisaron carga, validación, guardado, exportación e importación JSON y estado protegido. La suite cubre datos legados y actuales, JSON corrupto, fallos de lectura o escritura, cancelación, restauración, fichas archivadas, enfermeros inactivos y conflictos entre pestañas.
- Una fecha imposible en `exportedAt` podía causar `RangeError` al preparar la vista previa. Ahora se muestra como fecha no válida y el respaldo sigue su flujo normal de revisión. Los registros históricos conservan sus valores.
- La restauración de un valor corrupto también compara el valor original con el actual justo antes de escribir. La regresión simula una escritura externa visible antes de recibir el evento de otra pestaña. La limpieza completa de `localStorage` desde otra pestaña activa la protección si había datos guardados.
- Se conserva la recuperación explícita tras un fallo de lectura inicial, cuando el valor anterior es desconocido. El control de concurrencia es preventivo y la comparación y escritura son operaciones separadas. Algunos formularios legados todavía cambian el estado en memoria antes de intentar guardar. Ante una escritura rechazada, el aviso bloquea cambios posteriores y la regresión comprueba que el JSON anterior se conserva. Una revisión futura puede unificar la preparación de estados candidatos antes de guardarlos.
- Se conservaron `pastillas-v1`, el esquema, los índices, los identificadores, los movimientos históricos y las reglas de medicamentos, inventario, cobertura y pagos.

## PWA-002 · Offline y actualización

`sw.js` precarga el HTML, CSS, JavaScript, manifest, iconos de instalación, SVG Lucide y fuentes locales en `acompanha-v10`. El worker sirve su copia cacheada para los recursos conocidos y recurre a red ante una falta. Las URL de navegación conocidas con parámetros conservan acceso offline. El nuevo worker espera a que se cierren los clientes de la versión anterior. Cada cambio futuro de recursos precargados requiere incrementar el número de versión del worker.

La prueba de navegador comprobó el primer control por el worker, una visita posterior, navegación a `/` y `/index.html?offline=1`, recarga sin red, CSS, JS, fuente e iconos operativos, y exclusión de una ruta ajena. La versión sintética v11 esperó mientras un formulario seguía abierto con un borrador. Al salir el cliente, se activó y eliminó v10 y cachés obsoletas de Acompaña. La prueba confirmó el mismo JSON antes y después y conservó la caché de otro componente. Queda pendiente instalar desde la interfaz del sistema y reproducir el ciclo en una PWA instalada y con varios clientes abiertos.

## PERF-002 · Mediciones

Se revisaron el temporizador, los listeners delegados, Inicio, Pagos, calendario, selector, historiales y diálogos. El temporizador no redibuja mientras el diálogo está abierto. La suite de Pagos verificó cero mutaciones estructurales en veinte llamadas, con paneles y foco preservados. La inspección no mostró duplicación de listeners por renderizado periódico.

| Veinte llamadas al callback de 60 s con 24 medicinas ficticias | Tiempo total de JS | Mutaciones de hijos observadas | Mismo botón enfocado |
| --- | ---: | ---: | --- |
| Base anterior al cambio de Medicinas | 31.2 ms | 40 | No |
| PLAN-009, prueba dirigida | 20.6 ms | 0 | Sí |
| PLAN-009, primera suite integral aprobada | 11.1 ms | 0 | Sí |
| PLAN-009, última suite integral aprobada | 31.6 ms | 0 | Sí |

Las mediciones usan `performance.now()` en Edge headless y `MutationObserver` bajo la vista de Medicinas. Los tiempos variaron entre corridas. El resultado reproducible fue la eliminación de mutaciones estructurales en el caso sin cambios. Se reutilizó `updateHTML` para avisos, compras y tarjetas, conservando los cálculos de cada render. Quedan sin medir la fluidez de desplazamiento, el costo de Glass en dispositivos, FPS y memoria.

## QA-016 y archivos

`node --test tests/payments.spec.js tests/persistence.spec.js` pasó **69/69** (8 de motor y 61 de navegador). Incluye medicamentos, consumos, inventario, insumos, compras, citas, calendarios, tarifas, pagos, abonos, cancelaciones, archivos y respaldos. Los casos nuevos de historial y respaldo comprobaron también ausencia de errores de JavaScript durante sus flujos. Se verificó sintaxis en 12 scripts, parseo del manifest y `git diff --check`.

- Interfaz y ejecución: `care-ui.js`, `styles.css`, `index.html`, `inventory.js`, `app.js` y `sw.js`.
- Regresión: `tests/persistence.spec.js`.
- Documentación: README, plan, arquitectura, historial, guía de instalación y este informe.

## Checklist del propietario

- [ ] Validar PREVIEW-008 con datos ficticios. Revisar PLAN-009 por separado en la versión local.
- [ ] Abrir los historiales de enfermeros activos e inactivos. Revisar espaciado, colores, bordes, fechas, modalidades, importes y orden. Esperar más de un minuto y comprobar que siguen abiertos.
- [ ] Recorrer Inicio, Medicinas, Fichas, Pagos y respaldos con Tab y Shift+Tab. Abrir controles con Enter o Espacio y cancelar con Escape. Verificar foco visible y retorno del foco.
- [ ] Probar formularios, errores y confirmaciones con lector de pantalla y zoom real al 200 % y 400 % en el equipo habitual.
- [ ] Revisar calendario, asignaciones, tarifas, pagos y cancelaciones con un conjunto ficticio.
- [ ] Exportar un JSON ficticio, cancelar una restauración y luego confirmar otra. Comprobar fichas archivadas, enfermeros inactivos y los registros restaurados.
- [ ] Instalar en un perfil de prueba, abrir y recargar offline, y comprobar CSS, iconos y fuentes.
- [ ] Preparar una segunda versión de prueba con un formulario abierto. Comprobar que el borrador permanece hasta guardar o cancelar, cerrar todos los clientes y reabrir. Verificar que se muestran la versión nueva y los datos previos.
