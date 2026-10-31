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

## Despliegue y soporte

La dirección pública se documenta como aplicación alojada en Vercel. Este repositorio no contiene en esta guía un procedimiento de despliegue verificado, responsables de soporte, acceso al proyecto Vercel ni proceso aprobado de promoción. No seguir instrucciones de despliegue inferidas de este documento. La guía de despliegue queda pendiente de confirmar el flujo real con el propietario del proyecto; producción y `main` no se modifican aquí.
