---
name: switchat-design-system
description: Sistema de diseño visual y guía de estilo para la aplicación Switchat (https://switchat.gabrielcbmd.com/). Documenta la estética ultra-minimalista monocromática, tipografía Space Grotesk, componentes pill-shape, variables CSS y configuración de Tailwind CSS.
---

# 🎨 Switchat Design System (SKILL.md)

Este documento define el lenguaje visual completo, la arquitectura UI/UX y las especificaciones técnicas del frontend de **Switchat**. Diseñado para garantizar consistencia visual y servir como guía de implementación para futuros proyectos y componentes.

---

## 1. Filosofía de Diseño y Estética

### **Estilo General**
- **Monocromatismo Táctil Ultra-Minimalista / Industrial Dark Mode**: Un enfoque radicalmente sobrio, libre de gradientes estridentes y sombras complejas. Se apoya en una paleta estrictamente monocromática (carbono `#191919` y gris neutro `#858585`), superficies limpias, divisores finos y bordes suavizados (*Pill Shape Design*).

### **Tono Visual y Emociones**
- **Enfoque y Concentración Profunda**: Sin elementos cromáticos distractores ni animaciones recargadas.
- **Tono Retro-Futurista / Terminal Moderno**: La combinación de la tipografía de ancho variable *Space Grotesk* con detalles *monospace* proyecta velocidad, claridad técnica e inteligencia artificial.
- **Elegancia Discreta y Alta Densidad**: Paneles compactos de 300px, bordes limpios de 1px e inversión directa de contraste al interactuar.

### **Principios UI/UX**
1. **Inversión de Contraste Activa**: Los elementos interactivos (botones, inputs, items de lista) pasan de un estado base sutil (`transparent` / `#191919` con texto `#858585`) a un estado activo con alto contraste inverso (`background: #858585` con texto `#191919` o `#000000`).
2. **Geometría de Cúpsula (Pill-Shape Consistency)**: Todos los contenedores de interacción, botones e inputs adoptan un `border-radius` de `20px` o `30px`.
3. **División Estructural Fina**: Los límites de pantalla y secciones se definen mediante bordes de `1px solid #858585` o `#333333`, complementados por divisores dinámicos (`.resizer`) de 3px con cursor `col-resize`.
4. **Visibilidad Contextual**: Las acciones secundarias (como borrar, editar o modificar mensajes/chats) se mantienen ocultas (`opacity: 0`, `visibility: hidden`) y se revelan progresivamente mediante `hover`.

---

## 2. Paleta de Colores

| Categoría | Nombre de Token | Código HEX / RGBA | Uso & Descripción |
| :--- | :--- | :--- | :--- |
| **Fondo Base** | `--bg-primary` | `#191919` | Fondo principal del canvas, sidebars, modales y superficies de chat. |
| **Bordes & Texto Secundario** | `--color-neutral` | `#858585` | Color base para textos, bordes principales (1px), scrollbar e iconos. |
| **Bordes Sutiles / Headers** | `--border-subtle` | `#333333` | Divisores de encabezados y bordes inferiores de sección. |
| **Texto Activo / Inverso** | `--color-inverse` | `#191919` / `#000000` | Color del texto cuando el elemento está en estado `:hover` o `:active`. |
| **Overlay / Transparencias** | `--bg-glass-subtle` | `rgba(255, 255, 255, 0.05)` | Fondos de botones secundarios (ej. *Load More*). |
| **Borde Glass Overlay** | `--border-glass` | `rgba(255, 255, 255, 0.1)` | Bordes sutiles para elementos translúcidos. |
| **Texto Glass Hover** | `--text-bright` | `#ffffff` | Color de texto para hover sobre elementos glassmórficos. |

### **Efectos de Selección y Scroll**
- **Selección de texto (`::selection`)**: `background-color: #858585; color: #191919;`
- **Scrollbar Thumb**: `width: 6px`, `background: #858585`, `border-radius: 10px`. Track `transparent`.

---

## 3. Tipografía y Jerarquía

### **Familias Tipográficas**
- **Principal (UI & Mensajes)**: `'Space Grotesk', sans-serif` (Google Font cargada con pesos 300 a 700).
- **Secundaria (API Keys & Datos)**: `monospace` (Para claves secretas, identificadores y fragmentos de código).

### **Escala Tipográfica**

| Elemento | Fuente | Tamaño | Peso (`font-weight`) | Interlineado (`line-height`) | Color |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Headers (H1/H2)** | Space Grotesk | `15px` - `16px` | `500` (Medium) | `1.2` | `#858585` |
| **Labels / Nav items** | Space Grotesk | `14px` | `500` / `400` | `1.4` | `#858585` |
| **Body (Mensajes / Chat)**| Space Grotesk | `14px` | `400` (Regular) | `1.5` | `#858585` |
| **Inputs & Textareas** | Space Grotesk | `14px` | `400` (Regular) | `1.5` | `#858585` |
| **Code / API Keys** | Monospace | `13px` | `400` (Regular) | `1.4` | `#858585` |
| **Badges & Micro Buttons**| Space Grotesk / Mono| `10px` - `13px` | `500` | `1.0` | `#858585` |

---

## 4. Componentes y Patrones Visuales

### **Botones (`DefaultButton`, `newChatButton`, `sendButton`, `btnToolbar`)**
- **Estilo Base**: `background-color: transparent` (o `#191919`), `color: #858585`, `border: 1px solid #858585` (o `border: none`), `border-radius: 20px` o `30px`.
- **Hover**: Inversión completa de color: `background-color: #858585; color: #191919;` (o `#000000`).
- **Active / Press**: `transform: scale(0.93)` en botones de acción principal (como el botón de enviar mensaje).
- **Disabled**: `cursor: not-allowed`.
- **Transición**: `transition: background 0.5s` o `transition: background-color 0.3s ease, color 0.3s ease, transform 0.15s ease`.

### **Tarjetas y Contenedores (`promptInputContainer`, `dropdownList`, `settings-section`)**
- **Contenedores Principales**: `background-color: #191919`, `border: 1px solid #858585`, `border-radius: 20px`.
- **Paneles Laterales**: Ancho fijo o flexible con `width: 300px`, `min-width: 300px`, `border-left: 1px solid #858585`.
- **Divisor de Resizing (`.resizer`)**: Ancho de `3px`, `border-left: 1px solid #858585`, `cursor: col-resize`. Al arrastrar (`:active`), se resalta con `background-color: #858585`.

### **Inputs y Formularios (`DefaultInput`, `promptTextarea`, `searchBox`)**
- **Inputs Estándar**: `height: 30px`, `border-radius: 20px`, `padding: 0 10px`, `background: transparent`, `border: 1px solid #858585`, `color: #858585`, `outline: none`.
- **Prompts Multi-línea (`promptTextarea`)**: `background: transparent`, `border: none`, `resize: none`, `line-height: 1.5`, `min-height: 24px`, `max-height: 400px`.
- **Edición Inline (`editInput`)**: `background: transparent`, `border: none`, `border-bottom: 1px solid #858585`.

### **Sliders (`reasoningSlider`)**
- **Track**: `height: 6px`, `border-radius: 3px`, `background: #858585`.
- **Thumb**: Circular `18px x 18px`, `border-radius: 50%`, `background: #191919`, `border: 2px solid #858585`. Al hacer click (`:active`), escala a `scale(1.1)`.

### **Transiciones y Micro-animaciones**
- **Inversión de color**: Transición suave de `0.3s` a `0.5s`.
- **Acciones Hover Ocultas**: Los contenedores de acciones (`.messageActions`, `.buttonContainer`) se revelan suavemente mediante `opacity: 1` con `transition: opacity 0.2s ease-in-out`.

---

## 5. Variables CSS / Tailwind (Código listo para usar)

### **CSS Variables (`:root`)**

```css
@import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@300..700&display=swap');

:root {
  /* Colors */
  --bg-primary: #191919;
  --color-neutral: #858585;
  --border-subtle: #333333;
  --color-inverse: #191919;
  --color-inverse-dark: #000000;
  --bg-glass: rgba(255, 255, 255, 0.05);
  --border-glass: rgba(255, 255, 255, 0.1);
  
  /* Radii */
  --radius-sm: 4px;
  --radius-pill: 20px;
  --radius-pill-lg: 30px;
  --radius-full: 50%;

  /* Typography */
  --font-main: 'Space Grotesk', -apple-system, BlinkMacSystemFont, sans-serif;
  --font-mono: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;

  /* Transitions */
  --transition-fast: all 0.15s ease;
  --transition-normal: all 0.3s ease;
  --transition-color-invert: background-color 0.5s ease, color 0.5s ease;
}

/* Global Reset Base */
* {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
  font-family: var(--font-main);
  font-size: 14px;
  scrollbar-width: thin;
  scrollbar-color: var(--color-neutral) transparent;
}

body, #root {
  background-color: var(--bg-primary);
  color: var(--color-neutral);
}

::selection {
  background-color: var(--color-neutral);
  color: var(--color-inverse);
}

::-webkit-scrollbar {
  width: 6px;
  height: 6px;
}
::-webkit-scrollbar-track {
  background: transparent;
}
::-webkit-scrollbar-thumb {
  background: var(--color-neutral);
  border-radius: 10px;
}
```

---

### **Configuración Tailwind CSS (`tailwind.config.js`)**

```javascript
/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class',
  content: [
    './index.html',
    './src/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          bg: '#191919',
          neutral: '#858585',
          border: '#858585',
          subtle: '#333333',
          inverse: '#191919',
        },
      },
      fontFamily: {
        sans: ['"Space Grotesk"', 'sans-serif'],
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'Monaco', 'Consolas', 'monospace'],
      },
      borderRadius: {
        'pill': '20px',
        'pill-lg': '30px',
      },
      transitionProperty: {
        'colors-invert': 'background-color, color, border-color',
      },
    },
  },
  plugins: [],
};
```
