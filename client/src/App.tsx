import { useState, useEffect, useRef } from 'react';
import type { Chat, Message } from './types';
import { loadLocalChats, loadLocalActiveChatId, saveToLocalDisk, getTutorialChat } from './utils/storage';
import { loadChatsFromServer, fetchChatResponse, generateChatTitle, saveChatToServer, syncChatDraftToServer, deleteChatFromServer, deleteMessageFromServer, fetchChatMessagesFromServer, checkSession, logoutFromServer } from './services/api';
import Sidebar from './components/Sidebar';
import { SvgIcons } from './components/SvgIcons';
import { initResizer } from './utils/resizer';
import Toolbar from './components/Toolbar';
import AccountView from './views/AccountView';
import SettingView from './views/SettingsView';
import MessageView from './views/MessageView';
import NotesView from './views/NotesView';
import DocsView from './views/DocsView';
import { loadDefaultModel, saveDefaultModel, resolveReasoningLevel } from './utils/modelPreferences';
import SelectionToolbar from './components/SelectionToolbar';
import { isMobileViewport, loadPanelView, savePanelView, loadPanelOpen, savePanelOpen } from './utils/uiPreferences';
import type { LeftPanelView, RightPanelView } from './utils/uiPreferences';

// El chat nuevo lleva su id real desde el principio: cuando se materialice al enviar
// el primer mensaje no hay que reasignar nada.
function createDraftChat(): Chat {
  return { id: 'chat-' + Date.now(), title: 'New conversation', messages: [], draft: '', model: loadDefaultModel() };
}

