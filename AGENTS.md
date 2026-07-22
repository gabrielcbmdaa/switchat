# 🤖 Switchat — Contexto e Instrucciones para Agentes de IA

Este documento define el entorno de desarrollo, arquitectura Dual-Mode, esquemas y reglas de diseño para asistentes y agentes de Inteligencia Artificial que trabajen en este repositorio.

---

## 📌 1. Descripción del Proyecto

**Switchat** es una plataforma híbrida diseñada para conectar y gestionar conversaciones con múltiples Modelos de Lenguaje (LLMs), incluyendo **Google Gemini**, **OpenAI (ChatGPT)** y servidores de inferencia local a través de **LM Studio**.

### Arquitectura Dual-Mode:
- **Modo Online (Con Sesión):** Sincroniza chats, mensajes en tiempo real y borradores en **MongoDB Atlas** mediante el servidor Express con autenticación de contraseñas con `bcrypt` y cookies de sesión firmadas con `JWT`. Incluye una optimización de paginación incremental por cursor (`before` / `limit` de 6 mensajes) para un renderizado ultra-rápido de conversaciones largas.
- **Modo Offline (Sin Sesión):** Almacena todo localmente en `localStorage` del navegador y realiza peticiones de API directas hacia los proveedores utilizando las API Keys configuradas por el usuario.

---

## 🚀 2. Entorno de Desarrollo y Comandos (`pnpm`)

Este proyecto es un monorepo administrado con **`pnpm` workspaces**.

- **Instalar dependencias:** `pnpm install`
- **Modo Desarrollo Completo (Frontend + Backend):** `pnpm dev`
- **Modo Desarrollo (Solo Frontend - `http://localhost:5173`):** `pnpm dev:client`
- **Modo Desarrollo (Solo Backend - `http://localhost:3000`):** `pnpm dev:server`
- **Compilar cliente:** `pnpm build`
- **Ejecutar Linter:** `pnpm lint`

> ⚠️ **Regla de Oro:** Utiliza **siempre** `pnpm` y sus filtros (`pnpm --filter client ...`). **NO** uses `npm` ni `yarn`.

---

## 📂 3. Estructura de Directorios

```text
switchat/
├── client/                     # React 19 + TypeScript + Vite
│   ├── src/
│   │   ├── components/         # Componentes reutilizables (Sidebar, SvgIcons, Toolbar...)
│   │   ├── config/             # Configuraciones globales y constantes
│   │   ├── services/           # Servicios de integración API (api.ts para sync online)
│   │   ├── utils/              # Funciones auxiliares (resizer, storage helpers, etc.)
│   │   ├── views/              # Vistas principales (ChatView, MessageView, SettingsView, AccountView)
│   │   ├── App.tsx             # Punto de entrada UI y gestión de estado global
│   │   └── index.css           # Tokens de diseño y estilos globales
├── server/                     # Node.js + Express 5 + Mongoose
│   ├── controllers/            # Controladores de lógica (authController, chatController)
│   ├── middleware/             # Middleware de autorización (authMiddleware)
│   ├── models/                 # Modelos de base de datos Mongoose (User, Chat, Message)
│   ├── routes/                 # Rutas de API Express (authRoutes, chatRoutes)
│   └── server.js               # Inicio de servidor y conexión a MongoDB
└── .agents/skills/             # Habilidades y reglas específicas del proyecto
```

---

## ⚙️ 4. Configuración del Entorno (`server/.env`)

Para ejecutar el servidor localmente, asegúrate de contar con el archivo `server/.env` configurado según `server/.env.example`:
- `PORT`: Puerto de ejecución del servidor (por defecto `3000`).
- `MONGO_URI`: Cadena de conexión a la base de datos MongoDB Atlas o local.
- `JWT_SECRET`: Secreto de cifrado para tokens JWT de autenticación.
- `NODE_ENV`: Entorno de ejecución (`development` / `production`).

---

## 🎨 5. Sistema de Diseño Visual (Switchat Design System)

Al crear o modificar componentes de UI en `client/`, **es obligatorio respetar el lenguaje visual estricto**:

1. **Estética:** Monocromática táctil ultra-minimalista dark mode (sin gradientes ni colores estridentes).
2. **Paleta de Colores Básica:**
   - Fondo principal (`--bg-primary`): `#191919` (carbono).
   - Color neutral / Bordes / Textos (`--color-neutral`): `#858585` (gris neutro).
   - Divisores sutiles (`--border-subtle`): `#333333`.
3. **Tipografía:**
   - Principal (UI & Mensajes): `'Space Grotesk', sans-serif`.
   - Datos / Código / Keys: `ui-monospace, monospace`.
4. **Geometría Cápsula (Pill-Shape):**
   - Todos los inputs, botones y tarjetas interactivos usan `border-radius: 20px` o `30px`.
5. **Inversión de Contraste al Interactuar (Hover / Active):**
   - Los elementos interactivos pasan de fondo `#191919` / transparente con texto `#858585` a fondo `#858585` con texto `#191919` en hover.

> 📘 **Manual Completo:** Para revisar las variables CSS exactas, clases de Tailwind y ejemplos de componentes, consulta la habilidad en `.agents/skills/switchat-design-system/SKILL.md`.

---

## 📝 6. Convenciones de Código, Commits y Seguridad

- **TypeScript Estricto:** Mantén un tipado explícito en `client/src/types.ts`. Evita el uso de `any`.
- **Sincronización Dual:** Si modificas el almacenamiento de chats o mensajes, asegura la compatibilidad tanto para `localStorage` (Offline) como para `api.ts` (Online).
- **Commits:** Utiliza **Conventional Commits** (`feat: ...`, `fix: ...`, `refactor: ...`, `docs: ...`).
- **Seguridad:** NUNCA modifiques ni expongas claves o secretos almacenados en `.secrets/` o `.env`.
- **Verificación Obligatoria:** Ejecuta siempre `pnpm build` y `pnpm lint` para verificar tus cambios antes de declarar una tarea como finalizada.
