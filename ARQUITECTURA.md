# Arquitectura de Acompaña

Este documento describe hechos comprobados en el repositorio y los distingue de propuestas por evaluar. La inspección vigente se realizó en `development`, commit `f381219e31e515ba34096446d5c7109d8ae73937`, con el árbol limpio. Las mejoras visuales y del arnés de VAL-001 están integradas en ese commit. `main` no se modificó.

## Arquitectura vigente — hechos comprobados

- **Frontend:** aplicación web con HTML en `index.html`, estilos en `styles.css` y scripts clásicos síncronos locales. `app.js` compone la aplicación, administra el estado y la persistencia, genera las vistas principales y coordina eventos e importación/restauración. Los módulos de responsabilidades delimitadas exponen una API bajo un único namespace `window.Acompana…`; el orden de carga está declarado al final de `index.html`.
- **PWA y caché:** `manifest.json` describe la instalación; `sw.js` usa `acompanha-v9` con el prefijo de caché propio `acompanha-`. La activación limpia versiones anteriores de ese prefijo y la caché legada conocida `cuidados-v8`, preservando cachés ajenas del origen. Precarga por separado `/` y `/index.html` junto con recursos estáticos conocidos; usa red primero y su caché como fallback offline.
- **Persistencia:** el estado de la aplicación se almacena en el navegador mediante `localStorage`, bajo la clave `pastillas-v1`. El código valida y carga el estado y contiene rutas para fallos de almacenamiento. Los respaldos se exportan y restauran como JSON con validación.
- **Privacidad local:** `localStorage` no cifra los datos por sí mismo. Los respaldos JSON también contienen la información de cuidado y requieren protección del dispositivo y custodia privada.
- **Avisos y compartir:** las notificaciones locales muestran categorías generales de pendientes. WhatsApp y Google Calendar presentan contenido editable antes de abrir el servicio externo.
- **Tipografía:** Nunito se sirve desde `fonts/Nunito[wght].ttf`, variable en pesos 200–1000, con licencia SIL Open Font License 1.1 incluida en `fonts/OFL.txt`. La interfaz no requiere Google Fonts y el recurso está precargado por el service worker.
- **UX/UI:** se aplican verde bosque `#315B50`, crema `#F4EBDD`, superficie `#FAF8F3`, carbón `#293A34` y borde `#E4E0D6`. El énfasis ámbar usa `#8A5200` para alcanzar contraste de texto; el respaldo se presenta en columna en ventanas de hasta 360 px. No se añadieron dependencias visuales ni recursos remotos.
- **Pruebas presentes:** `tests/persistence.spec.js` usa Chromium para probar persistencia, fallos simulados, migración y restauración. Esto no constituye una auditoría integral de todas las funciones, navegadores, dispositivos o condiciones físicas de almacenamiento.
- **Servidor y sincronización:** en el código revisado no se encontró un backend centralizado ni sincronización multi-dispositivo confirmados. El despliegue del frontend figura como Vercel en la documentación del proyecto; eso no implica que exista backend.

## Contexto de uso y aceptación de riesgos — 2026-10-31

El responsable del proyecto acepta expresamente los riesgos residuales de AUD-003–AUD-012 para el contexto actual de uso familiar y controlado. Esta decisión no elimina los riesgos, no reduce las protecciones existentes, no cambia la persistencia y no significa que Acompaña esté preparada para publicación abierta al público.

Los riesgos aceptados para ese contexto son: (1) los datos bajo `localStorage` y `pastillas-v1` carecen de cifrado propio; (2) los respaldos JSON contienen información legible y requieren custodia privada; (3) WhatsApp y Google Calendar reciben los datos que el usuario confirma compartir; y (4) actualmente no hay autenticación, autorización, aislamiento entre familias ni backend multiusuario.

Antes de cualquier publicación pública se requiere una etapa específica de evaluación de seguridad, privacidad y cumplimiento aplicable, con revisión de estos riesgos y controles antes de abrir el acceso general. La aceptación actual no sustituye esa evaluación ni autoriza cambios de arquitectura, almacenamiento o datos.

## Estructura relevante

