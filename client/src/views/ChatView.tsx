import { useState, useEffect, useMemo } from 'react';
import styles from './ChatView.module.css';
import { sortChatList } from '../utils/chatOrder';
import type { Chat } from '../types';
import DefaultButton from '../components/DefaultButton';

// 1. TypeScript wants us to declare which "powers" (data) this view receives
interface ChatViewProps {
    chatList: Chat[];
    activeChatId: string;
    onChatClick: (chatId: string) => void; // Función para cambiar de chat
    onCreateNewChat: () => void;           // Función para crear un chat
    onDeleteChat: (chatId: string) => void; // Función para borrar un chat
    onReTitleChat: (chatId: string, newTitle: string) => void; // Función para renombrar un chat
    onTogglePin: (chatId: string) => void; // Fija o desfija un chat en lo alto de la lista
}

export default function ChatView({ chatList, activeChatId, onChatClick, onCreateNewChat, onDeleteChat, onReTitleChat, onTogglePin }: ChatViewProps) {
    // El orden es una vista sobre los datos, no una propiedad del array: chatList sigue en el
    // orden en que se fue llenando, y aquí se decide cómo se lee. Ponerlo al revés obligaría a
    // acordarse de reordenar en cada uno de los sitios que escriben la lista, y el primero que
    // se olvidara devolvería el desorden sin que nada avisara.
    const orderedChats = useMemo(() => sortChatList(chatList), [chatList]);

    // Estado para rastrear qué chat está esperando confirmación de borrado
    const [confirmingDeleteId, setConfirmingDeleteId] = useState<string | null>(null);

    // Estado para saber qué chat está en modo edición de título
    const [editingChatId, setEditingChatId] = useState<string | null>(null);
    // Estado temporal para guardar el texto que el usuario escribe en el input
    const [editTitle, setEditTitle] = useState('');
    // Which row has the overflow menu open. Touch has no hover, so the three-dot button
    // is the handle that reveals pencil, trash and pin. One row at a time.
    const [actionsOpenId, setActionsOpenId] = useState<string | null>(null);

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

    // El chat nuevo aún no está en la lista: si nada está activo, lo está la vista New Chat
    const isNewChatActive = !chatList.some((chat) => chat.id === activeChatId);

    return (
        <div className={styles.chatViewContainer}>
            <button
                className={styles.newChatButton}
                style={{ paddingLeft: isNewChatActive ? '6px' : '26px' }}
                onClick={() => {
                    setActionsOpenId(null);
                    onCreateNewChat();
                }}
            >
                {isNewChatActive && <div className={styles.point}></div>}
                New Chat
            </button>
            {/* Usamos .map() en lugar de .forEach() para imprimir el HTML */}
            {orderedChats.map((chat) => {
                // Preguntamos si este botón es el activo
                const isActive = chat.id === activeChatId;
                const isConfirming = confirmingDeleteId === chat.id;
                const isActionsOpen = actionsOpenId === chat.id;

                return (
                    <div
                        key={chat.id} // React necesita un "key" único cuando creas listas
                        className={[styles.chatButton, isActionsOpen ? styles.actionsOpen : '']
                            .filter(Boolean)
                            .join(' ')}
                        style={{
                            paddingLeft: isActive ? '6px' : '26px',
                        }}
                        onClick={() => {
                            setActionsOpenId(null);
                            onChatClick(chat.id);
                        }}
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
                        <div className={`${styles.buttonContainer} ${editingChatId === chat.id || isConfirming ? styles.buttonContainerVisible : ''}`}>
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
                                aria-label={editingChatId === chat.id ? 'Confirm rename' : 'Rename chat'}
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
                        <div className={`${styles.pinSlot} ${chat.pinned ? styles.pinSlotVisible : ''}`}>
                            <DefaultButton
                                className={styles.optionsButton}
                                onClick={(e) => {
                                    e.stopPropagation();
                                    onTogglePin(chat.id);
                                }}
                                aria-label={chat.pinned ? 'Unpin chat' : 'Pin chat'}
                                iconId="icon-pin"
                                size={22}
                                iconSize={14}
                            />
                        </div>
                        <div className={styles.overflowSlot}>
                            <DefaultButton
                                className={`${styles.optionsButton}${isActionsOpen ? ` ${styles.overflowButtonOpen}` : ''}`}
                                onClick={(e) => {
                                    e.stopPropagation();
                                    setActionsOpenId((openId) => (openId === chat.id ? null : chat.id));
                                }}
                                aria-label={isActionsOpen ? 'Close chat actions' : 'Chat actions'}
                                iconId="icon-options"
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