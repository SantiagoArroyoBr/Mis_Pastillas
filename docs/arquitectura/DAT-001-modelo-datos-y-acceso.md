# DAT-001 — Propuesta de modelo de datos y acceso

**Estado:** diseño propuesto; no implementado.  
**Base revisada:** `development`, HEAD local `7618326725c42c003350e6da906bf1e8c0f8463e` (2026-10-31). El checkout estaba limpio. No fue posible consultar GitHub en vivo por un error de resolución de `github.com`; `origin/development` local coincide con HEAD y `origin/main` local apunta al SHA estable `92c4034085e13bb38fd0a7ff2622c46ef797873d`.  
**Alcance:** modelo lógico, límites de autorización, compatibilidad y estrategia futura. No crea tablas, políticas, proyecto Supabase ni migración.

## 1. Resumen y límites de la propuesta

Se recomienda modelar cada familia como un tenant explícito, separar identidad de autenticación (`auth.users`) de los perfiles de aplicación, y conceder acceso familiar mediante membresías revocables con rol. Cada dato de cuidado debe llevar `family_id`; sus relaciones deben comprobarse también dentro de esa familia. Los pacientes son sujetos de cuidado y no cuentas. Enfermeros y enfermeras siguen siendo registros operativos salvo que una persona sea invitada por separado como cuenta.

La recomendación es una base para evaluación y no una decisión de adopción de Supabase, de identidad/login, del flujo de invitaciones, ni de política de retención. No se afirma que toda la información actual tenga autoría, fecha o identidad suficiente para completar esos campos históricamente.

## 2. Hechos del estado actual relevantes

La inspección de `app.js`, `tests/persistence.spec.js` y el inventario AUD-001 confirma:

- El estado completo reside en `localStorage` bajo `pastillas-v1`; la raíz incluye `p`, `pay`, `appts`, `sel`, `last` y `mode`.
- Pacientes están representados en el arreglo `p[]` por nombre y `meds[]`; su posición es significativa para referencias existentes.
- Medicinas e insumos pertenecen a un registro dentro de un paciente. Consumos independientes comparten el saldo de esa ficha; no equivalen a inventario global por nombre.
- `appts[].i`, `pay.cfg[]`, enfermeros, asignaciones y otra información de pagos usan índices de paciente y/o arreglos/objetos anidados.
- Enfermeros se guardan como datos operativos y nombres en asignaciones; no hay cuenta ni identidad autenticada asociada comprobada.
- Restauración JSON reemplaza el estado completo y requiere confirmación. Las rutas de migración existentes deben conservarse hasta que haya una sustitución compatible validada.

Por tanto, el esquema nuevo no debe inferir identidades por nombres, tratar el índice como clave permanente, agrupar medicinas por nombre ni convertir un enfermero automáticamente en usuario.

## 3. Entidades recomendadas

Las claves `uuid` son identificadores técnicos generados al crear la fila. `family_id` es obligatorio en cada fila propiedad de una familia. Fechas de creación/modificación se guardan en UTC (`timestamptz`); fechas de agenda/consumo con significado de calendario local requieren además zona horaria familiar explícita cuando esa conversión se diseñe.

