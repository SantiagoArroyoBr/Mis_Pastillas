# RECONST-032 · Fechas y revisión de interfaz móvil

18/11/2026. Base: `0f32723`. El propietario aportó tres capturas de iPhone donde Fecha de jornada, Fecha de abono individual y Fecha de abono general salen del borde derecho de sus tarjetas.

## Corrección

`backend/pilot.css` limita la caja de fechas y horas al ancho de su contenedor y normaliza su apariencia y editor WebKit. Se mantienen los tipos nativos, el calendario del sistema, las validaciones y los valores ISO; no se convierte la fecha en texto ni se cambia la lógica financiera. Se cubren también citas, vencimientos y fecha de inicio de pautas.

La revisión general incorpora controles de al menos 16 px de texto para evitar el zoom automático de entrada en iPhone, botones de envío completos en móvil, saltos de línea en etiquetas largas, encabezados y botones, área inferior segura y desplazamiento de tablas contenido en su marco. Los encabezados de las tablas conservan palabras completas; una tabla ancha puede desplazarse sin desplazar toda la página. No se oculta el desbordamiento de la página para disimularlo.

## Evidencia y límites

- Navegador integrado, datos ficticios y Auth simulado: siete apartados recorridos sin controles fuera de su padre ni desbordamiento de página a **320 y 390 px efectivos**. También se midieron tamaños mayores (853 y 1600 px efectivos). Se comprobó el ancho real, ya que el zoom del navegador hacía diferir el viewport solicitado.
- Campos de fecha financieros medidos con el mismo ancho que su etiqueta contenedora. Cita nueva desplegada y campos de fecha/hora visibles. Abono ficticio registrado con concepto largo y tabla revisada. Captura local fuera de Git: `backend/supabase/.temp/date-fields-mobile-fixed.jpg`.
- Durante la auditoría se encontró que el simulador no construía las relaciones `patients(name)` y `nurses(name)` de las jornadas, lo que interrumpía la vista al añadir datos. `backend/access-sandbox.mjs` ahora incorpora solo esas relaciones solicitadas de jornadas y pagos individuales, leyéndolas con el mismo usuario y RLS, sin credencial de servicio. La prueba existente verifica nombres relacionados y ausencia de datos para un propietario ajeno. No se altera el backend alojado.
- Suite conectada: **54/54**. Comprobación específica del simulador: **2/2**.
- Primera regresión PWA concurrente con SQL: **99/102**, tres tiempos de carga agotados. Repetida sin la carga SQL concurrente: **102/102**, incluidos respaldos, conflictos, pagos y recarga offline. No se cambiaron tiempos de espera ni pruebas para hacerlas pasar.
- Compilación estática: **18 recursos públicos**. `git diff --check` correcto.

Las fotos acreditan el defecto en iPhone; la corrección visual se comprobó en el navegador disponible, no en un iPhone físico ni en Safari remoto. Falta la confirmación del propietario en ese mismo teléfono tras actualizar el despliegue. Las suites y este recorrido no equivalen a una auditoría exhaustiva de todos los dispositivos o todos los estados posibles. No se modificaron esquema, datos reales, reglas de negocio ni main; no se enviaron correos.

Publicación y SHA se registran por separado en el historial cuando se comprueba Vercel.
