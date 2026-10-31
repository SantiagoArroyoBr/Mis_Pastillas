# Arquitectura de Acompaña

Este documento describe hechos comprobados en el repositorio y los distingue de propuestas por evaluar. La verificación de código corresponde al estado de `development` en `d39c054`, salvo donde se indique otro SHA histórico.

## Arquitectura vigente — hechos comprobados

- **Frontend:** aplicación web con HTML en `index.html`, estilos en `styles.css` y lógica JavaScript concentrada en `app.js`. `app.js` se carga como script clásico síncrono al final del documento, después del DOM.
- **PWA y caché:** `manifest.json` describe la instalación; `sw.js` registra la caché `cuidados-v8`, precarga los recursos de la aplicación y sirve recursos de mismo origen desde caché cuando la red falla.
- **Persistencia:** el estado de la aplicación se almacena en el navegador mediante `localStorage`, bajo la clave `pastillas-v1`. El código valida y carga el estado y contiene rutas para fallos de almacenamiento. Los respaldos se exportan y restauran como JSON con validación.
- **Pruebas presentes:** `tests/persistence.spec.js` usa Chromium para probar persistencia, fallos simulados, migración y restauración. Esto no constituye una auditoría integral de todas las funciones, navegadores, dispositivos o condiciones físicas de almacenamiento.
- **Servidor y sincronización:** en el código revisado no se encontró un backend centralizado ni sincronización multi-dispositivo confirmados. El despliegue del frontend figura como Vercel en la documentación del proyecto; eso no implica que exista backend.

## Estructura relevante

```text
index.html                 estructura de interfaz y carga de recursos
styles.css                 estilos
app.js                     estado, reglas de aplicación, vistas y eventos
sw.js                      caché y comportamiento offline
manifest.json              metadatos de instalación PWA
tests/persistence.spec.js  pruebas de persistencia y restauración
```

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
- El JavaScript en línea se trasladó a `app.js` sin refactorización; se conserva el orden síncrono de ejecución y el recurso se precarga para uso offline (MOD-001, integrada mediante `327ad8d5a16434095948a84d1ca49a00207f0429`).
- La clave y el esquema de persistencia existentes se conservaron en esos cambios; las validaciones reportadas están detalladas en el [historial](HISTORIAL_CAMBIOS.md).

## Propuestas de evolución — no implementadas ni decididas

La posible evolución a frontend modular, Supabase/PostgreSQL, autenticación, políticas RLS, IndexedDB, sincronización entre dispositivos, auditoría administrativa y notificaciones push requiere evaluación por requisitos, costos, seguridad y mantenimiento. No asumir su adopción hasta que el plan registre el objetivo y exista implementación comprobable.

Si se considera sincronización, debe definir colas, reintentos idempotentes y resolución de conflictos. Los movimientos de inventario requieren especial cuidado para evitar descuentos duplicados o sobrescrituras entre dispositivos. Una migración debe probar exportación y restauración JSON antes de modificar datos locales.


## Resultado de la evaluación DAT-002

La evaluación [DAT-002](docs/arquitectura/DAT-002-evaluacion-backend-auth-aislamiento.md) recomienda conservar por ahora la PWA local con `pastillas-v1` y respaldos JSON. No se confirmó una necesidad de sincronización multi-dispositivo y no se adoptan backend, Auth ni proveedor. El informe compara alternativas y documenta controles y condiciones para reconsiderarlas. Esta es una recomendación técnica, no una decisión de producto irreversible; cualquier backend real, autenticación o migración requiere los requisitos, verificaciones y autorización descritos allí. DAT-001 sigue siendo una propuesta conceptual.


## Preparación DAT-003 — sin migración

[DAT-003](docs/arquitectura/DAT-003-respaldo-restauracion-migracion.md) especifica controles documentales para respaldo, restauración de prueba, mapeo de índices y conciliación. El diseño está en curso: no se accedió a datos reales ni se verificó un respaldo de un dispositivo familiar. La clave `pastillas-v1`, el esquema vigente y el funcionamiento de la aplicación permanecen sin cambios. No iniciar una migración con base únicamente en fixtures sintéticos.