| Entidad | Clave primaria y campos principales | Relaciones y propósito |
|---|---|---|
| `profiles` | `user_id uuid PK FK auth.users(id)`, `display_name`, `created_at`, `updated_at` | Datos mínimos de perfil accesibles a la cuenta autenticada. No duplicar contraseñas ni tokens. |
| `families` | `id uuid PK`, `name`, `created_by uuid FK profiles`, `created_at`, `archived_at NULL` | Tenant. El archivo/archivo lógico se recomienda antes de borrado físico. |
| `family_memberships` | `id uuid PK`, `family_id FK`, `user_id FK`, `role`, `status`, `invited_by`, `created_at`, `accepted_at`, `revoked_at` | Une cuentas con familias. `UNIQUE(family_id,user_id)` para una membresía vigente por persona y familia; el tratamiento de reingreso queda por decidir (reactivar fila o historial separado). |
| `patients` | `id uuid PK`, `family_id`, `display_name`, campos de perfil acordados, `created_at`, `updated_at`, `archived_at NULL` | Un paciente pertenece a una familia; no referencia `auth.users`. Puede tener cero o más registros de cuidado. |
| `caregivers` | `id uuid PK`, `family_id`, `display_name`, `contact fields` solo si se aprueban, `created_at`, `archived_at NULL` | Registro operativo de cuidador/enfermero. No es cuenta. Si la misma persona tiene acceso, la membresía es una relación aparte; enlazar ambos registros requiere decisión y evidencia de identidad. |
| `patient_caregiver_assignments` | `id uuid PK`, `family_id`, `patient_id`, `caregiver_id`, fechas/horario según alcance, `created_at`, `archived_at NULL` | Asignación operativa muchos-a-muchos en el tiempo; las restricciones de solapamiento y significado de turnos quedan para DAT-004/reglas de pagos. |
| Registros de cuidado (`medications`, `consumption_schedules`, `inventory_events`, `purchases`, `appointments`, `payment_settings`, `payments`, `assignments`) | `id uuid PK`, `family_id`, claves foráneas a paciente/registro padre, campos de dominio, `created_at`, `updated_at`, `archived_at` cuando aplique | Descomponer el estado anidado solo al definir alcance de backend; cada tabla hija conserva familia para verificar pertenencia con claves compuestas. |
| `audit_events` | `id uuid PK`, `family_id`, `actor_user_id NULL FK profiles`, `action`, `entity_type`, `entity_id`, `occurred_at`, `request_id`, metadatos permitidos | Registro append-only de operaciones sensibles. Evitar copias indiscriminadas de datos médicos en `old_value/new_value`. |

### Integridad entre familias

En cada tabla familiar, definir una restricción `UNIQUE(family_id,id)` además de la clave primaria, y las referencias entre tablas del mismo tenant como claves compuestas, por ejemplo `(family_id, patient_id) REFERENCES patients(family_id,id)`. Esto impide que una fila con `family_id` de una familia apunte accidentalmente a un paciente de otra, incluso ante errores de lógica de aplicación. Las FK de usuario apuntan por separado a `auth.users(id)`/`profiles(user_id)`.

Índices mínimos a evaluar: `(family_id,id)` en tablas familiares; `(user_id,status,family_id)` en membresías; y claves de búsqueda por padre/fecha en registros de dominio. Las consultas y volumen reales deben guiar índices adicionales.

## 4. Cardinalidades

```text
auth.users 1 ── 0..1 profiles
profiles   1 ── 0..N family_memberships N ── 1 families
families   1 ── 0..N patients
families   1 ── 0..N caregivers
patients   N ── M caregivers       (patient_caregiver_assignments)
patients   1 ── 0..N care records
care records 1 ── 0..N child/history records
families   1 ── 0..N audit_events
```

Una cuenta puede pertenecer a varias familias y una familia puede tener varias cuentas miembro y pacientes. No se impone que todas las familias compartan un paciente, ni que un paciente o un registro pueda pertenecer a más de una familia. Compartir pacientes entre familias requeriría un flujo explícito de consentimiento y autorización; no forma parte de esta propuesta base.

## 5. Roles y permisos

El rol vive en la membresía, no en el perfil global: una misma cuenta puede ser cuidador en una familia y administradora en otra.

| Rol propuesto | Permisos base recomendados | Límites |
|---|---|---|
| `owner` (propietario) | Administrar familia y miembros, asignar roles, leer/escribir registros familiares, exportar, archivar familia. | No puede abandonar o ser degradado si eso deja la familia sin propietario; operación de transferencia debe ser transaccional y auditada. |
| `admin` (administrador) | Gestionar membresías no propietarias y datos de cuidado, configurar pacientes/cuidadores y exportar si el producto lo permite. | No puede transferir propiedad ni borrar/archivar la familia. |
| `caregiver` (cuidador con cuenta) | Leer información necesaria y registrar/actualizar actividades de cuidado asignadas; permisos granulares por tipo de dato y paciente por definir. | No administra familia/membresías ni exporta el conjunto completo por defecto. |
| `viewer` (solo lectura, opcional) | Consultar los pacientes y registros autorizados. | Sin escrituras, administración o exportación por defecto. |

