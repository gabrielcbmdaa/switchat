import type { Chat } from '../types';

export function getTutorialChat(): Chat[] {
    return [{
        id: 'tutorial-welcome',
        title: "🚀 Welcome & Tutorial",
        draft: '',
        messages: [
            {
                role: "model",
                parts: [{ text: "¡Hola! Bienvenido a tu conector local de Gemini. Para empezar a chatear gratis, primero necesitas configurar tu **API Key**." }]
            },
            {
                role: "model",
                parts: [{ text: "Ve al menú **Config** (abajo a la derecha) y pega tu clave de Google AI Studio. ¡Te espero aquí para empezar!" }]
            }
        ]
    }];
}

// 2. Funciones para leer de LocalStorage al iniciar la app
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