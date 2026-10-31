# AUD-003 — Auditoría de seguridad y privacidad

**Alcance:** revisión estática de la implementación en `development`, seguida por las correcciones AUD-004–AUD-010. Se utilizaron únicamente datos ficticios en las pruebas locales. Esta auditoría no constituye una prueba de penetración ni una evaluación legal.

## Hallazgos y mitigación

| ID | Hallazgo original | Estado tras AUD-004–AUD-010 |
|---|---|---|
| AUD-003-01 | Las notificaciones podían mostrar nombres, medicamentos, pagos y citas. | Mitigado: el cuerpo solo identifica categorías generales de pendientes; los momentos y condiciones de generación no cambiaron. |
| AUD-003-02 | Los datos en `localStorage` no tienen cifrado propio. | Riesgo inherente documentado en la guía. No se añadió cifrado ni se cambió `pastillas-v1` o el esquema. El acceso al perfil o código del mismo origen puede revelar datos. |
| AUD-003-03 | Importación JSON sin límite visible de tamaño. | Mitigado: se rechazan archivos mayores a 10 MiB antes de iniciar `FileReader`. |
| AUD-003-04 | WhatsApp y Google Calendar reciben información cuando la persona continúa al servicio. | Mitigado parcialmente: los diálogos muestran el contenido editable y requieren una acción expresa para abrir el servicio. La información aún se transmite si el usuario continúa. |
| AUD-003-05 | Un respaldo antiguo o equivocado puede reemplazar todos los datos locales. | Mitigado parcialmente: se muestran conteos y fecha solo si está presente y válida, se ofrece exportar el estado legible actual y se mantiene una confirmación final separada. Los respaldos existentes no contienen fecha de exportación, por lo que se indica que no está incluida. |
| AUD-003-06 | El service worker almacenaba cualquier respuesta GET del mismo origen. | Mitigado: solo recursos estáticos conocidos se consultan/guardan. La caché vigente usa `acompanha-v9`; la activación limpia versiones bajo el prefijo `acompanha-` y la caché legada conocida `cuidados-v8`, preservando las demás cachés del origen. `/` y `/index.html` se precargan y sirven offline. |
| AUD-003-07 | Google Fonts recibe solicitudes del navegador y no forma parte del precaché. | Corregido y verificado: Nunito variable y SIL OFL 1.1 incluidos localmente, declarados con `@font-face` y precargados offline. No hay dependencia de Google Fonts para la tipografía. |

## Medición del límite JSON

Se serializaron en memoria respaldos sintéticos, con registros ficticios y campos representativos del modelo actual:

| Fixture sintético | Tamaño JSON |
|---|---:|
| 2 personas, 40 medicinas, 10 citas | 9.3 KiB |
| 5 personas, 250 medicinas, 50 citas | 55.5 KiB |
| 10 personas, 1,000 medicinas, 200 citas | 220.2 KiB |

El límite de 10 MiB es aproximadamente 46 veces el mayor fixture medido. Es un margen inicial amplio para respaldos con contenido de texto; no es un límite comprobado contra todos los usos futuros. Si los respaldos reales legítimos se aproximan al límite, deberá reconsiderarse con fixtures adicionales antes de elevarlo.

## Controles y riesgos residuales

- La validación de estructura, migración y escritura protegida previa se conserva. La vista previa no modifica almacenamiento; la escritura ocurre solo tras la segunda confirmación.
- La vista previa utiliza conteos de listas ya validadas. `exportedAt` solo se presenta como fecha si tiene formato y fecha válidos; el exportador no añade ese campo y no se alteró el formato de respaldo.
- En modo protegido, el botón de exportar los datos actuales queda desactivado porque el estado leído no se considera confiable. Se conserva la posibilidad de restaurar un archivo validado.
- El caché offline contiene la respuesta de `/`, `index.html`, JavaScript, CSS, manifiesto e iconos estáticos. La tipografía externa puede no estar disponible offline y el navegador usará las alternativas de sistema.
- Un límite de archivo no garantiza que el dispositivo tenga memoria o cuota suficiente para toda operación local. No se simularon fallos físicos ni cierres durante escrituras.
- No se añadió cifrado a almacenamiento ni respaldos. Los archivos JSON deben guardarse en ubicaciones privadas y protegidas.
- La previsualización de enlaces no impide que la persona continúe y comparta datos; hace visible y editable el contenido antes de abrir el proveedor externo.

## Estado AUD-004–AUD-010

