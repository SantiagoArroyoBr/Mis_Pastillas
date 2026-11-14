# MACRO-001 · Finalización funcional y visual

Entrega local de Acompaña 1.0 para revisión del propietario. La aplicación organiza el cuidado familiar en un navegador con persistencia local y una PWA que precarga sus recursos. El alcance comprende las funciones de la matriz siguiente. Las opciones disponibles dependen de la sección y los datos de la ficha.

## Coordinación y SYNC-003

- Rama inicial `development`, SHA `7154612353a0c3bbc20192c6fb4281269ca480fc`. PLAN-012 ya estaba presente en tres commits locales desde `f151111`.
- Se ejecutaron `git fetch origin` y `git ls-remote`. GitHub confirmó `development` en `f1511111772e275807aab13e7459fdce177f163c`, con los doce commits aprobados de PREVIEW-011, y `main` en `92c4034085e13bb38fd0a7ff2622c46ef797873d`. Vercel devolvió `success` para el commit publicado. [PLAN-012 y evidencia histórica](PLAN-012-consolidacion-funcional.md) · [Despliegue PREVIEW-011](https://vercel.com/dinamita20/pastillas-1/3cctLLwdXgjrJ2y2UB1XHA4gbZ9x).
- La consulta de GitHub Actions para ese SHA devolvió cero ejecuciones de pull request. El conector consultado se limita a esa clase de ejecución.
- El checkout contenía dos documentos modificados, `docs/COB-001-propuesta-cobertura.md` y `docs/UX-004-propuesta-gestion-fichas.md`, y dos sin seguimiento, `docs/PLAN-005-cobertura-gestion-fichas.md` y `docs/QA-008-casos-cobertura-fichas.md`. Se preservaron fuera de la entrega. Los cambios del ciclo se mantienen locales.

## AUD-001 y FUNC-001

| Áreas | Comportamiento revisado en código y regresiones |
| --- | --- |
| Inicio, navegación y configuración | Secciones, pendientes y accesos rápidos. Las preferencias existentes son contextuales. Se puede cambiar de sección, consultar otra ficha, revelar temporalmente importes y habilitar avisos cuando el navegador lo permite. |
| Fichas | Alta, cambio de nombre, duplicados identificados por índice, selección, archivo, reactivación y revisión de retiro reversible. Casos de fallo, recarga y restauración. |
| Medicamentos, inventario, consumos e insumos | Alta, edición, validación de pautas independientes, frecuencias, existencias compartidas, reposición y corrección de cantidad. El cálculo vigente presenta días, tomas y última toma completa, con avisos de agotamiento e insuficiencia. |
| Compras y precios | Compra con o sin precio, anotación de precios, consulta y retiro explícito de una anotación, consumo estimado y comparación de tiendas. La fecha, cantidad y precio conservan su validación. |
| Calendario, citas y turnos | Límites mensuales, día actual, ficha visible, citas de hoy y próximas, edición, detalle por fecha, jornadas completas y medias, repetición semanal y distinción entre registro legado, cobertura y costo guardado. |
| Enfermería y tarifas | Alta, edición, tarifa cero, modalidad sin configurar, retiro de modalidad, activos antes de inactivos, historial, desactivación, reactivación y retiro con dependencias comprobadas. |
| Pagos, abonos e historiales | Deuda, saldo cero, saldo a favor, corte por día local, importes ocultos, abonos generales y cancelaciones con referencia. Historial anterior de prepago y movimientos individuales, y recibos con fechas inválidas preservadas. |
| Notificaciones y compartir | Avisos locales genéricos con la app abierta y permiso del navegador. Las acciones externas de WhatsApp y Google Calendar preparan una vista editable antes de abrir el servicio. |
| Respaldos | Descarga privada, lectura y validación previa, confirmación explícita, cancelación, errores de lectura y escritura, datos legados y recuperación. |
| PWA y offline | Identidad de instalación, precarga de fuentes, iconos y scripts locales, consulta y escritura offline, recarga y actualización diferida mientras hay clientes de la versión anterior. |

### Hallazgos corregidos

| Prioridad | Hallazgo | Corrección |
| --- | --- | --- |
| P0 | Agregar una compra o anotación después de la número 40 descartaba el precio más antiguo sin confirmación. | Se conserva el historial cargado. La corrección previene nuevos descartes y los respaldos anteriores siguen siendo una posible fuente para recuperar entradas ya ausentes. |
| P1 | Tras una escritura fallida podían cambiar en memoria los datos de citas, inventario, precios, modalidades o pagos, y podían cerrarse formularios como si se hubieran guardado. | Preparar el estado candidato, escribir y actualizar la vista únicamente con éxito. El diálogo conserva el aviso y recupera el foco en el error. También se protege el cambio de sección y el registro de la fecha del último aviso. |
| P1 | Un grupo de fichas vacío dejaba acciones e inventario visibles para la ficha del otro grupo. | Ocultar acciones e inventario específicos hasta tener una ficha del grupo visible. Mantener alta y cambio de grupo. |
| P1 | Anotar un precio vacío cerraba el formulario. Quitar un precio descartaba la captura en curso. | Validación junto al importe y conservación de precio, cantidad, tienda, fecha y apertura del historial. |
| P1 | Las citas válidas fuera de las tres recientes y del rango mensual eran inaccesibles desde la interfaz. | Panel **Citas anteriores** con acceso a las citas guardadas. Las fechas inválidas se muestran con el valor original y su acción de edición. |
| P2 | Enlaces dispersos y fichas con controles sobredimensionados, aviso de asignación con plantilla exclusivamente inactiva y nombre de instalación inconsistente. | Selector compacto con botones y foco visible, aviso de asignación limitado a fichas con personal activo e identidad Acompaña en el manifest y avisos. |

### Consolidación visual

El selector de Medicinas agrupa selección, acciones generales y acciones de la ficha. Los nombres largos se ajustan al ancho, y los controles mantienen 44 px de altura mínima. Se usa verde bosque para la navegación, salvia para el contorno y la fuente local Nunito Sans. Los iconos Lucide existentes conservan su papel en la navegación y Glass sigue concentrado en los paneles interactivos. Calendario, Enfermería y Pagos conservan los componentes de PLAN-012 ya presentes en el checkout. Se revisaron sus estados de modalidad, historial, saldo, privacidad y contraste mediante las regresiones existentes.

### Compatibilidad, riesgos y pendientes

- Se conserva `pastillas-v1`, el formato JSON, el índice de cada ficha y los identificadores y referencias guardados. Las fechas inválidas siguen en los registros. Se mantienen las fórmulas de consumo, reposición, saldo, cobertura y costos.
- La detección de cambios entre pestañas compara el valor persistido antes de guardar y reacciona a eventos de almacenamiento. Sigue existiendo una ventana entre lectura y escritura sin exclusión mutua. La resolución de colisiones simultáneas es P1 pendiente para MACRO-002.
- La importación conserva el límite existente de 10 MiB. Un historial muy grande puede aumentar el costo de renderizado y alcanzar cuotas de almacenamiento o el límite de restauración. Hace falta medir tamaños y tiempos antes de definir cambios de límites. Las operaciones de escritura conservan el modo protegido.
- Quedan pendientes la inspección visual manual con zoom real, lector de pantalla y dispositivos físicos, y la prueba funcional de la Preview autenticada. La validación de accesibilidad fue parcial y se basó en aserciones de reflujo, foco, teclado, nombres accesibles y contraste de componentes.
- P2 posteriores a 1.0 incluyen extender la iconografía Lucide a las acciones secundarias y revisar su legibilidad en modos de contraste del sistema.

## QA-023

Edge 157.0.4341.46 y Node.js 24.20.0 con perfil temporal y datos ficticios. La suite incluye DOM y eventos de teclado reales del navegador, consola instrumentada, recorridos de respaldo, fallos inyectados de almacenamiento y una actualización PWA de prueba. Las anchuras usadas para reflujo fueron 320, 360, 390, 430, 768, 1024 y 1280 px.

- `node --test tests/payments.spec.js tests/persistence.spec.js` pasó **86/86**. Se añadieron cuatro pruebas sobre citas, selección por teclado y reflujo de fichas, retención de precios y fallos de escritura.
- La actualización real **v15 → v16** desde una copia exacta de `7154612` pasó **1/1** en la ejecución aislada. Verificó que la caché anterior permanece activa con un borrador abierto, que se cargan los recursos nuevos al cerrar el cliente anterior y que `pastillas-v1` se conserva. También comprobó guardado y recarga offline. La primera ejecución completó el caso y devolvió `EPERM` al limpiar el perfil temporal de Edge. La repetición terminó con código 0.
- Pasaron la sintaxis JavaScript, la lectura de `manifest.json` como JSON y `git diff --check`. Se revisaron la lista de recursos precargados, la política de espera para activación y la limpieza de cachés propias del service worker.

## Propuesta para MACRO-002

1. Diseñar y reproducir escrituras simultáneas en dos pestañas y probar una estrategia que evite sobrescrituras y preserve el borrador ante conflictos.
2. Probar recuperación después de agotar cuota y medir qué respaldos se pueden exportar y restaurar, incluido el límite de importación.
3. Verificar con casos ficticios la conservación de registros huérfanos, recibos con fechas ilegales y asignaciones históricas. Definir con el propietario cómo conciliarlos.
4. Preparar una matriz de actualización desde la versión publicada y desde v15, con cierres de clientes, fallo de red durante instalación y recuperación tras una interrupción.
