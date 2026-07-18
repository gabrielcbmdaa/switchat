import { useEffect, useRef, useState, useCallback } from 'react';
import styles from './MessageView.module.css'
import MessageBubble from '../components/MessageBubble';
import PromptInput from '../components/PromptInput';
import type { Message } from '../types';

interface MessageViewProps {
    messages: Message[];
    chatId: string;
    hasMoreMap: Record<string, boolean>;
    onLoadMore: () => void;
    onDeleteMessage: (messageIndex: number) => void;
    onRetryMessage: (messageIndex: number) => void;
    token: string | null;
    draft: string;
    onDraftChange: (draft: string) => void;
    onSendMessage: () => void;
}

export default function MessageView({ messages, chatId, hasMoreMap, onLoadMore, onDeleteMessage, onRetryMessage, token, draft, onDraftChange, onSendMessage }: MessageViewProps) {
    const [visibleCount, setVisibleCount] = useState(6);
    const [promptHeight, setPromptHeight] = useState(58); // Altura inicial estimada del prompt
    const containerRef = useRef<HTMLDivElement>(null);
    const prevMessagesRef = useRef<Message[]>([]);
    const prevMessagesLengthRef = useRef(messages.length);
    const hasScrolledRef = useRef(false);

    const prevScrollHeightRef = useRef<number>(0);
    const prevScrollTopRef = useRef<number>(0);
    const isLoadingMoreRef = useRef<boolean>(false);

    // Incrementar visibleCount si llegan nuevos mensajes en el mismo chat (usuario escribe o responde Gemini)
    useEffect(() => {
        if (!token) {
            if (messages.length > prevMessagesLengthRef.current) {
                const added = messages.length - prevMessagesLengthRef.current;
                setVisibleCount(prev => prev + added);
            }
        }
        prevMessagesLengthRef.current = messages.length;
    }, [messages, token]);
    const visibleMessages = token ? messages : messages.slice(-visibleCount);
    // Determinar si hay más mensajes que cargar
    // Si hay sesión (token), nos guiamos por el mapa del servidor. Si no, por el total local.
    const hasMoreMessages = token ? (hasMoreMap[chatId] !== false) : (visibleCount < messages.length);
    // Función para solicitar más mensajes
    const loadMore = () => {
        if (!hasMoreMessages || isLoadingMoreRef.current) return;
        const container = containerRef.current;
        if (container) {
            prevScrollHeightRef.current = container.scrollHeight;
            prevScrollTopRef.current = container.scrollTop;
            isLoadingMoreRef.current = true;
        }
        if (token) {
            // Online: pedimos al servidor
            onLoadMore();
        } else {
            // Offline: incrementamos localmente
            setVisibleCount(prev => Math.min(prev + 6, messages.length));
        }
    };
    // Detectar scroll en el contenedor
    const handleScroll = () => {
        const container = containerRef.current;
        if (!container) return;
        // Si llega arriba y hay más por cargar, cargamos más automáticamente
        if (container.scrollTop <= 300 && hasMoreMessages) {
            loadMore();
        }
    };
    useEffect(() => {
        const container = containerRef.current;
        if (!container || messages.length === 0) {
            prevMessagesRef.current = messages;
            return;
        }
        const prev = prevMessagesRef.current;
        const isSameChat = prev.length > 0 && prev[0] === messages[0];
        if (isLoadingMoreRef.current) {
            // Si estábamos cargando más mensajes, ajustamos el scroll para que no salte
            const diff = container.scrollHeight - prevScrollHeightRef.current;
            container.scrollTop = prevScrollTopRef.current + diff;
            isLoadingMoreRef.current = false;
        } else {
            // Si es un chat nuevo o ha llegado un mensaje nuevo al final, hacemos scroll al final
            const hasNewMessage = messages.length > prev.length;
            const behavior = (hasScrolledRef.current && isSameChat && hasNewMessage) ? 'smooth' : 'auto';
            if (!isSameChat || hasNewMessage) {
                setTimeout(() => {
                    if (containerRef.current) {
                        containerRef.current.scrollTo({
                            top: containerRef.current.scrollHeight,
                            behavior
                        });
                    }
                }, 0);
            }
        }
        hasScrolledRef.current = true;
        prevMessagesRef.current = messages;
    }, [visibleMessages, chatId, messages]);

    // Callback que recibe la altura del PromptInput cada vez que cambia
    const handlePromptHeightChange = useCallback((height: number) => {
        // Antes de actualizar, verificamos si el usuario está cerca del fondo
        const container = containerRef.current;
        if (container) {
            const distanceFromBottom = container.scrollHeight - container.scrollTop - container.clientHeight;
            const isNearBottom = distanceFromBottom <= 200;

            setPromptHeight(height);

            // Solo hacemos scroll al fondo si el usuario ya estaba cerca del final
            if (isNearBottom) {
                setTimeout(() => {
                    if (containerRef.current) {
                        containerRef.current.scrollTo({
                            top: containerRef.current.scrollHeight,
                            behavior: 'smooth'
                        });
                    }
                }, 0);
            }
        } else {
            setPromptHeight(height);
        }
    }, []);

    return (
        <div className={styles.messageViewWrapper}>
            <div
                ref={containerRef}
                className={styles.messageViewContainer}
                onScroll={handleScroll}
                style={{ paddingBottom: promptHeight + 16 }}
            >
                {hasMoreMessages && (
                    <button className={styles.loadMoreButton} onClick={loadMore}>
                        Cargar mensajes anteriores
                    </button>
                )}
                {visibleMessages.map((msg, index) => {
                    // Calcular el índice real en el array completo de messages
                    const realIndex = token ? index : (messages.length - visibleCount + index);
                    return (
                        <MessageBubble
                            key={index}
                            msg={msg}
                            isUser={msg.role === 'user'}
                            onDelete={() => onDeleteMessage(realIndex)}
                            onRetry={() => onRetryMessage(realIndex)}
                        />
                    );
                })}
            </div>
            <PromptInput
                draft={draft}
                onDraftChange={onDraftChange}
                onSendMessage={onSendMessage}
                onHeightChange={handlePromptHeightChange}
            />
        </div>
    );
}
