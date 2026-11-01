# AUD-FUNC-001 — Auditoría funcional integral

**Estado:** informe local para revisión; no se modificó código.
**Checkout auditado:** rama `development`, SHA `b55754bd611979ec98126305fe4a3be7ad933d68` (posterior al cierre documental CIERRE-002).
**Fecha de revisión:** 2026-10-31.

**Decisión CONS-006:** este informe y PLAN-004 quedan consolidados documentalmente. Se autorizó FIX-FECHA-001, investigación DATA-001 condicionada a compatibilidad, COB-001/UX-004 como propuestas documentales, correcciones puntuales ACC-001 y QA-006. La evidencia y el hallazgo F-001 siguen referidos al SHA auditado; los cambios posteriores se registran en secciones de seguimiento, sin reescribir resultados de línea base.

## 1. Resumen ejecutivo

La implementación inspeccionada es una PWA frontend modular que guarda un único estado completo en `localStorage` (`pastillas-v1`), valida y restaura JSON con protecciones, calcula inventario de medicinas/insumos, mantiene citas y ofrece libros separados de pagos individuales y abonos generales. La suite ejecutada pasó **45/45**. No se identificaron hallazgos críticos o altos en el alcance revisado.

Se confirmó un defecto de integridad de fechas: el validador acepta valores imposibles que cumplen la forma `AAAA-MM-DD`; el constructor de fechas de JavaScript los normaliza a otra fecha. La prueba aislada aceptó `2030-99-99` y la conversión local produjo `2038-06-07`. Esto puede desplazar citas, compras o movimientos importados. No se corrigió por alcance.

Existe además un riesgo potencial de concurrencia entre pestañas: cada pestaña conserva su propia copia del estado y guarda el JSON completo sin comprobar si otra pestaña escribió después. No hay escucha de cambios `storage` ni control de versión/conflicto. La posibilidad de sobrescritura se deriva del flujo de escritura; no se ejecutó una prueba multi-pestaña.

La cobertura histórica de enfermería se calcula en fechas por ficha y no pondera modalidad o número de enfermeros. La interfaz/documentación identifica que es un conteo histórico y separa el saldo general verificable, así que se registra como límite del modelo pendiente de decisión, no como error confirmado de la liquidación ADMIN-001. Los datos locales y respaldos JSON no están cifrados por la aplicación; este riesgo ya fue documentado y aceptado para el uso familiar/controlado actual, no para una publicación de acceso público.

## 2. Alcance y metodología

### Estado y archivos

Se verificó raíz `C:/Users/santi/Documents/Mis_Pastillas`, `development`, SHA `b55754bd611979ec98126305fe4a3be7ad933d68`, remoto `origin` = `SantiagoArroyoBr/Mis_Pastillas`, sincronización `development`/`origin/development`, árbol limpio antes de la auditoría y `main`/`origin/main` en `92c4034085e13bb38fd0a7ff2622c46ef797873d`. El commit auditado posterior al cierre solo contiene documentación.

Revisados: `index.html`, `styles.css`, `app.js`, `compatibility.js`, `domain.js`, `forms.js`, `appointments.js`, `inventory.js`, `payments.js`, `care-ui.js`, `sharing.js`, `sw.js`, `manifest.json`, `tests/payments.spec.js`, `tests/persistence.spec.js`, documentos centrales, FUNC-001/PLAN-002/PLAN-003, ADMIN-001, DEV-003A, AUD-003 y revisión AUD-011 con seguimiento AUD-012.

No existen en la raíz los documentos opcionales `REGLAS_GENERALES.md`, `CENTRO_DE_COORDINACION.md`, `SOLICITUDES.md`, `TRABAJO_ACTIVO.md` ni `DECISIONES_TECNICAS.md`.

### Comprobaciones ejecutadas

