# Diagnóstico arquitectónico y ruta de modularización

**Estado:** referencia arquitectónica aprobada; MOD-001 en curso.  
**SHA inspeccionado:** [`fa78806b53f601ce6aa070e75573df065043f4d3`](https://github.com/SantiagoArroyoBr/Mis_Pastillas/commit/fa78806b53f601ce6aa070e75573df065043f4d3)  
**Rama analizada:** `development`. El SHA es una referencia histórica comprobada como cabeza remota al iniciar MOD-001.  
**Alcance de la revisión:** análisis del código y propuesta de extracción; no es una auditoría integral de seguridad, accesibilidad ni de todas las funciones en producción.

## Arquitectura comprobada

- `index.html` contiene la estructura de interfaz y un único bloque grande de JavaScript en línea. El CSS ya está en `styles.css`.
- El JavaScript reúne migración y validación del estado, persistencia, cálculos de inventario y pagos, enfermería, citas, calendario, notificaciones, generación de vistas, formularios, eventos y respaldo/restauración.
- El estado compartido es `S`. Se carga desde `localStorage` con la clave `pastillas-v1`; `save()` serializa el estado. La carga valida y migra antes de habilitar escrituras. Hay protección ante fallos de lectura, validación o escritura, y una restauración JSON confirmada por el usuario.
- La interfaz se actualiza desde JavaScript. Las vistas se construyen con `innerHTML`, los formularios se muestran en un `<dialog>` y un listener delegado en `document` procesa acciones. Al final se llama a `render()` y se vuelve a renderizar cada minuto.
- El documento registra `sw.js` al cargar. En el SHA revisado, el service worker utiliza `cuidados-v7`, precarga `index.html`, `styles.css`, `manifest.json` e iconos. Para solicitudes del mismo origen intenta la red y utiliza la caché si falla. `manifest.json` define el modo instalable y los iconos.
- `tests/persistence.spec.js` usa Chromium y un servidor HTTP local para probar persistencia, fallos, migraciones y restauración. Esa suite no cubre por sí sola todas las funciones del producto ni todos los navegadores.

## Dependencias y límites

**Hechos del código:** numerosas funciones comparten o modifican `S`; la inicialización consulta elementos del DOM; callbacks y listeners usan funciones definidas en el mismo ámbito. La ejecución termina renderizando la interfaz y programando su actualización periódica.

**Inferencia:** extraer código directamente a módulos ES puede cambiar el alcance global de funciones y variables y, por tanto, romper callbacks o scripts de prueba. El orden y el momento de ejecución también son dependencias.

**Recomendación:** avanzar en cambios pequeños y reversibles, conservar el formato del estado, `pastillas-v1`, los flujos JSON y el comportamiento offline. No cambiar persistencia ni reglas de negocio como parte de la modularización.

## Estructura futura posible

Esta estructura es una propuesta de largo plazo, no una descripción actual ni una autorización para implementarla:

```text
index.html
styles.css
sw.js
manifest.json
js/
  app.js
  state/
    persistence.js
    migration.js
  domain/
    inventory.js
    schedules.js
    payments.js
    appointments.js
  ui/
    render.js
    forms.js
    events.js
```

Orden recomendado después de la extracción literal: identificar dependencias y establecer pruebas de comportamiento; separar persistencia/migración; extraer reglas de dominio con pruebas; separar renderizado, formularios y eventos; evaluar módulos ES solo cuando sus límites y el soporte offline estén definidos. Cada paso requiere su propio alcance y aprobación.

## Primera etapa aprobada: MOD-001

**Objetivo:** mover el bloque JavaScript en línea de `index.html` a `app.js`, sin reordenar ni refactorizar el contenido.

**Archivos autorizados:** `docs/arquitectura/diagnostico-modularizacion.md`, `index.html`, `app.js` (nuevo), `sw.js`, y `tests/persistence.spec.js` solo para servir JavaScript con MIME adecuado si la configuración de prueba lo requiere; además, los registros aprobados de coordinación.

**Dependencias que deben conservarse:** el script debe ejecutarse después de que exista el HTML y en el mismo orden; `S`, `save()`, `render()`, la inicialización y la persistencia deben mantener su comportamiento. El service worker debe precargar el nuevo archivo y cambiar la versión de caché para evitar mezclar versiones al operar offline.

**Riesgos:** orden o alcance alterados; `app.js` ausente del precaché; MIME incorrecto; caché antigua con recursos mezclados. La extracción debe conservar literalmente también las plantillas HTML, escapes y listeners existentes.

**Validación:** pruebas existentes de persistencia y regresión; sintaxis; navegador para carga, operaciones críticas, exportación/restauración y conservación de `pastillas-v1`; instalación/precarga y carga offline. Usar únicamente datos ficticios.

**Aceptación:** comportamiento y datos observables conservados; misma clave y estructura de almacenamiento; ninguna escritura inesperada ante datos inválidos o restauración cancelada; suite aprobada; carga offline del HTML y `app.js` tras actualizar la caché.

**Fuera de alcance:** dividir en más módulos, refactorizar, rediseñar o alterar HTML/CSS, modelo, migraciones, notificaciones, dependencias, backend, sincronización, manifiesto, producción o despliegue.

## Validación progresiva y reversión

En cada etapa, comparar el comportamiento antes y después y ejecutar las pruebas pertinentes. Mantener respaldo JSON antes de cualquier futura migración (MOD-001 no cambia datos ni almacenamiento). Considerar una etapa completa solo con alcance comprobado, pruebas ejecutadas, conservación de datos y validación offline afectada. La reversión de MOD-001 consiste en restaurar el bloque inline y retirar `app.js` del HTML y del precaché, conservando la clave y los datos.

## Registro de revisión inicial

El diagnóstico inicial fue de solo lectura y no modificó archivos ni ejecutó pruebas. Al comenzar MOD-001, el checkout disponible era `task/css-001-external-stylesheet`, limpio pero atrasado; no se usó para describir el código. Se consultaron los cinco documentos obligatorios y no se encontró tarea activa ni PR abierto en esos registros. La ausencia en un registro manual no descarta trabajo no registrado. El propietario aprobó expresamente el diagnóstico y el alcance de MOD-001 el 2026-10-30 en la conversación «Direccion general».

## Evidencia de MOD-001

- `app.js` conserva el cuerpo del único bloque inline en el mismo orden. `index.html` lo carga sin `async` ni `defer`, en la misma posición al final del `<body>`, después de que existe el DOM.
- `sw.js` incluye `app.js` en `ASSETS` y cambia la caché a `cuidados-v8`.
- `tests/persistence.spec.js` sirve archivos `.js` con `text/javascript; charset=utf-8`, requerido para el script externo en Chromium.
- La suite de persistencia ejecutada con Chromium pasó **13/13** pruebas.
- Una comprobación temporal en Chromium pasó: MIME de `app.js`, carga e inicialización, alta y persistencia de un insumo ficticio en `pastillas-v1`, precarga en `cuidados-v8` y recarga offline con el dato visible.
- `node --check` pasó para `app.js`, `sw.js` y `tests/persistence.spec.js`; `git diff --check` no reportó errores.
- El escenario manual de navegador verificó el flujo de alta de insumo y recarga offline; no cubrió todos los módulos de la aplicación, navegadores ni tamaños de pantalla. La suite automatizada sí cubre carga, persistencia, fallos simulados, migración y restauración.
- La rama de tarea queda pendiente de revisión e integración a `development`. No se modificó `main` ni se desplegó producción.
