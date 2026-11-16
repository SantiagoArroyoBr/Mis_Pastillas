# CAL-001 — Matriz de pruebas de respaldo y aislamiento

**Estado:** piloto SQL local con comprobación de aislamiento en PostgreSQL embebido y una prueba integrada aprobada en Supabase local.

**Alcance:** datos y cuentas sintéticas exclusivamente. La matriz completa se conserva para las iteraciones posteriores. [Piloto RECONST-002](../../backend/README.md).

## 1. Objetivo

Si se adopta una operación multi-familia, demostrar tanto accesos esperados como denegados desde la API y la base de datos. Ocultar botones en la interfaz o probar solo un rol no demuestra aislamiento. La revisión debe cubrir cada tabla, endpoint, operación y rol definido por producto; grants y políticas RLS se verifican por separado según DAT-002.

## 2. Matriz mínima

| Actor sintético | Recurso/acción | Resultado requerido |
|---|---|---|
| Integrante A de Familia A | Leer/crear/editar registros permitidos de A | Permitido solo según rol acordado; cada registro pertenece a A. |
| Integrante A de Familia A | Leer/editar/eliminar recurso de Familia B por ID conocido | Denegado; sin filtrar campos ni revelar existencia por mensajes distinguibles. |
| Cuenta sin sesión | Acceder a cualquier dato privado o mutación | Denegado. |
| Integrante con permiso de lectura | Intentar escritura o borrado | Denegado en servidor, aunque se construya la solicitud manualmente. |
| Integrante revocado | Reutilizar token antes y después de expirar/renovar; operar offline y reconectar | Denegación remota según política; cola local retenida o descartada según decisión explícita, sin reenviar con privilegios revocados. |
| Rol autorizado | Ejecutar operación permitida y reintentar con igual clave idempotente | Un efecto durable; respuesta repetible sin duplicar registros ni movimientos. |
| Cliente con clave pública | Solicitar operaciones con privilegios administrativos | Denegado; claves de servicio no están en frontend. |
| Administrador de base de datos de prueba | Operación directa con rol limitado y grants configurados | RLS no se trata como sustituto de grants ni grants como sustituto de RLS; ambos resultados se comprueban. |

Repetir para lectura, inserción, actualización, borrado y relaciones de cada entidad; probar IDs ajenos, relaciones cruzadas, filtros que omiten familia, valores `null`, lote, vistas, funciones y endpoints auxiliares. Revisar que auditoría/diagnóstico no incluya valores médicos.

## 3. Recuperación y compatibilidad

En el entorno aislado, restaurar exportación ficticia, comparar conteos y referencias, repetir el mismo lote y comprobar idempotencia. Simular fallo a mitad de lote y caída antes/después de confirmar; el resultado debe ser recuperable y conciliable. Validar que la fuente local no cambia y que el cliente puede seguir en modo local si falla el servicio. DAT-003 define los controles del snapshot y la restauración.

## 4. Ejecución y evidencia exigida

Antes de ejecutar deben existir modelo aprobado, roles y permisos concretos, proveedor/entorno de prueba, políticas y grants revisables, fixtures sintéticos y una cuenta de prueba por familia/rol. Cada resultado debe registrar versión de código/esquema, identidad sintética, acción, resultado esperado/observado y referencia a la evidencia sin incluir datos de cuidado.

Bloqueantes de liberación: una lectura o escritura entre familias, una operación accesible por cliente anónimo sin justificación, grants inesperados, duplicación en reintentos, relación que apunte a otra familia, error que revele datos o restauración no conciliable. No importar datos reales para diagnosticar.

## 5. Estado

RECONST-002 cubre con SQL las cuentas propietaria, cuidadora, externa, revocada y anónima en el primer conjunto de tablas. La prueba HTTP pasó con tres cuentas ficticias, dos familias, una ficha compartida, rechazo de una revisión obsoleta, un abono reintentado y revocación. La matriz completa requiere ampliar la cobertura a cada tabla y operación incorporada y probar restauración y sincronización offline cuando se implementen. DAT-003 conserva la evidencia previa de persistencia y restauración local.

Las pruebas de abonos individuales comprueban que una cuenta externa o cuidadora carece de acceso a las asignaciones. El caso SQL comprueba además que una cuenta anónima carece de permisos para leer o registrar abonos individuales y que la cuenta propietaria tampoco puede borrar asignaciones mediante escritura directa. La prueba HTTP confirma que dos pagos simultáneos no pueden superar juntos el pendiente y que el reintento del pago aceptado conserva el mismo identificador. [SQL y permisos](../../backend/tests/database.spec.mjs) · [Integración HTTP](../../backend/tests/supabase.integration.mjs).
