# DAT-003 — Diseño de respaldo, restauración y migración local

**Estado:** completada como validación local sintética; la comprobación del respaldo del dispositivo familiar sigue pendiente y no se solicita para esta tarea. No se exportaron ni procesaron datos reales.
**Base:** AUD-001, DAT-001 y evaluación DAT-002 en `development`.
**Decisión de DAT-002:** conservar por ahora la aplicación y persistencia local. Este documento prepara controles para una eventual migración y no inicia una ni elige proveedor.

## 1. Alcance y límites

El estado actual se guarda por dispositivo en `localStorage` bajo `pastillas-v1`. La aplicación ofrece respaldo JSON y restauración que reemplaza el estado completo después de validar y pedir confirmación. La restauración depende del archivo elegido por la familia; no existe copia remota automática ni sincronización multi-dispositivo confirmada. La estructura contiene referencias mediante índices de paciente y arreglos anidados, por lo que un respaldo debe tratarse como un snapshot íntegro, no como registros independientes que puedan reordenarse o combinarse libremente.

DAT-003 define una secuencia compatible para investigar un cambio futuro. No modifica el formato local, no contacta dispositivos familiares y no autoriza un backend. La validación local se ejecutó exclusivamente con registros ficticios y un perfil de Edge temporal.

## 2. Invariantes

- Mantener intacta la clave y los datos originales `pastillas-v1` hasta una eventual aprobación explícita y reconciliación comprobada.
- No sobrescribir, borrar, limpiar, transformar ni cargar datos reales en un prototipo mientras se diseña o prueba.
- No guardar respaldos reales, capturas, nombres, contenido del JSON, hashes vinculables ni identificadores de familias en GitHub, issues, logs, mensajes o herramientas compartidas.
- Mantener cada respaldo como unidad completa, incluyendo el estado raíz y el orden exacto de arreglos que resuelven referencias existentes.
- No deduplicar pacientes, medicinas o enfermeros por nombre; no inferir titularidad, autoría, familia o cuenta a partir del contenido local.
- Toda prueba automatizada o de staging debe usar datos ficticios no derivados de registros familiares.
- Separar el hecho “restauración de ejemplo funciona” del hecho “el respaldo del dispositivo de una familia es recuperable”; ambos requieren evidencia distinta.

## 3. Preparación de respaldo — ejecución futura por la familia

1. En el dispositivo que hoy contiene los datos, abrir la aplicación y usar la función normal de exportación JSON; no copiar a mano el contenido de almacenamiento del navegador.
2. Guardar el archivo en una ubicación elegida por la familia con control de acceso. No enviarlo por correo/chat ni subirlo al repositorio.
3. Conservar una copia original sin editar y anotar localmente fecha, dispositivo, versión de la aplicación y nombre del archivo. No incluir nombres de pacientes en un registro compartido.
4. Antes de usar el archivo para una migración, inspeccionar solo su estructura y conteos localmente; verificar que JSON se pueda leer y que las referencias por índice permanecen en el mismo snapshot. Si se necesita una suma de comprobación, calcularla y guardarla junto al respaldo local; no publicar el valor si pudiera identificar el archivo.
5. No realizar la operación si la exportación falla, el archivo está incompleto, no se conoce su origen o hay diferencias no explicadas. Mantener intacto el almacenamiento original.

La disponibilidad y validez de un archivo debe confirmarse por quien controla el dispositivo. Un archivo sintético de prueba no sustituye el respaldo real previo a una migración.

## 4. Prueba de restauración sin riesgo

Antes de cualquier migración real, la restauración debe comprobarse en un perfil de navegador aislado y con una copia de prueba. La prueba debe demostrar que:

- La app reconoce un respaldo válido y exige confirmación antes de reemplazar el estado.
- Cancelar no escribe ni reemplaza datos.
- Un archivo inválido o una versión no compatible no sobrescribe el estado existente.
- Una restauración válida recupera las entidades y relaciones esperadas y la app puede volver a cargar el estado desde `pastillas-v1`.
- Los fallos de lectura/escritura dejan el modo protegido y el respaldo original disponible.
- La exportación posterior coincide en estructura y conteos con el fixture esperado, sin comparar ni registrar datos médicos.
- La aplicación sigue funcionando offline y las validaciones preexistentes de persistencia/restauración se ejecutan correctamente.

El fixture debe inventarse para la prueba, ser claramente ficticio y no contener datos derivados de usuarios. Para el respaldo real de una familia, el usuario debe comprobar localmente que su archivo puede abrirse/restaurarse en el flujo acordado; no se debe solicitar ni recibir el JSON para este trabajo documental.

## 5. Mapeo del snapshot para una importación futura