Roles futuros como facturación, enfermero invitado, auditor externo o cuidador limitado a ciertos pacientes no deben agregarse hasta que exista necesidad de producto. Para permisos por paciente, proponer una tabla explícita de asignación/alcance de membresía en vez de codificar listas en JWT o confiar en filtros de interfaz.

## 6. Autenticación, autorización y RLS

### Recomendación de seguridad

- Si se adopta Supabase, usar Supabase Auth para sesiones y `auth.uid()` como identidad autenticada. La autenticación demuestra qué cuenta presenta la petición; no determina por sí misma a qué familia pertenece ni qué puede hacer.
- La autorización se calcula en base de datos a partir de una membresía activa para el `family_id` consultado y del rol requerido. La interfaz puede ocultar acciones, pero nunca sustituye la autorización del servidor/DB.
- Activar RLS en cada tabla expuesta por la API y revisar también los `GRANT`: grants deciden qué operaciones puede intentar un rol de Postgres y RLS qué filas operan. Habilitar RLS sin revisar grants no basta.
- Para todas las familias, negar por omisión y crear políticas separadas `SELECT`, `INSERT`, `UPDATE`, `DELETE`. Las políticas de escritura validan con `WITH CHECK` la fila resultante para impedir cambiar `family_id`, paciente padre o propietario a otro tenant.
- Las funciones auxiliares de membresía pueden ser `SECURITY DEFINER` solo si hace falta evitar recursión de RLS: fijar `search_path`, calificar nombres, minimizar permisos, no aceptar un usuario arbitrario y probar explícitamente sus límites. Alternativamente, mantener políticas `EXISTS` directas si no crean recursión ni problemas de rendimiento.
- No incluir permisos mutables de membresía como fuente autoritativa en claims JWT de larga duración; una revocación debe surtir efecto sin esperar a que caduque una sesión. Claims pueden servir para datos estables no sensibles, no reemplazan la comprobación actual de membresía.
- La clave pública/anon del cliente no es secreto y requiere RLS correcto. La `service_role` omite RLS: nunca incluirla en la PWA o código cliente; reservar credenciales elevadas para entorno servidor confiable y operaciones puntuales auditadas.
- Aplicar menor privilegio a esquemas, tablas, funciones, vistas y buckets de Storage futuros. Si se almacenan adjuntos, sus rutas también deben incluir/verificar tenant y no usar enlaces públicos para contenido sensible.

### Forma conceptual de las políticas

Esto es pseudocódigo de diseño, **no SQL listo para ejecutar**. La función conceptual `has_family_role(family_id, roles[])` debe consultar membresía activa vinculada a `auth.uid()` y no confiar en parámetros de usuario no autenticados.

```sql
-- lectura: membresía vigente en el tenant de la fila
USING (auth.uid() IS NOT NULL AND has_family_role(family_id, ARRAY['owner','admin','caregiver','viewer']))

-- inserción: además del rol, validar relación del padre en el mismo tenant
WITH CHECK (has_family_role(family_id, ARRAY['owner','admin','caregiver'])
            AND patient_belongs_to_family(patient_id, family_id))

-- actualización: el USING autoriza la fila anterior y WITH CHECK la nueva;
-- ambos deben exigir el mismo tenant y rol adecuado.
```

