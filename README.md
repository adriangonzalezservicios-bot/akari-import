# AKARI IMPORT — Catálogo de Productos y Panel de Administración (React + Vite)

Aplicación web moderna desarrollada en **React 18**, **TypeScript**, **Vite** y **Firebase Auth**, migrada a partir del catálogo original de Akari Import.

## Características y Funcionalidades

- **Catálogo Online Interactivo:**
  - Visualización completa de productos con SKU, nombre, descripción, precio y estado de stock (unidades disponibles o "Sin stock").
  - Galería de productos con soporte para vista ampliada (Zoom modal) de imágenes.
  - Buscador reactivo por texto y código SKU con botón para limpiar búsqueda.
  - Filtro por categorías dinámicas ordenadas alfabéticamente.
  - Ordenamiento por Nombre A–Z, Precio menor a mayor y Precio mayor a menor.
  - Precios minoristas públicos y lista de precios mayoristas con acceso para revendedores autorizados.

- **Carrito de Pedidos y Conexión con WhatsApp:**
  - Carrito deslizable (Slide-over drawer) con control de cantidades (+, −), eliminación y cálculo automático de total estimado.
  - Formulario con nombre o razón social y notas adicionales de entrega.
  - Registro del pedido en el backend (`createOrder`) con generación de número de pedido (`AK-XXXXXX`).
  - Generación de mensaje formateado listo para confirmar vía WhatsApp con el número oficial (+54 9 11 3367-2920).

- **Autenticación y Roles (Firebase Auth):**
  - Modal de inicio de sesión con correo y contraseña.
  - Detección automática de roles: Administrador y Revendedor mayorista.
  - Desbloqueo dinámico de precios mayoristas en todo el catálogo.

- **Panel de Administración Integrado:**
  - **Pestaña Productos:** Alta y edición de productos, stock, imágenes y publicación.
  - **Edición Masiva:** Aplicar cambios de publicación (publicar/ocultar), categoría, stock (cantidad o agotado), y ajustes porcentuales o fijos en precios minoristas y mayoristas.
  - **Importación / Exportación Excel (.xlsx):** Descargar la planilla actual y cargar lotes de productos directamente desde Excel.
  - **Fotos por SKU:** Asignación automática de imágenes al hacer coincidir el nombre de archivo con el SKU del producto.
  - **Pestaña Pedidos:** Registro histórico de pedidos con seguimiento de estados (Pendiente, Confirmado, En preparación, Entregado, Cancelado) y desglose de artículos.
  - **Pestaña Revendedores:** Gestión de clientes mayoristas autorizados y generación de credenciales provisorias.
  - **Pestaña Historial:** Auditoría de acciones realizadas.

- **Resiliencia y Modo Offline:**
  - Caché local en `localStorage` para carga instantánea del catálogo.
  - Proxy con Google Apps Script backend (`apps-script/Code.gs`) y fallback automático a la base inicial de productos (`importar-productos.json`).

## Estructura del Proyecto

```text
├── assets/                     # Logotipo y placeholder estático
├── apps-script/                # Backend en Google Apps Script (Code.gs)
├── importar-productos.json     # Catálogo inicial de productos
├── src/
│   ├── components/             # Header, Hero, Catalog, CartDrawer, AdminPanel, etc.
│   ├── services/               # Firebase Auth y API client con fallback
│   ├── types/                  # Definiciones de TypeScript
│   ├── utils/                  # Formateador de moneda y WhatsApp builder
│   ├── index.css               # Estilos globales y diseño responsive
│   ├── App.tsx                 # Componente principal
│   └── main.tsx                # Punto de entrada React
├── index.html                  # HTML con meta tags y SEO
├── metadata.json               # Metadatos del applet en AI Studio
├── package.json                # Dependencias y scripts de desarrollo
├── tsconfig.json               # Configuración de TypeScript
└── vite.config.ts              # Configuración de Vite con proxy /api
```

## Ejecución y Construcción

- **Iniciar servidor de desarrollo:**
  ```bash
  npm run dev
  ```
  Inicia el servidor Vite en el puerto `3000` accesible desde `http://0.0.0.0:3000`.

- **Compilar para producción:**
  ```bash
  npm run build
  ```
