# QA-011 · Identidad de Acompaña en web e instalación

18/11/2026. Paquete local preparado sobre la candidata conectada. El objetivo es que la pestaña, el icono de inicio del teléfono y la identidad visible utilicen el mismo corazón de cuidado en petróleo, crema y terracota. No se modifican los datos, Auth ni los iconos de la PWA histórica en este sublote.

## Archivos

| Recurso | Uso |
| --- | --- |
| `backend/icons/acompana.svg` | Fuente vectorial e icono de pestaña con soporte SVG. |
| `backend/icons/favicon-32.png` | Alternativa raster 32×32 para pestañas. |
| `backend/icons/favicon-48.png` | Alternativa raster 48×48. |
| `backend/icons/apple-touch-icon.png` | Icono opaco 180×180 para acceso desde iPhone. |
| `backend/icons/icon-192.png` | Icono general de manifest, 192×192. |
| `backend/icons/icon-512.png` | Icono general de manifest, 512×512. |
| `backend/icons/icon-maskable-512.png` | Icono con fondo completo y zona segura maskable. |
| `backend/manifest.webmanifest` | Nombre, alcance, lanzamiento y variantes de iconos de la candidata. |
| `backend/icons/generate-icons.py` | Generador reproducible con Python/Pillow; no se publica como recurso de la app. |

El icono no depende de fuentes, servicios externos ni un texto diminuto. Los PNG tienen fondo opaco petróleo y modo RGB. Los trazos esenciales caben en el círculo central de radio 40 % del tamaño para máscaras de sistema. No se usa la misma declaración `purpose: any maskable`: las dos finalidades se distinguen en el manifest.

## Generación y verificación

Ejecutar `python backend/icons/generate-icons.py` con Python 3 y Pillow. En el equipo de revisión se utilizó Python 3.14 ya instalado, sin descargar dependencias. El generador usa la misma geometría cúbica del SVG, supersampling 4× y reducción Lanczos. La geometría se comprueba contra el círculo de seguridad.

Se verificaron seis PNG, sus tamaños, modo RGB, parseo JSON y existencia de todas las rutas del manifest. Se inspeccionaron visualmente el icono de 512 px y el favicon real de 32 px. La primera aproximación de trazo de Pillow generó picos; se corrigió con unión de discos de contorno redondo y se regeneraron todos los recursos. `git diff --check` correcto en las rutas asignadas.

## Integración preparada y aplicada

El lote completo QA-012 integró los recursos siguientes en el HTML, build y servidores; la salida conjunta es de **32 archivos públicos**. También comparte el icono en la PWA raíz, cuyo service worker pasa a v23. Los pasos siguientes conservan la referencia de integración del sublote; la prueba física queda pendiente.

En `backend/index.html`, dentro de head:

```html
<link rel="icon" href="/icons/acompana.svg" type="image/svg+xml">
<link rel="icon" href="/icons/favicon-32.png" type="image/png" sizes="32x32">
<link rel="icon" href="/icons/favicon-48.png" type="image/png" sizes="48x48">
<link rel="apple-touch-icon" href="/icons/apple-touch-icon.png" sizes="180x180">
<link rel="manifest" href="/manifest.webmanifest">
<meta name="apple-mobile-web-app-title" content="Acompaña">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="mobile-web-app-capable" content="yes">
```

Puede utilizarse el mismo SVG junto al título visible de Acompaña, con alt vacío cuando sea decorativo y el título ya diga su nombre. El asset no debe sustituir una etiqueta accesible por una imagen sin nombre.

`backend/build-preview.mjs` debe copiar explícitamente el manifest y los siete recursos de icono en su lista cerrada. No copiar el generador Python. Esto incrementa la salida anterior de 18 a **26 recursos públicos**, salvo otros archivos añadidos por los lotes paralelos.

`backend/server.mjs` y `backend/sandbox-server.mjs` deben servir esas rutas. MIME: SVG `image/svg+xml`, PNG `image/png`, manifest `application/manifest+json`. La CSP existente permite imágenes del mismo origen. No ampliar a dominios externos ni introducir claves.

## Límites y comprobaciones pendientes

- El manifest y los iconos no aportan por sí mismos operación offline ni sincronización; no anunciar esa capacidad hasta que el lote correspondiente la implemente y pruebe.
- No se probó instalación real en iPhone/Android ni actualización del icono de una instalación existente. El sistema y el navegador pueden conservar iconos anteriores; validar primero en una instalación de prueba. Cualquier reinstalación de la PWA histórica debe preservar antes su respaldo JSON y su recuperación comprobada.
- La PWA histórica tiene su manifest y service worker propios. Para cambiar su identidad hay que copiar/integrar los recursos en sus rutas, conservar su start_url/scope, versionar caché y comprobar actualización offline. No redirigir su manifest al de backend ni mezclar los orígenes de almacenamiento.
- El manifest conectada usa `id`, `start_url` y `scope` `/`, adecuados para el despliegue actual en la raíz del proyecto `acompana-piloto`. Un despliegue futuro bajo subruta exige ajustar esos valores y las rutas de iconos.

No hubo publicación, migración, modificación de main ni cambio de configuración del proveedor durante la preparación del paquete. El agente principal registra integración, prueba y publicación por separado.