Las funciones de comprobación deben evitar políticas recursivas sobre `family_memberships`; no conceder al cliente una forma de insertar su propio rol, elevarse a `owner/admin`, reactivar su membresía o cambiar `family_id`. Invitaciones, aceptación, alta inicial de familia, transferencia de propiedad y revocación deben pasar por operaciones transaccionales con reglas explícitas y auditoría. Antes de producción, probar usuarios anónimos, miembros activos/inactivos y usuarios de otras familias con pgTAP o entorno equivalente; Supabase documenta pruebas RLS con pgTAP.

## 7. Reglas de negocio que el modelo debe preservar

1. **Paciente ≠ cuenta:** pacientes son registros de cuidado. No tienen credenciales ni se convierten en usuarios por compartir nombre o teléfono.
2. **Cuidador/enfermero ≠ usuario autenticado:** el registro operativo puede existir sin cuenta. Si se invita a su titular, se crea una membresía vinculada a `auth.users`; el vínculo con su registro operativo requiere confirmación, no coincidencia automática.
3. **Membresía ≠ paciente:** el acceso de una cuenta a la familia se guarda en membresías. Si se decide acceso limitado a pacientes, se modela explícitamente y se prueba.
4. **Datos de dominio con contexto familiar:** todo registro pertenece a una familia; las referencias paciente/registro se restringen a esa misma familia.
5. **Inventario:** cada ficha de medicamento/insumo mantiene su propio saldo. Consumos independientes descuentan ese saldo compartido de ficha. No consolidar por nombre; los eventos de inventario deberán ser idempotentes si hay sincronización para evitar doble descuento.
6. **Trazabilidad:** pagos, compras, asignaciones y ajustes administrativos requieren conservar historia suficiente y autor/fecha cuando estén disponibles. La conversión no inventa autores retrospectivos.

## 8. Compatibilidad con `pastillas-v1`

No cambiar el formato local durante DAT-001. El diseño de migración debe:

- Tratar el respaldo `pastillas-v1` como snapshot de un dispositivo/estado completo, no como colección de filas globales ni eventos inequívocos.
- Añadir un `migration_batch_id` y un mapeo de origen, no reutilizar índices como identificadores finales. Mantener una tabla privada `migration_id_map` con `(batch_id, entity_type, legacy_path/index, new_uuid)` hasta conciliar referencias; nunca exponer datos de mapeo a otros tenants.
- Asignar UUID a pacientes y registros y resolver primero las dependencias. Convertir `appts[].i`, `pay.cfg[]`, índices de enfermero/asignaciones y demás referencias solo mediante el mapeo exacto de posición del mismo snapshot. Mantener simultáneamente un manifiesto de cantidades y hash/identificador del archivo fuente.
- Conservar nombres de enfermeros como registros `caregivers` operativos y apuntar asignaciones a su ID. No crear cuenta ni enlazar persona autenticada por igualdad de nombre.
- Preservar las claves/objetos originales de medicina, consumos, compras, citas y pagos y anotar origen local/fecha de importación. No fusionar elementos de fichas distintas por nombre, ni deduplicar pacientes coincidentes por nombre.
- Registrar campos de legado sin equivalencia en un informe de conciliación. Si falta una relación, una fecha o una persona, mantener el valor de origen o aislar la fila para resolución; no elegir paciente/familia mediante heurística.
- No sobreescribir `pastillas-v1` durante carga inicial. Mantener exportación previa descargable, copia íntegra, comparación y ruta de reversión hasta validar; la política de fuente de verdad durante coexistencia local/remota está pendiente.

## 9. Estrategia de migración futura (sin ejecutar)

