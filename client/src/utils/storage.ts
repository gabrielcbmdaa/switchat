import type { Chat } from '../types';

export function getTutorialChat(): Chat[] {
    return [{
        id: 'tutorial-welcome',
        title: "🚀 Welcome & Tutorial",
        draft: '',
        messages: [
            {
                role: "model",
                parts: [{ text: "¡Hola! Bienvenido a **Switchat** — tu hub para chatear con varios LLMs desde un solo lugar.\n\nConecta **Google Gemini**, **Anthropic Claude**, **OpenAI ChatGPT**, **LM Studio** u **Ollama**, y cambia de modelo cuando quieras." }]
            },
            {
                role: "model",
                parts: [{ text: "## Cómo empezar en 1 minuto\n\n1. Abre **Settings** (barra inferior derecha).\n2. Pega tu API Key y pulsa guardar.\n3. Elige el proveedor: Google, Anthropic u OpenAI.\n4. Selecciona un modelo en la lista (o busca por ID).\n5. Crea un chat nuevo desde la barra izquierda y escribe.\n\nClaves: [Google AI Studio](https://aistudio.google.com/apikey) · [Anthropic Console](https://console.anthropic.com/settings/keys) · [OpenAI Platform](https://platform.openai.com/api-keys)." }]
            },
            {
                role: "model",
                parts: [{ text: "## Online vs Offline\n\n- **Sin sesión (Offline):** todo vive en tu navegador (`localStorage`). Las peticiones van directo al proveedor con tus keys.\n- **Con sesión (Online):** inicia sesión en **Account** (barra inferior izquierda). Tus chats se sincronizan con el servidor; las API Keys siguen solo en tu dispositivo y se envían por petición (no se guardan en la nube).\n\nPuedes usar Switchat completamente offline. La cuenta es opcional, para historial entre dispositivos." }]
            },
            {
                role: "model",
                parts: [{ text: "## Modelos, System Prompt y Reasoning\n\nEn **Settings** también puedes:\n\n- Cambiar el **modelo** activo (Gemini, Claude, GPT, o IDs locales).\n- Definir un **System Prompt** para tono, rol o reglas fijas.\n- Ajustar **Reasoning** (thinking) si el modelo lo soporta: más esfuerzo = respuestas más reflexivas, a costa de latencia/tokens.\n\nPara modelos locales, ten **LM Studio** u **Ollama** en marcha y elige un modelo compatible." }]
            },
            {
                role: "model",
                parts: [{ text: "## Chats, Notes y atajos útiles\n\n- **Chats:** lista a la izquierda — crea, renombra o elimina conversaciones.\n- **Notes:** panel a la derecha para apuntes. Selecciona texto en un mensaje → botón **Send to Notes**.\n- Los borradores del cuadro de mensaje se guardan por chat.\n\nCuando estés listo: configura tu key, abre un chat nuevo y escribe. Este tutorial puedes dejarlo o borrarlo cuando quieras. ¡A chatear!" }]
            }
        ]
    }];
}

// chatList / activeChatId en localStorage son solo para modo offline.
// Los chats online viven en React state + MongoDB; no deben escribirse aquí.
export function loadLocalChats(): Chat[] {
    const localData = localStorage.getItem('chatList');

    // 1. Si no hay nada en el disco (es null), frenamos y devolvemos un array vacío
    if (!localData) {
        return [];
    }

    // 2. Si pasó el filtro de arriba, TypeScript ya SABE con 100% de certeza 
    // que 'localData' es un string real. Ya no hay peligro de 'null'.
    return JSON.parse(localData) as Chat[];
}

export function loadLocalActiveChatId() {
    return localStorage.getItem('activeChatId') || '';
}

// 3. Función para guardar (ahora requiere que le pasemos los datos desde fuera)
export function saveToLocalDisk(chatList: Chat[], activeChatId: string) {
    localStorage.setItem('activeChatId', activeChatId);
    localStorage.setItem('chatList', JSON.stringify(chatList));
}

// 4. Notas: localStorage es la fuente de verdad, así que funciona aunque
// NotesView no esté montada (ej. al enviar texto desde el SelectionToolbar).
export function appendToNotes(text: string) {
    const prev = localStorage.getItem('switchat_notes') || '';
    const separator = prev.trim() ? '\n\n' : '';
    const updated = prev + separator + text;
    localStorage.setItem('switchat_notes', updated);
    window.dispatchEvent(new CustomEvent('sendToNotes', { detail: updated }));
    return updated;
}
