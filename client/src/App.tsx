import { useState, useEffect, useRef } from 'react';
import type { Chat, Message } from './types';
import { loadLocalChats, loadLocalActiveChatId, saveToLocalDisk, getTutorialChat } from './utils/storage';
import { loadChatsFromServer, fetchChatResponse, saveChatToServer, syncChatDraftToServer, deleteChatFromServer, deleteMessageFromServer, fetchChatMessagesFromServer, checkSession, logoutFromServer } from './services/api';
import Sidebar from './components/Sidebar';
import { SvgIcons } from './components/SvgIcons';
import { initResizer } from './utils/resizer';
import Toolbar from './components/Toolbar';
import AccountView from './views/AccountView';
import SettingView from './views/SettingsView';
import MessageView from './views/MessageView';
import NotesView from './views/NotesView';
import { getModelConfig } from './config/models.config';
import ContextMenu from './components/ContextMenu';

export default function App() {
  const [chatList, setChatList] = useState<Chat[]>([]);
  const [activeChatId, setActiveChatId] = useState<string>('');
  const [activeLeftPanel, setActiveLeftPanel] = useState<'chats' | 'account' | null>(() => {
    return typeof window !== 'undefined' && window.innerWidth < 768 ? null : 'chats';
  });
  const [activeRightPanel, setActiveRightPanel] = useState<'settings' | 'notes' | null>(() => {
    return typeof window !== 'undefined' && window.innerWidth < 768 ? null : 'settings';
  });
  const [hasMoreMap, setHasMoreMap] = useState<Record<string, boolean>>({});
  const currentChat = chatList.find((chat) => chat.id === activeChatId);
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const abortControllerRef = useRef<AbortController | null>(null);
  const draftSyncTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const currentChatRef = useRef(currentChat);
  const isAuthenticatedRef = useRef(isAuthenticated);
  const [model, setModel] = useState<string>(() => {
    const savedModel = localStorage.getItem('model');
    if (savedModel && getModelConfig(savedModel)) {
      return savedModel;
    }
    return 'gemini-3.5-flash';
  });

  useEffect(() => {
    currentChatRef.current = currentChat;
  }, [currentChat]);

  useEffect(() => {
    isAuthenticatedRef.current = isAuthenticated;
  }, [isAuthenticated]);

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

  function persistIfOffline(chats: Chat[], activeId: string) {
    if (!isAuthenticatedRef.current) {
      saveToLocalDisk(chats, activeId);
    }
  }

  async function materializeOnlineWelcomeChat(): Promise<Chat> {
    const template = getTutorialChat()[0];
    const welcome: Chat = {
      ...template,
      id: 'chat-' + Date.now(),
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
    async function initializeApp() {
      const localChats = loadLocalChats() || [];
      const localActiveId = loadLocalActiveChatId() || '';

      // Siempre intentamos reatachar la sesión vía cookie HttpOnly (/auth/me).
      // Antes solo se hacía si existía localStorage.isLoggedIn, y si esa bandera
      // faltaba (storage limpio parcial, otro perfil, etc.) la cookie quedaba viva
      // pero la UI se quedaba en modo offline: login visible y mensajes sin cargar.
      try {
        const sessionActive = await checkSession();
        if (sessionActive) {
          localStorage.setItem('isLoggedIn', 'true');
          setIsAuthenticated(true);

          const serverChats = await loadChatsFromServer();
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

          // Sesión activa pero sin chats: materializar welcome real en Mongo (+ mensajes).
          const welcome = await materializeOnlineWelcomeChat();
          setChatList([welcome]);
          setActiveChatId(welcome.id);
          return;
        }

        localStorage.removeItem('isLoggedIn');
      } catch (error) {
        console.error("Error en la carga inicial de sesión o chats del servidor:", error);
      }

      // Offline: usar chats locales; si vacíos, tutorial + persistir.
      let initialChats = localChats;
      let initialActiveId = localActiveId;
      if (initialChats.length === 0) {
        initialChats = getTutorialChat();
        initialActiveId = 'tutorial-welcome';
        saveToLocalDisk(initialChats, initialActiveId);
      }

      setChatList(initialChats);
      setActiveChatId(initialActiveId);
    }

    initializeApp();
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
  }, [activeChatId, chatList, hasMoreMap, isAuthenticated]);

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
    flushDraftSyncToServer(currentChat);

    // 1. Creamos el nuevo dato exactamente igual que antes
    const newId = 'chat-' + Date.now();
    const newChat = { id: newId, title: 'New conversation', messages: [], draft: '' };

    // 2. En lugar de hacer .push(), le pasamos la nueva lista completa a React
    // (...chatList significa: "copia todos los chats que ya tenías y agrégale el nuevo")
    const updatedChats = [...chatList, newChat];
    setChatList(updatedChats);

    // 3. Le decimos a React cuál es el nuevo ID activo y a qué vista ir
    setActiveChatId(newId);
    if (window.innerWidth < 768) {
      setActiveLeftPanel(null);
    } else {
      setActiveLeftPanel('chats');
    }

    if (isAuthenticated) {
      saveChatToServer(newChat);
    } else {
      persistIfOffline(updatedChats, newId);
    }
  }

  function handleSelectChat(clickedChatId: string) {
    if (clickedChatId !== activeChatId) {
      // Sync the chat we're leaving (with its current draft), not the destination
      flushDraftSyncToServer(currentChat);
    }

    setActiveChatId(clickedChatId);
    if (window.innerWidth < 768) {
      setActiveLeftPanel(null);
    } else {
      setActiveLeftPanel('chats');
    }
    persistIfOffline(chatList, clickedChatId);
  }

  function handleDraftChange(newDraft: string) {
    // En React, para modificar un elemento dentro de una lista, usamos .map()
    // Recorremos los chats, modificamos solo el activo y dejamos los demás intactos
    const updatedChats = chatList.map((chat) => {
      if (chat.id === activeChatId) {
        return { ...chat, draft: newDraft }; // Copia el chat y actualiza su borrador
      }
      return chat;
    });

    setChatList(updatedChats);
    persistIfOffline(updatedChats, activeChatId);

    const updatedChat = updatedChats.find((chat) => chat.id === activeChatId);
    if (updatedChat) {
      scheduleDraftSyncToServer(updatedChat);
    }
  }

  function handleSystemPromptChange(newSystemPrompt: string) {
    const updatedChats = chatList.map((chat) => {
      if (chat.id === activeChatId) {
        return { ...chat, systemPrompt: newSystemPrompt };
      }
      return chat;
    });

    setChatList(updatedChats);
    persistIfOffline(updatedChats, activeChatId);

    const updatedChat = updatedChats.find((chat) => chat.id === activeChatId);
    if (updatedChat && isAuthenticated) {
      saveChatToServer(updatedChat);
    }
  }

  async function handleAuthSuccess() {
    localStorage.setItem('isLoggedIn', 'true');
    setActiveLeftPanel('chats');
    setIsAuthenticated(true);
    setChatList([]);
    setActiveChatId('');

    try {
      const serverChats = await loadChatsFromServer();

      if (serverChats && serverChats.length > 0) {
        setChatList(serverChats);
        setActiveChatId(serverChats[0].id);
      } else {
        // Cuenta nueva: welcome real en servidor. No pisar chats locales en disco.
        const welcome = await materializeOnlineWelcomeChat();
        setChatList([welcome]);
        setActiveChatId(welcome.id);
      }
    } catch (error) {
      console.error("Error al cargar chats del servidor:", error);
    }

    if (window.innerWidth < 768) {
      setActiveLeftPanel(null);
    } else {
      setActiveLeftPanel('chats');
    }
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
    if (window.innerWidth < 768) {
      setActiveLeftPanel(null);
    } else {
      setActiveLeftPanel('chats');
    }
  }

  async function handleSendMessage() {
    // 1. Validaciones iniciales (Reemplaza a tu document.getElementById)
    if (!currentChat || !currentChat.draft.trim() || isGenerating) return;
    clearDraftSyncTimer(); // Avoid syncing a stale draft after send clears it
    const promptText = currentChat.draft.trim();

    // 2. Preparamos el mensaje del usuario y el mensaje temporal de "pensando"
    const userMessage: Message = { role: "user", parts: [{ text: promptText }], createdAt: new Date().toISOString() };
    const thinkingMessage = { role: "model" as const, parts: [{ text: "Thinking..." }], isTemporary: true, createdAt: new Date().toISOString() };

    // 3. Actualizamos el estado INMEDIATAMENTE para que la UI reaccione
    let updatedMessages = [...currentChat.messages, userMessage, thinkingMessage];
    let newTitle = currentChat.title;

    // Si es el primer mensaje, cambiamos el título
    if (currentChat.messages.length === 0) {
      newTitle = promptText.substring(0, 20) + "...";
    }

    // Actualizamos la lista de chats en React (y limpiamos el borrador)
    const chatsWithUserMsg = chatList.map(chat =>
      chat.id === activeChatId
        ? { ...chat, messages: updatedMessages, title: newTitle, draft: '' }
        : chat
    );
    setChatList(chatsWithUserMsg);
    const controller = new AbortController();
    abortControllerRef.current = controller;
    setIsGenerating(true);

    // 4. Llamamos a la API
    try {
      if (isAuthenticated) {
        const chatToSync = chatsWithUserMsg.find((chat) => chat.id === activeChatId);
        if (chatToSync) {
          // Solo asegurar el documento Chat; no sembrar Thinking/user aquí (van por createMessage).
          await saveChatToServer({ ...chatToSync, messages: [] });
        }
      }

      // Le pasamos los mensajes originales (sin el "pensando") a la API
      const response = await fetchChatResponse(
        activeChatId,
        [...currentChat.messages, userMessage],
        model,
        isAuthenticated,
        currentChat.systemPrompt,
        controller.signal
      );

      // Reemplazamos el mensaje "pensando" por la respuesta real, incluyendo los _id de MongoDB
      updatedMessages = [
        ...currentChat.messages,
        { ...userMessage, _id: response.userMessageId },
        { role: "model", parts: [{ text: response.text }], _id: response.aiMessageId, createdAt: new Date().toISOString(), model }
      ];

      const finalChats = chatsWithUserMsg.map(chat =>
        chat.id === activeChatId
          ? { ...chat, messages: updatedMessages }
          : chat
      );

      setChatList(finalChats);
      persistIfOffline(finalChats, activeChatId);

    } catch (error) {
      const err = error as Error;
      if (err.name === 'AbortError') {
        updatedMessages = [...currentChat.messages, userMessage];
        const abortedChats = chatsWithUserMsg.map(chat =>
          chat.id === activeChatId
            ? { ...chat, messages: updatedMessages }
            : chat
        );
        setChatList(abortedChats);
        persistIfOffline(abortedChats, activeChatId);
      } else if (err.message === 'SESSION_EXPIRED') {
        resetSessionToDefault(); // Implementarás esto luego
        alert("Session expired. Please log in again.");
      } else {
        // Reemplazamos "pensando" por el error
        updatedMessages = [...currentChat.messages, userMessage, { role: "model" as const, parts: [{ text: `Error: ${err.message}` }], createdAt: new Date().toISOString() }];
        setChatList(chatsWithUserMsg.map(chat => chat.id === activeChatId ? { ...chat, messages: updatedMessages } : chat));
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
    const newActiveId = chatId === activeChatId
      ? (updatedChats.length > 0 ? updatedChats[0].id : '')
      : activeChatId;
    setChatList(updatedChats);
    setActiveChatId(newActiveId);
    persistIfOffline(updatedChats, newActiveId);
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
        model,
        isAuthenticated,
        currentChat.systemPrompt,
        controller.signal
      );

      // Reemplazamos "Thinking" por la respuesta y actualizamos los IDs
      updatedMessages = [
        ...historyUpToUser.slice(0, -1),
        { ...userMessage, _id: response.userMessageId || userMessage._id },
        { role: "model", parts: [{ text: response.text }], _id: response.aiMessageId, createdAt: new Date().toISOString(), model }
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
      <ContextMenu />
      <div className="app-container" id='app-container'>
        {(activeLeftPanel !== null || activeRightPanel !== null) && (
          <div
            className="backdrop-overlay"
            onClick={() => {
              setActiveLeftPanel(null);
              setActiveRightPanel(null);
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
                onNavChats={() => setActiveLeftPanel('chats')}
                onNavAccount={() => setActiveLeftPanel('account')}
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
            onToggleLeftSidebar={() => setActiveLeftPanel((prev) => (prev ? null : 'chats'))}
            onToggleRightSidebar={() => setActiveRightPanel((prev) => (prev ? null : 'settings'))}
          />
        </main>

        {activeRightPanel !== null && (
          <>
            <div className="resizer resizer-right" id="right-resizer"></div>
            <aside className="settings-section" id='settings-section' aria-label="Panel secundario">
              {activeRightPanel === 'settings' && (
                <SettingView
                  currentModel={model}
                  onModelChange={(newModel) => {
                    setModel(newModel);
                    localStorage.setItem('model', newModel);
                  }}
                  systemPrompt={currentChat?.systemPrompt ?? ''}
                  onSystemPromptChange={handleSystemPromptChange}
                />
              )}
              {activeRightPanel === 'notes' && (
                <NotesView />
              )}
              <Toolbar
                onNavNotes={() => setActiveRightPanel('notes')}
                onNavConfig={() => setActiveRightPanel('settings')}
              />
            </aside>
          </>
        )}

      </div>
    </>
  );
} 