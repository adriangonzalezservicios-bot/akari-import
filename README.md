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

## Límites
No puedo crear la hoja de Google ni desplegar Cloudflare/Firebase en tu cuenta desde este archivo; esas conexiones requieren que inicies sesión en tus cuentas y aceptes permisos. Una vez completados los pasos, el código persiste datos en Sheets y no en el navegador.