- **AUD-004 — Completada:** texto de notificación genérico; se conservó una notificación diaria por el mismo criterio de pendientes y permiso.
- **AUD-005 — Completada:** límite de 10 MiB basado en medición sintética; comprobación antes de leer.
- **AUD-006 — Completada:** fecha opcional validada, conteos y recomendación/exportación previa cuando el estado local es legible; confirmación explícita final.
- **AUD-007 — Completada y verificada en AUD-012:** prefijo propio `acompanha-`, transición segura desde `cuidados-v8`, preservación de cachés ajenas, recursos estáticos permitidos y navegación offline en `/` y `/index.html`.
- **AUD-008 — Completada y verificada en AUD-012:** se probó el clic del enlace Calendar renderizado, edición, confirmación, URL resultante y cancelación sin apertura.
- **AUD-009 — Completada:** guía documenta `localStorage`, perfil compartido y custodia del respaldo.
- **AUD-010 — Completada y verificada:** `fonts/Nunito[wght].ttf` (276,932 bytes; SHA-256 `BB55A5CA5C2042335B3991AF27C4D0705D0EF41CAC6164AC737FD8F2A1E85207`) y `fonts/OFL.txt` (4,384 bytes; SHA-256 `EE9491AD3EA5D390878695BD6CCE49BEB3CACD5C4312F8AB574B541E9F7AFA21`), obtenidos del origen oficial y commit indicado abajo. Se eliminó un espacio final accidental del archivo de licencia; el texto de la licencia no cambia.

## Fuente de licencia de Nunito

La metadata oficial de [Google Fonts](https://github.com/google/fonts/blob/main/ofl/nunito/METADATA.pb) fija el repositorio `googlefonts/nunito`, commit `8c6a9bb9732545b9ed53f29ec5e1ab0ff53c4e6f`, archivo variable `fonts/variable/Nunito[wght].ttf` y `OFL.txt`. Ambos se descargaron desde `raw.githubusercontent.com` en ese commit. La licencia incluida es SIL Open Font License 1.1; no se alteró el archivo de licencia.

## Pruebas y limitaciones

El historial de cambios registra los comandos realmente ejecutados y sus resultados. Las pruebas son sintéticas y locales. La instalación/actualización/offline de PWA se comprobó en Chromium aislado con servidor de loopback; la actualización fue simulada. No se inspeccionó el despliegue público ni se realizaron pruebas contra producción.

## Seguimiento de cierre técnico — 2026-10-31

AUD-010 se verificó con la metadata oficial y el binario/licencia locales. `@font-face` usa la fuente variable con pesos 200–1000; `sw.js` la incluye en el precaché. La prueba de navegador carga Nunito desde caché offline en `/` e `/index.html` y confirma que no se solicitaron recursos de Google Fonts. AUD-011 y AUD-012 se revisaron contra el código y la suite; sus defectos confirmados están cubiertos. Los hallazgos de privacidad local siguen como riesgos residuales; no se cifró almacenamiento ni respaldo. El responsable aceptó expresamente esos riesgos el 2026-10-31 para el contexto familiar y controlado actual. Esa aceptación no autoriza reducir controles ni publicar para acceso público general; véase el registro en `ARQUITECTURA.md` y el historial.

## Riesgos residuales y decisión registrada

| Riesgo | Impacto plausible | Estado y decisión requerida |
|---|---|---|
| `localStorage` sin cifrado propio | Una persona con acceso al perfil desbloqueado o código del mismo origen puede leer o alterar nombres y datos personales/de cuidado. | Riesgo aceptado únicamente para el uso familiar y controlado actual. Cifrado/autenticación o cambios estructurales quedan fuera de este cierre. |
| Respaldo JSON sin cifrado | Cualquier persona que obtenga el archivo puede leer su contenido completo. | Riesgo aceptado únicamente para el uso familiar y controlado actual; mantener custodia privada del archivo. |
| Compartición con proveedores | Al confirmar, el contenido que la persona revisó se entrega a WhatsApp o Google Calendar, bajo las condiciones de esos servicios. | Consentimiento explícito por flujo; no implica control de retención ni cifrado por Acompaña después de la entrega. |
| Aplicación local/offline sin cuentas | No hay autenticación, autorización, aislamiento familiar ni sincronización/backend. | Límite arquitectónico conocido; no se añade esa capacidad en esta tarea. Requiere decisión separada si cambia el modelo. |

El navegador/sistema operativo protegen el perfil según sus controles (cuenta de usuario, bloqueo y cifrado de disco si están habilitados); Acompaña no proporciona cifrado de datos en reposo. El funcionamiento offline tampoco constituye respaldo. No se probó la configuración del dispositivo ni del deployment. La aceptación no equivale a evaluación legal ni se extiende a publicación abierta.

### Estado consolidado

AUD-004–AUD-010 tienen corrección verificada donde corresponde; AUD-011 conservó su dictamen inicial y los hallazgos P2 se resolvieron en AUD-012, cuya revisión independiente aparece en su sección 13. No se encontraron defectos P1/P2 conocidos pendientes dentro del alcance comprobado. El estado es **ETAPA TÉCNICAMENTE COMPLETA; RIESGOS ACEPTADOS PARA USO FAMILIAR Y CONTROLADO**. La evaluación específica de seguridad, privacidad y cumplimiento será requisito previo a una eventual publicación pública.
