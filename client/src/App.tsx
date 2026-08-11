import { useState, useEffect, useRef } from 'react';
import type { Chat, Message } from './types';
import { loadLocalChats, saveToLocalDisk, getTutorialChat } from './utils/storage';
import { loadChatsFromServer, fetchChatResponse, saveMessageToServer, generateChatTitle, saveChatToServer, syncChatDraftToServer, deleteChatFromServer, deleteMessageFromServer, fetchChatMessagesFromServer, checkSession, logoutFromServer } from './services/api';
import { SvgIcons } from './components/SvgIcons';
import { initResizer } from './utils/resizer';
import Toolbar from './components/Toolbar';
import Sidebar from './views/Sidebar';
import AccountView from './views/AccountView';
import SettingView from './views/SettingsView';
import MessageView from './views/MessageView';
import NotesView from './views/NotesView';
import DocsView from './views/DocsView';
import { loadDefaultModel, saveDefaultModel, resolveReasoningLevel } from './utils/modelPreferences';
import SelectionToolbar from './components/SelectionToolbar';
import { isMobileViewport, loadPanelView, savePanelView, loadPanelOpen, savePanelOpen, loadActiveChatId, saveActiveChatId } from './utils/uiPreferences';
import { syncApiKeysWithServer } from './utils/apiKeys';
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

  // El chat activo se guarda con sesión y sin ella: es una preferencia de UI, igual
  // que los paneles de arriba. El id del borrador también se guarda; al recargar no
  // estará en la lista y la carga inicial abrirá un chat nuevo, que es lo correcto.
  useEffect(() => {
    // Vacío solo durante el arranque, antes de elegir chat: escribirlo borraría la
    // preferencia justo antes de poder restaurarla.
    if (!activeChatId) return;
    saveActiveChatId(activeChatId);
  }, [activeChatId]);

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

  // Solo la lista de chats está sujeta a esta regla: online la fuente de verdad es
  // Mongo y escribirla aquí pisaría los chats del modo offline. El chat activo se
  // persiste aparte (ver el efecto de abajo) porque es una preferencia de UI.
  function persistIfOffline(chats: Chat[]) {
    if (!isAuthenticatedRef.current) {
      saveToLocalDisk(chats);
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
    persistIfOffline(updatedChats);

    return updatedChat;
  }

  // Abre la vista de chat nuevo. El chat no se crea aquí: nace al enviar el primer mensaje.
  function startDraftChat(chats: Chat[] = chatList) {
    const chat = createDraftChat();

    setDraftChat(chat);
    setActiveChatId(chat.id);
    persistIfOffline(chats);

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
    persistIfOffline(updatedChats);

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
      const localActiveId = loadActiveChatId() || '';

      // Siempre intentamos reatachar la sesión vía cookie HttpOnly (/auth/me).
      // Antes solo se hacía si existía localStorage.isLoggedIn, y si esa bandera
      // faltaba (storage limpio parcial, otro perfil, etc.) la cookie quedaba viva
      // pero la UI se quedaba en modo offline: login visible y mensajes sin cargar.
      try {
        const session = await checkSession();
        if (session.authenticated) {
          localStorage.setItem('isLoggedIn', 'true');
          if (!cancelled) setIsAuthenticated(true);

          // También aquí, no solo en handleAuthSuccess: quien ya tiene la cookie viva y
          // solo recarga la página nunca pasa por el login, y se quedaría sin sincronizar.
          syncApiKeysWithServer();

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
            console.error('Active session without userId; cannot materialize the welcome chat.');
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
        console.error("Error during the initial load of the session or the server chats:", error);
      }

      if (cancelled) return;

      // Offline: usar chats locales; si vacíos, tutorial + persistir.
      let initialChats = localChats;
      let initialActiveId = localActiveId;
      if (initialChats.length === 0) {
        initialChats = getTutorialChat();
        initialActiveId = 'tutorial-welcome';
        saveToLocalDisk(initialChats);
      }

      setChatList(initialChats);
      if (initialActiveId && initialChats.some((chat) => chat.id === initialActiveId)) {
        setActiveChatId(initialActiveId);
      } else {
        // Sin chat activo válido (p. ej. se cerró la app en la vista de chat nuevo)
        const draft = createDraftChat();
        setDraftChat(draft);
        setActiveChatId(draft.id);
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
    persistIfOffline(chatList);
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

    // Sin await: las claves se reconcilian en segundo plano y no deben retrasar la entrada
    syncApiKeysWithServer();

    try {
      const serverChats = await loadChatsFromServer();

      if (serverChats && serverChats.length > 0) {
        setChatList(serverChats);
        setActiveChatId(serverChats[0].id);
      } else {
        // Cuenta nueva: welcome real en servidor (id estable). No pisar chats locales.
        const session = await checkSession();
        if (!session.userId) {
          console.error('Active session without userId; cannot materialize the welcome chat.');
          return;
        }
        const welcome = await materializeOnlineWelcomeChat(session.userId);
        setChatList([welcome]);
        setActiveChatId(welcome.id);
      }
    } catch (error) {
      console.error("Error loading the chats from the server:", error);
    }

    showLeftPanel('chats');
  }

  async function resetSessionToDefault() {
    localStorage.removeItem('isLoggedIn');
    await logoutFromServer();
    setIsAuthenticated(false);

    // Restaurar chats offline intactos; solo persistir tutorial si no había ninguno.
    let localChats = loadLocalChats() || [];
    let localActiveId = loadActiveChatId() || '';
    if (localChats.length === 0) {
      localChats = getTutorialChat();
      localActiveId = 'tutorial-welcome';
      saveToLocalDisk(localChats);
    } else if (!localChats.some((chat) => chat.id === localActiveId)) {
      localActiveId = localChats[0].id;
    }

    setChatList(localChats);
    setActiveChatId(localActiveId);
    setDraftChat(null);
    showLeftPanel('chats');
  }

  // Núcleo común de enviar y reintentar: pinta el "Thinking...", le pide la respuesta
  // al modelo y la reconcilia con la lista de chats. Enviar y reintentar solo se
  // diferencian en el papeleo previo, así que eso se queda fuera y entra por parámetros.
  //
  // Convención que sostiene todo lo de abajo: historyToSend TERMINA siempre en el
  // mensaje de usuario que provoca la respuesta. Por eso su último elemento es el que
  // recibe el _id que devuelve el servidor, y por eso basta un slice(0, -1) para
  // quedarse con lo anterior.
  async function sendChatHistory(
    historyToSend: Message[],
    chats: Chat[],
    chatId: string,
    options: {
      // Trabajo con el servidor que cada caso necesita antes de pedir la respuesta.
      beforeRequest?: () => Promise<void>;
      // El "y además" de quien llama: enviar lo usa para pedir el título del chat.
      onSuccess?: (responseText: string) => void;
    } = {}
  ) {
    // La convención de arriba, comprobada: sin mensaje de usuario al final no hay nada
    // que responder, y seguir adelante dejaría dos respuestas del modelo seguidas y un
    // _id de usuario pegado al mensaje equivocado.
    const userMessage = historyToSend[historyToSend.length - 1];
    if (!userMessage || userMessage.role !== 'user') return;

    const targetChat = chats.find((chat) => chat.id === chatId);
    const thinkingMessage = { role: "model" as const, parts: [{ text: "Thinking..." }], isTemporary: true, createdAt: new Date().toISOString() };

    // Pintamos el "pensando" antes de nada para que la UI reaccione al instante
    const chatsWithThinking = chats.map(chat =>
      chat.id === chatId
        ? { ...chat, messages: [...historyToSend, thinkingMessage] }
        : chat
    );
    setChatList(chatsWithThinking);
    const controller = new AbortController();
    abortControllerRef.current = controller;
    setIsGenerating(true);

    // Todas las salidas de abajo escriben el mismo chat: lo único que cambia es con qué mensajes
    const withMessages = (messages: Message[]) =>
      chatsWithThinking.map(chat => chat.id === chatId ? { ...chat, messages } : chat);

    // El prompt se guarda ANTES de generar para que cerrar la pestaña a mitad no se lleve
    // lo que el usuario acaba de escribir: se pierde la respuesta, nunca la pregunta.
    // Persistimos historyToSend y no chatsWithThinking a propósito: el "pensando" es
    // isTemporary y en disco quedaría congelado y sin botón de reintentar (handleRetryMessage
    // descarta los isTemporary). El estado que queda es el mismo que ya deja abortar.
    persistIfOffline(withMessages(historyToSend));

    // Se asigna dentro del try, no aquí: el servidor comprueba que el chat exista y sea
    // tuyo, y es beforeRequest quien lo materializa en Mongo. Vive fuera para que el catch
    // pueda sellar el _id aunque la generación acabe fallando o abortada.
    let pendingUserMessageId: Promise<string | undefined> = Promise.resolve(undefined);

    try {
      await options.beforeRequest?.();

      if (isAuthenticatedRef.current) {
        // Se lanza sin await, en paralelo a la generación: la respuesta del modelo tarda
        // segundos, así que el viaje extra al servidor queda solapado y no se nota.
        pendingUserMessageId = saveMessageToServer(chatId, {
          sender: 'user',
          content: userMessage.parts?.[0]?.text || '',
        });
        // Solo evita el unhandled rejection mientras esperamos al modelo; el fallo se trata abajo
        pendingUserMessageId.catch(() => undefined);
      }

      const response = await fetchChatResponse(
        historyToSend,
        activeModel,
        activeReasoning,
        // El system prompt solo viaja si el interruptor del chat está encendido
        targetChat?.systemPromptEnabled === false ? undefined : targetChat?.systemPrompt,
        controller.signal
      );

      // Si el prompt no llegó a guardarse, este await relanza y no persistimos la respuesta.
      // Es deliberado: una conversación sin su última respuesta se reintenta, pero una
      // respuesta sin su pregunta rompe handleRetryMessage, que da por hecho que todo
      // mensaje del modelo va precedido del usuario que lo provocó.
      const userMessageId = await pendingUserMessageId;

      const aiMessageId = isAuthenticatedRef.current
        ? await saveMessageToServer(chatId, { sender: 'ai', content: response.text, model: activeModel })
        : undefined;

      // Reemplazamos el "pensando" por la respuesta real y sellamos los _id de MongoDB.
      // El || rescata el _id que el mensaje ya tuviera: al reintentar existe, al enviar no.
      const finalChats = withMessages([
        ...historyToSend.slice(0, -1),
        { ...userMessage, _id: userMessageId || userMessage._id },
        { role: "model", parts: [{ text: response.text }], _id: aiMessageId, createdAt: new Date().toISOString(), model: activeModel }
      ]);

      setChatList(finalChats);
      persistIfOffline(finalChats);

      options.onSuccess?.(response.text);
    } catch (error) {
      const err = error as Error;

      // El prompt puede haberse guardado aunque la generación fallara o se abortara. Sin
      // sellar su _id el mensaje queda huérfano en Mongo: el cliente lo borraría solo de
      // la pantalla y reaparecería en la siguiente recarga.
      const savedUserMessageId = await pendingUserMessageId.catch(() => undefined);
      const sealedHistory = [
        ...historyToSend.slice(0, -1),
        { ...userMessage, _id: savedUserMessageId || userMessage._id },
      ];

      if (err.name === 'AbortError') {
        // Abortar deja la conversación tal y como se envió, sin respuesta
        const abortedChats = withMessages(sealedHistory);
        setChatList(abortedChats);
        persistIfOffline(abortedChats);
      } else if (err.message === 'SESSION_EXPIRED') {
        resetSessionToDefault();
        alert("Session expired. Please log in again.");
      } else {
        // El error ocupa el sitio del "pensando", y también debe quedar en disco
        const failedChats = withMessages([...sealedHistory, { role: "model" as const, parts: [{ text: `Error: ${err.message}` }], createdAt: new Date().toISOString() }]);
        setChatList(failedChats);
        persistIfOffline(failedChats);
      }
    } finally {
      if (abortControllerRef.current === controller) {
        abortControllerRef.current = null;
      }
      setIsGenerating(false);
    }
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

    // 2. El historial que viaja es el de siempre más lo que acabas de escribir
    const userMessage: Message = { role: "user", parts: [{ text: promptText }], createdAt: new Date().toISOString() };
    const historyToSend = [...currentChat.messages, userMessage];

    // 3. Papeleo de nacimiento, que reintentar no necesita: título provisional mientras
    // el modelo genera el definitivo, borrador limpio, y modelo y nivel sellados (un chat
    // de antes de este cambio venía sin ellos y los resolvía en cada render).
    // Los mensajes no se tocan aquí: de eso se encarga sendChatHistory.
    const newTitle = isFirstMessage ? promptText.substring(0, 20) + "..." : currentChat.title;
    const sealedChats = baseChats.map(chat =>
      chat.id === chatId
        ? { ...chat, title: newTitle, draft: '', model: activeModel, reasoningLevel: activeReasoning }
        : chat
    );
    setDraftChat(null); // Ya vive en chatList: deja de ser borrador

    await sendChatHistory(historyToSend, sealedChats, chatId, {
      beforeRequest: async () => {
        if (!isAuthenticated) return;
        const chatToSync = sealedChats.find((chat) => chat.id === chatId);
        // Crea el documento Chat si aún no existe; no sembrar Thinking/user aquí (van por createMessage).
        if (chatToSync) await saveChatToServer({ ...chatToSync, messages: [] });
      },
      onSuccess: (responseText) => {
        // El título real se pide en segundo plano: no debe retrasar la respuesta en pantalla
        if (!isFirstMessage) return;
        generateChatTitle(promptText, responseText, activeModel)
          .then((title) => {
            if (title) applyGeneratedTitle(chatId, title);
          });
      },
    });
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
      persistIfOffline(updatedChats);
    }

    if (isAuthenticated) {
      deleteChatFromServer(chatId);
    }
  }

  // A chat that runs out of messages deletes itself: an empty row in the list is noise.
  // The rule lives here, on the user's own delete action, and NOT in the server's
  // deleteMessage: handleRetryMessage also empties a chat as an intermediate step, and a
  // server-side rule would delete the chat right before the retry saves its new messages.
  async function handleDeleteMessage(messageIndex: number) {
    if (!currentChat || isDraftChat) return; // The draft is not in chatList yet

    const messageToDelete = currentChat.messages[messageIndex];
    if (!messageToDelete) return;

    // Pin the target chat: the active one may change while we await the server
    const chatId = currentChat.id;

    // 1. Delete it locally right away
    const updatedMessages = currentChat.messages.filter((_, i) => i !== messageIndex);
    const updatedChats = chatList.map(chat =>
      chat.id === chatId
        ? { ...chat, messages: updatedMessages }
        : chat
    );
    setChatList(updatedChats);
    persistIfOffline(updatedChats);

    // 2. Offline, localStorage holds the whole conversation, so the list we just filtered
    //    is the entire truth: empty means empty.
    if (!isAuthenticated) {
      if (updatedMessages.length === 0) handleDeleteChat(chatId);
      return;
    }

    // 3. Awaited on purpose (it used to be fire-and-forget): asking the server what is left
    //    before the deletion lands would count the message we are deleting.
    if (messageToDelete._id) {
      await deleteMessageFromServer(chatId, messageToDelete._id);
    }

    if (updatedMessages.length > 0) return;

    // 4. An empty screen is not an empty chat: the list only holds the loaded page of 6 and
    //    older messages may still be waiting behind the cursor. Ask before deleting anything
    //    irreversible — on a network error we get null and keep the chat.
    const remaining = await fetchChatMessagesFromServer(chatId, 1);
    if (!Array.isArray(remaining) || remaining.length > 0) return;

    handleDeleteChat(chatId);
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

    // Fijamos el chat destino: durante los await el chat activo puede cambiar
    const chatId = currentChat.id;
    const chatToSync = currentChat;

    // 2. El historial que reenviamos acaba justo en ese mensaje de usuario
    const historyToSend = currentChat.messages.slice(0, userMessageIndex + 1);

    // 3. Bifurcación: lo que venía después queda descartado y hay que borrarlo del backend
    const messagesToDeleteFromBackend = currentChat.messages.slice(userMessageIndex);

    await sendChatHistory(historyToSend, chatList, chatId, {
      beforeRequest: async () => {
        if (!isAuthenticated) return;
        await saveChatToServer({ ...chatToSync, messages: [] });
        // Silenciosa a propósito: si falla, el chat local ya es la versión buena
        messagesToDeleteFromBackend.forEach(msg => {
          if (msg._id) {
            deleteMessageFromServer(chatId, msg._id);
          }
        });
      },
    });
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
    persistIfOffline(updatedChats);
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
            <aside className="sidebar-section" id='sidebar-section' aria-label="Main navigation">
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