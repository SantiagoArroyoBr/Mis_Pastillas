# DAT-002 — Evaluación de backend, autenticación y aislamiento familiar

**Estado:** evaluación técnica y recomendación, 2026-10-31.  
**Base revisada:** `development` en `26cae2a29a8add9741616c9c625a4b35a700bb0c`, DAT-001 y AUD-001.  
**Decisión técnica recomendada:** conservar la aplicación local actual por ahora; no activar backend, autenticación ni sincronización multi-dispositivo hasta que exista una necesidad de producto confirmada y se completen los criterios previos de datos, privacidad y operación.

## 1. Alcance y hechos de partida

DAT-001 propone un modelo multi-familia con cuentas, pacientes y registros separados, además de un patrón posible de autorización con RLS. Es un diseño conceptual; no es una implementación ni una decisión de adoptar Supabase.

AUD-001 y `ARQUITECTURA.md` describen la situación vigente: PWA frontend, datos guardados localmente bajo `localStorage` y la clave `pastillas-v1`, importación/exportación JSON, modo offline parcial y ausencia confirmada de backend, cuentas y sincronización entre dispositivos en el código revisado. El plan no confirma hoy una necesidad de compartir datos en tiempo real entre dispositivos. Los datos de cuidado pueden ser sensibles, y la continuidad del uso actual es prioritaria.

Este informe evalúa alternativas y controles. No crea servicios, cuentas, credenciales, tablas, políticas, autenticación ni cambios en la aplicación o en los datos locales.

## 2. Alternativas evaluadas

| Alternativa | Ventajas | Costos y riesgos | Adecuación actual |
| --- | --- | --- | --- |
| Mantener PWA local y respaldos JSON | Sin nuevo proveedor ni cuentas; conserva el modelo de uso y el modo offline actual; menor superficie de exposición remota y costo operativo. | No sincroniza automáticamente; cada dispositivo mantiene su copia; la recuperación depende de que la familia exporte y custodie respaldos. | **Recomendada temporalmente**, porque no hay una necesidad multi-dispositivo confirmada y cambiarlo impactaría la operación y los datos existentes. |
| Servicio gestionado con PostgreSQL, Auth y RLS (Supabase como candidato) | Reduce trabajo de operar base de datos y ofrece integración de Auth/JWT con políticas RLS; puede facilitar colaboración familiar y acceso desde varios dispositivos. | Requiere diseño y pruebas de permisos por tabla/operación, invitaciones y recuperación, costos recurrentes, gestión de incidentes y disponibilidad, revisión de privacidad y términos, correo de autenticación, y un mecanismo offline/conflictos. RLS mal configurado o grants excesivos pueden exponer datos. | **Candidato para prototipo aislado**, solo después de confirmar requisitos y preparar DAT-003/CAL-001. No aprobado para producción. |
| Backend propio u otro proveedor administrado | Más control sobre APIs, autenticación, región, procesos y portabilidad según proveedor. | Mayor carga de desarrollo, monitoreo, parches, copias, seguridad, disponibilidad y respuesta operativa; comparar proveedores requiere requisitos que aún no existen. | No justificado hoy; reconsiderar únicamente si requisitos de privacidad, región, costo o operación descartan la opción gestionada. |

La opción “seguir local” no impide evaluar después un servicio remoto. Conserva el estado actual mientras se comprueba si los beneficios de compartir datos compensan la nueva complejidad y exposición.

## 3. Auth y autorización

La autenticación responde quién es la persona; la autorización define qué puede consultar o cambiar. Si se adopta un backend, los roles de la UI no bastarán: cada operación debe quedar limitada en servidor/base de datos y comprobarse con identidades ficticias de distintas familias.

Para el candidato Supabase, la documentación oficial indica que Auth emite JWT integrables con RLS; también advierte que RLS y grants son controles separados, que las tablas de esquemas expuestos deben protegerse con ambos y que las claves secretas o `service_role` no deben estar en el frontend. Cada tabla expuesta requeriría políticas específicas de lectura, inserción, actualización y borrado, grants de mínimo privilegio y pruebas que confirmen tanto accesos permitidos como denegados. Ver referencias oficiales al final.

Antes de elegir el proveedor y los roles hay que definir: cómo se invita y revoca a un familiar; si un paciente pertenece a una o varias familias; quién ve medicinas, citas, enfermería, compras y pagos; qué funciones tiene cada rol; cómo se recupera una cuenta; qué pasa con dispositivos sin conexión después de revocar acceso; y cómo se conservan, exportan o eliminan datos. DAT-001 enumera estas decisiones abiertas. No se deben inferir permisos a partir de la propuesta de roles.

## 4. Costos, disponibilidad y operación

