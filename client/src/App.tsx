import { useState, useEffect } from 'react';
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

export default function App() {
  const [chatList, setChatList] = useState<Chat[]>([]);
  const [activeChatId, setActiveChatId] = useState<string>('');
  const [activeLeftPanel, setActiveLeftPanel] = useState<'chats' | 'account' | null>('chats');
  const [activeRightPanel, setActiveRightPanel] = useState<'settings' | 'notes' | null>('settings');
  const [hasMoreMap, setHasMoreMap] = useState<Record<string, boolean>>({});
  const currentChat = chatList.find((chat) => chat.id === activeChatId);
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [model, setModel] = useState<string>(() => {
    const savedModel = localStorage.getItem('model');
    if (savedModel && getModelConfig(savedModel)) {
      return savedModel;
    }
    return 'gemini-3.5-flash';
  });

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
      let initialChats = loadLocalChats() || [];
      let initialActiveId = loadLocalActiveChatId() || '';

      // Solo verificamos sesión en el servidor si el usuario se logueó previamente
      const hasSessionFlag = localStorage.getItem('isLoggedIn') === 'true';

      if (hasSessionFlag) {
        try {
          const sessionActive = await checkSession();
          if (sessionActive) {
            setIsAuthenticated(true);

            const serverChats = await loadChatsFromServer();
            if (serverChats && serverChats.length > 0) {
              initialChats = serverChats;
              if (!initialChats.some((chat: Chat) => chat.id === initialActiveId)) {
                initialActiveId = initialChats[0].id;
              }
            }
          } else {
            // Si la cookie expiró en el servidor pero la bandera seguía en true, la limpiamos
            localStorage.removeItem('isLoggedIn');
          }
        } catch (error) {
          console.error("Error en la carga inicial de sesión o chats del servidor:", error);
        }
      }

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
      if (currentChat && isAuthenticated) {
        syncChatDraftToServer(currentChat);
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [currentChat, isAuthenticated]);

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
    // 1. Creamos el nuevo dato exactamente igual que antes
    const newId = 'chat-' + Date.now();
    const newChat = { id: newId, title: 'New conversation', messages: [], draft: '' };

    // 2. En lugar de hacer .push(), le pasamos la nueva lista completa a React
    // (...chatList significa: "copia todos los chats que ya tenías y agrégale el nuevo")
    setChatList([...chatList, newChat]);

    // 3. Le decimos a React cuál es el nuevo ID activo y a qué vista ir
    setActiveChatId(newId);
    if (window.innerWidth < 768) {
      setActiveLeftPanel(null);
    } else {
      setActiveLeftPanel('chats');
    }
  }

  function handleSelectChat(clickedChatId: string) {
    setActiveChatId(clickedChatId);
    if (window.innerWidth < 768) {
      setActiveLeftPanel(null);
    } else {
      setActiveLeftPanel('chats');
    }
    saveToLocalDisk(chatList, clickedChatId);
    const clickedChat = chatList.find(chat => chat.id === clickedChatId);
    if (clickedChat && isAuthenticated) {
      saveChatToServer(clickedChat);
    }
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
    saveToLocalDisk(updatedChats, activeChatId);
  }

  async function handleAuthSuccess() {
    localStorage.setItem('isLoggedIn', 'true'); // 👈 Guardamos el indicador de inicio de sesión
    setActiveLeftPanel('chats');
    setIsAuthenticated(true);
    setChatList([]);
    setActiveChatId('');

    try {
      // 2. Pedimos los datos al servidor
      const serverChats = await loadChatsFromServer();

      if (serverChats && serverChats.length > 0) {
        // Opción A: El usuario ya tenía historial
        setChatList(serverChats);
        setActiveChatId(serverChats[0].id);
      } else {
        // Opción B: Cuenta nueva, no hay chats. Le cargamos el tutorial.
        const tutorialChats = getTutorialChat(); // Asegúrate de tener esto importado
        const tutorialId = 'tutorial-welcome';

        setChatList(tutorialChats);
        setActiveChatId(tutorialId);
        saveToLocalDisk(tutorialChats, tutorialId); // Guardamos para que no lo pierda al recargar
      }
    } catch (error) {
      console.error("Error al cargar chats del servidor:", error);
      // Nota: Si falla el servidor, la lista quedará vacía. 
      // Más adelante podrías agregar un estado para mostrar un mensaje de error en la UI.
    }

    // 3. Cambiamos la vista. Lo ponemos al final para que la pantalla de chat 
    // ya entre con los datos cargados en memoria.
    setActiveLeftPanel('chats');
  }

  async function resetSessionToDefault() {
    localStorage.removeItem('isLoggedIn'); // 👈 Limpiamos el indicador al cerrar sesión
    await logoutFromServer(); // 👈 Llama al backend para limpiar la cookie de sesión
    setIsAuthenticated(false);

    // 2. Preparamos los datos del tutorial
    const tutorialChats = getTutorialChat();
    const tutorialId = 'tutorial-welcome';

    // 3. Le avisamos a React para que actualice la interfaz sola
    setChatList(tutorialChats);
    setActiveChatId(tutorialId);
    setActiveLeftPanel('chats');

    // 4. Guardamos en el disco local esta estructura limpia
    saveToLocalDisk(tutorialChats, tutorialId);
  }

  async function handleSendMessage() {
    // 1. Validaciones iniciales (Reemplaza a tu document.getElementById)
    if (!currentChat || !currentChat.draft.trim()) return;
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

    // 4. Llamamos a la API
    try {
      // Le pasamos los mensajes originales (sin el "pensando") a la API
      const response = await fetchChatResponse(activeChatId, [...currentChat.messages, userMessage], model, isAuthenticated);

      // Reemplazamos el mensaje "pensando" por la respuesta real, incluyendo los _id de MongoDB
      updatedMessages = [
        ...currentChat.messages,
        { ...userMessage, _id: response.userMessageId },
        { role: "model", parts: [{ text: response.text }], _id: response.aiMessageId, createdAt: new Date().toISOString() }
      ];

      const finalChats = chatsWithUserMsg.map(chat =>
        chat.id === activeChatId
          ? { ...chat, messages: updatedMessages }
          : chat
      );

      setChatList(finalChats);
      saveToLocalDisk(finalChats, activeChatId); // Tu guardado local

    } catch (error) {
      const err = error as Error;
      if (err.message === 'SESSION_EXPIRED') {
        resetSessionToDefault(); // Implementarás esto luego
        alert("Session expired. Please log in again.");
      } else {
        // Reemplazamos "pensando" por el error
        updatedMessages = [...currentChat.messages, userMessage, { role: "model" as const, parts: [{ text: `Error: ${err.message}` }], createdAt: new Date().toISOString() }];
        setChatList(chatsWithUserMsg.map(chat => chat.id === activeChatId ? { ...chat, messages: updatedMessages } : chat));
      }
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
    saveToLocalDisk(updatedChats, newActiveId);
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
    saveToLocalDisk(updatedChats, activeChatId);

    // 2. Si hay sesión y el mensaje tiene _id, borrarlo del servidor en segundo plano
    if (isAuthenticated && messageToDelete._id) {
      deleteMessageFromServer(activeChatId, messageToDelete._id);
    }
  }

  async function handleRetryMessage(messageIndex: number) {
    if (!currentChat) return;

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

    // 5. Eliminar mensajes antiguos del backend de forma silenciosa
    if (isAuthenticated) {
      messagesToDeleteFromBackend.forEach(msg => {
        if (msg._id) {
          deleteMessageFromServer(activeChatId, msg._id);
        }
      });
    }

    // 6. Hacer la petición a la API
    try {
      const response = await fetchChatResponse(activeChatId, historyUpToUser, model, isAuthenticated);

      // Reemplazamos "Thinking" por la respuesta y actualizamos los IDs
      updatedMessages = [
        ...historyUpToUser.slice(0, -1),
        { ...userMessage, _id: response.userMessageId || userMessage._id },
        { role: "model", parts: [{ text: response.text }], _id: response.aiMessageId, createdAt: new Date().toISOString() }
      ];

      const finalChats = chatsWithThinking.map(chat =>
        chat.id === activeChatId
          ? { ...chat, messages: updatedMessages }
          : chat
      );

      setChatList(finalChats);
      saveToLocalDisk(finalChats, activeChatId);
    } catch (error) {
      const err = error as Error;
      if (err.message === 'SESSION_EXPIRED') {
        resetSessionToDefault();
        alert("Session expired. Please log in again.");
      } else {
        updatedMessages = [...historyUpToUser, { role: "model" as const, parts: [{ text: `Error: ${err.message}` }], createdAt: new Date().toISOString() }];
        setChatList(chatsWithThinking.map(chat => chat.id === activeChatId ? { ...chat, messages: updatedMessages } : chat));
      }
    }
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
    saveToLocalDisk(updatedChats, activeChatId);
    const retitledChat = updatedChats.find((chat) => chat.id === chatId);

    if (retitledChat && isAuthenticated) {
      saveChatToServer(retitledChat);
    }
  }

  return (
    <>
      {/* 1. Inyectamos los símbolos en el DOM */}
      <SvgIcons />
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