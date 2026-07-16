import { useState, useEffect } from 'react';
import type { Chat, Message } from './types';
import { loadLocalChats, loadLocalActiveChatId, saveToLocalDisk, getTutorialChat } from './utils/storage';
import { loadChatsFromServer, fetchChatResponse, saveChatToServer, syncChatDraftToServer, deleteChatFromServer, deleteMessageFromServer, fetchChatMessagesFromServer } from './services/api';
import Sidebar from './components/Sidebar';
import { SvgIcons } from './components/SvgIcons';
import { initResizer } from './utils/resizer';
import Toolbar from './components/Toolbar';
import AccountView from './views/AccountView';
import SettingView from './views/SettingsView';
import MessageView from './views/MessageView';

export default function App() {
  const [chatList, setChatList] = useState<Chat[]>([]);
  const [activeChatId, setActiveChatId] = useState<string>('');
  const [currentView, setCurrentView] = useState<'settings' | 'account' | 'chats'>('chats');
  const [hasMoreMap, setHasMoreMap] = useState<Record<string, boolean>>({});
  const currentChat = chatList.find((chat) => chat.id === activeChatId);
  const [token, setToken] = useState<string | null>(localStorage.getItem('userToken'));
  const [model, setModel] = useState<string>(localStorage.getItem('model') || 'gemini-3.5-flash');
  const [provider, setProvider] = useState<string>(localStorage.getItem('provider') || 'google');

  useEffect(() => {
    async function initializeApp() {
      initResizer();
      let initialChats = loadLocalChats() || [];
      let initialActiveId = loadLocalActiveChatId() || '';
      const initialToken = localStorage.getItem('userToken');

      if (initialToken) {
        try {
          const serverChats = await loadChatsFromServer(initialToken);
          if (serverChats && serverChats.length > 0) {
            initialChats = serverChats;
            if (!initialChats.some((chat: Chat) => chat.id === initialActiveId)) {
              initialActiveId = initialChats[0].id;
            }
          }
        } catch (error) {
          console.error("Error al cargar chats del servidor:", error);
          // Si falla el servidor, nos quedamos con los locales que ya se cargaron arriba
        }
      } else if (initialChats.length === 0) {
        // Si no hay token y tampoco hay chats locales, metemos el tutorial
        initialChats = getTutorialChat();
        initialActiveId = 'tutorial-welcome';
        saveToLocalDisk(initialChats, initialActiveId);
      }

      // 2. ¡LE PASAMOS LOS DATOS FINALES A REACT!
      setChatList(initialChats);
      setActiveChatId(initialActiveId);
      // setCurrentView('chats');
    }

    // 3. Ejecutamos la función de inmediato
    initializeApp();
  }, []);

  useEffect(() => {
    const handleBeforeUnload = () => {
      // Si hay un chat seleccionado y el usuario está logueado, sincronizamos el borrador
      if (currentChat && token) {
        syncChatDraftToServer(currentChat, token);
      }
    };

    // 1. Enganchamos el evento al navegador
    window.addEventListener('beforeunload', handleBeforeUnload);

    // 2. La función de limpieza (cleanup)
    // React ejecuta este return automáticamente cuando el componente cambia o muere
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [currentChat, token]);

  useEffect(() => { // Carga inicial de los últimos 6 mensajes cuando cambia el chat activo
    if (!activeChatId) return;
    if (!token) return; // En modo offline no hacemos peticiones

    const activeChat = chatList.find(c => c.id === activeChatId);
    if (activeChat && (!activeChat.messages || activeChat.messages.length === 0) && hasMoreMap[activeChatId] !== false) {
      fetchChatMessagesFromServer(activeChatId, token, 6).then(msgs => {
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
  }, [activeChatId, chatList, hasMoreMap, token]);

  async function handleLoadMoreMessages(chatId: string) {
    if (!token) return;

    const chat = chatList.find(c => c.id === chatId);
    if (!chat || !chat.messages || chat.messages.length === 0) return;

    const oldestMessage = chat.messages[0];
    const before = oldestMessage.createdAt;

    const newMessages = await fetchChatMessagesFromServer(chatId, token, 6, before);
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
    setCurrentView('chats');
  }

  function handleSelectChat(clickedChatId: string) {
    setActiveChatId(clickedChatId);
    setCurrentView('chats');
    saveToLocalDisk(chatList, clickedChatId);
    const clickedChat = chatList.find(chat => chat.id === clickedChatId);
    if (clickedChat) {
      saveChatToServer(clickedChat, token);
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

  async function handleAuthSuccess(newToken: string) {
    setCurrentView('chats');
    setToken(newToken);
    setChatList([]);
    setActiveChatId('');

    try {
      // 2. Pedimos los datos al servidor
      const serverChats = await loadChatsFromServer(newToken);

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
    setCurrentView('chats');
  }

  function resetSessionToDefault() {
    // 1. Limpiamos el token viejo
    localStorage.removeItem('userToken');
    setToken(null);

    // 2. Preparamos los datos del tutorial
    const tutorialChats = getTutorialChat();
    const tutorialId = 'tutorial-welcome';

    // 3. Le avisamos a React para que actualice la interfaz sola
    setChatList(tutorialChats);
    setActiveChatId(tutorialId);
    setCurrentView('chats');

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
      const response = await fetchChatResponse(activeChatId, [...currentChat.messages, userMessage], model, token, provider);

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
    deleteChatFromServer(chatId, token);
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
    if (token && messageToDelete._id) {
      deleteMessageFromServer(activeChatId, messageToDelete._id, token);
    }
  }

  function handleRenameChat(newTitle: string) {
    if (!activeChatId) return;
    const trimmedTitle = newTitle.trim();
    if (!trimmedTitle) return;
    if (currentChat?.title === trimmedTitle) return;
    const updatedChats = chatList.map((chat) => {
      if (chat.id === activeChatId) {
        return { ...chat, title: newTitle };
      }
      return chat;
    });
    setChatList(updatedChats);
    saveToLocalDisk(updatedChats, activeChatId);
    const renamedChat = updatedChats.find((chat) => chat.id === activeChatId);

    if (renamedChat && token) {
      saveChatToServer(renamedChat, token);
    }
  }

  function renderMainContent() {
    switch (currentView) {
      case 'account':
        return (
          <AccountView
            token={token}
            onAuthSuccess={handleAuthSuccess}
            onLogoutAction={resetSessionToDefault}
          />
        );
      case 'settings':
        return (
          <SettingView
            currentTitle={currentChat?.title || ''}
            onRenameChat={handleRenameChat}
            currentModel={model}
            currentProvider={provider}
            onModelChange={(newModel) => {
              setModel(newModel);
              localStorage.setItem('model', newModel);
            }}
            onProviderChange={(newProvider) => {
              setProvider(newProvider);
              localStorage.setItem('provider', newProvider);
            }}
          />
        );
      case 'chats':
        return (
          <Sidebar
            chatList={chatList}
            activeChatId={activeChatId}
            onChatClick={handleSelectChat}
            onCreateNewChat={handleCreateNewChat}
            onDeleteChat={handleDeleteChat}
          />
        );
      default:
        return null;
    }
  }

  return (
    <>
      {/* 1. Inyectamos los símbolos en el DOM */}
      <SvgIcons />
      <div className="app-container" id='app-container'>


        <aside className="sidebar-section" id='sidebar-section'>
          {renderMainContent()}
          <Toolbar
            onNavChats={() => setCurrentView('chats')}
            onNavConfig={() => setCurrentView('settings')}
            onNavAccount={() => setCurrentView('account')}
          />
        </aside>

        <div className="resizer" id='resizer'></div>

        <main className="message-section">
          <MessageView
            key={activeChatId}
            messages={currentChat?.messages || []}
            chatId={activeChatId}
            hasMoreMap={hasMoreMap}
            onLoadMore={() => handleLoadMoreMessages(activeChatId)}
            onDeleteMessage={handleDeleteMessage}
            token={token}
            draft={currentChat?.draft || ''}
            onDraftChange={handleDraftChange}
            onSendMessage={handleSendMessage}
          />
        </main>



      </div>
    </>
  );
} 