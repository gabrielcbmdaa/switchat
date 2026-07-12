import styles from './Sidebar.module.css';
import type { Chat } from '../types';

// 1. TypeScript nos pide que le digamos qué "poderes" (datos) recibe esta barra lateral
interface SidebarProps {
    chatList: Chat[];
    activeChatId: string;
    onChatClick: (chatId: string) => void; // Función para cambiar de chat
    onCreateNewChat: () => void;           // Función para crear un chat
}

export default function Sidebar({ chatList, activeChatId, onChatClick, onCreateNewChat }: SidebarProps) {
    return (
        <div className={styles.sidebarContainer}>
            <button className={styles.chatBtn} onClick={onCreateNewChat}>
                + New Chat
            </button>
            {/* Usamos .map() en lugar de .forEach() para imprimir el HTML */}
            {chatList.map((chat) => {
                // Preguntamos si este botón es el activo
                const isActive = chat.id === activeChatId;

                return (
                    <button
                        key={chat.id} // React necesita un "key" único cuando creas listasx
                        className={styles.chatBtn}
                        style={{
                            paddingLeft: isActive ? '4px' : '24px',
                        }}
                        onClick={() => onChatClick(chat.id)} // Enganchamos el clic de selección
                    >
                        {/* Si es el activo, dibujamos el puntito usando el operador && */}
                        {isActive && <div className={styles.point}></div>}
                        {chat.title}
                    </button>
                );
            })}
        </div>
    );
}