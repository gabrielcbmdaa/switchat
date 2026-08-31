import type { Chat } from '../types';

// chatList en localStorage es solo para modo offline: los chats online viven en
// React state + MongoDB y no deben escribirse aquí. El chat activo NO sigue esta
// regla —es una preferencia de UI y se guarda siempre—, por eso vive en
// utils/uiPreferences.ts y no en este módulo.
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

// 3. Función para guardar (ahora requiere que le pasemos los datos desde fuera)
export function saveToLocalDisk(chatList: Chat[]) {
    localStorage.setItem('chatList', JSON.stringify(chatList));
}