```text
index.html                 estructura de interfaz y orden de carga
styles.css                 identidad visual y adaptación responsive
app.js                     composición, estado, persistencia, vistas principales e importación/restauración
compatibility.js           estado inicial, migración y validación compatible
domain.js                  fechas, calendarios y cálculos puros
payments.js                cobertura, adeudos y vencimientos
inventory.js               inventario, compras, consumos y precios
care-ui.js                 pantallas y formularios de pacientes y pagos
appointments.js            citas y sus acciones
forms.js                   renderizado de formularios
sharing.js                 vistas previas e integración de compartir
sw.js                      caché y comportamiento offline
manifest.json              metadatos de instalación PWA
tests/persistence.spec.js  regresión de persistencia, PWA e integraciones
```

### Mapa de dependencias

`index.html` carga `compatibility.js` y `domain.js` antes de los consumidores. `app.js` los usa y crea `payments.js` con acceso al estado/configuración mediante dependencias inyectadas. Después de preparar el diálogo y el formulario común, compone `sharing.js`, `appointments.js`, `inventory.js` y `care-ui.js`, inyectándoles estado, renderizado, cálculos y utilidades que necesitan. Los módulos no se importan entre sí ni forman ciclos; los scripts se comunican mediante APIs acotadas en `window.Acompana…`. `forms.js` es compartido por los módulos que presentan formularios. La persistencia y la ruta sensible de importación/restauración permanecen en `app.js` para mantener un único punto transaccional de escritura a `pastillas-v1`.

El diagnóstico [histórico de modularización](docs/arquitectura/diagnostico-modularizacion.md) recoge el análisis de `fa78806b53f601ce6aa070e75573df065043f4d3`; sus referencias a la caché anterior describen aquel SHA, no la versión vigente.

## Datos y reglas de negocio

- Los datos de pacientes son registros de cuidado, distintos de las cuentas de acceso.
- Los enfermeros son registros operativos, no necesariamente usuarios del sistema.
- Un medicamento puede tener varios esquemas de consumo independientes que comparten el inventario del medicamento.
- Las alertas de reposición no equivalen a recordatorios de toma; deben evitar duplicados.
- Los registros administrativos e históricos deben conservar trazabilidad.

Estas reglas de producto deben verificarse en el código antes de modificarlas o afirmar que todos sus aspectos están implementados.

## Protección de datos y compatibilidad

La continuidad de los datos en dispositivos familiares tiene prioridad. Cualquier cambio futuro que afecte almacenamiento, estructura, migración, inventario, respaldo o restauración debe analizar compatibilidad con `pastillas-v1`, conservar los datos existentes y definir exportación, respaldo, restauración, recuperación y validación antes de migrar. La PWA y su funcionamiento offline también forman parte del comportamiento que debe preservarse. Usar únicamente datos ficticios en validaciones compartidas.

Estas son condiciones técnicas permanentes del proyecto, no un flujo de autorizaciones por tarea; las tareas, dependencias y estados se llevan en el [plan](PLAN_DESARROLLO.md).

## Decisiones técnicas vigentes

- Se separaron los estilos de `index.html` en `styles.css` y se incluyeron en la caché offline (CSS-001, integrada en `development` mediante `4d3ee998f7ec94d49fc858d1834c2202489053d6`).
- La separación posterior de responsabilidades de cálculo, compatibilidad, pagos, inventario, cuidados, citas, formularios e integraciones externas conserva scripts clásicos síncronos con APIs explícitas; `app.js` sigue siendo el único compositor e inicializador. La carga y precaché de todos los módulos se declara en `index.html` y `sw.js`.
- La clave y el esquema de persistencia existentes se conservaron en esos cambios; las validaciones reportadas están detalladas en el [historial](HISTORIAL_CAMBIOS.md).

## Propuestas de evolución — no implementadas ni decididas

La posible evolución a ES modules empaquetados, Supabase/PostgreSQL, autenticación, políticas RLS, IndexedDB, sincronización entre dispositivos, auditoría administrativa y notificaciones push requiere evaluación por requisitos, costos, seguridad y mantenimiento. La modularización actual usa scripts locales sin empaquetador ni dependencias de terceros.

Si se considera sincronización, debe definir colas, reintentos idempotentes y resolución de conflictos. Los movimientos de inventario requieren especial cuidado para evitar descuentos duplicados o sobrescrituras entre dispositivos. Una migración debe probar exportación y restauración JSON antes de modificar datos locales.


## Resultado de la evaluación DAT-002

