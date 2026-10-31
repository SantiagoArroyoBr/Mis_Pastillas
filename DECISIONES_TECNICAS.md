# Registro de decisiones — Acompaña

> **Lee primero [REGLAS_GENERALES.md](REGLAS_GENERALES.md).** Las propuestas no son decisiones aprobadas.
>
> El contexto compartido se encuentra en [CENTRO_DE_COORDINACION.md](CENTRO_DE_COORDINACION.md). Las propuestas pendientes se registran en [SOLICITUDES.md](SOLICITUDES.md).

## Objetivo

Conservar decisiones que afectan a más de un área o condicionan la evolución del producto. Registrar también las alternativas consideradas y las consecuencias.

## Estados

- Propuesta.
- Pendiente de aprobación.
- Aprobada.
- Implementada.
- Validada.
- Descartada.
- Sustituida.

## Decisiones registradas

### DEC-001: Extracción literal del JavaScript de `index.html` a `app.js`

- **Fecha:** 2026-10-30
- **Área proponente:** Dirección general / Arquitectura y planificación
- **Estado:** Incorporada en `development` mediante PR #2; validaciones ejecutadas en rama de tarea, no repetidas tras el merge.
- **Problema / contexto:** `index.html` concentra el JavaScript de la aplicación; la extracción reduce esa concentración y prepara una modularización progresiva.
- **Decisión propuesta:** trasladar literalmente el bloque JavaScript inline a `app.js`, cargarlo desde `index.html`, incluirlo en la precarga del service worker y actualizar su versión de caché.
- **Alternativas consideradas:** mantener el bloque inline; dividirlo ahora en módulos funcionales (fuera de alcance).
- **Justificación:** obtener una primera separación reversible sin alterar el comportamiento.
- **Áreas afectadas:** Arquitectura, frontend, persistencia, PWA y pruebas.
- **Impacto en datos y compatibilidad:** no cambiar `localStorage` (`pastillas-v1`), esquema, migraciones ni importación/exportación.
- **Seguridad y privacidad:** sin cambios; validar solo con datos ficticios.
- **Costos y mantenimiento:** un archivo JavaScript más que mantener y precargar offline.
- **Consecuencias / compromisos:** carga externa y MIME JavaScript correcto requeridos; conservar orden y momento de inicialización.
- **Plan de implementación:** referencia diagnóstica histórica `fa78806b53f601ce6aa070e75573df065043f4d3`; modificar solo el documento aprobado, `index.html`, `app.js`, `sw.js` y, solo si hace falta, `tests/persistence.spec.js`.
- **Plan de pruebas y reversión:** pruebas de persistencia y regresión, sintaxis y navegador incluyendo carga y modo offline; reversión reponiendo el bloque inline y retirando `app.js` de la precarga.
- **Aprobación del propietario:** explícita el 2026-10-30 en «Direccion general», para el alcance MOD-001.
- **Evidencia de implementación:** commits `d0f0055` y `e8f9501` en `task/mod-001-external-javascript`; PR #2 integrada en `development` con merge `327ad8d5a16434095948a84d1ca49a00207f0429`.
- **Validación:** suite de persistencia 13/13; comprobación temporal Chromium aprobada para carga externa, alta ficticia persistida y recarga offline; sintaxis de `app.js`, `sw.js` y `tests/persistence.spec.js` válida. Limitada a los flujos indicados; sin cobertura de todos los módulos o navegadores.

### DEC-002: Comprobar solicitudes y registrar tareas antes de editar

- **Fecha:** 2026-10-30
- **Área proponente:** Dirección general («Direccion general»)
- **Estado:** Aprobada e incorporada en `development`.
- **Problema / contexto:** faltaba un paso inicial que obligara a comprobar si cada encargo ya tenía solicitud y tarea registrada, lo que provocó un bloqueo documental durante MOD-001.
- **Decisión:** todos los agentes leen los cinco documentos operativos, buscan solicitudes y tareas equivalentes, evitan duplicados y registran una solicitud ausente como pendiente. El registro no concede permiso de implementación. La aprobación explícita requerida se comprueba y la tarea aprobada se registra en `TRABAJO_ACTIVO.md` antes de editar sus archivos.
- **Alternativas consideradas:** tratar el mensaje de tarea o la ausencia de registro como permiso suficiente (descartado porque confunde solicitud, aprobación y ejecución); dejar el flujo como recomendación (descartado porque no previene omisiones).
- **Justificación:** mantener trazabilidad y autoridad del propietario, prevenir trabajo duplicado y detectar conflictos de archivos antes de editar.
- **Áreas afectadas:** todas las áreas y chats del proyecto.
- **Impacto en datos y compatibilidad:** ninguno; no modifica datos ni código de aplicación.
- **Seguridad y privacidad:** ninguno adicional.
- **Costos y mantenimiento:** requiere lectura y actualización manual de los registros de coordinación.
- **Consecuencias / compromisos:** la coordinación documental no bloquea técnicamente GitHub; se debe revisar también el estado remoto y las tareas concurrentes.
- **Plan de implementación:** actualización de `REGLAS_GENERALES.md`, `CENTRO_DE_COORDINACION.md`, `SOLICITUDES.md`, `TRABAJO_ACTIVO.md` y este registro en `development`.
- **Plan de pruebas y reversión:** revisar enlaces, consistencia de estados y diff; revertir el commit documental si hace falta. No se requieren pruebas de aplicación.
- **Aprobación del propietario:** explícita en esta conversación el 2026-10-30.
- **Evidencia de implementación:** COORD-001 en `SOLICITUDES.md` y `TRABAJO_ACTIVO.md`; commits documentales en `development`.
- **Validación:** referencias cruzadas y estados revisados; no se ejecutaron pruebas de aplicación.

