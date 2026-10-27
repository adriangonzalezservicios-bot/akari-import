# AKARI IMPORT — Catálogo online para Cloudflare Pages + Google Sheets

## Qué incluye
- Catálogo online con SKU, nombre, descripción, miniaturas ampliables, búsqueda y categorías.
- Precios minoristas públicos; precios mayoristas únicamente para cuentas autorizadas.
- Carrito con cantidades y pedido registrado en Google Sheets antes de abrir WhatsApp (+54 9 11 3367-2920).
- Panel de administración: productos, importación, pedidos/estados, revendedores e historial.
- Google Sheets como base central. Los cambios se sincronizan entre dispositivos.
- No usa almacenamiento local para guardar productos ni pedidos.

## Importante sobre los datos de origen
Se incluye `importar-productos.json` con los 103 productos de la planilla “Lista_Unificada_Precios_Mayorista”. Se importan los precios mayoristas y minoristas que figuran en esa planilla. Siete productos no tenían SKU de origen; se les asignaron identificadores internos temporales `SIN-SKU-001` a `SIN-SKU-007`, que podés reemplazar por los SKU reales desde el panel. Las imágenes se dejan como placeholder porque la planilla no incluye URLs de fotos; cargá URLs HTTPS reales desde el panel antes de publicar. La mayoría de imágenes del archivo fuente eran placeholders; se pueden reemplazar desde el panel con URLs HTTPS reales.

## A. Crear Google Sheet
1. Creá una hoja de cálculo nueva en Google Drive.
2. Extensiones → Apps Script.
3. Reemplazá el contenido de `Code.gs` con el archivo de este paquete.
4. Ejecutá `setupAkari` desde el editor y aceptá los permisos. Se crean las pestañas Productos, Pedidos, Revendedores, Historial y Configuracion.
5. En Configuración del proyecto → Propiedades del script, agregá `FIREBASE_WEB_API_KEY` con la API Key web de tu proyecto Firebase y `ADMIN_EMAILS` con el correo administrador. Si hay varios administradores, separá los correos con comas.
6. Implementar → Nueva implementación → Aplicación web. Ejecutar como: **Yo**. Quién tiene acceso: **Cualquier persona**. Copiá la URL `/exec`. El acceso público al endpoint no expone los datos privados: el código verifica los tokens Firebase y el rol del lado del servidor. No compartas permisos de edición del Sheet con revendedores.

## B. Configurar Firebase Authentication
1. En Firebase Console creá un proyecto o usá uno existente.
2. Authentication → Sign-in method → activá Email/Password.
3. Agregá el dominio `tu-proyecto.pages.dev` a los dominios autorizados.
4. En Configuración del proyecto → Tus apps → Web, copiá la configuración en `firebase-config.js`.
5. Authentication → Users → agregá tu cuenta administradora con correo y contraseña. El correo debe coincidir con `ADMIN_EMAILS` en Apps Script.
6. Los revendedores también necesitan cuentas creadas en Firebase Authentication; luego se habilitan desde Panel → Revendedores usando el mismo correo. No hay registro público.

## C. Publicar en Cloudflare Pages
1. Subí todos los archivos de esta carpeta a la raíz de un repositorio GitHub nuevo.
2. Cloudflare → Workers & Pages → Create → Pages → Connect to Git.
3. Build command: vacío. Build output directory: `/` o `.` según la interfaz.
4. En Settings → Variables and Secrets, agregá `GOOGLE_APPS_SCRIPT_URL` con la URL `/exec` de Apps Script. Volvé a desplegar.
5. Abrí la web, iniciá sesión como admin y entrá al panel. Usá “Importar productos iniciales” y seleccioná `importar-productos.json`.

## D. Precios y fotos
- Los precios minoristas y mayoristas se toman de la planilla Excel suministrada. Verificá que sigan vigentes antes de publicar.
- Las fotos se actualizan desde el panel pegando una URL HTTPS. Para imágenes propias, subilas a un hosting de imágenes o almacenamiento y pegá el enlace público.
- El pedido se calcula de nuevo en el backend usando el precio vigente en Sheets, no el importe que mande el navegador.

