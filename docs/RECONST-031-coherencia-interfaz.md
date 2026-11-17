# RECONST-031 · Coherencia visual y Configuración

Fecha: 17/11/2026. Base: `79451a4`. Petición específica del propietario: usar Inicio como referencia del acceso, unificar iconos de contorno, revisar centrado y mejorar Configuración.

## Alcance y resultado

Se ajustaron `backend/index.html`, `backend/pilot.css` y `backend/pilot.mjs`. El acceso utiliza la tarjeta y los colores crema/petróleo de Inicio. Los siete enlaces de navegación tienen SVG decorativos del mismo tamaño, trazo y color heredado, sin dependencias externas; se conservan las etiquetas legibles. Inicio y Configuración comparten cabecera con emblema, alineación y jerarquía. El último enlace del menú ocupa la fila completa para evitar una celda aislada a la izquierda. Los títulos y resúmenes se centran; etiquetas y datos conservan alineación de lectura.

Configuración separa Tus familias, Accesos temporales, Invitaciones de cuentas existentes y Tu cuenta. Crear familia y aceptar invitación pasan a desplegables. Sin familia, el alta se abre automáticamente; las cuentas temporales no ven esos desplegables ni la administración. Se conservan IDs, formularios, handlers, validaciones y permisos. No hay cambios de esquema, servicios, reglas financieras ni persistencia.

## Verificación

- `npm test` en backend: **54/54**. Incluye acceso temporal, aislamiento, revocación, recuperación, cuotas, correo, inventario, calendario y equivalencia financiera.
- `node --test tests/payments.spec.js tests/persistence.spec.js`: **102/102**, con Edge y fixtures aislados, incluyendo respaldos, concurrencia y operación offline de la PWA existente.
- Compilación estática: **18 recursos públicos**, con lista cerrada de publicación. Sintaxis de `pilot.mjs` y `git diff --check` correctos.
- Navegador integrado: entrada y cierre de sesión con fixture; creación de familia y ficha ficticias; Inicio actualiza el contador y conserva los 30 días del calendario. Los siete apartados se recorrieron a 320 px sin desbordamiento de página. Configuración se revisó a 390 px y 1440 px; siete iconos SVG de menú presentes y grupos administrativos dentro de su contenedor de permisos.
- Se detectó un servidor de ensayo previo que no servía `account-recovery.mjs` (404). Se reinició con las rutas actuales y el recorrido pasó. Era un proceso local antiguo, no un fallo del despliegue real. No se modificó el esquema ni se enviaron correos reales.

La captura de ensayo permanece fuera de Git en `backend/supabase/.temp/settings-refined-mobile.jpg`. Los datos son ficticios. La revisión de este lote no repite una recuperación real ni todas las acciones de nube; conserva la evidencia real e iPhone del [lote anterior](RECONST-030-integracion-real.md). La PWA histórica sigue offline; la candidata conectada aún requiere conexión.

El estado del despliegue se registra por separado en el historial después de comprobar la URL de development. Main no forma parte de este lote.
