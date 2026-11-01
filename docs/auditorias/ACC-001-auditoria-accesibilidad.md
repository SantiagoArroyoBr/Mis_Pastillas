# ACC-001 — Revisión de accesibilidad acotada

**Estado:** inspección de código y verificación automatizada parcial. No equivale a conformidad WCAG ni a pruebas manuales con lector de pantalla, zoom del navegador o teclado físico.

## Evidencia observada

- La interfaz conservaba `role="tablist"` para la selección de fichas sin panel de pestañas ni patrón completo de teclado ARIA. El selector de pauta usaba `role="tablist"`, pero sus botones tampoco tenían rol/paneles de pestaña.
- Se reemplazaron esos roles incompletos por grupos de botones nativos con `aria-pressed`, adecuados al comportamiento de botones de selección/toggle. La selección de ficha principal, secciones, selección de ficha en Inicio y pauta usan ahora el estado `aria-pressed` correspondiente; los botones conservan el orden y foco nativos.
- Los formularios ya anuncian errores en un elemento `role="alert"` con `aria-live="polite"`; la suite conserva esa comprobación.
- La hoja de estilos define `:focus-visible` con contorno visible. La suite existente comprueba seis anchuras (320, 360, 375, 390, 430 y 768 px).

## Cambios de bajo riesgo

Se retiraron semánticas de pestaña incompletas sin cambiar el mecanismo de selección, rutas de clic, persistencia o reglas de negocio. Los controles continúan siendo botones y se comunican como seleccionados mediante `aria-pressed`. No se rediseñó la interfaz.

## Verificación y límites

- Verificación automatizada incluida en QA-006: roles de grupo y atributos pressed, avisos de formulario, navegación de selección y layout responsive.
- No se verificó con NVDA, Narrator, JAWS, VoiceOver, lector móvil, zoom de navegador al 200/400 %, modo alto contraste ni usuarios con discapacidad.
- La interacción por teclado se apoya en el comportamiento nativo de botones; no se afirma cumplimiento total de WCAG ni compatibilidad con una combinación concreta de lector/navegador.

## Recomendación

Priorizar una ronda manual guiada por teclado y lector de pantalla en la plataforma objetivo, con foco en diálogo de formularios, restauración JSON, controles de pauta, avisos y selección de ficha. Registrar plataforma, navegador, lector, zoom y resultados por flujo antes de atribuir conformidad.