- `node --check` en todos los archivos `*.js` rastreados por `rg --files`.
- `JSON.parse` de `manifest.json`.
- `node --test tests/payments.spec.js tests/persistence.spec.js`: **45/45**, Edge 156.0.4314.50, perfil temporal y fixtures sintéticos.
- La suite recorre viewports 320, 360, 375, 390, 430 y 768 px; pruebas de almacenamiento, importación/restauración, pagos, citas, enlaces, manifest, notificaciones, caché/offline y responsive.
- Inspección estática de rutas dinámicas HTML, URLs externas, scripts/dependencias y validación de estado.
- Reproducción aislada en Node/V8 de aceptación de fecha imposible mediante `AcompanaCompatibility.validateStoredState` y normalización de `new Date(...)`; solo objetos sintéticos, sin leer ni escribir datos del navegador.
- `git diff --check` antes de crear los informes locales.

El primer intento de la suite de navegador en esta sesión falló porque el entorno denegó el loopback (`EACCES 127.0.0.1`); se repitió con permiso local y pasó 45/45. La instrumentación de páginas comprueba errores JavaScript en casos de la suite, pero no se realizó una captura completa de todos los mensajes de consola. No se hicieron pruebas manuales de interfaz, Firefox, dispositivos físicos, instalación real, Preview ni producción; se conserva aparte la declaración del propietario de que probó PREVIEW-003, sin inventar casos/resultados.

## 3. Inventario funcional

| Área | Estado comprobado y módulos | Reglas/dependencias y observaciones |
|---|---|---|
| Pacientes/fichas | Dos fichas iniciales en `compatibility.js:85`; se seleccionan con pestañas generadas por `app.js:248`; `app.js:305` edita el nombre activo. | No hay controles de alta/baja/reordenamiento de fichas en la interfaz actual. Citas y varios registros históricos dependen de índices; gestionar ciclo de vida requiere proteger referencias y no debe improvisarse. |
| Medicamentos | Alta/edición, múltiples pautas, eventos y cálculo de existencias en `app.js:262–274`, `inventory.js:109–145` y `domain.js:47–77`. | Los consumos de las pautas de una ficha se suman al inventario común de cada medicina. Eventos llevan dosis/horarios/calendario; umbrales de compra usan ventana de seguridad 1–2 días. Datos y reglas validados en `tests/persistence.spec.js`. |
| Insumos y compras | Registro como `kind:'sup'`; historial de precios/compras en `inventory.js:29–63`; previsión de consumo mensual en `inventory.js:37–38`. | El historial conserva hasta 40 anotaciones; gasto mensual usa último precio unitario y consumo proyectado de 30 días. Es estimación, no contabilidad de gasto real. |
| Enfermería/calendario | Enfermeros, tarifas opcionales por modalidad y asignaciones con costo snapshot en `care-ui.js:157–205,217–281`; asignación repetida semanal hasta fin de mes en `care-ui.js:240–258`. | IDs estables de servicio/enfermero; no se ofrece modalidad sin tarifa. Se evita duplicar al mismo enfermero por ficha/fecha. El calendario guarda servicios y costos; asignaciones anteriores sin tarifa permanecen identificadas como legado. |
| Cobertura histórica | `payments.js:78–96` cuenta fechas de `pay.v` desde fecha base y descuenta días de `cfg.pays`. | No pondera media jornada ni dos enfermeros de una misma fecha. Esta semántica histórica no debe confundirse con cargos/saldo por servicio. La UI y arquitectura advierten que conteo de cobertura y montos no equivalen a conciliación histórica individual. Reglas adicionales permanecen pendientes en DEV-003B. |
| Pagos individuales/general | `payments.js:6–76` convierte importes a centavos, calcula libros, asigna abonos individuales FIFO por ID y produce suma general de servicios verificables menos recibos activos. `care-ui.js:27–51,98–143` presenta historial/resumen/cancelación. | Cancelaciones son append-only. La validación de `compatibility.js:140–184` verifica identidad, fecha de aplicación, totales y duplicados. PAG-001/ADMIN-001 mantienen por separado pagos legados no conciliados; no se atribuyen automáticamente a enfermeros ni se descuentan del saldo general. |
| Citas/pendientes | CRUD de citas asociadas por índice de ficha en `appointments.js:6–60`; edición/eliminación por ID; vista futura y últimas tres pasadas. `apptDue` considera hoy a dos días. | No hay estado de completada/cancelada, ni notificación de fondo; avisos de navegador solo se calculan cuando se renderiza la app. WhatsApp/Calendar requieren vista previa y acción expresa (`sharing.js:4–32`). |
| Respaldo/restauración | Exportación JSON y restauración en `app.js:310–319,362–445`; validación/migración en `compatibility.js:89–334`. | `pastillas-v1`, límite de 10 MiB, doble paso de revisión/confirmación, conteos, opción de exportar estado actual y escritura protegida se conservan. La copia es texto JSON sin cifrado de aplicación. Suite cubre cancelación, corrupto, sobrelímite, lectura/escritura fallidas, legado y roundtrip. |
| Persistencia | Inicialización/guardado en `app.js:8–45`; módulos reciben `save` en lugar de gestionar storage. | La escritura serializa el estado entero en `localStorage`. No se observó `storage` listener, fusión ni control de escrituras concurrentes entre pestañas; véase riesgo potencial F-002. No hay backend ni sincronización multi-dispositivo. |
| PWA/offline | Manifest estático y SW `acompanha-v9`, `sw.js:1–54`. | Precarga allowlist estática, `/` e `/index.html`; red primero, fallback de caché; limpia solo prefijo propio y legacy declarado. Suite prueba offline y actualización simulada. La auditoría no verificó instalación/actualización en dispositivo real ni deployment. |
| UX/accesibilidad | Estilos de alto contraste visual, controles generalmente ≥44/48 px, `:focus-visible`, roles/labels y errores anunciados; `styles.css:1–62`, `forms.js:5–43`. | Formularios y seis viewports tienen regresión. No se ejecutó lector de pantalla, zoom real ni auditoría WCAG. Tablists declaran roles pero no se observó patrón completo de teclado/relaciones `aria-controls`; mejora de verificación, no defecto de operación demostrado. |

