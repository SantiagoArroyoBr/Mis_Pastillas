# Cuidados

Aplicación web progresiva (PWA) para organizar el cuidado familiar: inventario de medicamentos e insumos, esquemas de consumo, compras, enfermería, citas y pagos.

- **Aplicación:** https://pastillas-1.vercel.app/
- **Repositorio:** https://github.com/SantiagoArroyoBr/Mis_Pastillas
- **Rama principal:** `main`

> Este documento distingue entre las funciones existentes y la arquitectura propuesta. La presencia de una función en el roadmap no significa que ya esté implementada.

## Objetivo

Cuidados busca centralizar la información operativa del cuidado familiar en una aplicación sencilla, instalable y utilizable desde distintos dispositivos. El proyecto comenzó como un control de medicamentos y evoluciona hacia una solución multi-familia.

## Funcionalidades del proyecto

La aplicación actual incluye o contempla, según la versión desplegada:

- Registro y seguimiento de medicamentos.
- Inventario de insumos de cuidado, como pañales y gasas.
- Indicadores de inventario: disponible, próximo a agotarse y urgente.
- Esquemas de consumo independientes para un mismo medicamento.
- Resumen para compartir por WhatsApp.
- Recordatorios de reposición y enlaces para registrar compras en Google Calendar.
- Exportación e importación de respaldos JSON.
- Instalación como PWA.

También forman parte del alcance funcional del proyecto:

- Registro de compras y precios.
- Gestión de enfermeros, turnos, asignaciones y periodos cubiertos.
- Registro de citas y pagos.
- Panel general con información relevante.

La disponibilidad exacta de cada módulo debe comprobarse en el código y en la versión desplegada antes de considerarlo terminado.

## Reglas de negocio

### Inventario y consumos

- Cada medicamento tiene un único inventario compartido.
- Un medicamento puede tener varios esquemas de consumo independientes.
- Cada esquema define su propia dosis y calendario.
- Todos los esquemas descuentan del mismo inventario; no representan existencias separadas.
- El consumo estimado debe calcularse considerando todos los esquemas activos.

Ejemplo: un medicamento tiene 30 tabletas. Un esquema consume media tableta lunes, miércoles y viernes; otro consume una tableta martes, jueves y sábado. El inventario se descuenta con la suma de ambos esquemas.

### Alertas de reposición

- Las alertas son exclusivamente para reponer inventario; no son avisos para administrar o tomar medicamentos.
- No deben notificarse con más de dos días de anticipación al agotamiento estimado.
- Deben evitarse notificaciones duplicadas.
- Deben contemplarse medicamentos e insumos próximos a agotarse o agotados.

### Enfermería

- Los enfermeros son registros operativos, no cuentas de usuario.
- Sus datos pueden incluir nombre, color identificador, turnos, horarios y asignaciones por día.
- Los pagos y periodos cubiertos deben poder relacionarse con los registros correspondientes.

## Familias, pacientes y usuarios

El diseño objetivo separa las familias, los pacientes y las cuentas de acceso:

- Una **familia** agrupa sus datos y miembros.
- Un **paciente** es una persona cuyo cuidado se registra; no necesita tener una cuenta.
- Un **usuario** es una persona autenticada que puede acceder a la aplicación según su rol.

### Roles previstos

| Rol | Capacidades previstas |
| --- | --- |
| `OWNER` | Administración de la familia, miembros y roles; acceso al historial; puede iniciar la recuperación de acceso de otros miembros. |
| `SUBJEFE` | Apoyo en la administración y operación cotidiana; acceso al historial; no puede cambiar al propietario ni recuperar las credenciales de otros miembros. |
| `USUARIO` | Operaciones cotidianas autorizadas; sin acceso al historial administrativo ni a la gestión de miembros, roles o contraseñas. |

Los permisos definitivos deben aplicarse y validarse en el backend, no solamente ocultando controles en la interfaz.