### DEC-003: Extracción de utilidades independientes a `js/utils.js`

- **Fecha:** 2026-10-31
- **Área proponente:** Dirección general / Arquitectura y planificación («Direccion general»).
- **Estado:** implementada y validada en `task/mod-002-independent-utilities`; pendiente de integración. No desplegada.
- **Problema / contexto:** `app.js` contiene cinco utilidades sin dependencia del DOM o del estado de aplicación.
- **Decisión:** extraer únicamente `esc`, `parseTimes`, `pos`, `num` y `money` a `js/utils.js`; definirlas dentro de un ámbito aislado y exponerlas por `window.AcompanaUtils`; cargarlas clásicamente y de forma síncrona antes de `app.js`; precargar el archivo en el service worker y cambiar la caché a `cuidados-v9`.
- **Alternativas consideradas:** mantenerlas en `app.js` (no prepara su separación); usar módulos ES o dependencias (añade cambios al orden/carga no aprobados).
- **Justificación:** separación acotada, reversible y sin dependencias externas, conservando el comportamiento.
- **Áreas afectadas:** arquitectura, frontend, PWA y pruebas.
- **Impacto en datos y compatibilidad:** sin cambios de almacenamiento, estructura de datos, reglas, fechas o importación/exportación; los nombres usados por `app.js` siguen disponibles.
- **Seguridad y privacidad:** `esc` conserva la lógica de escape actual; casos con contenido peligroso se validaron con datos ficticios.
- **Costos y mantenimiento:** un archivo estático adicional para cargar y precargar.
- **Consecuencias / compromisos:** debe mantenerse el orden de scripts y el activo en la precarga; un conflicto de declaraciones globales se evitó encerrando las definiciones en una función inmediata.
- **Plan de implementación:** base remota `development` `d39c054d9a39477b552346241df0b28328b4e1a3`; rama `task/mod-002-independent-utilities`. Sin cambios a `main`, integración ni despliegue.
- **Plan de pruebas y reversión:** comparar utilidades con versiones previas; casos de seguridad; suite de regresión; formulario, MIME y recarga offline con datos ficticios. Revertir restableciendo las cinco definiciones en `app.js), quitando la referencia y el activo y restaurando la caché anterior.
- **Aprobación del propietario:** explícita el 2026-10-31 en «Direccion general».
- **Evidencia de implementación:** commits `67e514b2906439da8d6dafa6f1b26182902b682c`, `13a0c313fdecc9c56a6741b9771dbbbec14af242`, `97653f23afafc50444bf53e6c561ccd703bf0f9e), `a90f3d576ec6dc5bda49eb62ddfbf48853faef22), `305ae0f5e327f428c72017b684ffd21863648205) y `8e1b811885b5f6868a412349577ec1023cf0051c`.
- **Validación:** sintaxis JavaScript correcta; suite Chromium 15/15, incluyendo equivalencia, entradas peligrosas, formulario, MIME, precarga y recarga offline con persistencia ficticia. Limitada a Chromium; sin afirmaciones sobre otros navegadores o tamaños.

## Plantilla de decisión

### DEC-[número]: [título]

- **Fecha:**
- **Área proponente:**
- **Estado:**
- **Problema / contexto:**
- **Decisión propuesta:**
- **Alternativas consideradas:**
- **Justificación:**
- **Áreas afectadas:**
- **Impacto en datos y compatibilidad:**
- **Seguridad y privacidad:**
- **Costos y mantenimiento:**
- **Consecuencias / compromisos:**
- **Plan de implementación:**
- **Plan de pruebas y reversión:**
- **Aprobación del propietario:**
- **Evidencia de implementación:** commit, PR o archivos.
- **Validación:** pruebas y resultados.

## Historial

| ID | Decisión | Estado | Fecha | Referencia |
|---|---|---|---|---|
| DEC-001 | Extracción literal del JavaScript inline a `app.js`, sin refactorización | Incorporada en `development`; validaciones en rama de tarea | 2026-10-30 | PR #2; merge `327ad8d5a16434095948a84d1ca49a00207f0429` |
| DEC-002 | Flujo obligatorio para registrar solicitudes y tareas antes de editar | Aprobada e incorporada en `development` | 2026-10-30 | COORD-001; `REGLAS_GENERALES.md` y `TRABAJO_ACTIVO.md` |
| DEC-003 | Extracción de cinco utilidades independientes a `js/utils.js` | Implementada y validada en rama de tarea; pendiente de integración | 2026-10-31 | MOD-002; `task/mod-002-independent-utilities` |

## Reglas

1. No registrar una recomendación como decisión aprobada.
2. No cambiar el estado a aprobada sin autorización explícita.
3. No marcar implementada sin evidencia en el repositorio.
4. No marcar validada sin pruebas ejecutadas.
5. Si una decisión cambia, conservar la anterior y marcarla como sustituida, indicando la nueva.
6. Las decisiones que afecten datos, seguridad, infraestructura o producción requieren análisis de impacto y plan de reversión.
