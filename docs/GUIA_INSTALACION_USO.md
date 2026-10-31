# Guía de instalación y uso de Acompaña

**Alcance:** guía inicial basada en la interfaz y el código revisados en `development`; no sustituye una prueba guiada con usuarios. No contiene datos médicos de ejemplo.

## Abrir e instalar

1. Abre la dirección oficial de la aplicación desde un navegador compatible: https://pastillas-1.vercel.app/.
2. Si el navegador ofrece instalar o agregar la aplicación a la pantalla de inicio, puedes usar esa opción. El nombre del menú cambia según navegador, sistema operativo y versión; si no aparece, abre la aplicación en una pestaña normal. La instalación no sincroniza datos entre dispositivos.
3. Usa el mismo navegador y perfil donde ya guardas los datos. El contenido local de un perfil no se comparte automáticamente con otro navegador, otro perfil ni otro dispositivo.

## Organización básica

- La aplicación inicia con dos fichas locales de personas. Selecciona la ficha correspondiente antes de añadir o editar información; cambiar de ficha cambia el contexto de las vistas.
- En **Inicio** se muestran resúmenes y pendientes derivados de la información capturada.
- En **Medicinas** se administran medicinas e insumos, existencias, consumos, compras y precios según los controles disponibles. Revisa los datos antes de guardar; los avisos de reposición son estimaciones de inventario.
- En **Pagos** se consultan asignaciones, citas y cobertura administrativa según los registros guardados.
- Las notificaciones disponibles dependen de que la aplicación se abra, del navegador y de un permiso previamente concedido. No equivalen a un servicio de alertas que funcione siempre en segundo plano.
- WhatsApp y Calendar se abren como servicios externos cuando se usan sus accesos; la aplicación no sincroniza automáticamente calendarios ni mensajes.

## Respaldar y restaurar

1. Usa la opción de exportar respaldo desde la aplicación y guarda el JSON en una ubicación privada que controles.
2. Conserva una copia original sin editar. No publiques ni envíes el archivo por chats o correo; puede contener información de cuidado.
3. Para restaurarlo, elige el JSON desde la opción de importación y revisa la confirmación. Restaurar reemplaza toda la información local del perfil actual por el contenido del archivo.
4. Si no estás seguro de que el archivo sea correcto, cancela. No uses una importación para combinar datos de dispositivos distintos.

La exportación y restauración sintéticas se probaron en el navegador aislado descrito en DAT-003. Eso no demuestra que un respaldo particular de una familia esté completo ni sustituye una copia custodiada por sus responsables.

## Uso sin conexión y límites

La PWA precarga recursos de la aplicación para uso sin conexión, pero no hay sincronización entre dispositivos ni copia remota confirmada. El navegador puede limitar almacenamiento local; no uses el funcionamiento offline como único respaldo. Si cambias de dispositivo o perfil, restaura únicamente desde un respaldo que controles y hayas verificado.

## Despliegue: evidencia y verificación del propietario

### Configuración comprobada

- El repositorio público es `SantiagoArroyoBr/Mis_Pastillas`. GitHub reporta `main` como su rama predeterminada.
- Los metadatos públicos de GitHub y el README registran `https://pastillas-1.vercel.app/` como homepage/aplicación. Los documentos del proyecto identifican Vercel como proveedor previsto.
- El commit `92c4034085e13bb38fd0a7ff2622c46ef797873d` es la punta observada de la rama Git `main` durante esta revisión. Es un SHA de Git; no es evidencia de que ese commit esté desplegado.
- En el checkout revisado no hay `vercel.json`, `.vercel/project.json`, directorio `.github` ni workflows de GitHub versionados. No hay configuración local que identifique un proyecto Vercel, su rama de producción o el proceso de publicación.

### Verificación comunicada por el propietario

El 2026-10-31, el propietario confirmó haber revisado en Vercel los cinco puntos siguientes y que son correctos:

| Punto | Resultado comunicado | Detalle no compartido |
|---|---|---|
| Proyecto Vercel | Identificado | Nombre/ID y equipo/cuenta no incluidos en esta guía. |
| Repositorio conectado | Conexión correcta | GitHub identifica el repositorio como `SantiagoArroyoBr/Mis_Pastillas`. |
| Rama de producción | Configurada correctamente | El nombre exacto de la rama no fue comunicado; no se infiere de la rama predeterminada de GitHub. |
| Deployment actual | Identificado y funcionando | No se proporcionó su SHA ni la etiqueta técnica exacta de estado. |
| Dominio y reversión | Dominio asignado correctamente; opción de reversión disponible | El dominio público indicado por el repositorio es `https://pastillas-1.vercel.app/`; no se compartieron otros aliases ni detalles de elegibilidad. |

Este registro refleja la confirmación del propietario; Codex no tuvo acceso al panel para comprobarla de forma independiente. El SHA de `main` no se usa como sustituto del SHA de producción.

### Inferencia técnica general

La documentación de Vercel indica que `main` suele ser la rama inicial de producción cuando no existe una sobrescritura, y que cada proyecto puede cambiarla en **Settings → Environments → Production → Branch Tracking** ([conexión Git y rama de producción](https://vercel.com/docs/git)). Para este proyecto, la rama se registra como verificada por el propietario; su nombre exacto no se comunicó.

### Datos no registrados y verificación futura

El equipo/cuenta y nombre o ID del proyecto, SHA del deployment y etiqueta técnica exacta del estado no se registraron aquí. El conector de GitHub no permitió consultar Deployments/Environments y la herramienta de lectura web no abrió la URL pública. No se inició sesión ni se cambió configuración.

La confirmación del propietario cierra esta revisión documental de DOC-002. Para futuras auditorías, la evidencia se puede volver a comprobar en modo de solo lectura en el proyecto correcto de Vercel:

1. En **Settings → Git**, verificar que el repositorio conectado sea `SantiagoArroyoBr/Mis_Pastillas`.
2. En **Settings → Environments → Production → Branch Tracking**, anotar la rama que está configurada. No inferirla del default de GitHub.
3. En **Deployments**, identificar la deployment marcada como actual/current para el dominio de producción; registrar URL/dominio, estado, rama y SHA completo del commit de origen. Vercel describe `Current` como la deployment enlazada al dominio que se sirve actualmente ([promoción y estado de deployments](https://vercel.com/docs/deployments/promoting-a-deployment)).
4. Sin iniciar una nueva deployment, comprobar que el dominio señalado corresponda a esa deployment actual y registrar fecha/hora, estado visible y SHA. Mantener esta revisión libre de datos reales de familias.
5. Confirmar con el responsable del proyecto quién verifica el resultado y quién puede autorizar una reversión. No registrar secretos, variables de entorno ni tokens en documentación.

### Reversión documentada; no ejecutada

La documentación oficial de Vercel describe **Instant Rollback** desde la tarjeta de Production Deployment del proyecto o desde el menú de una deployment anterior. El propietario debe comprobar el dominio afectado y seleccionar una deployment que Vercel permita revertir antes de confirmar. La reversión reasigna el dominio a una deployment existente; no revierte commits de Git ni actualiza variables de entorno. Vercel también indica que tras Instant Rollback se desactiva la asignación automática de dominios para nuevos pushes; para restaurarla hay que deshacer el rollback promoviendo una deployment ([Instant Rollback](https://vercel.com/docs/instant-rollback)).

Este es un procedimiento de referencia, no una autorización para ejecutarlo. El propietario debe confirmar acceso, elegibilidad, impacto de dominios/entorno y pasos vigentes en la cuenta del proyecto. No se ejecutaron rollback, promoción ni despliegue durante esta revisión.