La evaluación [DAT-002](docs/arquitectura/DAT-002-evaluacion-backend-auth-aislamiento.md) recomienda conservar por ahora la PWA local con `pastillas-v1` y respaldos JSON. No se confirmó una necesidad de sincronización multi-dispositivo y no se adoptan backend, Auth ni proveedor. El informe compara alternativas y documenta controles y condiciones para reconsiderarlas. Esta es una recomendación técnica, no una decisión de producto irreversible; cualquier backend real, autenticación o migración requiere los requisitos, verificaciones y autorización descritos allí. DAT-001 sigue siendo una propuesta conceptual.


## DAT-003 — validación sintética; sin migración

[DAT-003](docs/arquitectura/DAT-003-respaldo-restauracion-migracion.md) especifica controles para respaldo, restauración, mapeo y conciliación. El ciclo sintético exportar-restaurar pasó junto con los casos de cancelación y fallo: 14/14 pruebas locales en Edge. No se accedió, pidió ni verificó un respaldo familiar; esa comprobación sigue siendo necesaria antes de cualquier migración. La clave `pastillas-v1`, el esquema y la aplicación no cambiaron.

## Evaluaciones PWA y CAL

[PWA-001](docs/arquitectura/PWA-001-almacenamiento-y-sincronizacion-offline.md) recomienda mantener `localStorage` hasta que exista una necesidad que justifique IndexedDB o sincronización. Describe una cola futura con reintentos, idempotencia y conciliación de movimientos sin implementar esos mecanismos. No hay backend ni prueba real multi-dispositivo.

[CAL-001](docs/arquitectura/CAL-001-matriz-pruebas-aislamiento.md) prepara pruebas negativas/positivas de permisos y recuperación. Su ejecución requiere decisiones de producto y un entorno multi-familia aislado; por ahora está bloqueada.

[PWA-002](docs/arquitectura/PWA-002-evaluacion-notificaciones-push.md) documenta que los avisos actuales dependen de abrir la aplicación. Push no está implementado y requeriría un emisor y servicio remoto, aún no adoptados.

[AUD-003](docs/auditorias/AUD-003-seguridad-privacidad.md) registra la revisión, las correcciones AUD-004–AUD-010 y riesgos residuales. No introduce cifrado, cambios a `pastillas-v1` ni servicios nuevos. AUD-011/AUD-012 documentan la verificación independiente de cachés, navegación offline y Calendar.

La [guía de instalación, uso y despliegue](docs/GUIA_INSTALACION_USO.md) registra la confirmación del propietario (2026-10-31) de que identificó el proyecto Vercel, comprobó la conexión Git, validó la rama de producción, encontró operativo el deployment actual y confirmó dominio y opción de reversión. El nombre de la rama y el SHA desplegado no fueron compartidos; no se equiparan al default GitHub `main` ni a su SHA. La confirmación no fue inspeccionada independientemente desde el panel. DOC-002 queda completada como documentación basada en esa evidencia comunicada.


## Evaluación DAT-004 — historial administrativo

[DAT-004](docs/arquitectura/DAT-004-evaluacion-auditoria.md) define una propuesta conceptual para una bitácora futura, con actor confiable, metadatos mínimos, separación de datos de cuidado y controles de acceso. No existe una bitácora implementada. Roles de consulta, retención, exportación, borrado y obligaciones de privacidad permanecen abiertos; la evaluación no añade tablas ni atribuye acciones a cuentas inexistentes.

## FUNC-001 y PREVIEW-001 — estado revisado

[FUNC-001](docs/auditorias/FUNC-001-inventario-funcional.md) actualiza el inventario funcional al commit `f381219e31e515ba34096446d5c7109d8ae73937`. La composición modular se conserva: scripts locales con APIs acotadas, `app.js` como coordinador y punto central de persistencia; no se encontró backend ni sincronización multi-dispositivo.

El responsable declaró completada la validación manual de PREVIEW-001. No se entregaron casos ni resultados detallados. La ejecución automatizada local de VAL-002 (25/25 en Edge) es evidencia separada y no demuestra la validación manual del deployment. GitHub reportó deployment Vercel completado para ese SHA; desde la sesión de revisión, el URL Preview redirigió al inicio de sesión y no se pudo inspeccionar su aplicación ni corroborar independientemente la configuración o los detalles de las pruebas manuales. Véase [la guía](docs/GUIA_INSTALACION_USO.md#preview-001--declaracion-de-validacion-manual).