## 4. Hallazgos

### F-001 — El validador acepta fechas de calendario imposibles

- **Área:** importación, citas, compras y datos fechados.
- **Tipo:** defecto confirmado de validación/integridad.
- **Severidad:** media (P2).
- **Evidencia:** `compatibility.js:106,114` (y validaciones de fechas de movimientos en `:148,168`) verifican regex `YYYY-MM-DD`, sin comprobar que día/mes existan. `prepareMigratedState` usa esa validación antes de importar (`compatibility.js:314–323`). `domain.js:107` construye `new Date(y,m-1,d)`, que normaliza valores fuera de rango.
- **Reproducción no destructiva:** el validador aceptó en un objeto sintético una cita `2030-99-99`; el constructor equivalente de fecha local produjo `2038-06-07`. No se alteró ningún almacenamiento.
- **Impacto:** un JSON malformado pero con estructura plausible puede desplazar una cita o anotación varios años, presentándose como fecha válida. Una fecha inválida en el estado guardado puede afectar calendario/ordenamiento sin activar el modo protegido.
- **Riesgo de datos:** medio; datos no se borran, pero se interpretan con fecha distinta.
- **Recomendación:** validar calendario gregoriano real (incluidos bisiestos) para nuevas importaciones y entradas; decidir por separado cómo conservar registros previos que ya contengan fechas de formato correcto pero imposibles. No normalizar ni sobrescribir historial automáticamente.
- **Pruebas requeridas:** días 00/32, mes 00/13, 29 de febrero bisiesto/no bisiesto, citas/compra/pago y estado previo intacto ante rechazo; respaldos legacy válidos siguen restaurando.
- **Riesgo de corrección:** medio por compatibilidad; rechazar indiscriminadamente un respaldo o estado histórico que ya contenga esos valores podría bloquear restauración/inicialización.