1. **Precondiciones:** resolver producto/auth, consentimiento, propiedad de familia, región/retención, soporte y arquitectura (DAT-002); fijar un formato de exportación conocido y revisar sus compatibilidades. Probar restauración JSON real con datos ficticios y obtener respaldo verificado del dispositivo antes de cada operación real.
2. **Inventario de origen:** exportar localmente bajo control del usuario; validar versión y estructura con las mismas validaciones de `pastillas-v1`; calcular conteos por entidad, referencias por índice, hashes y campos no mapeados. Nunca registrar datos personales en logs compartidos.
3. **Preparación de tenant:** crear familia destino y membresías confirmadas por invitación/auth. Una exportación local no prueba que la cuenta que la carga tenga autoridad sobre todos los pacientes: resolver titularidad y consentimiento antes de importar datos reales.
4. **Carga en staging aislado:** generar UUID y mapa estable por snapshot; cargar en transacción o lotes idempotentes; conservar `source_device_id`/`source_record_key` de importación con `UNIQUE` para evitar repetir el mismo archivo; el hash por sí solo identifica un archivo exacto, no resuelve diferencias entre exportaciones posteriores.
5. **Conciliación:** comparar conteos por tipo, relaciones, saldos y eventos calculables; comprobar que cada FK apunta al padre esperado y que la política RLS bloquea una segunda familia. Todo conteo discrepante o referencia ambigua se resuelve antes de activar uso.
6. **Activación controlada:** piloto con copias ficticias y luego usuarios voluntarios; elegir explícitamente modo de coexistencia, ventana de corte o sincronización y comportamiento offline. No aceptar escrituras simultáneas independientes sin protocolo de conflictos e idempotencia de inventario.
7. **Reversión y conservación:** mantener respaldo exportado sin alteración y documentar cómo volver al estado local original. No borrar ni limpiar el almacenamiento local tras importación hasta que el usuario confirme reconciliación y recuperación probada. Retención y borrado definitivo requieren política de producto/legal y diseño de DAT-004/DAT-002.

La migración completa queda fuera de DAT-001 y depende de DAT-002 y DAT-003; esta secuencia no constituye autorización para acceder a datos reales o activar un backend.

## 10. Auditoría y operaciones sensibles

Se recomienda una tabla de eventos inmutable para invitaciones, aceptación/revocación de membresía, cambios de rol/propietario, creación/archivo de familia o paciente, exportación/importación, ajustes de inventario, pagos y restauraciones. Registrar actor obtenido del contexto de sesión (`auth.uid()`), familia, acción, tipo/ID de entidad, hora UTC, identificador de solicitud y resultado. Las operaciones automáticas sin actor humano deben indicar origen de sistema.

No almacenar credenciales, tokens, respaldos completos, notas médicas ni snapshots de filas por defecto en la auditoría. Definir quién puede consultar la bitácora, retención, exportación, corrección de errores y borrado conforme a requisitos legales y del producto. El cliente no debe poder insertar eventos que suplanten a otro actor ni modificar/eliminar eventos existentes. Las escrituras del registro deben originarse en trigger/función confiable o servicio autenticado con privilegio mínimo. El alcance temporal y la inmutabilidad técnica necesitan validación específica antes de implementación.

## 11. Alternativas y decisiones pendientes

| Tema | Recomendación para evaluar | Alternativa | Decisión pendiente / impacto |
|---|---|---|---|
| Una familia por respaldo local | Importar el snapshot a exactamente una familia confirmada. | Dividir respaldo entre varias familias. | No hay IDs de familia/persona; dividir requiere selección manual de registros y reconciliar pagos/citas/índices. |
| Titularidad de familia | Rol `owner` en membresía y transferencia auditada. | Propietario implícito como creador sin rol transferible. | Definir número mínimo/máximo de propietarios y recuperación cuando el titular pierde acceso. |
| Cuidador con alcance | Permisos generales por rol al inicio, diseñar extensión por paciente. | ACL por paciente desde primera versión. | ACL mejora mínimo privilegio pero aumenta interfaz, políticas y pruebas. ¿Enfermeros verán medicinas/pagos o solo agenda asignada? |
| Registro de cuidador y cuenta | Entidades separadas, enlace explícito tras invitación/confirmación. | Sustituir caregiver por cuenta obligatoria. | La segunda alternativa excluye cuidadores sin acceso digital y cambia operación existente. |
| Datos e historial | Archivar y conservar trazabilidad, borrar físicamente mediante proceso específico. | Borrado en cascada inmediato. | Impacto en conservación, exportación, requisitos legales y expectativas familiares. |
| Auth | Evaluar Supabase Auth si se elige Supabase. | Proveedor externo/OIDC o mantener PWA local sin cuentas. | Costos, recuperación de cuenta, MFA, correo/SMS, región y soporte aún no evaluados (DAT-002). |
| Esquema de registros | Tablas normalizadas con FK e historial. | JSONB por paciente/familia. | JSONB simplifica importación inicial, pero debilita integridad, consultas, permisos granulares y auditoría; no recomendado para datos sensibles de dominio como única estructura. |
| Conflictos de sincronización | Escrituras idempotentes e historial de eventos para inventario. | Última escritura gana. | Última escritura puede perder cambios y duplicar descuentos; no usar sin decisión informada. |

