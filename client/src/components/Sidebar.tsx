import { useState, useEffect } from 'react';
import styles from './Sidebar.module.css';
import type { Chat } from '../types';
import DefaultButton from './DefaultButton';

// 1. TypeScript nos pide que le digamos qué "poderes" (datos) recibe esta barra lateral
interface SidebarProps {
    chatList: Chat[];
    activeChatId: string;
    onChatClick: (chatId: string) => void; // Función para cambiar de chat
    onCreateNewChat: () => void;           // Función para crear un chat
    onDeleteChat: (chatId: string) => void; // Función para borrar un chat
    onReTitleChat: (chatId: string, newTitle: string) => void; // Función para renombrar un chat
}

export default function Sidebar({ chatList, activeChatId, onChatClick, onCreateNewChat, onDeleteChat, onReTitleChat }: SidebarProps) {
    // Estado para rastrear qué chat está esperando confirmación de borrado
    const [confirmingDeleteId, setConfirmingDeleteId] = useState<string | null>(null);

    // Estado para saber qué chat está en modo edición de título
    const [editingChatId, setEditingChatId] = useState<string | null>(null);
    // Estado temporal para guardar el texto que el usuario escribe en el input
    const [editTitle, setEditTitle] = useState('');

    // Si estamos en modo "confirmación", arrancamos un cronómetro de 5 segundos para cancelar
    useEffect(() => {
        let timer: ReturnType<typeof setTimeout>;

        if (confirmingDeleteId) {
            timer = setTimeout(() => {
                setConfirmingDeleteId(null); // Volvemos a la normalidad
            }, 5000);
        }

        return () => clearTimeout(timer);
    }, [confirmingDeleteId]);

    // Función para confirmar la edición del título
    const confirmEdit = () => {
        if (!editingChatId) return;

        const trimmed = editTitle.trim();
        if (trimmed) {
            // Solo renombramos si el título no está vacío
            onReTitleChat(editingChatId, trimmed);
        }
        // Siempre salimos del modo edición (si estaba vacío, no se guardó)
        setEditingChatId(null);
    };

    // La función que decide qué hace el botón de basura
    const handleDeleteClick = (e: React.MouseEvent<HTMLButtonElement>, chatId: string) => {
        e.stopPropagation(); // Evitamos que el clic seleccione el chat

        if (confirmingDeleteId !== chatId) {
            setConfirmingDeleteId(chatId); // Primer clic: pedimos confirmación
        } else {
            onDeleteChat(chatId); // Segundo clic: borramos de verdad
            setConfirmingDeleteId(null); // Reiniciamos el estado
        }
    };

    return (
        <div className={styles.sidebarContainer}>
            <button className={styles.newChatButton} onClick={onCreateNewChat}>
                New Chat
            </button>
            {/* Usamos .map() en lugar de .forEach() para imprimir el HTML */}
            {chatList.map((chat) => {
                // Preguntamos si este botón es el activo
                const isActive = chat.id === activeChatId;
                const isConfirming = confirmingDeleteId === chat.id;

                return (
                    <div
                        key={chat.id} // React necesita un "key" único cuando creas listas
                        className={styles.chatButton}
                        style={{
                            paddingLeft: isActive ? '6px' : '26px',
                        }}
                        onClick={() => onChatClick(chat.id)} // Enganchamos el clic de selección
                    >
                        {/* Si es el activo, dibujamos el puntito usando el operador && */}
                        {isActive && <div className={styles.point}></div>}
                        <div className={styles.titleContainer}>
                            {editingChatId === chat.id ? (
                                <input
                                    id={`edit-chat-${chat.id}`}
                                    name="chatTitle"
                                    type="text"
                                    className={styles.editInput}
                                    value={editTitle}
                                    onChange={(e) => setEditTitle(e.target.value)}
                                    onClick={(e) => e.stopPropagation()}
                                    onBlur={confirmEdit}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter') {
                                            confirmEdit();
                                        } else if (e.key === 'Escape') {
                                            setEditingChatId(null);
                                        }
                                    }}
                                    autoFocus
                                />
                            ) : (
                                chat.title
                            )}
                        </div>
                        <div className={styles.buttonContainer}>
                            <DefaultButton
                                className={styles.optionsButton}
                                onMouseDown={(e) => {
                                    if (editingChatId === chat.id) {
                                        // Previene que el input dispare su onBlur antes de procesar este clic
                                        e.preventDefault();
                                    }
                                }}
                                onClick={(e) => {
                                    e.stopPropagation();
                                    if (editingChatId === chat.id) {
                                        // Si estamos editando, confirmamos y guardamos el título
                                        confirmEdit();
                                    } else {
                                        // Si no estamos editando, activamos el modo edición
                                        setEditingChatId(chat.id);
                                        setEditTitle(chat.title);
                                    }
                                }}
                                iconId={editingChatId === chat.id ? 'icon-confirm' : 'icon-pencil'}
                                size={22}
                                iconSize={14}
                            />
                            <DefaultButton
                                className={styles.optionsButton}
                                onClick={(e) => handleDeleteClick(e, chat.id)}
                                iconId={isConfirming ? 'icon-confirm' : 'icon-trash'}
                                size={22}
                                iconSize={14}
                            />
                        </div>
                    </div>
                );
            })}
        </div>
    );
}