La página oficial de precios consultada presenta un plan Free y planes pagados; actualmente indica que los proyectos Free pueden pausarse tras una semana de inactividad y que Free no ofrece descarga de copias de la base de datos. La página presenta Pro desde USD 25/mes e incluye copias diarias con retención de siete días, con cómputo adicional sujeto a configuración. Estas cifras y condiciones pueden cambiar y no son una cotización para el uso de Acompaña. Para una evaluación posterior se deben recalcular en el momento de decidir, estimar usuarios/tráfico/almacenamiento/correo, impuestos y tipo de cambio, y comparar el costo total con la operación actual.

Un prototipo gratuito no equivale a una base confiable para datos familiares de producción. Deben definirse RPO/RTO aceptables, copias fuera del proveedor cuando proceda, restauraciones probadas, monitoreo, soporte, responsables de incidentes y plan de salida/portabilidad. La guía oficial de producción recomienda revisar RLS en todas las tablas expuestas, grants, SSL/red, autenticación y respaldos; la lista concreta de controles dependerá del despliegue finalmente elegido.

No se concluye aquí cumplimiento legal, residencia adecuada de datos ni elegibilidad para tratar datos de salud. Antes de procesar datos reales se deben revisar jurisdicción, responsabilidades, aviso/consentimiento aplicable, contrato de tratamiento, subencargados, ubicación, retención y obligaciones del servicio con asesoría apropiada. El proyecto no ha proporcionado esos requisitos.

## 5. Privacidad y amenazas principales

- **Acceso cruzado entre familias:** mitigarlo con claves foráneas que incluyan familia cuando corresponda, grants mínimos, RLS en todas las tablas expuestas y pruebas negativas desde otra familia.
- **Permiso excesivo o revocado tardíamente:** definir sesiones, caducidad/renovación, revocación y comportamiento offline; no confiar en controles visuales ni claims desactualizados sin analizar el riesgo.
- **Filtración de secretos:** nunca incluir claves privilegiadas en frontend, repositorio o archivos compartidos; guardar secretos en el entorno de servidor y rotarlos ante exposición.
- **Pérdida o corrupción:** exportaciones verificables, respaldos del proveedor y copia independiente según requisitos, más simulacros de restauración.
- **Cambios de inventario simultáneos:** diseñar operaciones idempotentes y reglas de conflicto; “última escritura gana” puede perder movimientos o descontar dos veces.
- **Cuenta comprometida o recuperación abusiva:** limitar el flujo de recuperación, revisar MFA y alertas según riesgo; el propietario no debe ver contraseñas ajenas.
- **Dependencia de proveedor:** mantener esquema, exportación y ruta de salida documentados; probar formato de exportación utilizable fuera del servicio.

## 6. Recomendación y condiciones para reconsiderar

**Mantener ahora el almacenamiento local y el comportamiento actual.** No hay evidencia en el plan de que varias personas necesiten editar la misma información desde dispositivos distintos. Adoptar backend/Auth hoy trasladaría datos sensibles y transformaría acceso, respaldo, recuperación y trabajo offline antes de que esos requisitos estén acordados.

Reabrir la decisión cuando el usuario confirme una necesidad concreta, por ejemplo compartir cambios entre cuidadores en dispositivos diferentes. Antes de cualquier uso con datos reales se requeriría:

1. Definir roles, invitaciones, permisos por tipo de registro, revocación, retención, exportación/borrado y recuperación.
2. Elegir jurisdicción y evaluar privacidad, contratos, residencia, costos y responsable operativo.
3. Completar DAT-003: respaldo JSON real hecho por la familia y restauración comprobada, mapeo de datos y reversión documentada. Este requisito es una puerta previa a migrar; no se hizo ni se solicita ahora una exportación de datos reales.
4. Preparar entorno aislado, cuentas y registros totalmente ficticios; nunca importar datos reales al prototipo.
5. Implementar RLS/grants con mínimo privilegio y pruebas automatizadas de permitir/denegar por rol y por familia (CAL-001), más pruebas de recuperación, offline, conflictos y restauración.
6. Revisar resultados y obtener autorización explícita antes de activar el backend, autenticar usuarios o iniciar una migración.

Si se confirma la necesidad, Supabase/PostgreSQL puede ser un candidato a comparar mediante prototipo aislado, pero esta recomendación no selecciona proveedor ni plan.

## 7. Referencias oficiales consultadas el 2026-10-31

- [Supabase Auth](https://supabase.com/docs/guides/auth): autenticación y uso de JWT junto con RLS.
- [Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security): políticas, grants, tablas expuestas y pruebas de permisos.
- [Securing your data](https://supabase.com/docs/guides/database/secure-data): uso de claves publicables y prohibición de exponer claves secretas o `service_role` en el frontend.
- [Production Checklist](https://supabase.com/docs/guides/deployment/going-into-prod): controles de seguridad, disponibilidad, respaldos y operación.
- [Precios de Supabase](https://supabase.com/pricing): planes, cuotas y características vigentes al consultar; verificar nuevamente antes de decidir.
