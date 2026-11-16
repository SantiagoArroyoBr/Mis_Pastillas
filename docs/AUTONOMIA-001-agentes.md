# AUTONOMÍA-001 — Agentes y modelos

Se verificó `codex-cli 0.169.0-alpha.11.1`. El cliente devolvió su catálogo local con `codex debug models`. Entre los modelos del catálogo, el chat actual expone a los subagentes `gpt-6.1-sol`, `gpt-6.1-terra`, `gpt-6-astra`, `gpt-6-sol` y `gpt-6-luna`. Los cuatro primeros anuncian esfuerzos desde `low` hasta `ultra`; Luna llega a `max`. Confirma el catálogo y las capacidades del chat al abrir un ciclo nuevo.

| Rol | Responsabilidad | Modelo y esfuerzo propuestos |
| --- | --- | --- |
| Dirección técnica | Priorizar, diseñar, coordinar, resolver conflictos y revisar resultados o decisiones pendientes. | Modelo de la sesión. Sol `medium` para el trabajo habitual, `high` para decisiones con impacto en varios módulos. |
| Desarrollo | Implementar y verificar una corrección compatible en rutas asignadas. | Terra `medium`. |
| QA | Revisar independientemente regresión, compatibilidad y casos extremos usando fixtures. | Sol `medium`. |
| Seguridad e integridad | Auditar de forma defensiva persistencia, privacidad, concurrencia y recuperación. | Sol `high` o Astra `high` si el riesgo y la capacidad disponible lo justifican. |
| Documentación | Contrastar enlaces, evidencias y trazabilidad del README, plan, backlog, historial e informes. | Luna `medium`. |

El agente principal conserva la selección de tareas, la revisión final y el commit. Delega cuando esté habilitado y resulte útil contrastar evidencia o aislar un cambio. Acota el acceso, el alcance y las rutas del desarrollador. QA y seguridad informan hallazgos al principal para su validación. En un chat con capacidad limitada, el principal asume los roles en secuencia.

## Propuesta local para un proyecto de confianza

Codex documenta perfiles locales en `.codex/agents/` y ajustes de proyecto en `.codex/config.toml`. La propuesta comienza con un perfil QA de revisión, invocable si el chat admite agentes personalizados. Los roles restantes pueden seguir como asignaciones de la sesión. El presente cambio deja el ejemplo en documentación y mantiene las preferencias instaladas. [Subagentes](https://learn.chatgpt.com/docs/agent-configuration/subagents) · [Referencia de configuración](https://learn.chatgpt.com/docs/config-file/config-reference).

Ejemplo de `.codex/agents/acompana-qa.toml`:

```toml
name = "acompana_qa"
description = "Revisión independiente de regresiones de Acompaña con datos ficticios."
model = "gpt-6.1-sol"
model_reasoning_effort = "medium"
developer_instructions = """
Lee AGENTS.md y verifica SHA, alcance y criterios de la tarea asignada.
Ejecuta las comprobaciones autorizadas con perfiles aislados y datos ficticios.
Conserva los archivos del repositorio. Reporta comandos, entorno, resultados y límites.
"""
```

Se verificó la capacidad de delegación expuesta a esta sesión. La ejecución del perfil personalizado depende del soporte efectivo y las políticas del cliente y queda por comprobar antes de adoptarlo. La cuota y los créditos de la cuenta concreta quedaron sin verificar. Consulta `/status` o el panel de uso para medir capacidad. Conserva el modo estándar y el modelo heredado cuando sean suficientes. API de pago, créditos adicionales y cambios con costo requieren autorización. [Uso y precios](https://learn.chatgpt.com/docs/pricing).
