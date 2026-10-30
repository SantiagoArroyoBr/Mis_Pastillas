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

Todavía no hay decisiones técnicas nuevas registradas en este documento. El commit estable y la separación de ramas descritos en las reglas son contexto operativo conocido, no decisiones nuevas tomadas por este registro.

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
| — | No hay decisiones registradas | — | — | — |

## Reglas

1. No registrar una recomendación como decisión aprobada.
2. No cambiar el estado a aprobada sin autorización explícita.
3. No marcar implementada sin evidencia en el repositorio.
4. No marcar validada sin pruebas ejecutadas.
5. Si una decisión cambia, conservar la anterior y marcarla como sustituida, indicando la nueva.
6. Las decisiones que afecten datos, seguridad, infraestructura o producción requieren análisis de impacto y plan de reversión.