## Seguridad y operación
- Firebase Web API Key es identificador público; la seguridad está en verificación de tokens, roles de backend y no compartir la hoja.
- `ADMIN_EMAILS` debe incluir al menos un correo administrador y mantenerse privado en las propiedades del script.
- Al crear revendedores, primero creá su cuenta en Firebase y luego habilitala en el panel.
- El historial registra modificaciones y pedidos. Google Sheets permite además usar Historial de versiones como respaldo.
- La URL de Apps Script es un endpoint público, pero las acciones privadas requieren token Firebase y rol autorizado.

## Despliegue en Cloudflare (Worker con archivos estáticos)
Este sitio se despliega como **Worker** (`wrangler.jsonc` + `worker.js`). `worker.js` atiende `/api` y reenvía al Google Apps Script; el resto lo sirven los archivos estáticos. La carpeta `functions/` de Cloudflare Pages no se usa en Workers.
- Deploy command en Cloudflare (Settings → Builds): `npx wrangler deploy`.
- Variable obligatoria: `GOOGLE_APPS_SCRIPT_URL` (Settings → Variables and Secrets del Worker), con la URL de Apps Script que termina en `/exec`.
- `.assetsignore` evita que se publiquen `importar-productos.json`, `README.md`, `worker.js` y `wrangler.jsonc`.

## Panel de administración (admin.html)
- **Revendedores con contraseña:** cargá correo + contraseña (botón "Generar" crea una segura). La cuenta se crea en Firebase y queda habilitada; el panel muestra los datos para copiar y enviar. Si la cuenta ya existe, su contraseña no se cambia: usá "Enviar enlace de nueva contraseña". Requiere en Firebase: Authentication → Settings → User actions → "Enable create (sign-up)" activado.
- **Fotos en bloque:** botón "Examinar…", elegí varias fotos nombradas con el SKU (`PIOTT002.jpg`). Se reducen a 900 px, se guardan en una carpeta de tu Google Drive ("Akari Import - Fotos de productos") y se asignan al producto. También hay un botón "Foto" en cada fila.
- **Modificación masiva:** tildá productos (hay filtros por texto, categoría, foto y estado) y aplicá categoría, publicar/ocultar y ajuste porcentual de precios con redondeo.
- Estas funciones requieren `apps-script/Code.gs` versión 3 en Apps Script: pegarlo, ejecutar `autorizarPermisos` una vez (pide permiso de Drive) y publicar una nueva versión de la implementación. `?action=health` debe mostrar `"version":3`.

## Diagnóstico rápido
- Abrí `URL_DE_APPS_SCRIPT/exec?action=health`: indica si están cargadas `FIREBASE_WEB_API_KEY` y `ADMIN_EMAILS`, si existen las 5 pestañas y cuántos productos hay (no muestra claves ni correos).
- Si el sitio dice "No se pudo cargar el catálogo", el texto entre paréntesis indica la causa: falta `GOOGLE_APPS_SCRIPT_URL` en Cloudflare (Production, y hay que volver a desplegar), la URL `/exec` está mal copiada, o la implementación de Apps Script no tiene acceso "Cualquier persona".
- Si entrás pero no llegás al panel, el cartel "No se pudo verificar tu cuenta" muestra el motivo; lo más común es que el correo de `ADMIN_EMAILS` no coincida exactamente con el usuario de Firebase.
- El catálogo queda vacío hasta importar `importar-productos.json` desde el panel (admin.html).
- Los logos deben estar en `assets/` (no en la raíz).

## Privacidad de precios mayoristas
`importar-productos.json` contiene precios mayoristas y todo archivo de la raíz se publica en el sitio. Después de importar los productos, borralo del repositorio (o guardalo fuera de él) y mantené el repositorio privado. No subas la planilla Excel de origen.

## Límites
No puedo crear la hoja de Google ni desplegar Cloudflare/Firebase en tu cuenta desde este archivo; esas conexiones requieren que inicies sesión en tus cuentas y aceptes permisos. Una vez completados los pasos, el código persiste datos en Sheets y no en el navegador.
