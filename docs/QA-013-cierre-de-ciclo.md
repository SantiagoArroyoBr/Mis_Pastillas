# QA-013 · Pulido y revisión de cierre

18/11/2026, zona de trabajo México; la ejecución cruzó a 19/11 UTC. Base `a1a8150db3854a9075f2b34653e77bd0ce9be2c2`. Alcance autorizado: completar los cinco puntos de pulido recomendados y revisar defectos para cerrar el ciclo actual. Trabajo en development, conservando las cuatro propuestas ajenas.

## Resultado

Se completó el lote de interfaz y se corrigieron defectos de sesión y confirmación de operaciones encontrados durante la revisión. La aplicación queda preparada para seguir utilizándose como candidata controlada y para revisar su integración. No se declara equivalencia total offline, certificación de accesibilidad ni ausencia universal de defectos. Main y el corte de producción continúan separados.

El propietario confirmó **iPhone y Android** para el recorrido anterior de instalación, icono, sesión y consulta offline de QA-012. Es aprobación manual declarada; no se conocen modelos ni versiones, y no es una prueba de VoiceOver/TalkBack ni de los estilos nuevos de este lote.

## Defectos corregidos

| Hallazgo | Cambio y evidencia |
| --- | --- |
| Una renovación del token de la misma cuenta invalidaba lecturas en curso como 401 y podía cerrar borradores. | La generación ahora distingue rotación de token de cambio real de identidad/cierre. Prueba con lectura diferida mientras otra petición renueva. |
| Un fallo de red de una petición antigua podía recurrir a la caché de una sesión posterior y cambiar su estado offline. | Guardas antes de fallback y después de leer el cuerpo HTTP. Las respuestas antiguas se descartan sin devolver datos de la cuenta nueva. |
| Una verificación Auth/renovación antigua podía limpiar una cuenta posterior. | Guardas de identidad en reanudación, reconexión y refresh. La UI tampoco trata una respuesta marcada stale como cierre de la sesión actual. |
| Un cuerpo HTTP interrumpido carecía de tratamiento uniforme. | Una lectura 200 incompleta puede usar caché autorizada de la identidad vigente; un 401 sigue rechazándose y nunca usa caché. |
| Crear/restablecer acceso seguido de fallo de recarga ocultaba el resultado confirmado y el código recibido. | El código se presenta antes de recargar; el fallo posterior avisa que la operación ya ocurrió y que no debe repetirse. Dos pruebas específicas de confirmación frente a lectura fallida. |
| Renombrar, archivar/reactivar y revocar una cuenta cuidadora podían informar fallo después de una escritura confirmada. | Separación de guardado y recarga. Confirmación explícita antes de revocar; se conserva el resultado y se ofrece actualizar. Renombrado con recarga HTTP503 comprobado en navegador. |
| Campos requeridos con espacios solos llegaban al servidor; errores nativos no tenían explicación persistente junto al control. | Validación local sin modificar el dato histórico; mensaje asociado por aria-describedby y aria-invalid, limpiado al corregir o restablecer. Prueba de cero altas por nombre vacío/espacios. |
| Navegar entre pantallas no trasladaba el foco al contenido; controles pequeños y padding de checkbox dificultaban tocar. | Foco al título desde navegación y enlaces internos; etiquetas checkbox y desplegables con objetivo mínimo de 44px y margen de desplazamiento. |

No se cambiaron esquema, reglas de pagos, identidades históricas, `pastillas-v1`, confirmaciones de restauración o compartición. No hubo nuevos correos, credenciales ni operaciones sobre datos reales.

## Pulido de uso diario

- Progreso global de guardado/actualización, fuera de los contenedores aria-busy; evita anunciar una operación terminada antes de su resultado.
- Fecha de última actualización **completa**; un refresco fallido advierte que la vista puede estar desactualizada. Offline conserva un mensaje distinto, sin fingir una sincronización nueva.
- Estados vacíos de fichas/citas con el siguiente paso, sin inventar datos.
- Configuración explica el ámbito de la familia activa, diferencia invitación y acceso temporal, aclara el vencimiento según el dispositivo y enlaza Respaldo. Ayuda de dispositivo personal y preferencias de sesión.
- Respaldo local anterior etiquetado como tal; se conserva la separación respecto del JSON conectado.

## Matriz de comprobación