export default function App() {
  const [chatList, setChatList] = useState<Chat[]>([]);
  const [activeChatId, setActiveChatId] = useState<string>('');
  // La vista activa y el estado abierto/cerrado van por separado: así colapsar
  // un panel no olvida en qué vista estaba.
  const [leftPanelView, setLeftPanelView] = useState<LeftPanelView>(() => loadPanelView('left', 'chats'));
  const [rightPanelView, setRightPanelView] = useState<RightPanelView>(() => loadPanelView('right', 'settings'));
  // En móvil los paneles son drawers de 85vw: arrancan siempre cerrados para no tapar el chat.
  const [isLeftPanelOpen, setIsLeftPanelOpen] = useState<boolean>(() => !isMobileViewport() && loadPanelOpen('left', true));
  const [isRightPanelOpen, setIsRightPanelOpen] = useState<boolean>(() => !isMobileViewport() && loadPanelOpen('right', true));
  const activeLeftPanel = isLeftPanelOpen ? leftPanelView : null;
  const activeRightPanel = isRightPanelOpen ? rightPanelView : null;
  const [hasMoreMap, setHasMoreMap] = useState<Record<string, boolean>>({});
  // Chat en borrador: vive solo en memoria hasta que se envía el primer mensaje.
  // No está en chatList, no se persiste y no aparece en la barra lateral.
  const [draftChat, setDraftChat] = useState<Chat | null>(null);
  const isDraftChat = draftChat?.id === activeChatId;
  const currentChat = chatList.find((chat) => chat.id === activeChatId)
    ?? (draftChat && draftChat.id === activeChatId ? draftChat : undefined);
  // El borrador no existe en el servidor: solo los chats materializados se sincronizan.
  const syncableChat = isDraftChat ? undefined : currentChat;
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const abortControllerRef = useRef<AbortController | null>(null);
  const draftSyncTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const currentChatRef = useRef(currentChat);
  const isAuthenticatedRef = useRef(isAuthenticated);
  // Espejo del estado para los callbacks que resuelven después de un await
  const chatListRef = useRef(chatList);
  const activeChatIdRef = useRef(activeChatId);
  // Preferencia global: solo decide con qué modelo nacen los chats nuevos.
  // El modelo que se usa de verdad es el del chat activo.
  const [defaultModel, setDefaultModel] = useState<string>(loadDefaultModel);
  // Los chats de antes del cambio llegan sin ajustes (o con '' desde Mongo): el modelo
  // cae en la preferencia global y el nivel en el defaultThinking del modelo.
  const activeModel = currentChat?.model || defaultModel;
  const activeReasoning = resolveReasoningLevel(activeModel, currentChat?.reasoningLevel);

  useEffect(() => {
    currentChatRef.current = syncableChat;
  }, [syncableChat]);

  useEffect(() => {
    isAuthenticatedRef.current = isAuthenticated;
  }, [isAuthenticated]);

  useEffect(() => {
    chatListRef.current = chatList;
    activeChatIdRef.current = activeChatId;
  }, [chatList, activeChatId]);

  useEffect(() => {
    savePanelView('left', leftPanelView);
  }, [leftPanelView]);

  useEffect(() => {
    savePanelView('right', rightPanelView);
  }, [rightPanelView]);

  useEffect(() => {
    savePanelOpen('left', isLeftPanelOpen);
  }, [isLeftPanelOpen]);

  useEffect(() => {
    savePanelOpen('right', isRightPanelOpen);
  }, [isRightPanelOpen]);

  function clearDraftSyncTimer() {
    if (draftSyncTimerRef.current) {
      clearTimeout(draftSyncTimerRef.current);
      draftSyncTimerRef.current = null;
    }
  }

  function scheduleDraftSyncToServer(chat: Chat) {
    if (!isAuthenticatedRef.current) return;
    clearDraftSyncTimer();
    draftSyncTimerRef.current = setTimeout(() => {
      syncChatDraftToServer(chat);
      draftSyncTimerRef.current = null;
    }, 2000);
  }

  function flushDraftSyncToServer(chat: Chat | undefined) {
    clearDraftSyncTimer();
    if (chat && isAuthenticatedRef.current) {
      syncChatDraftToServer(chat);
    }
  }

  // En móvil el panel izquierdo es un drawer que tapa el chat: al navegar lo cerramos.
  function showLeftPanel(view: LeftPanelView) {
    setLeftPanelView(view);
    setIsLeftPanelOpen(!isMobileViewport());
  }

  function persistIfOffline(chats: Chat[], activeId: string) {
    if (!isAuthenticatedRef.current) {
      // Un id que no está en la lista (el borrador) se guarda como vacío: al recargar
      // volvemos a la vista de chat nuevo en vez de quedarnos sin chat activo.
      const persistedActiveId = chats.some((chat) => chat.id === activeId) ? activeId : '';
      saveToLocalDisk(chats, persistedActiveId);
    }
  }

  // Punto único para editar el chat activo: aplica el cambio en la lista y persiste
  // offline. Devuelve el chat ya actualizado para que quien llame decida su sync.
  function updateActiveChat(update: (chat: Chat) => Chat): Chat | undefined {
    if (!currentChat) return undefined;

    const updatedChat = update(currentChat);

    if (isDraftChat) {
      // El chat todavía no existe: solo memoria, nada que persistir ni sincronizar.
      setDraftChat(updatedChat);
      return updatedChat;
    }

    const updatedChats = chatList.map((chat) => (chat.id === activeChatId ? updatedChat : chat));

    setChatList(updatedChats);
    persistIfOffline(updatedChats, activeChatId);

    return updatedChat;
  }

  // Abre la vista de chat nuevo. El chat no se crea aquí: nace al enviar el primer mensaje.
  function startDraftChat(chats: Chat[] = chatList) {
    const chat = createDraftChat();

    setDraftChat(chat);
    setActiveChatId(chat.id);
    persistIfOffline(chats, chat.id);

    return chat;
  }

  // El título llega después de un await: leemos el estado por referencia para no pisar
  // los cambios ocurridos mientras el modelo lo generaba.
  function applyGeneratedTitle(chatId: string, title: string) {
    const chats = chatListRef.current;
    const targetChat = chats.find((chat) => chat.id === chatId);
    if (!targetChat || targetChat.title === title) return;

    const updatedChats = chats.map((chat) => (chat.id === chatId ? { ...chat, title } : chat));

    setChatList(updatedChats);
    persistIfOffline(updatedChats, activeChatIdRef.current);

    if (isAuthenticatedRef.current) {
      saveChatToServer({ ...targetChat, title, messages: [] });
    }
  }

  async function materializeOnlineWelcomeChat(userId: string): Promise<Chat> {
    const template = getTutorialChat()[0];
    // Id estable por usuario: recargas / Strict Mode hacen upsert del mismo chat, no duplicados.
    const baseTime = Date.now() - template.messages.length * 1000;
    const welcome: Chat = {
      ...template,
      id: `welcome-${userId}`,
      messages: template.messages.map((msg, index) => ({
        ...msg,
        createdAt: new Date(baseTime + index * 1000).toISOString(),
      })),
    };
    await saveChatToServer(welcome);
    return welcome;
  }

  useEffect(() => {
    if (activeLeftPanel !== null) {
      return initResizer('left');
    }
  }, [activeLeftPanel]);

  useEffect(() => {
    if (activeRightPanel !== null) {
      return initResizer('right');
    }
  }, [activeRightPanel]);

  useEffect(() => {
    let cancelled = false;

    async function initializeApp() {
      const localChats = loadLocalChats() || [];
      const localActiveId = loadLocalActiveChatId() || '';

      // Siempre intentamos reatachar la sesión vía cookie HttpOnly (/auth/me).
      // Antes solo se hacía si existía localStorage.isLoggedIn, y si esa bandera
      // faltaba (storage limpio parcial, otro perfil, etc.) la cookie quedaba viva
      // pero la UI se quedaba en modo offline: login visible y mensajes sin cargar.
      try {
        const session = await checkSession();
        if (session.authenticated) {
          localStorage.setItem('isLoggedIn', 'true');
          if (!cancelled) setIsAuthenticated(true);

          let serverChats = await loadChatsFromServer();
          if (cancelled) return;

          if (serverChats && serverChats.length > 0) {
            // Online: solo state. No escribir chats del servidor en localStorage.
            setChatList(serverChats);
            setActiveChatId(
              localActiveId && serverChats.some((chat: Chat) => chat.id === localActiveId)
                ? localActiveId
                : serverChats[0].id
            );
            return;
          }

          // Sesión activa pero sin chats: materializar welcome real (id estable por userId).
          if (!session.userId) {
            console.error('Sesión activa sin userId; no se puede materializar welcome.');
            return;
          }
          // Re-check por carrera (Strict Mode / doble mount) antes de crear.
          serverChats = await loadChatsFromServer();
          if (cancelled) return;
          if (serverChats && serverChats.length > 0) {
            setChatList(serverChats);
            setActiveChatId(serverChats[0].id);
            return;
          }

          const welcome = await materializeOnlineWelcomeChat(session.userId);
          if (cancelled) return;
          setChatList([welcome]);
          setActiveChatId(welcome.id);
          return;
        }

        localStorage.removeItem('isLoggedIn');
      } catch (error) {
        console.error("Error en la carga inicial de sesión o chats del servidor:", error);
      }

      if (cancelled) return;

      // Offline: usar chats locales; si vacíos, tutorial + persistir.
      let initialChats = localChats;
      let initialActiveId = localActiveId;
      if (initialChats.length === 0) {
        initialChats = getTutorialChat();
        initialActiveId = 'tutorial-welcome';
        saveToLocalDisk(initialChats, initialActiveId);
      }

      setChatList(initialChats);
      if (initialActiveId && initialChats.some((chat) => chat.id === initialActiveId)) {
        setActiveChatId(initialActiveId);
      } else {
        // Sin chat activo válido (p. ej. se cerró la app en la vista de chat nuevo)
        const draft = createDraftChat();
        setDraftChat(draft);
        setActiveChatId(draft.id);
        saveToLocalDisk(initialChats, '');
      }
    }

    initializeApp();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const handleBeforeUnload = () => {
      if (currentChatRef.current && isAuthenticatedRef.current) {
        clearDraftSyncTimer();
        syncChatDraftToServer(currentChatRef.current);
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      clearDraftSyncTimer();
    };
  }, []);

  useEffect(() => { // Carga inicial de los últimos 6 mensajes cuando cambia el chat activo
    if (!activeChatId) return;
    if (!isAuthenticated) return; // En modo offline no hacemos peticiones
    if (isDraftChat) return; // El borrador aún no existe en el servidor

    const activeChat = chatList.find(c => c.id === activeChatId);
    if (activeChat && (!activeChat.messages || activeChat.messages.length === 0) && hasMoreMap[activeChatId] !== false) {
      fetchChatMessagesFromServer(activeChatId, 6).then(msgs => {
        if (msgs) {
          setChatList(prevChats => prevChats.map(c => {
            if (c.id === activeChatId) {
              return { ...c, messages: msgs };
            }
            return c;
          }));
          if (msgs.length < 6) {
            setHasMoreMap(prev => ({ ...prev, [activeChatId]: false }));
          }
        }
      });
    }
  }, [activeChatId, chatList, hasMoreMap, isAuthenticated, isDraftChat]);

  async function handleLoadMoreMessages(chatId: string) {
    if (!isAuthenticated) return;

    const chat = chatList.find(c => c.id === chatId);
    if (!chat || !chat.messages || chat.messages.length === 0) return;

    const oldestMessage = chat.messages[0];
    const before = oldestMessage.createdAt;

    const newMessages = await fetchChatMessagesFromServer(chatId, 6, before);
    if (newMessages) {
      setChatList(prevChats => prevChats.map(c => {
        if (c.id === chatId) {
          return {
            ...c,
            messages: [...newMessages, ...c.messages]
          };
        }
        return c;
      }));

      if (newMessages.length < 6) {
        setHasMoreMap(prev => ({ ...prev, [chatId]: false }));
      }
    }
  }

  function handleCreateNewChat() {
    flushDraftSyncToServer(syncableChat);

    startDraftChat();
    showLeftPanel('chats');
  }

  function handleSelectChat(clickedChatId: string) {
    if (clickedChatId !== activeChatId) {
      // Sync the chat we're leaving (with its current draft), not the destination
      flushDraftSyncToServer(syncableChat);
    }

    // Salir de la vista de chat nuevo descarta el borrador sin dejar rastro
    setDraftChat(null);
    setActiveChatId(clickedChatId);
    showLeftPanel('chats');
    persistIfOffline(chatList, clickedChatId);
  }

  function handleDraftChange(newDraft: string) {
    const updatedChat = updateActiveChat((chat) => ({ ...chat, draft: newDraft }));

    if (updatedChat && !isDraftChat) {
      scheduleDraftSyncToServer(updatedChat);
    }
  }

  function handleReplyWithSelection(text: string) {
    // La cita va toda seguida en una línea: colapsamos los saltos de la selección
    const quote = ` > ${text.replace(/\s+/g, ' ').trim()}`;
    const current = currentChat?.draft ?? '';

    handleDraftChange(`${current.trimEnd()}${quote}`);

    // Avisamos al PromptInput para que se enfoque con el cursor al final
    window.dispatchEvent(new CustomEvent('focusPrompt'));
  }

  function handleModelChange(newModel: string) {
    // Los niveles de reasoning no son universales: el nivel se revalida contra el
    // modelo nuevo y viaja con él en la misma edición, para no dejar al chat un
    // instante con un nivel que su proveedor no entiende.
    const nextReasoning = resolveReasoningLevel(newModel, activeReasoning);
    const updatedChat = updateActiveChat((chat) => ({ ...chat, model: newModel, reasoningLevel: nextReasoning }));

    if (updatedChat && isAuthenticated && !isDraftChat) {
      saveChatToServer(updatedChat);
    }

    // El último modelo elegido pasa a ser con el que nacen los chats nuevos.
    setDefaultModel(newModel);
    saveDefaultModel(newModel);
  }

  function handleReasoningChange(level: string) {
    const updatedChat = updateActiveChat((chat) => ({ ...chat, reasoningLevel: level }));

    if (updatedChat && isAuthenticated && !isDraftChat) {
      saveChatToServer(updatedChat);
    }
  }

  function handleSystemPromptChange(newSystemPrompt: string) {
    const updatedChat = updateActiveChat((chat) => ({ ...chat, systemPrompt: newSystemPrompt }));

    if (updatedChat && isAuthenticated && !isDraftChat) {
      saveChatToServer(updatedChat);
    }
  }

  function handleSystemPromptEnabledChange(isEnabled: boolean) {
    const updatedChat = updateActiveChat((chat) => ({ ...chat, systemPromptEnabled: isEnabled }));

    if (updatedChat && isAuthenticated && !isDraftChat) {
      saveChatToServer(updatedChat);
    }
  }

  async function handleAuthSuccess() {
    localStorage.setItem('isLoggedIn', 'true');
    setLeftPanelView('chats');
    setIsAuthenticated(true);
    setChatList([]);
    setActiveChatId('');
    setDraftChat(null);

    try {
      const serverChats = await loadChatsFromServer();

      if (serverChats && serverChats.length > 0) {
        setChatList(serverChats);
        setActiveChatId(serverChats[0].id);
      } else {
        // Cuenta nueva: welcome real en servidor (id estable). No pisar chats locales.
        const session = await checkSession();
        if (!session.userId) {
          console.error('Sesión activa sin userId; no se puede materializar welcome.');
          return;
        }
        const welcome = await materializeOnlineWelcomeChat(session.userId);
        setChatList([welcome]);
        setActiveChatId(welcome.id);
      }
    } catch (error) {
      console.error("Error al cargar chats del servidor:", error);
    }

    showLeftPanel('chats');
  }

  async function resetSessionToDefault() {
    localStorage.removeItem('isLoggedIn');
    await logoutFromServer();
    setIsAuthenticated(false);

    // Restaurar chats offline intactos; solo persistir tutorial si no había ninguno.
    let localChats = loadLocalChats() || [];
    let localActiveId = loadLocalActiveChatId() || '';
    if (localChats.length === 0) {
      localChats = getTutorialChat();
      localActiveId = 'tutorial-welcome';
      saveToLocalDisk(localChats, localActiveId);
    } else if (!localChats.some((chat) => chat.id === localActiveId)) {
      localActiveId = localChats[0].id;
    }

    setChatList(localChats);
    setActiveChatId(localActiveId);
    setDraftChat(null);
    showLeftPanel('chats');
  }

  async function handleSendMessage() {
    // 1. Validaciones iniciales (Reemplaza a tu document.getElementById)
    if (!currentChat || !currentChat.draft.trim() || isGenerating) return;
    clearDraftSyncTimer(); // Avoid syncing a stale draft after send clears it
    const promptText = currentChat.draft.trim();
    // Fijamos el chat destino: durante los await el chat activo puede cambiar
    const chatId = currentChat.id;
    const isFirstMessage = currentChat.messages.length === 0;
    // Enviar el primer mensaje es el acto de nacimiento del borrador: aquí entra en la lista
    const baseChats = isDraftChat ? [...chatList, currentChat] : chatList;

    // 2. Preparamos el mensaje del usuario y el mensaje temporal de "pensando"
    const userMessage: Message = { role: "user", parts: [{ text: promptText }], createdAt: new Date().toISOString() };
    const thinkingMessage = { role: "model" as const, parts: [{ text: "Thinking..." }], isTemporary: true, createdAt: new Date().toISOString() };

    // 3. Actualizamos el estado INMEDIATAMENTE para que la UI reaccione
    let updatedMessages = [...currentChat.messages, userMessage, thinkingMessage];
    let newTitle = currentChat.title;

    // Título provisional mientras el modelo genera el definitivo
    if (isFirstMessage) {
      newTitle = promptText.substring(0, 20) + "...";
    }

    // Actualizamos la lista de chats en React (y limpiamos el borrador).
    // Sellamos modelo y nivel: un chat de antes de este cambio venía sin ellos y
    // los resolvía en cada render; al primer envío pasa a tener los suyos.
    const chatsWithUserMsg = baseChats.map(chat =>
      chat.id === chatId
        ? { ...chat, messages: updatedMessages, title: newTitle, draft: '', model: activeModel, reasoningLevel: activeReasoning }
        : chat
    );
    setChatList(chatsWithUserMsg);
    setDraftChat(null); // Ya vive en chatList: deja de ser borrador
    const controller = new AbortController();
    abortControllerRef.current = controller;
    setIsGenerating(true);

    // 4. Llamamos a la API
    try {
      if (isAuthenticated) {
        const chatToSync = chatsWithUserMsg.find((chat) => chat.id === chatId);
        if (chatToSync) {
          // Crea el documento Chat si aún no existe; no sembrar Thinking/user aquí (van por createMessage).
          await saveChatToServer({ ...chatToSync, messages: [] });
        }
      }

      // Le pasamos los mensajes originales (sin el "pensando") a la API
      const response = await fetchChatResponse(
        chatId,
        [...currentChat.messages, userMessage],
        activeModel,
        activeReasoning,
        isAuthenticated,
        // El system prompt solo viaja si el interruptor del chat está encendido
        currentChat.systemPromptEnabled === false ? undefined : currentChat.systemPrompt,
        controller.signal
      );

      // Reemplazamos el mensaje "pensando" por la respuesta real, incluyendo los _id de MongoDB
      updatedMessages = [
        ...currentChat.messages,
        { ...userMessage, _id: response.userMessageId },
        { role: "model", parts: [{ text: response.text }], _id: response.aiMessageId, createdAt: new Date().toISOString(), model: activeModel }
      ];

      const finalChats = chatsWithUserMsg.map(chat =>
        chat.id === chatId
          ? { ...chat, messages: updatedMessages }
          : chat
      );

      setChatList(finalChats);
      persistIfOffline(finalChats, chatId);

      // El título real se pide en segundo plano: no debe retrasar la respuesta en pantalla
      if (isFirstMessage) {
        generateChatTitle(chatId, promptText, response.text, activeModel, isAuthenticated)
          .then((title) => {
            if (title) applyGeneratedTitle(chatId, title);
          });
      }

    } catch (error) {
      const err = error as Error;
      if (err.name === 'AbortError') {
        updatedMessages = [...currentChat.messages, userMessage];
        const abortedChats = chatsWithUserMsg.map(chat =>
          chat.id === chatId
            ? { ...chat, messages: updatedMessages }
            : chat
        );
        setChatList(abortedChats);
        persistIfOffline(abortedChats, chatId);
      } else if (err.message === 'SESSION_EXPIRED') {
        resetSessionToDefault(); // Implementarás esto luego
        alert("Session expired. Please log in again.");
      } else {
        // Reemplazamos "pensando" por el error
        updatedMessages = [...currentChat.messages, userMessage, { role: "model" as const, parts: [{ text: `Error: ${err.message}` }], createdAt: new Date().toISOString() }];
        const failedChats = chatsWithUserMsg.map(chat => chat.id === chatId ? { ...chat, messages: updatedMessages } : chat);
        setChatList(failedChats);
        // Un chat recién nacido cuyo primer envío falla también debe quedar en disco
        persistIfOffline(failedChats, chatId);
      }
    } finally {
      if (abortControllerRef.current === controller) {
        abortControllerRef.current = null;
      }
      setIsGenerating(false);
    }
  }

  function handleDeleteChat(chatId: string) {
    if (!chatId) return;
    const updatedChats = chatList.filter(chat => chat.id !== chatId);
    setChatList(updatedChats);

    if (chatId === activeChatId && updatedChats.length === 0) {
      // Sin chats a los que caer: abrimos la vista de chat nuevo
      startDraftChat(updatedChats);
    } else {
      const newActiveId = chatId === activeChatId ? updatedChats[0].id : activeChatId;
      setActiveChatId(newActiveId);
      persistIfOffline(updatedChats, newActiveId);
    }

    if (isAuthenticated) {
      deleteChatFromServer(chatId);
    }
  }

  function handleDeleteMessage(messageIndex: number) {
    if (!currentChat) return;

    const messageToDelete = currentChat.messages[messageIndex];
    if (!messageToDelete) return;

    // 1. Borrar localmente de inmediato
    const updatedMessages = currentChat.messages.filter((_, i) => i !== messageIndex);
    const updatedChats = chatList.map(chat =>
      chat.id === activeChatId
        ? { ...chat, messages: updatedMessages }
        : chat
    );
    setChatList(updatedChats);
    persistIfOffline(updatedChats, activeChatId);

    // 2. Si hay sesión y el mensaje tiene _id, borrarlo del servidor en segundo plano
    if (isAuthenticated && messageToDelete._id) {
      deleteMessageFromServer(activeChatId, messageToDelete._id);
    }
  }

  async function handleRetryMessage(messageIndex: number) {
    if (!currentChat || isGenerating) return;

    const messageToRetry = currentChat.messages[messageIndex];
    if (!messageToRetry || messageToRetry.isTemporary) return;

    // 1. Encontrar dónde está el mensaje del usuario que detonó esta parte de la conversación
    let userMessageIndex = messageIndex;
    if (messageToRetry.role === 'model') {
      userMessageIndex = messageIndex - 1;
    }

    // Seguridad: Asegurarnos de que encontramos un mensaje de usuario
    if (userMessageIndex < 0 || currentChat.messages[userMessageIndex].role !== 'user') return;

    const userMessage = currentChat.messages[userMessageIndex];

    // 2. Tomar el historial exacto que queremos reenviar a la API
    const historyUpToUser = currentChat.messages.slice(0, userMessageIndex + 1);

    // 3. Bifurcación: Identificar los mensajes que serán descartados en el backend
    const messagesToDeleteFromBackend = currentChat.messages.slice(userMessageIndex);

    // 4. Preparar la UI agregando el estado de "Thinking..."
    const thinkingMessage = { role: "model" as const, parts: [{ text: "Thinking..." }], isTemporary: true, createdAt: new Date().toISOString() };
    let updatedMessages = [...historyUpToUser, thinkingMessage];

    const chatsWithThinking = chatList.map(chat =>
      chat.id === activeChatId
        ? { ...chat, messages: updatedMessages }
        : chat
    );
    setChatList(chatsWithThinking);
    const controller = new AbortController();
    abortControllerRef.current = controller;
    setIsGenerating(true);

    // 5. Eliminar mensajes antiguos del backend de forma silenciosa
    if (isAuthenticated) {
      await saveChatToServer({ ...currentChat, messages: [] });
      messagesToDeleteFromBackend.forEach(msg => {
        if (msg._id) {
          deleteMessageFromServer(activeChatId, msg._id);
        }
      });
    }

    // 6. Hacer la petición a la API
    try {
      const response = await fetchChatResponse(
        activeChatId,
        historyUpToUser,
        activeModel,
        activeReasoning,
        isAuthenticated,
        // El system prompt solo viaja si el interruptor del chat está encendido
        currentChat.systemPromptEnabled === false ? undefined : currentChat.systemPrompt,
        controller.signal
      );

      // Reemplazamos "Thinking" por la respuesta y actualizamos los IDs
      updatedMessages = [
        ...historyUpToUser.slice(0, -1),
        { ...userMessage, _id: response.userMessageId || userMessage._id },
        { role: "model", parts: [{ text: response.text }], _id: response.aiMessageId, createdAt: new Date().toISOString(), model: activeModel }
      ];

      const finalChats = chatsWithThinking.map(chat =>
        chat.id === activeChatId
          ? { ...chat, messages: updatedMessages }
          : chat
      );

      setChatList(finalChats);
      persistIfOffline(finalChats, activeChatId);
    } catch (error) {
      const err = error as Error;
      if (err.name === 'AbortError') {
        updatedMessages = historyUpToUser;
        const abortedChats = chatsWithThinking.map(chat =>
          chat.id === activeChatId
            ? { ...chat, messages: updatedMessages }
            : chat
        );
        setChatList(abortedChats);
        persistIfOffline(abortedChats, activeChatId);
      } else if (err.message === 'SESSION_EXPIRED') {
        resetSessionToDefault();
        alert("Session expired. Please log in again.");
      } else {
        updatedMessages = [...historyUpToUser, { role: "model" as const, parts: [{ text: `Error: ${err.message}` }], createdAt: new Date().toISOString() }];
        setChatList(chatsWithThinking.map(chat => chat.id === activeChatId ? { ...chat, messages: updatedMessages } : chat));
      }
    } finally {
      if (abortControllerRef.current === controller) {
        abortControllerRef.current = null;
      }
      setIsGenerating(false);
    }
  }

  function handleStopGeneration() {
    abortControllerRef.current?.abort();
  }

  function handleReTitleChat(chatId: string, newTitle: string) {
    const trimmedTitle = newTitle.trim();
    if (!trimmedTitle) return;
    const targetChat = chatList.find((chat) => chat.id === chatId);
    if (targetChat?.title === trimmedTitle) return;
    const updatedChats = chatList.map((chat) => {
      if (chat.id === chatId) {
        return { ...chat, title: trimmedTitle };
      }
      return chat;
    });
    setChatList(updatedChats);
    persistIfOffline(updatedChats, activeChatId);
    const retitledChat = updatedChats.find((chat) => chat.id === chatId);

    if (retitledChat && isAuthenticated) {
      saveChatToServer(retitledChat);
    }
  }

  return (
    <>
      {/* 1. Inyectamos los símbolos en el DOM */}
      <SvgIcons />
      <SelectionToolbar onReply={handleReplyWithSelection} />
      <div className="app-container" id='app-container'>
        {(activeLeftPanel !== null || activeRightPanel !== null) && (
          <div
            className="backdrop-overlay"
            onClick={() => {
              setIsLeftPanelOpen(false);
              setIsRightPanelOpen(false);
            }}
          />
        )}

        {activeLeftPanel !== null && (
          <>
            <aside className="sidebar-section" id='sidebar-section' aria-label="Navegación principal">
              {activeLeftPanel === 'account' && (
                <AccountView
                  isAuthenticated={isAuthenticated}
                  onAuthSuccess={handleAuthSuccess}
                  onLogoutAction={resetSessionToDefault}
                  onOpenTerms={() => { setRightPanelView('docs'); setIsRightPanelOpen(true); }}
                />
              )}
              {activeLeftPanel === 'chats' && (
                <Sidebar
                  chatList={chatList}
                  activeChatId={activeChatId}
                  onChatClick={handleSelectChat}
                  onCreateNewChat={handleCreateNewChat}
                  onDeleteChat={handleDeleteChat}
                  onReTitleChat={handleReTitleChat}
                />
              )}
              <Toolbar
                onNavChats={() => setLeftPanelView('chats')}
                onNavAccount={() => setLeftPanelView('account')}
              />
            </aside>

            <div className="resizer resizer-left" id='left-resizer'></div>
          </>
        )}

        <main className="message-section">
          <MessageView
            key={activeChatId}
            messages={currentChat?.messages || []}
            chatId={activeChatId}
            isNewChat={isDraftChat}
            hasMoreMap={hasMoreMap}
            onLoadMore={() => handleLoadMoreMessages(activeChatId)}
            onDeleteMessage={handleDeleteMessage}
            onRetryMessage={handleRetryMessage}
            token={isAuthenticated ? 'active' : null}
            draft={currentChat?.draft || ''}
            onDraftChange={handleDraftChange}
            onSendMessage={handleSendMessage}
            isGenerating={isGenerating}
            onStopGeneration={handleStopGeneration}
            isLeftSidebarOpen={activeLeftPanel !== null}
            isRightSidebarOpen={activeRightPanel !== null}
            onToggleLeftSidebar={() => setIsLeftPanelOpen((prev) => !prev)}
            onToggleRightSidebar={() => setIsRightPanelOpen((prev) => !prev)}
          />
        </main>

        {activeRightPanel !== null && (
          <>
            <div className="resizer resizer-right" id="right-resizer"></div>
            <aside className="settings-section" id='settings-section' aria-label="Panel secundario">
              {activeRightPanel === 'settings' && (
                <SettingView
                  currentModel={activeModel}
                  onModelChange={handleModelChange}
                  reasoningLevel={activeReasoning}
                  onReasoningChange={handleReasoningChange}
                  systemPrompt={currentChat?.systemPrompt ?? ''}
                  onSystemPromptChange={handleSystemPromptChange}
                  systemPromptEnabled={currentChat?.systemPromptEnabled !== false}
                  onSystemPromptEnabledChange={handleSystemPromptEnabledChange}
                />
              )}
              {activeRightPanel === 'notes' && (
                <NotesView />
              )}
              {activeRightPanel === 'docs' && (
                <DocsView />
              )}
              <Toolbar
                onNavNotes={() => setRightPanelView('notes')}
                onNavConfig={() => setRightPanelView('settings')}
                onNavDocs={() => setRightPanelView('docs')}
              />
            </aside>
          </>
        )}

      </div>
    </>
  );
} 