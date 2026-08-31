import { useEffect, useRef, useState, useCallback } from 'react';
import styles from './MessageView.module.css'
import MessageBubble from '../components/MessageBubble';
import PromptInput from '../components/PromptInput';
import DefaultButton from '../components/DefaultButton';
import TemplatePicker from '../components/TemplatePicker';
import { CHAT_TEMPLATES } from '../config/chatTemplates';
import type { Message } from '../types';

interface MessageViewProps {
    messages: Message[];
    chatId: string;
    isNewChat?: boolean;
    hasMoreMap: Record<string, boolean>;
    loadedChatIds: Record<string, boolean>;
    onLoadMore: () => void;
    onDeleteMessage: (messageIndex: number) => void;
    onRetryMessage: (messageIndex: number) => void;
    onSaveMessage?: (messageIndex: number, text: string) => void;
    onSaveAndReply?: (messageIndex: number, text: string) => void;
    token: string | null;
    draft: string;
    onDraftChange: (draft: string) => void;
    onSendMessage: () => void;
    isGenerating?: boolean;
    onStopGeneration?: () => void;
    isLeftSidebarOpen?: boolean;
    isRightSidebarOpen?: boolean;
    onToggleLeftSidebar?: () => void;
    onToggleRightSidebar?: () => void;
    onUseTemplate?: (templateId: string) => void;
}

export default function MessageView({
    messages,
    chatId,
    isNewChat = false,
    hasMoreMap,
    loadedChatIds,
    onLoadMore,
    onDeleteMessage,
    onRetryMessage,
    onSaveMessage,
    onSaveAndReply,
    token,
    draft,
    onDraftChange,
    onSendMessage,
    isGenerating = false,
    onStopGeneration,
    isLeftSidebarOpen = true,
    isRightSidebarOpen = false,
    onToggleLeftSidebar,
    onToggleRightSidebar,
    onUseTemplate,
}: MessageViewProps) {
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
    const hasMessages = messages.length > 0;
    // Determinar si hay más mensajes que cargar
    // Si hay sesión (token), nos guiamos por el mapa del servidor. Si no, por el total local.
    // Un chat sin mensajes nunca tiene historial anterior que pedir.
    const hasMoreMessages = hasMessages && (token ? (hasMoreMap[chatId] !== false) : (visibleCount < messages.length));
    // Online los mensajes llegan por fetch diferido: mientras no sepamos si el chat
    // tiene historial, no podemos afirmar que esté vacío (si no, parpadea la vista vacía).
    // Un chat nuevo no tiene nada que esperar: nunca ha existido en el servidor.
    const isAwaitingHistory = Boolean(token) && !hasMessages && !isNewChat && !loadedChatIds[chatId];
    const showEmptyState = !hasMessages && !isAwaitingHistory;
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

    const promptInput = (
        <PromptInput
            draft={draft}
            onDraftChange={onDraftChange}
            onSendMessage={onSendMessage}
            isGenerating={isGenerating}
            onStopGeneration={onStopGeneration}
            onHeightChange={handlePromptHeightChange}
            variant={showEmptyState ? 'centered' : 'docked'}
        />
    );

    return (
        <div className={styles.messageViewWrapper}>
            <DefaultButton
                className={`${styles.toggleBtn} ${styles.toggleBtnLeft}`}
                onClick={onToggleLeftSidebar || (() => {})}
                iconId={isLeftSidebarOpen ? "icon-chevron-left" : "icon-chevron-right"}
                size={30}
                iconSize={16}
                title={isLeftSidebarOpen ? "Hide the left sidebar" : "Show the left sidebar"}
            />

            <DefaultButton
                className={`${styles.toggleBtn} ${styles.toggleBtnRight}`}
                onClick={onToggleRightSidebar || (() => {})}
                iconId={isRightSidebarOpen ? "icon-chevron-right" : "icon-chevron-left"}
                size={30}
                iconSize={16}
                title={isRightSidebarOpen ? "Hide the right sidebar" : "Show the right sidebar"}
            />

            {showEmptyState ? (
                <div className={styles.emptyStateContainer}>
                    <h1 className={styles.emptyStateTitle}>Switchat</h1>
                    <p className={styles.emptyStateSubtitle}>What are you thinking about?</p>
                    <TemplatePicker templates={CHAT_TEMPLATES} onSelect={onUseTemplate || (() => { })} />
                    {promptInput}
                </div>
            ) : (
                <>
                    <div
                        ref={containerRef}
                        className={styles.messageViewContainer}
                        onScroll={handleScroll}
                        style={{ paddingBottom: promptHeight + 16 }}
                    >
                        {visibleMessages.map((msg, index) => {
                            // Calcular el índice real en el array completo de messages
                            const realIndex = token ? index : (messages.length - visibleMessages.length + index);
                            return (
                                <MessageBubble
                                    key={msg._id
                                        ? `${msg._id}:${msg.role}`
                                        : `${msg.role}:${msg.createdAt ?? `orphan-${index}`}`}
                                    msg={msg}
                                    isUser={msg.role === 'user'}
                                    onDelete={() => onDeleteMessage(realIndex)}
                                    onRetry={() => onRetryMessage(realIndex)}
                                    onSave={onSaveMessage ? (text) => onSaveMessage(realIndex, text) : undefined}
                                    onSaveAndReply={onSaveAndReply ? (text) => onSaveAndReply(realIndex, text) : undefined}
                                    editDisabled={isGenerating || Boolean(token && msg.role === 'user' && !msg._id)}
                                />
                            );
                        })}
                    </div>
                    {promptInput}
                </>
            )}
        </div>
    );
}
