# UX-004 — Auditoría del ciclo de vida de fichas

**Estado:** inspección estática y propuesta; no se añadieron ni eliminaron fichas y no se alteraron referencias persistidas. Datos de ejemplo no utilizados.

## Estado comprobado

- `compatibility.js` crea dos fichas iniciales (`Persona 1`, `Persona 2`) cuando no existe un estado previo.
- La interfaz presenta las fichas existentes y permite seleccionar o cambiar el nombre (`index.html`, `app.js`). En la funcionalidad revisada no hay un flujo normal para agregar, archivar o eliminar una ficha.
- Citas guardan `i`, el índice de ficha (`appointments.js`); pagos y turnos también usan índices de paciente dentro de objetos/tablas relacionados (`payments.js`, `care-ui.js`, `compatibility.js`). No hay ID persistido de paciente en el esquema vigente.
- Por ello, cambiar el orden o quitar una ficha puede cambiar el significado de referencias a citas, turnos, costos y pagos. Un botón de borrado simple podría asociar historia a otra persona o dejar referencias huérfanas.
- Renombrar modifica la etiqueta visible de la misma ficha; no se encontró historial de nombres anteriores.

## Limitaciones observadas

- El número y ciclo de vida de fichas no se adapta desde la aplicación a hogares que cambien.
- El índice es la referencia técnica, no un identificador estable ante reordenamiento o eliminación.
- No existe archivo lógico ni restauración selectiva de ficha; la copia/restauración es del estado completo.
- Renombrar no conserva la denominación histórica en registros que solo referencian índice.

## Propuesta incremental para evaluación futura

1. Confirmar con el responsable si hacen falta altas o archivo de fichas más allá de las dos actuales.
2. Si solo se necesita alta, empezar con operación **aditiva**: agregar una ficha vacía al final sin reordenar las existentes, dejando claro que el respaldo contiene toda la información local. No habilitar eliminación en esa etapa.
3. Si se necesita archivo, acordar primero si una ficha archivada sigue visible en consultas históricas y si puede reactivarse. Ocultar para nuevas capturas no debe borrar referencias ni reducir el índice del arreglo.
4. Diseñar identificadores estables y su convivencia con respaldos antiguos antes de permitir reordenar, mover o eliminar. Eso cambia el esquema lógico, aunque la clave externa `pastillas-v1` se mantenga.
5. Mantener restauración completa y validar cada referencia a paciente antes de escribir. No reescribir ni reasignar citas/pagos automáticamente sin revisión y respaldo recuperable.

## Criterios de aceptación para una futura tarea

- Fichas sintéticas con nombres duplicados y referencias distintas permanecen correctamente vinculadas después de recargar y restaurar JSON.
- Alta/archivo no reasigna citas, turnos, servicios ni abonos.
- El formato anterior sigue abriendo y restaurándose sin pérdida, o se prepara una migración aditiva documentada antes de cambiarlo.
- Fallos de validación o escritura conservan el JSON original; la cancelación no realiza escrituras.
- La interfaz explica qué significa archivar y qué aparece en nuevas capturas e historial.

## Decisiones pendientes

- ¿Las dos fichas actuales son suficientes para el uso previsto?
- ¿Se necesita crear fichas adicionales, archivar o solo cambiar nombres?
- ¿Una ficha archivada debe permanecer en historiales, calendario y pagos?
- ¿Se autoriza diseñar identificadores estables y una migración aditiva si se necesita reordenamiento?

No se recomienda implementación destructiva hasta recibir respuesta a estas decisiones.