### F-002 — Escritura completa sin coordinación entre pestañas

- **Área:** persistencia/concurrencia local.
- **Tipo:** riesgo potencial basado en código; no se reprodujo con dos pestañas.
- **Severidad:** media (P2 potencial).
- **Evidencia:** `app.js:37–45` escribe serialización completa de `S` a `pastillas-v1`; no se observó lectura previa por versión ni manejador `storage` en los scripts inspeccionados.
- **Escenario/impacto:** dos pestañas abiertas desde el mismo perfil cargan el mismo estado inicial. Si la primera guarda una edición y la segunda guarda después desde su copia antigua, el último `setItem` sustituye el JSON entero y puede perder la primera edición. El mismo patrón puede producir avisos diarios repetidos desde pestañas que conservan `S.last` antiguo.
- **Riesgo de datos:** potencialmente alto para la edición local concurrente; probabilidad baja/media según uso de varias pestañas.
- **Recomendación:** definir política explícita de una pestaña o detectar `storage`/conflictos antes de reemplazar el estado; no fusionar registros automáticamente sin reglas e IDs adecuados.
- **Pruebas requeridas:** dos contextos aislados del mismo origen; cada uno hace una edición distinta; confirmar que no se pierde ninguna y que los avisos no se duplican.
- **Riesgo de corrección:** medio/alto; coordinación incorrecta podría bloquear guardados válidos o fusionar estados de forma inconsistente. Mantener el esquema no implica resolverlo sin diseño.

### F-003 — Alta/baja de fichas no disponible en UI

- **Área:** administración de pacientes.
- **Tipo:** limitación funcional confirmada, no defecto de datos.
- **Severidad:** baja (P3).
- **Evidencia:** el estado inicial contiene dos fichas (`compatibility.js:85`); `index.html:17–18` y `app.js:248,305` permiten seleccionar y renombrar, sin control para agregar, archivar o eliminar fichas.
- **Impacto:** una familia que necesite otra ficha no puede gestionarla desde el flujo normal. Añadir baja/reordenamiento podría invalidar citas y registros que usan índice de ficha.
- **Recomendación:** validar necesidad con el propietario y diseñar ciclo de vida que preserve referencias antes de implementar. No eliminar ni reordenar datos existentes por inferencia.
- **Riesgo:** medio/alto si modifica índices persistidos; bajo si solo documenta el límite.

## 5. Matriz de riesgos

| Severidad | Resultado |
|---|---|
| Crítica | Ningún hallazgo confirmado en la revisión. |
| Alta | Ningún hallazgo confirmado. F-002 podría causar pérdida de la última edición concurrente, pero el uso simultáneo no se reprodujo. |
| Media | F-001 confirmado: fechas imposibles pasan la validación; F-002 potencial: último escritor reemplaza el estado completo. Riesgo inherente de exposición local descrito abajo. |
| Baja | F-003: falta UI para gestionar ciclo de vida de fichas; brechas de cobertura de teclado/zoom/lectores de pantalla no probadas. |

## 6. Reglas de negocio y cálculos revisados