### Contraseñas y recuperación

- Las contraseñas existentes nunca deben ser visibles para otros usuarios, incluido el OWNER.
- No almacenar contraseñas en texto plano.
- El OWNER podrá iniciar un proceso seguro de recuperación o restablecimiento para otros miembros.
- La autenticación y recuperación deben delegarse a un proveedor de identidad confiable.

### Historial de cambios

El historial administrativo está previsto para OWNER y SUBJEFE. Debe registrar, como mínimo:

- Actor que realizó la operación.
- Fecha y hora.
- Acción realizada.
- Tipo e identificador del registro afectado.
- Valores anteriores y nuevos cuando corresponda.

Los usuarios ordinarios no deben poder consultar ni modificar este historial.

## Arquitectura actual

La aplicación desplegada utiliza una arquitectura ligera de frontend:

- HTML, CSS y JavaScript.
- El JavaScript del frontend se carga desde `app.js` como script clásico síncrono al final de `index.html`; la lógica sigue concentrada en un único archivo.
- Despliegue del frontend en Vercel.
- Persistencia local mediante `localStorage`; la clave utilizada por la aplicación es `pastillas-v1`.
- `manifest.json` para la instalación como PWA.
- `sw.js` para el service worker y el comportamiento de caché.
- El service worker precarga `app.js` para que la interfaz pueda abrirse offline.
- Respaldo manual mediante archivos JSON.

La persistencia local no equivale a sincronización multi-dispositivo ni proporciona por sí sola autenticación, aislamiento entre familias o respaldo remoto.

## Arquitectura objetivo propuesta

La siguiente arquitectura es una propuesta de evolución; no debe considerarse implementada hasta que exista código, configuración y pruebas correspondientes.

| Capa | Tecnología propuesta | Responsabilidad |
| --- | --- | --- |
| Frontend | HTML, CSS y JavaScript (o una evolución gradual) | Interfaz de la PWA. |
| Hosting | Vercel | Publicación del frontend. |
| Backend y base de datos | Supabase / PostgreSQL | Datos compartidos y operaciones de servidor. |
| Autenticación | Supabase Auth | Inicio de sesión y recuperación segura. |
| Autorización | Row Level Security (RLS) | Aislamiento de datos por familia y permisos por rol. |
| Persistencia offline | IndexedDB | Datos locales y operaciones pendientes de sincronización. |
| Notificaciones remotas | Web Push + service worker + backend | Envío de notificaciones cuando el navegador lo permita. |

Se busca evitar depender de un servidor VPS propio encendido permanentemente. Antes de adoptar servicios externos deben revisarse sus límites, disponibilidad, costos y condiciones del plan utilizado.

## Funcionamiento offline y sincronización

El objetivo es que las operaciones esenciales sigan disponibles sin conexión y se sincronicen al recuperar conectividad.

Comportamiento previsto:

1. Leer y modificar datos locales desde IndexedDB.
2. Registrar las operaciones pendientes en una cola.
3. Sincronizar al abrir la aplicación, después de cambios relevantes y al recuperar la conexión.
4. Reintentar operaciones fallidas sin duplicar movimientos.
5. Detectar conflictos y resolverlos mediante reglas explícitas.

El inventario requiere especial cuidado: una operación no debe descontarse dos veces ni sobrescribir movimientos concurrentes de otro dispositivo. Las operaciones de inventario deben ser idempotentes y validarse en el backend.

Los navegadores no garantizan la ejecución periódica de tareas cuando la aplicación está cerrada. La sincronización en segundo plano y las notificaciones push dependen de las capacidades del navegador, permisos y servicios de servidor.

## Seguridad

- Aislar los datos de cada familia en el backend.
- Aplicar políticas RLS a todas las tablas con información familiar.
- Validar roles y permisos en servidor.
- No incluir claves secretas ni la clave `service_role` en el frontend.
- Registrar operaciones administrativas en un historial protegido.
- Proteger los procesos de invitación, recuperación y cambio de roles.
- Probar que una cuenta de una familia no pueda consultar ni modificar datos de otra.
- Mantener respaldos y probar los procesos de restauración.

