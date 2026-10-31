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
- **Estado:** Implementada y probada en rama de tarea; pendiente revisión/integración
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
- **Evidencia de implementación:** commits `d0f0055` (implementación) y `e8f9501` (cierre documental) en `task/mod-001-external-javascript`; PR #2 en borrador para revisión hacia `development`.
- **Validación:** suite de persistencia 13/13; comprobación temporal Chromium aprobada para carga externa, alta ficticia persistida y recarga offline; sintaxis de `app.js`, `sw.js` y `tests/persistence.spec.js` válida. Limitada a los flujos indicados; sin cobertura de todos los módulos o navegadores.

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
| DEC-001 | Extracción literal del JavaScript inline a `app.js`, sin refactorización | Implementada y probada en rama; pendiente revisión/integración | 2026-10-30 | PR #2; commits `d0f0055`, `e8f9501`; detalle en `SOLICITUDES.md` |

## Reglas

1. No registrar una recomendación como decisión aprobada.
2. No cambiar el estado a aprobada sin autorización explícita.
3. No marcar implementada sin evidencia en el repositorio.
4. No marcar validada sin pruebas ejecutadas.
5. Si una decisión cambia, conservar la anterior y marcarla como sustituida, indicando la nueva.
6. Las decisiones que afecten datos, seguridad, infraestructura o producción requieren análisis de impacto y plan de reversión.