- **Consumo:** `domain.js:47–77` genera eventos por hora/día/esquema, descuenta dosis y estima existencia/fecha de compra. `domain.js:25–35` evalúa frecuencia diaria, días fijos o intervalo; eventos usan hora local. La suite verifica el motor y consumos compartidos. Riesgo a futuro: cambios de horario de verano/zonas requieren casos de frontera.
- **Redondeo:** saldo remanente se redondea a dos decimales y el algoritmo permite tolerancia `1e-9` al comparar dosis (`domain.js:64–76`). No se observó prueba exhaustiva de todas las fracciones binariamente representables; cantidades son una proyección del modelo, no un libro de dispensación.
- **Reposición:** ventana de alerta de uno/dos días en `domain.js:72–76`; no equivale a recordatorio de toma. `pillEvents` crea eventos de compra/agotamiento por ficha (`payments.js:125–138`). No se modificó ni recalculó.
- **Tarifas/costos:** modalidad completa/media seleccionada desde tarifas configuradas y costo fijado en el servicio (`care-ui.js:244–258`). Tarifas posteriores no reescriben snapshot. Dos enfermeros en fecha producen servicios separados e IDs distintos.
- **Pagos individuales:** `allocatePayment` asigna FIFO hasta fecha y servicio para el mismo ID (`payments.js:42–57`); rechaza importes inválidos/excedentes. Cancelaciones conservan referencia (`care-ui.js:128–143` y `compatibility.js:168–184`).
- **Saldo general:** suma costos de servicios verificables y recibos generales activos (`payments.js:59–76`), sin conciliar pagos legados, PAG-001 individual o asignaciones sin costo. Esta exclusión está declarada en UI/documentos y se prueba; no representa deuda histórica integral.
- **Cobertura:** `cover` toma claves de fecha con al menos una asignación y consume número de fechas pagadas; no pondera horas/modalidad ni personas (`payments.js:78–96`). No equivale al saldo monetario ADMIN-001; reglas exactas de cobertura requieren decisión del responsable.
- **Fechas:** citas limitan avisos a hoy+2 días (`appointments.js:9–12`), muestran futuras y últimas tres anteriores (`:25–35`). Las fechas son locales; la validación regex sin calendario real es F-001.

## 7. Seguridad, privacidad y arquitectura

- No se observó backend, autenticación, control por rol ni sincronización. Fichas y cuentas están en un perfil local del navegador.
- `localStorage` bajo `pastillas-v1` y exportaciones JSON legibles no tienen cifrado propio. El acceso al perfil desbloqueado, DevTools o código ejecutándose en el mismo origen puede leer/alterar información. Es riesgo residual de AUD-003 documentado y aceptado para el uso familiar controlado; no equivale a una autorización para publicación general.
- La suite previa AUD-003–AUD-012 registra mitigación de notificaciones genéricas, límite 10 MiB, doble confirmación, previsualización externa, allowlist del SW y precaché local de Nunito. Esta revisión estática no redescubrió uso de `eval`, `new Function` ni carga de scripts remotos. URLs externas encontradas son WhatsApp y Google Calendar; ambas pasan por vista previa editable y acción expresa.
- La caché se limita a recursos estáticos enumerados en `sw.js:4–54`; precarga falla de forma completa antes de activar la versión nueva. Suite cubre offline en `/` y `/index.html` y actualización simulada. No verificamos una actualización real de deployment ni almacenamiento de datos privados en caché.
- No se ejecutaron ataques, pruebas destructivas, operaciones con datos reales ni pruebas contra producción.

## 8. Recomendaciones y dictamen

1. Priorizar política y pruebas de fechas reales para F-001, con compatibilidad explícita para registros guardados antiguos.
2. Decidir si se soporta uso multi-pestaña; si sí, diseñar detección de conflictos antes de cualquier escritura concurrente (F-002).
3. Mantener el conteo de cobertura distinto del saldo monetario y pedir reglas explícitas antes de cambiarlo.
4. Confirmar si las familias requieren agregar/archivar fichas desde UI, antes de proponer cualquier cambio que afecte índices.
5. Planear verificación manual de accesibilidad con teclado/lector/zoom y dispositivos, ya que la regresión automatizada no prueba esos entornos.

**Dictamen:** no aparecen fallos críticos/altos reproducidos y la regresión automatizada actual pasa. El flujo auditado tiene un defecto de integridad de fecha de severidad media reproducible que conviene corregir en una fase autorizada. Este informe no aprueba la aplicación como libre de errores ni modifica el código.
