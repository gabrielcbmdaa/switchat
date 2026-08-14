---
name: switchat-design-system
description: Visual design system and style guide for the Switchat application (https://switchat.gabrielcbmd.com/). Documents the ultra-minimalist monochrome aesthetic, Space Grotesk typography, pill-shape components, CSS variables and Tailwind CSS configuration.
---

# 🎨 Switchat Design System (SKILL.md)

This document defines the complete visual language, the UI/UX architecture and the technical specifications of the **Switchat** frontend. It exists to guarantee visual consistency and to serve as an implementation guide for future projects and components.

---

## 1. Design Philosophy and Aesthetic

### **Overall Style**
- **Ultra-Minimalist Tactile Monochrome / Industrial Dark Mode**: A radically sober approach, free of loud gradients and complex shadows. It leans on a strictly monochrome palette (carbon `#191919` and neutral gray `#858585`), clean surfaces, thin dividers and softened borders (*Pill Shape Design*).

### **Visual Tone and Emotion**
- **Focus and Deep Concentration**: No distracting chromatic elements, no overloaded animations.
- **Retro-Futurist / Modern Terminal Tone**: Pairing the variable-width *Space Grotesk* typeface with *monospace* details projects speed, technical clarity and artificial intelligence.
- **Discreet Elegance and High Density**: Compact 300px panels, clean 1px borders and direct contrast inversion on interaction.

### **UI/UX Principles**
1. **Active Contrast Inversion**: Interactive elements (buttons, inputs, list items) move from a subtle base state (`transparent` / `#191919` with `#858585` text) to a high-contrast inverted active state (`background: #858585` with `#191919` or `#000000` text).
2. **Capsule Geometry (Pill-Shape Consistency)**: Every interaction container, button and input takes a `border-radius` of `20px` or `30px`.
3. **Thin Structural Division**: Screen and section boundaries are defined with `1px solid #858585` or `#333333` borders, complemented by dynamic 3px dividers (`.resizer`) with a `col-resize` cursor.
4. **Contextual Visibility**: Secondary actions (such as deleting, editing or modifying messages/chats) stay hidden (`opacity: 0`, `visibility: hidden`) and are revealed progressively on `hover`.

---

## 2. Color Palette

| Category | Token Name | HEX / RGBA Code | Use & Description |
| :--- | :--- | :--- | :--- |
| **Base Background** | `--bg-primary` | `#191919` | Main background for the canvas, sidebars, modals and chat surfaces. |
| **Borders & Secondary Text** | `--color-neutral` | `#858585` | Base color for text, main (1px) borders, scrollbar and icons. |
| **Subtle Borders / Headers** | `--border-subtle` | `#333333` | Header dividers and section bottom borders. |
| **Active / Inverse Text** | `--color-inverse` | `#191919` / `#000000` | Text color while the element is in its `:hover` or `:active` state. |
| **Overlay / Transparencies** | `--bg-glass-subtle` | `rgba(255, 255, 255, 0.05)` | Backgrounds for secondary buttons (e.g. *Load More*). |
| **Glass Overlay Border** | `--border-glass` | `rgba(255, 255, 255, 0.1)` | Subtle borders for translucent elements. |
| **Glass Hover Text** | `--text-bright` | `#ffffff` | Text color on hover over glassmorphic elements. |

### **Selection and Scroll Effects**
- **Text selection (`::selection`)**: `background-color: #858585; color: #191919;`
- **Scrollbar Thumb**: `width: 6px`, `background: #858585`, `border-radius: 10px`. Track `transparent`.

---

## 3. Typography and Hierarchy

### **Type Families**
- **Primary (UI & Messages)**: `'Space Grotesk', sans-serif` (Google Font loaded with weights 300 to 700).
- **Secondary (API Keys & Data)**: `monospace` (for secret keys, identifiers and code fragments).

### **Type Scale**

| Element | Font | Size | Weight (`font-weight`) | Line height (`line-height`) | Color |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Headers (H1/H2)** | Space Grotesk | `15px` - `16px` | `500` (Medium) | `1.2` | `#858585` |
| **Labels / Nav items** | Space Grotesk | `14px` | `500` / `400` | `1.4` | `#858585` |
| **Body (Messages / Chat)**| Space Grotesk | `14px` | `400` (Regular) | `1.5` | `#858585` |
| **Inputs & Textareas** | Space Grotesk | `14px` | `400` (Regular) | `1.5` | `#858585` |
| **Code / API Keys** | Monospace | `13px` | `400` (Regular) | `1.4` | `#858585` |
| **Badges & Micro Buttons**| Space Grotesk / Mono| `10px` - `13px` | `500` | `1.0` | `#858585` |

---

## 4. Components and Visual Patterns

### **Buttons (`DefaultButton`, `newChatButton`, `sendButton`, `btnToolbar`)**
- **Base Style**: `background-color: transparent` (or `#191919`), `color: #858585`, `border: 1px solid #858585` (or `border: none`), `border-radius: 20px` or `30px`.
- **Hover**: Full color inversion: `background-color: #858585; color: #191919;` (or `#000000`).
- **Active / Press**: `transform: scale(0.93)` on primary action buttons (such as the send-message button).
- **Disabled**: `cursor: not-allowed`.
- **Transition**: `transition: background 0.5s` or `transition: background-color 0.3s ease, color 0.3s ease, transform 0.15s ease`.

### **Cards and Containers (`promptInputContainer`, `dropdownList`, `settings-section`)**
- **Main Containers**: `background-color: #191919`, `border: 1px solid #858585`, `border-radius: 20px`.
- **Side Panels**: Fixed or flexible width with `width: 300px`, `min-width: 300px`, `border-left: 1px solid #858585`.
- **Resizing Divider (`.resizer`)**: `3px` wide, `border-left: 1px solid #858585`, `cursor: col-resize`. While dragging (`:active`) it is highlighted with `background-color: #858585`.

### **Inputs and Forms (`DefaultInput`, `promptTextarea`, `searchBox`)**
- **Standard Inputs**: `height: 30px`, `border-radius: 20px`, `padding: 0 10px`, `background: transparent`, `border: 1px solid #858585`, `color: #858585`, `outline: none`.
- **Multi-line Prompts (`promptTextarea`)**: `background: transparent`, `border: none`, `resize: none`, `line-height: 1.5`, `min-height: 24px`, `max-height: 400px`.
- **Inline Editing (`editInput`)**: `background: transparent`, `border: none`, `border-bottom: 1px solid #858585`.

### **Sliders (`reasoningSlider`)**
- **Track**: `height: 6px`, `border-radius: 3px`, `background: #858585`.
- **Thumb**: Circular `18px x 18px`, `border-radius: 50%`, `background: #191919`, `border: 2px solid #858585`. On click (`:active`) it scales to `scale(1.1)`.

### **Transitions and Micro-animations**
- **Color inversion**: Smooth transition from `0.3s` to `0.5s`.
- **Hidden Hover Actions**: Action containers (`.messageActions`, `.buttonContainer`) are revealed smoothly through `opacity: 1` with `transition: opacity 0.2s ease-in-out`.

---

## 5. CSS / Tailwind Variables (Ready-to-use code)

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

### **Tailwind CSS Configuration (`tailwind.config.js`)**

> ⚠️ Switchat itself does not use Tailwind — it styles the client with the CSS variables above and `client/src/index.css`. This block is here for future projects that want to reuse the same visual language; do not read it as a description of this repository.

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
