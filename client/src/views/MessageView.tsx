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
    const prevChatIdRef = useRef(chatId);

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
            // Online: ask the server for the page behind the cursor.
            onLoadMore();
        } else {
            // Offline: the next page is already in memory.
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
        // A finished answer replaces the temporary bubble with new objects, so the
        // first message's identity changes without the reader having switched chats.
        // Only a real chat change should force the view to the bottom.
        const chatChanged = prevChatIdRef.current !== chatId;
        prevChatIdRef.current = chatId;

        const container = containerRef.current;
        if (!container || messages.length === 0) {
            prevMessagesRef.current = messages;
            return;
        }
        const prev = prevMessagesRef.current;
        const isSameChat = prev.length > 0 && prev[0] === messages[0];
        if (isLoadingMoreRef.current) {
            // Older messages were prepended. Keep the viewport on the same line.
            const diff = container.scrollHeight - prevScrollHeightRef.current;
            container.scrollTop = prevScrollTopRef.current + diff;
            isLoadingMoreRef.current = false;
        } else {
            const hasNewMessage = messages.length > prev.length;
            // The answer being written does not add a message: the last one grows inside, so
            // its length is the only thing that moves. Without this the view stays where it
            // was and the text grows below the fold.
            const lastText = messages[messages.length - 1]?.parts[0]?.text ?? '';
            const prevLastText = prev.length === messages.length
                ? prev[prev.length - 1]?.parts[0]?.text ?? ''
                : '';
            const lastMessageGrew = isSameChat && !hasNewMessage && lastText.length > prevLastText.length;

            // Only if the user was already near the bottom: someone who scrolled up to reread
            // something should not be dragged down. Same 200 px threshold the prompt resizer
            // uses below.
            const scrollContainer = containerRef.current;
            const isNearBottom = !scrollContainer
                || scrollContainer.scrollHeight - scrollContainer.scrollTop - scrollContainer.clientHeight <= 200;

            // 'auto' while it is being written: a smooth scroll lasts longer than the 80 ms
            // batch, so at ~12 batches per second each animation would cancel the previous one.
            const behavior = lastMessageGrew
                ? 'auto'
                : ((hasScrolledRef.current && isSameChat && hasNewMessage) ? 'smooth' : 'auto');

            if (chatChanged || hasNewMessage || (lastMessageGrew && isNearBottom)) {
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

        // The scrollbar is the only gesture that asks for older messages, and it
        // only exists once the text overflows. A page of short messages never
        // overflows, so the history behind it would stay unreachable. Ask while
        // the page still fits. clientHeight 0 means layout has not happened yet.
        if (
            hasMoreMessages &&
            container.clientHeight > 0 &&
            container.scrollHeight <= container.clientHeight
        ) {
            loadMore();
        }
        // loadMore stays out of the dependency list on purpose: the parent builds
        // a new onLoadMore on every render, so listing it would ask again for the
        // same page whenever the screen re-renders and the text still fits.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [visibleMessages, chatId, messages, hasMoreMessages]);

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
                    {/* Only the new-chat view offers a starting point. A conversation that
                        exists and merely has no messages left is still that conversation:
                        a template started from inside it would build a second one. */}
                    {isNewChat && <TemplatePicker templates={CHAT_TEMPLATES} onSelect={onUseTemplate || (() => { })} />}
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
