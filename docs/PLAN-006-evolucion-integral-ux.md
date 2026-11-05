# PLAN-006 — Evolución integral de UX

## CONS-008 — Alcance aprobado

Mejorar navegación móvil, jerarquía de Inicio, consulta histórica y superficies interactivas con vidrio sutil. Conservar cálculos y contenido crítico sobre superficies sólidas.

PREVIEW-005 publicó los cinco commits de PLAN-005A hasta `e27bea8` en development. El propietario declaró satisfactoria su revisión manual local. La comprobación funcional de Preview queda pendiente. URL conocida https://pastillas-1-git-development-dinamita20.vercel.app/.

## Diagnóstico y decisiones

Inicio reúne pendientes, calendario y citas en una columna. Medicinas concentra el selector y la gestión de fichas. Compras y precios viven dentro de cada medicamento o insumo. Los respaldos están al final de la página. Los abonos y cancelaciones ya tienen historial expandible.

Se añadirán accesos directos y encabezados de contexto. El archivo usa `p[i].archived` opcional, con ausencia equivalente a activa. Conserva posición, relaciones y datos. Oculta fichas del selector habitual y ofrece consulta de archivadas. Los avisos y saldos existentes conservan su alcance familiar. Archivar la última ficha mantiene un índice válido y abre la consulta de archivadas. La reactivación selecciona esa ficha. El guardado de estos cambios usa el estado candidato y la protección existente entre pestañas.

Los cuatro documentos pendientes anteriores quedan fuera de los commits de este ciclo. Las nuevas decisiones y resultados se registran aquí.

## Implementación y compatibilidad

Inicio incorpora Atención prioritaria, Resumen del cuidado y accesos a Medicinas/fichas, calendario, Pagos/historial y respaldos. Se conserva el cálculo existente de pendientes. La asignación del día se describe como registro. El selector de Medicinas ofrece activas y archivadas, con confirmación, reactivación y guardado antes de sustituir el estado en memoria. Las fichas archivadas siguen consultables y editables. Los avisos, citas y saldos mantienen su alcance familiar.

La restauración acepta respaldos anteriores sin marca de archivo. La marca nueva es booleana y se valida. Si todas las fichas se archivan se mantiene seleccionada una ficha válida en la consulta de archivadas. Una nueva ficha vuelve a la lista de activas. Se conservan los índices y las referencias de todos los módulos.

El historial de precios ahora expone todas las anotaciones dentro de un panel expandible, en orden inverso de captura. Los abonos y cancelaciones muestran el número de movimientos y explican su orden cronológico. Los movimientos conservan sus importes y referencias.

## Identidad y GLASS-001

Se conserva la paleta del proyecto. Nunito Sans y tres iconos Lucide se incluyen localmente con sus licencias y en la lista offline. La marca muestra Acompaña y el eslogan aprobado. El único desenfoque se aplica a los accesos rápidos de Inicio, a 4 px con fondo 92 % opaco. Formularios, errores, historial y saldos permanecen sobre superficies sólidas. CSS incluye fallback sólido, preferencias de transparencia y movimiento reducidos y colores forzados.

## QA-010 y límites

Resultado de la suite combinada **55/55**, con 8 pruebas unitarias y 47 de navegador. Sintaxis de 12 scripts, manifest JSON y revisión del diff satisfactorias.

Edge 156.0.4314.58 con perfil aislado y fixtures ficticios. Se incorporaron tres pruebas de archivo/reactivación y respaldo, fallos/cancelación/conflicto y presentación/historial/recursos. Se revisó reflujo a 320, 360, 375, 390, 430, 768 y 1280 px, preferencias reducidas, errores JavaScript y captura móvil. Se corrigió desbordamiento de controles de citas a 320 px. El servidor de pruebas recibió el tipo MIME SVG para verificar los iconos decodificados.

La protección DATA-001 mantiene su límite de detección preventiva entre pestañas. La compatibilidad se refiere a la aplicación actual leyendo respaldos anteriores y actuales. Una versión anterior puede ignorar la marca de archivo. Pendientes de revisión manual en dispositivos reales el zoom del navegador, lectores de pantalla, fluidez y memoria. La revisión efectuada no acredita conformidad integral WCAG 2.2 AA. Se mantiene una sola superficie con blur para acotar el costo gráfico.

## Validación manual pendiente

1. Revisar Inicio y sus cuatro accesos rápidos.
2. Cambiar de sección con teclado y verificar foco y estado activo.
3. Archivar, consultar y reactivar una ficha con registros ficticios.
4. Archivar todas, añadir una nueva y confirmar selección válida.
5. Consultar precios antiguos, abonos y cancelaciones.
6. Revisar Glass y su versión sólida con transparencia reducida.
7. Probar móvil, escritorio y zoom de 200 %.
8. Exportar, recargar y restaurar un respaldo con fichas archivadas.
9. Abrir offline después de cargar los recursos y comprobar navegación e iconos.

PREVIEW-005 recibió Vercel success. PLAN-006 queda para revisión manual local antes de una publicación adicional.