Si en el futuro se aprueba un destino remoto, diseñar un convertidor separado que lea una copia del snapshot, valide versión/forma y genere un manifiesto local de conciliación. El convertidor no debe escribir en el dispositivo de origen.

- Asignar IDs destino nuevos una sola vez por lote y mantener un mapa privado de `(lote, tipo, ruta/índice legacy)` a ID destino.
- Resolver `appts[].i`, configuración de pagos, enfermeros y asignaciones únicamente contra las posiciones exactas del mismo archivo fuente.
- Procesar primero pacientes y registros padre; después registros hijos y sus relaciones; comprobar claves y conteos antes de enviar.
- Mantener distintas fichas de medicinas aunque coincida el nombre. Preservar consumos independientes que descuentan el saldo de su ficha.
- Conservar registros de enfermeros como operativos; no crear cuentas ni vincular identidades por coincidencia de texto.
- No inventar fechas, autores, permisos, zona horaria, cantidades o familia. Aislar referencias ausentes/ambiguas para resolución explícita.
- Registrar campos sin correspondencia y errores por ruta técnica sin incluir valores personales. Abortarlo todo si faltan campos necesarios o se rompe una referencia.
- Usar importación idempotente con una clave de lote estable, límites y reporte de conteos. No reintentar creando filas duplicadas.
- No declarar una importación exitosa por respuesta HTTP: conciliar entidades, relaciones, saldos y lecturas permitidas/denegadas.

Este diseño es preliminar: el esquema destino, el tenant, el formato de importación, el protocolo de coexistencia y el manejo de conflictos dependen de decisiones futuras y pruebas aisladas.

## 6. Secuencia y puntos de control

| Etapa | Evidencia requerida | Si falla |
|---|---|---|
| Confirmar objetivo y permisos | Necesidad multi-dispositivo concreta; propietario de los datos y roles definidos; privacidad, región y proveedor evaluados. | Seguir con PWA local; no preparar cuentas ni destino real. |
| Verificar respaldo | Exportación reciente creada en el dispositivo familiar, sin compartirla, e integridad JSON/conteos comprobados localmente. | Detener; preservar `pastillas-v1` y pedir a la familia que resuelva el respaldo desde su dispositivo. |
| Probar restauración | Restauración y recuperación probadas en perfil aislado con fixture ficticio; pruebas existentes pasan; resultado verificado en una copia del respaldo según protocolo aprobado. | No migrar; corregir y repetir en entorno aislado. |
| Validar mapeo | Revisión técnica de referencias, conteos, claves, repetición idempotente y errores en dataset sintético. | Corregir el conversor; sin datos reales. |
| Validar autorización | CAL-001 prueba accesos permitidos y denegados entre dos familias y roles en staging; sin tablas expuestas sin grants/RLS. | No habilitar acceso familiar ni datos reales. |
| Ensayo de recuperación | Copia de seguridad destino, restauración completa y ruta de vuelta al estado local verificadas con datos ficticios. | No autorizar corte ni eliminar el original. |
| Activación | Decisión de producto explícita, ventana/piloto acordados y plan de soporte, exportación, rollback y coexistencia aprobados. | Mantener la app local sin modificarla. |

Cada punto se evidencia por separado. Pasar una prueba con datos ficticios no acredita respaldo real ni autorización para migrar.

## 7. Estado y trabajo pendiente

**Diseño documental realizado:** se definieron invariantes de protección, manejo del respaldo, pruebas sintéticas, mapeo, conciliación, idempotencia y puertas de control.

**Validación local completada:** la suite de persistencia pasó 14/14 en Edge, con un perfil nuevo en directorio temporal y fixture inventado. La prueba adicional ejecuta exportación JSON, verifica campos sintéticos, vuelve a cargar ese archivo mediante el flujo de restauración, confirma que no hay escritura antes de confirmar y compara el estado restaurado con el exportado. También pasan los casos existentes de cancelación, JSON inválido y fallos de lectura/escritura. El perfil y los archivos temporales se eliminan al terminar.

**Límite independiente antes de una migración real:** no se examinó, solicitó, copió ni recibió el respaldo familiar y no se comprobó su exportación o restauración. Esto no bloquea el cierre de la evaluación técnica sintética, pero sí bloquea cualquier futura migración o carga a un destino remoto. La app, `pastillas-v1` y su formato no cambiaron; no hay necesidad multi-dispositivo confirmada.

## Referencias internas

- [Inventario funcional AUD-001](../auditorias/AUD-001-inventario-funcional.md)
- [Modelo conceptual DAT-001](DAT-001-modelo-datos-y-acceso.md)
- [Evaluación DAT-002](DAT-002-evaluacion-backend-auth-aislamiento.md)
