# QA-010 · Correcciones iniciales y presentación del repositorio

18/11/2026. Base: `92d2d54`. El propietario autorizó continuar el informe QA-009 y reorganizar GitHub para facilitar lectura y comprensión. Este lote conserva los datos y la documentación histórica; no aplica migraciones ni modifica main.

## Cambios de aplicación

- Familias, fichas e invitaciones separan el guardado confirmado de la recarga posterior. Tras commit confirmado se limpia el formulario; si la consulta falla, el aviso dice que se guardó y pide actualizar, sin repetir el alta. Dos pruebas cubren lectura fallida tras commit y escritura no confirmada que debe conservar el borrador.
- Los formularios de sesión registran cambios del usuario. Cambiar de familia, crear otra, aceptar invitación o cerrar sesión consulta antes de descartar otros borradores. Cancelar conserva familia y texto; confirmar restablece los formularios pendientes. Se añade advertencia nativa antes de recargar/cerrar cuando hay borradores, sujeta a las restricciones del navegador. No hay persistencia de borradores sensibles.
- Abrir la edición de inventario también reconoce el borrador de un artículo nuevo. Errores y advertencias generales permanecen hasta cierre manual o nuevo mensaje; éxitos e información siguen desvaneciéndose. Las operaciones comunican `aria-busy`.

### Límites que siguen abiertos

QA-009-01 queda **parcialmente corregido**: se resuelve el commit confirmado seguido de fallo de lectura. La pérdida de la propia respuesta de escritura sigue necesitando idempotencia/conciliación de servidor; no se ha modificado el esquema. Los nombres duplicados intencionales deben seguir permitidos.

La guarda de borradores protege los cambios explícitos descritos, pero una expiración/revocación de sesión fuerza la limpieza por seguridad. No se ha implementado recuperación persistente del borrador tras expiración. No declarar cerrados todos los escenarios de QA-009-03.

## GitHub y documentación

Portada README con banner SVG propio, acceso rápido, tabla funcional, comparación de versiones, ensayo sin Docker, pruebas y mapa documental. El README anterior se conserva completo en `README-REFERENCIA.md`; una comprobación automática confirma que contiene exactamente el contenido previo. Se añade un estado vigente al principio de backend/README sin borrar la evidencia histórica.

Se incorporan CONTRIBUTING, SECURITY, mapa `docs/README`, plantilla de PR y reporte de errores sin datos personales. No se crea una licencia ni se afirma una licencia no elegida. El canal de vulnerabilidades privado se describe de forma condicional; no se afirma habilitado.

Workflow Calidad: Node 22, npm ci, suite backend, regresión PWA en Chrome y build público; permisos de lectura, timeout y cancelación de ejecuciones obsoletas. No despliega, envía correo ni aplica esquema. Su éxito remoto y el requisito de checks para merge son estados separados. La rama predeterminada sigue siendo main hasta una integración autorizada; la nueva portada se revisa en development.

## Validación

- Backend **56/56**; pruebas nuevas del guardado confirmado incluidas. Tras el ajuste final de aceptación de invitaciones se repitieron las pruebas de cliente: **19/19**.
- PWA **102/102** en Edge, ejecutada por separado de SQL.
- Build **18 recursos públicos**, sintaxis y diff correctos.
- **32 enlaces locales** de portada, contribución, seguridad y guías comprobados. README histórico conservado íntegro.
- Navegador: entrada con fixture, borrador de ficha y cambio de familia. Se observó el diálogo nativo; Escape canceló y se comprobó familia A y texto intacto. La automatización del segundo recorrido de confirmación quedó bloqueada por el diálogo nativo del navegador integrado: no se registra como aprobado. Se usó la habilidad computer-use para cerrar el primer diálogo; no se tocaron datos reales.

No se repitieron recuperaciones reales ni se enviaron correos. Capturas y pruebas previas de iPhone no sustituyen la confirmación física de este lote.

## Seguimiento del informe

| Hallazgo | Estado después de este lote |
| --- | --- |
| 01 · reintentos | Parcial: commit confirmado protegido; respuesta de escritura perdida pendiente de servidor. |
| 02 · recuperación nube | Pendiente de contrato de exportación/restauración y migraciones respaldadas si hacen falta. |
| 03 · borradores | Guarda explícita implementada; cancelación comprobada; confirmación completa y expiración pendientes. |
| 04 · historial | Pendiente paginación y consulta de movimientos anteriores a 20. |
| 05 · sesión | Sin cambios de persistencia o renovación. |
| 06 · offline | Conectada continúa necesitando internet. |
| 07 · varios teléfonos | Actualización continúa bajo demanda. |
| 08 · documentación | Entrada vigente corregida, portada y mapa reorganizados; historia conservada. |
| 09 · QA | Workflow preparado; ejecución remota y protección de rama se verifican aparte. |
| 10 · feedback | Errores persistentes y aria-busy añadidos; recorrido VoiceOver pendiente. |

El siguiente lote debe cerrar la idempotencia completa y la prueba de borradores, y luego la consulta de historial. La restauración conectada, sesión persistente y offline exigen diseño y pruebas independientes; no se declaran implementados por esta entrega.