## 12. Riesgos, dependencias y criterios de salida

### Riesgos

- Aislar solo mediante filtro de UI o políticas incompletas permite exposición entre familias.
- Las relaciones por índice del origen pueden asociarse mal si se omite el mapa del snapshot o se reordena antes de importar.
- Duplicados de exportaciones sucesivas no se resuelven comparando nombres ni solo hashes; requieren clave de origen estable o revisión humana.
- Una membresía revocada que siga en claims de sesión puede conservar acceso si RLS confía en claims obsoletos.
- Borrados en cascada, enlaces de Storage públicos, `service_role` en el cliente o funciones `SECURITY DEFINER` amplias pueden anular el aislamiento.
- La PWA actual offline no puede confirmar en tiempo real permisos revocados; DAT-003/PWA-001 deben definir comportamiento, expiración de datos en caché y conflicto para operaciones offline.
- No están decididos requisitos legales, región de datos, retención, consentimiento, recuperación de cuentas ni alcance de acceso de cada rol.

### Dependencias antes de implementación

- DAT-002: decisión backend/Auth/RLS sustentada en necesidades, costo, seguridad y mantenimiento.
- DAT-003: formato de migración local, respaldo/restauración, coexistencia y recuperación.
- CAL-001: pruebas de respaldo y aislamiento entre familias con cuentas ficticias antes de producción.
- PWA-001: permisos revocados, colas, reintentos, idempotencia, conflictos y datos offline.
- Definiciones de producto: propiedad y transferencia de familia; acceso del cuidador; información compartida; invitaciones; borrado/retención; zonas horarias.

### Criterios para considerar este diseño terminado

- Entidades, cardinalidades, claves e integridad familiar descritas.
- Roles y límites de acceso iniciales con alternativas abiertas.
- Principios RLS/Auth y amenazas de aislamiento documentados, sin presentarlos como políticas ya implementadas.
- Mapeo de `pastillas-v1` y estrategia de reversión sin asociaciones por heurística definidos.
- Dependencias, riesgos y decisiones de producto explícitos.

DAT-001 cumple esos criterios como propuesta documental. No autoriza crear el backend, implementar RLS, importar datos reales ni cambiar la arquitectura vigente.

## 13. Referencias técnicas

Documentación oficial de Supabase consultada el 2026-10-31; verificarla de nuevo al implementar porque las APIs y recomendaciones pueden evolucionar:

- [Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security): grants y políticas son controles distintos; `auth.uid()`, políticas por operación y `USING`/`WITH CHECK`.
- [Supabase Auth](https://supabase.com/docs/guides/auth): integración de Auth con JWT y RLS.
- [User Management](https://supabase.com/docs/guides/auth/managing-user-data): tablas de aplicación para perfiles, FK a `auth.users` y protección de RLS.
- [Testing RLS policies with pgTAP](https://supabase.com/docs/guides/database/postgres/testing-row-level-security): validación de permisos como parte de la implementación.
- [Deleting data and dropping objects safely](https://supabase.com/docs/guides/database/postgres/data-deletion): respaldos, dependencias y cuidado con borrado en producción.