| Superficie | Comprobación y resultado |
| --- | --- |
| Cuenta y permisos | Suite conectada **95/95**: SQL/RLS, aislamiento, temporales, revocación, cuotas/correo simulado, recuperación, idempotencia y carreras de sesión. |
| Fichas y dos cuentas | Navegador: invitación y aceptación por segunda cuenta; edición remota provoca conflicto local y conserva el borrador; archivo/reactivación visible para ambas; revocación elimina lectura de la segunda cuenta. |
| Guardado incierto | Navegador pausa RPC y comprueba progreso/aria-busy. Escritura de nombre confirmada seguida de lectura503: formulario cerrado, advertencia correcta y servidor con el nombre nuevo. |
| Citas/calendario/inventario/pagos | Suites de dominio/SQL/cliente y regresión; historial20→25, montos se ocultan de nuevo, agenda y movimientos conservan filtros/relaciones. No se repitió cada operación en proveedor real. |
| Móvil y texto | Siete pantallas a **320, 390, 768 y 1280px**, más texto raíz al **200% a320px**: sin desbordamiento de documento. Tablas pueden desplazarse dentro de su contenedor. Checkbox ≥44px, foco de navegación comprobado. |
| Respaldo y offline | Copia restaurada conserva el dato previo y deja la familia original actualizada intacta. Sesión reanudada, consulta offline, bloqueo de formularios, reconexión, actualización real del SW, caché ajena conservada y limpieza privada al salir. |
| PWA anterior | Regresión conjunta **102/102** con Edge/perfil aislado: pagos, históricos, escritura fallida, concurrencia, JSON y offline. |
| Artefacto público | Build de **32 archivos**, lista cerrada; sin SQL, respaldos, pruebas ni generador. Sintaxis y diff correctos. |
| Dependencias | `npm audit --prefix backend --json`: **0 avisos** conocidos. No sustituye una auditoría de cadena de suministro. |

El recorrido integrado ampliado es **1/1**, con múltiples verificaciones en el mismo escenario y datos ficticios en PostgreSQL desechable. No sumar sus aserciones como pruebas independientes. Los ensayos iniciales detectaron sincronización insuficiente del propio test al cargar módulos/recargar SW y expectativa de nombre anterior; se corrigieron y se repitió el recorrido completo aprobado.

## Límites y cierre

1. **Escala:** historiales paginados; los catálogos de fichas, artículos, enfermería y accesos conservan lecturas sujetas al máximo de filas del proveedor. No se observó truncamiento en datos reales. Antes de familias de gran volumen, paginar catálogos y verificar sus selectores/cálculos.
2. **Offline:** sólo consulta opcional de lecturas previas con sesión vigente, sin escrituras ni comprobación remota de revocaciones; pagos/administración y temporales requieren red. No hay transición automática desde el JSON local.
3. **Accesibilidad:** probado foco, validación asociada, objetivos táctiles y reflujo; falta recorrido dedicado con VoiceOver/TalkBack físicos. La confirmación de instalación del propietario no se presenta como conformidad WCAG.
4. **Proveedor:** sandbox simula Auth/correo y un subconjunto PostgREST. No se hizo una nueva prueba de correo, recuperación real o penetración en nube en este cierre.
5. **P2 confirmado · Alta de enfermería:** `add_nurse` todavía carece de ticket de servidor; repetir el mismo payload crea dos IDs (fixture: dos200, dosfilas). No duplica automáticamente pagos/jornadas. Se añadió aviso explícito ante fallo de red/servidor para actualizar y revisar tarifas antes de repetir. La protección duradera de QA-012 cubre familias/fichas, no todas las altas. La corrección completa requiere un cambio de esquema con respaldo y pruebas; se registra para un ciclo posterior, sin introducir una migración adicional en este cierre.

Comandos: `npm test --prefix backend`; `npm run test:ui --prefix backend`; `node --test tests/payments.spec.js tests/persistence.spec.js`; `node backend/build-preview.mjs`; `npm audit --prefix backend --json`; `git diff --check`. Los navegadores corren con perfil temporal y acceso loopback autorizado. Captura ficticia ignorada: `backend/supabase/.temp/closing-settings.jpg`.

Publicación, SHA y CI remoto se registran por separado. Se cierra el lote implementable; las decisiones de integración a main/corte de producción permanecen fuera de este commit.