## Modelo de datos conceptual

El modelo definitivo se diseñará conforme se implementen los módulos. Las entidades previstas incluyen:

| Entidad | Propósito |
| --- | --- |
| `families` | Familias o espacios de trabajo. |
| `profiles` | Perfil de cada cuenta autenticada. |
| `family_members` | Relación entre cuentas, familias y roles. |
| `patients` | Personas cuyo cuidado se registra. |
| `medications` | Medicamentos e inventario compartido. |
| `medication_consumptions` | Esquemas independientes de consumo. |
| `supplies` | Insumos y existencias. |
| `inventory_movements` | Entradas, salidas y ajustes de inventario. |
| `purchases` | Compras, cantidades, precios y fechas. |
| `nurses` | Registros de enfermeros. |
| `nurse_assignments` | Asignaciones de enfermería. |
| `nurse_shifts` | Turnos y horarios. |
| `appointments` | Citas. |
| `payments` | Pagos y periodos cubiertos. |
| `audit_logs` | Historial administrativo. |
| `push_subscriptions` | Suscripciones para notificaciones push. |

Las relaciones, restricciones, índices y políticas de acceso se definirán antes de migrar los datos de producción.

## Roadmap

- [ ] Consolidar el inventario de funciones actuales y sus reglas.
- [ ] Diseñar el modelo relacional y las reglas de acceso multi-familia.
- [ ] Configurar backend, autenticación y políticas RLS.
- [ ] Migrar progresivamente los módulos y los datos locales.
- [ ] Implementar persistencia local con IndexedDB y sincronización segura.
- [ ] Implementar historial de auditoría.
- [ ] Implementar notificaciones push de reposición.
- [ ] Probar recuperación, respaldos, restauración y aislamiento entre familias.
- [ ] Preparar documentación de instalación, uso y despliegue.

## Criterios de mantenimiento

- Actualizar este README en cada cambio relevante de arquitectura, funcionalidad o reglas de negocio.
- Añadir una entrada al registro de cambios por cada modificación significativa.
- No marcar una función como terminada hasta implementarla y probarla.
- Mantener separadas las capacidades existentes y las propuestas.
- No eliminar funciones existentes sin una decisión explícita y una alternativa documentada.
- No subir secretos, credenciales, tokens ni datos personales reales al repositorio.

## Registro de cambios

### 0.1 — Documentación inicial

- Se documentan el propósito y alcance de Cuidados.
- Se registran las reglas de inventario, consumos independientes y alertas de reposición.
- Se describen los roles y el modelo multi-familia previsto.
- Se separa la arquitectura actual de la arquitectura objetivo.
- Se incorpora un roadmap inicial.

### MOD-001 — Extracción del JavaScript

- Se documenta la arquitectura comprobada en `docs/arquitectura/diagnostico-modularizacion.md`, basada en `fa78806b53f601ce6aa070e75573df065043f4d3`.
- En la rama de tarea, el bloque JavaScript se trasladó literalmente a `app.js`; no se dividió en más módulos ni se refactorizó.
- `index.html` carga el archivo después del DOM y `sw.js` lo precarga con caché `cuidados-v8` para uso offline.
- Estado de esta rama: pruebas aprobadas; pendiente revisión e integración. No desplegada.


### MOD-002 — Utilidades independientes

- Se extrajeron `esc`, `parseTimes`, `pos`, `num` y `money` a `js/utils.js`, expuestas en `window.AcompanaUtils` y conservando sus resultados.
- `index.html` carga las utilidades de forma clásica y síncrona antes de `app.js`; `sw.js` las precarga en la caché `cuidados-v9` para uso offline.
- Estado de esta rama: implementación y validación en curso; no integrada ni desplegada.
