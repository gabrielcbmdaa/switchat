import { useState, useEffect, useRef } from 'react';
import type { Chat, Message } from './types';
import { loadLocalChats, saveToLocalDisk, getTutorialChat } from './utils/storage';
import { loadChatsFromServer, fetchChatResponse, saveMessageToServer, updateMessageOnServer, generateChatTitle, saveChatToServer, syncChatDraftToServer, deleteChatFromServer, deleteMessageFromServer, fetchChatMessagesFromServer, checkSession, logoutFromServer } from './services/api';
import { SvgIcons } from './components/SvgIcons';
import { initResizer } from './utils/resizer';
import Toolbar from './components/Toolbar';
import ChatView from './views/ChatView';
import AccountView from './views/AccountView';
import SettingView from './views/SettingsView';
import MessageView from './views/MessageView';
import NotesView from './views/NotesView';
import LegalView from './views/LegalView';
import { loadDefaultModel, saveDefaultModel, resolveReasoningLevel, migrateRetiredModels } from './utils/modelPreferences';
import SelectionToolbar from './components/SelectionToolbar';
import { isMobileViewport, fitsBothPanels, loadPanelView, savePanelView, loadPanelOpen, savePanelOpen, loadActiveChatId, saveActiveChatId } from './utils/uiPreferences';
import { syncApiKeysWithServer } from './utils/apiKeys';
import { matchPanelShortcut } from './utils/keyboardShortcuts';
import type { LeftPanelView, RightPanelView } from './utils/uiPreferences';
import { isNotesEnabled } from './utils/notesContext';
import { sortChatList } from './utils/chatOrder';

// El chat nuevo lleva su id real desde el principio: cuando se materialice al enviar
// el primer mensaje no hay que reasignar nada.
function createDraftChat(): Chat {
  return { id: 'chat-' + Date.now(), title: 'New conversation', messages: [], draft: '', model: loadDefaultModel(), createdAt: new Date().toISOString() };
}

// Lo que dura en pantalla un mensaje temporal antes de retirarse solo.
const TEMPORARY_MESSAGE_MS = 5000;

// Both edit routes say the same thing because the same thing is true in both: the server kept
// the old wording, and the screen has been put back to match it. Silence here used to leave the
// two showing different text until the next reload.
const EDIT_NOT_SAVED = 'Could not save the edit. The message was left as it was.';
const CHAT_NOT_SAVED = 'Could not save the change. The chat was left as it was.';

function snapshotManagedFields(chat: Chat): Partial<Chat> {
  // The fields this helper owns. Draft and notes text travel on a different timer;
  // messages never go through saveChatFieldsToServer (syncChat would reseed them).
  // Mongo stores model as '' on chats that never picked one. The dropdown does not
  // show that empty string: it shows the seed for new chats. Revert must land on
  // that visible id, or '' || defaultModel paints the model we just failed to save.
  return {
    pinned: chat.pinned,
    title: chat.title,
    model: chat.model || loadDefaultModel(),
    reasoningLevel: chat.reasoningLevel,
    systemPromptEnabled: chat.systemPromptEnabled,
    notesEnabled: chat.notesEnabled,
  };
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
  // What the center column shows. Legal prose needs the width the panels do not have,
  // so it takes over the center instead of living in the right panel. It is not
  // persisted: reopening the app always lands on the conversation.
  const [isLegalOpen, setIsLegalOpen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  // Dos hechos distintos sobre el mismo chat, que antes compartían mapa: hasMoreMap dice
  // si quedan mensajes MÁS ANTIGUOS detrás del cursor, y loadedChatIds si ya le hemos
  // pedido su primera página al servidor. Juntarlos los hacía indistinguibles justo en el
  // caso peor — un chat de menos de una página, que responde "no hay más" a la primera —,
  // y entonces "no hay nada anterior" se leía como "ya está cargado, no preguntes".
  const [hasMoreMap, setHasMoreMap] = useState<Record<string, boolean>>({});
  const [loadedChatIds, setLoadedChatIds] = useState<Record<string, boolean>>({});
  // Chat en borrador: vive solo en memoria hasta que se envía el primer mensaje.
  // No está en chatList, no se persiste y no aparece en la barra lateral.
  const [draftChat, setDraftChat] = useState<Chat | null>(null);
  const isDraftChat = draftChat?.id === activeChatId;
  const currentChat = chatList.find((chat) => chat.id === activeChatId)
    ?? (draftChat && draftChat.id === activeChatId ? draftChat : undefined);
  // El borrador no existe en el servidor: solo los chats materializados se sincronizan.
  const syncableChat = isDraftChat ? undefined : currentChat;
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  // Generar es un estado DEL CHAT, no de la app: con una bandera global, mirar otra
  // conversación mientras el modelo responde ponía el botón en modo Stop en un chat que no
  // estaba generando nada, y pulsarlo abortaba el de al lado. Un chat a la vez, pero varios
  // chats a la vez — lo que solo es seguro desde que cada respuesta escribe únicamente el
  // suyo (ver commitChatMessages).
  const [generatingChatIds, setGeneratingChatIds] = useState<string[]>([]);
  const abortControllersRef = useRef<Map<string, AbortController>>(new Map());
  // Chats cuya primera página está pedida y todavía no ha vuelto (ver el efecto de carga)
  const pendingFirstPageRef = useRef<Set<string>>(new Set());
  const draftSyncTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // De quién es el borrador que espera a sincronizarse. Sin esto, borrar un chat cualquiera
  // tendría que cancelar el temporizador a ciegas y se llevaría por delante el borrador de
  // otro; con el id se cancela solo cuando el muerto es justo el que iba a escribirse.
  const draftSyncChatIdRef = useRef<string | null>(null);
  // Los temporizadores de los mensajes temporales, para poder cancelarlos al desmontar:
  // un setTimeout que sobrevive al componente escribiría estado en un árbol que ya no está.
  const temporaryMessageTimersRef = useRef<Set<number>>(new Set());
  const noticeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const currentChatRef = useRef(currentChat);
  const isAuthenticatedRef = useRef(isAuthenticated);
  // Espejo del estado para los callbacks que resuelven después de un await
  const chatListRef = useRef(chatList);
  const activeChatIdRef = useRef(activeChatId);
  // Last snapshot Mongo accepted for the managed fields. Revert goes here, not to
  // whatever was on screen at the click — that may already be another optimistic try.
  const lastAckedRef = useRef<Record<string, Partial<Chat>>>({});
  // One in-flight save per chat: the next click waits, then reapplies its own fields.
  const saveChainRef = useRef<Record<string, Promise<void>>>({});
  // Preferencia global: solo decide con qué modelo nacen los chats nuevos.
  // El modelo que se usa de verdad es el del chat activo.
  const [defaultModel, setDefaultModel] = useState<string>(loadDefaultModel);
  // Los chats de antes del cambio llegan sin ajustes (o con '' desde Mongo): el modelo
  // cae en la preferencia global y el nivel en el defaultThinking del modelo.
  const activeModel = currentChat?.model || defaultModel;
  const activeReasoning = resolveReasoningLevel(activeModel, currentChat?.reasoningLevel);
  // Lo que ve el chat abierto, que es lo único que la barra de abajo puede afirmar.
  const isActiveChatGenerating = generatingChatIds.includes(activeChatId);

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

  // Ninguna de las tres columnas de escritorio se encoge: los paneles llevan flex: none y
  // el área de mensajes tiene min-width. Por debajo de 1006px no caben las tres y el layout
  // se salía por la derecha. Se cierra el panel derecho, que es el accesorio, para que el
  // chat nunca baje de sus 400px. Se comprueba también al montar: la ventana pudo cambiar
  // de tamaño con la pestaña cerrada.
  useEffect(() => {
    if (!isLeftPanelOpen || !isRightPanelOpen) return;

    const closeRightPanelIfTight = () => {
      if (isMobileViewport() || fitsBothPanels()) return;
      setIsRightPanelOpen(false);
    };

    closeRightPanelIfTight();
    window.addEventListener('resize', closeRightPanelIfTight);
    return () => window.removeEventListener('resize', closeRightPanelIfTight);
  }, [isLeftPanelOpen, isRightPanelOpen]);

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
    draftSyncChatIdRef.current = null;
  }

  function scheduleDraftSyncToServer(chat: Chat) {
    if (!isAuthenticatedRef.current) return;
    clearDraftSyncTimer();
    draftSyncChatIdRef.current = chat.id;
    draftSyncTimerRef.current = setTimeout(() => {
      syncChatDraftToServer(chat);
      draftSyncTimerRef.current = null;
      draftSyncChatIdRef.current = null;
    }, 2000);
  }

  function flushDraftSyncToServer(chat: Chat | undefined) {
    clearDraftSyncTimer();
    if (chat && isAuthenticatedRef.current) {
      syncChatDraftToServer(chat);
    }
  }

  // Takes over the center column. On mobile the panels are drawers covering it, so they
  // step aside: opening a document nobody can see would be a dead click.
  function openLegal() {
    setIsLegalOpen(true);
    if (isMobileViewport()) {
      setIsLeftPanelOpen(false);
      setIsRightPanelOpen(false);
    }
  }

  // Abrir un panel cuando no caben los dos cierra el otro: se queda el último que pides.
  // En móvil no aplica, ahí los paneles flotan sobre el chat y no le roban sitio.
  function toggleLeftPanel() {
    const willOpen = !isLeftPanelOpen;
    setIsLeftPanelOpen(willOpen);
    if (willOpen && !isMobileViewport() && !fitsBothPanels()) setIsRightPanelOpen(false);
  }

  function toggleRightPanel() {
    const willOpen = !isRightPanelOpen;
    setIsRightPanelOpen(willOpen);
    if (willOpen && !isMobileViewport() && !fitsBothPanels()) setIsLeftPanelOpen(false);
  }

  // ⌘B abre y cierra el panel derecho, ⌥⌘B el izquierdo (Ctrl y Ctrl+Alt fuera de macOS).
  //
  // Sin array de dependencias a propósito: toggleLeftPanel y toggleRightPanel leen
  // isLeftPanelOpen / isRightPanelOpen directamente, así que con [] el listener se quedaría
  // mirando el estado del primer render y el panel dejaría de responder tras la primera
  // pulsación. Volver a suscribirse en cada render cuesta nada y siempre es correcto.
  useEffect(() => {
    const handlePanelShortcut = (event: KeyboardEvent) => {
      const side = matchPanelShortcut(event);
      if (!side) return;
      event.preventDefault();
      if (side === 'left') toggleLeftPanel();
      else toggleRightPanel();
    };

    window.addEventListener('keydown', handlePanelShortcut);
    return () => window.removeEventListener('keydown', handlePanelShortcut);
  });

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

  function rememberAckedChats(chats: Chat[]) {
    const next: Record<string, Partial<Chat>> = {};
    for (const chat of chats) {
      next[chat.id] = snapshotManagedFields(chat);
    }
    lastAckedRef.current = next;
  }

  function enqueueChatSave(chatId: string, job: () => Promise<void>): void {
    const previous = saveChainRef.current[chatId] ?? Promise.resolve();
    const next = previous.catch(() => undefined).then(job);
    saveChainRef.current[chatId] = next;
  }

  function applyLiveChatFields(chatId: string, fields: Partial<Chat>): Chat | undefined {
    const live = chatListRef.current.find((item) => item.id === chatId);
    if (!live) return undefined;
    const next = { ...live, ...fields };
    const updatedChats = chatListRef.current.map((item) => (item.id === chatId ? next : item));
    chatListRef.current = updatedChats;
    setChatList(updatedChats);
    return next;
  }

  // Field-only save: messages stay out so syncChat cannot reseed them. Clicks paint
  // immediately; this work waits its turn per chat. On failure, restore the last
  // snapshot Mongo accepted (or this click's previousFields if there is no ack yet)
  // over the live list — a draft typed while we waited must survive. If the chat is
  // gone, drop the answer.
  function saveChatFieldsToServer(
    chat: Chat,
    previousFields: Partial<Chat>,
    expectedFields: Partial<Chat>,
  ): void {
    enqueueChatSave(chat.id, async () => {
      // A pending draft sync carries a SNAPSHOT of the chat taken before this click
      // and leaves two seconds later. syncChat writes every field it receives, so
      // that photo would hand a just-saved title or pin its old value back in Mongo.
      // Cancelling it loses nothing on success: this POST already carries the live draft.
      if (draftSyncChatIdRef.current === chat.id) clearDraftSyncTimer();

      const intended = applyLiveChatFields(chat.id, expectedFields);
      if (!intended) return;

      const ok = await saveChatToServer({ ...intended, messages: [] });
      if (ok) {
        lastAckedRef.current[chat.id] = snapshotManagedFields(intended);
        return;
      }

      const ack = lastAckedRef.current[chat.id] ?? previousFields;
      const restored = applyLiveChatFields(chat.id, ack);
      if (!restored) return;
      showNotice(CHAT_NOT_SAVED);
      // The cancelled timer never uploaded the text. Arm it again on the restored
      // chat so a failed pin or rename does not also drop the draft.
      scheduleDraftSyncToServer(restored);
    });
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

    chatListRef.current = updatedChats;
    setChatList(updatedChats);
    persistIfOffline(updatedChats);

    if (isAuthenticatedRef.current) {
      saveChatToServer({ ...targetChat, title, messages: [] });
    }
  }

  // Escribe los mensajes de UN chat sin tocar el resto de la lista. Lee la lista viva por
  // referencia, igual que applyGeneratedTitle: quien resuelve después de un await no puede
  // partir de la foto que tenía antes de esperar, porque cualquier cosa ocurrida mientras
  // tanto (los mensajes que se cargaron al cambiar de chat, un chat borrado, un borrador
  // recién escrito) se perdería al reescribir la lista entera.
  function commitChatMessages(chatId: string, messages: Message[], messagesToPersist?: Message[]) {
    const chats = chatListRef.current;
    // Borrado durante la generación: se descarta la respuesta en vez de resucitar el chat.
    if (!chats.some((chat) => chat.id === chatId)) return;

    const updatedChats = chats.map((chat) => (chat.id === chatId ? { ...chat, messages } : chat));

    // El efecto que sincroniza el ref no ha corrido todavía entre dos escrituras seguidas,
    // y el camino de error escribe dos veces: hay que adelantarlo a mano.
    chatListRef.current = updatedChats;
    setChatList(updatedChats);
    // Lo que se ve y lo que se guarda no siempre son lo mismo. Un mensaje temporal —el
    // "pensando", un error— se pinta pero no baja a disco: allí quedaría congelado y
    // reaparecería en la siguiente recarga, sin botón de reintentar y sin nada que lo
    // retire, porque el temporizador que lo iba a borrar murió con la pestaña.
    persistIfOffline(messagesToPersist
      ? updatedChats.map((chat) => (chat.id === chatId ? { ...chat, messages: messagesToPersist } : chat))
      : updatedChats);
  }

  function showNotice(message: string) {
    if (noticeTimerRef.current) clearTimeout(noticeTimerRef.current);
    setNotice(message);
    noticeTimerRef.current = setTimeout(() => {
      noticeTimerRef.current = null;
      setNotice(null);
    }, TEMPORARY_MESSAGE_MS);
  }

  // A leftover timer would still fire after a later notice replaced this one, and
  // would take that new notice down with it.
  function dismissNotice() {
    if (noticeTimerRef.current) clearTimeout(noticeTimerRef.current);
    noticeTimerRef.current = null;
    setNotice(null);
  }

  // Retira un mensaje temporal pasados unos segundos. Guarda el mensaje exacto que puso y
  // solo lo quita si sigue siendo el último: durante esos segundos el usuario ha podido
  // reintentar, borrar o recibir otra respuesta, y entonces la conversación ya es otra y
  // no nos toca tocarla. La comparación es por referencia a propósito: commitChatMessages
  // rehace el array, pero los mensajes de dentro son los mismos objetos.
  function scheduleTemporaryMessageRemoval(chatId: string, message: Message) {
    const timer = window.setTimeout(() => {
      temporaryMessageTimersRef.current.delete(timer);
      const chat = chatListRef.current.find((item) => item.id === chatId);
      if (!chat || chat.messages[chat.messages.length - 1] !== message) return;
      commitChatMessages(chatId, chat.messages.slice(0, -1));
    }, TEMPORARY_MESSAGE_MS);
    temporaryMessageTimersRef.current.add(timer);
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
    // Nace aquí: es uno de los dos únicos sitios que pueden crear un chat en el servidor.
    await saveChatToServer(welcome, { allowCreate: true });
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
            const chats = migrateRetiredModels(serverChats);
            rememberAckedChats(chats);
            setChatList(chats);
            setActiveChatId(
              localActiveId && serverChats.some((chat: Chat) => chat.id === localActiveId)
                ? localActiveId
                : sortChatList(serverChats)[0].id
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
            const chats = migrateRetiredModels(serverChats);
            rememberAckedChats(chats);
            setChatList(chats);
            setActiveChatId(sortChatList(serverChats)[0].id);
            return;
          }

          const welcome = await materializeOnlineWelcomeChat(session.userId);
          if (cancelled) return;
          rememberAckedChats([welcome]);
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

      setChatList(migrateRetiredModels(initialChats));
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

  // Un setTimeout pendiente al desmontar escribiría en un árbol que ya no existe.
  useEffect(() => {
    const timers = temporaryMessageTimersRef.current;
    return () => {
      timers.forEach((timer) => window.clearTimeout(timer));
      timers.clear();
      if (noticeTimerRef.current) clearTimeout(noticeTimerRef.current);
    };
  }, []);

  useEffect(() => { // Carga inicial de los últimos 6 mensajes cuando cambia el chat activo
    if (!activeChatId) return;
    if (!isAuthenticated) return; // En modo offline no hacemos peticiones
    if (isDraftChat) return; // El borrador aún no existe en el servidor

    if (loadedChatIds[activeChatId]) return; // Su primera página ya se pidió
    // Y esta guarda es la que impide pedirla N veces: el efecto depende de chatList, que
    // cambia con cada tecla del borrador y con cada respuesta de cualquier otro chat, y
    // loadedChatIds no se marca hasta que el servidor contesta. Sin esto, escribir mientras
    // carga dispara una petición por pulsación. Es un ref y no estado a propósito: hay que
    // verlo en el mismo tick en que se pide, antes de cualquier re-render.
    if (pendingFirstPageRef.current.has(activeChatId)) return;

    const activeChat = chatList.find(c => c.id === activeChatId);
    if (activeChat && (!activeChat.messages || activeChat.messages.length === 0)) {
      const requestedChatId = activeChatId;
      pendingFirstPageRef.current.add(requestedChatId);

      fetchChatMessagesFromServer(requestedChatId, 6).then(msgs => {
        // Sin respuesta (red caída) no marcamos nada: al volver a entrar se reintenta.
        if (msgs) {
          setChatList(prevChats => prevChats.map(c => {
            if (c.id === requestedChatId) {
              return { ...c, messages: msgs };
            }
            return c;
          }));
          setLoadedChatIds(prev => ({ ...prev, [requestedChatId]: true }));
          // Página incompleta: el servidor no tiene nada más antiguo que enseñar.
          if (msgs.length < 6) {
            setHasMoreMap(prev => ({ ...prev, [requestedChatId]: false }));
          }
        }
      }).finally(() => {
        pendingFirstPageRef.current.delete(requestedChatId);
      });
    }
  }, [activeChatId, chatList, loadedChatIds, isAuthenticated, isDraftChat]);

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

    setIsLegalOpen(false); // Same as picking one: the center goes back to the conversation
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
    setIsLegalOpen(false); // Picking a chat means going back to the conversation
    showLeftPanel('chats');
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
    // Reasoning scales are not universal: the level is revalidated against the new
    // model and saved with it, so the chat is never left on a level its provider
    // does not understand. previousModel is the id the dropdown showed — Mongo may
    // still hold '', which is not what was on screen.
    const previousModel = currentChat?.model || defaultModel;
    const previousReasoning = resolveReasoningLevel(
      previousModel,
      currentChat?.reasoningLevel,
    );
    const nextReasoning = resolveReasoningLevel(newModel, activeReasoning);
    const updatedChat = updateActiveChat((chat) => ({ ...chat, model: newModel, reasoningLevel: nextReasoning }));

    if (updatedChat && isAuthenticated && !isDraftChat) {
      void saveChatFieldsToServer(
        updatedChat,
        { model: previousModel, reasoningLevel: previousReasoning },
        { model: newModel, reasoningLevel: nextReasoning },
      );
    }

    // El último modelo elegido pasa a ser con el que nacen los chats nuevos.
    setDefaultModel(newModel);
    saveDefaultModel(newModel);
  }

  function handleReasoningChange(level: string) {
    const previousLevel = currentChat?.reasoningLevel;
    const updatedChat = updateActiveChat((chat) => ({ ...chat, reasoningLevel: level }));

    if (updatedChat && isAuthenticated && !isDraftChat) {
      void saveChatFieldsToServer(
        updatedChat,
        { reasoningLevel: previousLevel },
        { reasoningLevel: level },
      );
    }
  }

  function handleSystemPromptChange(newSystemPrompt: string) {
    const updatedChat = updateActiveChat((chat) => ({ ...chat, systemPrompt: newSystemPrompt }));

    if (updatedChat && isAuthenticated && !isDraftChat) {
      saveChatToServer(updatedChat);
    }
  }

  function handleSystemPromptEnabledChange(isEnabled: boolean) {
    const previousEnabled = currentChat?.systemPromptEnabled;
    const updatedChat = updateActiveChat((chat) => ({ ...chat, systemPromptEnabled: isEnabled }));

    if (updatedChat && isAuthenticated && !isDraftChat) {
      void saveChatFieldsToServer(
        updatedChat,
        { systemPromptEnabled: previousEnabled },
        { systemPromptEnabled: isEnabled },
      );
    }
  }

  function handleNotesEnabledChange(isEnabled: boolean) {
    const previousEnabled = currentChat?.notesEnabled;
    const updatedChat = updateActiveChat((chat) => ({ ...chat, notesEnabled: isEnabled }));

    if (updatedChat && isAuthenticated && !isDraftChat) {
      void saveChatFieldsToServer(
        updatedChat,
        { notesEnabled: previousEnabled },
        { notesEnabled: isEnabled },
      );
    }
  }

  function handleNotesChange(newNotes: string) {
    const updatedChat = updateActiveChat((chat) => ({ ...chat, notes: newNotes }));

    if (updatedChat && !isDraftChat) {
      scheduleDraftSyncToServer(updatedChat);
    }
  }

  function handleSendToNotes(text: string) {
    const updatedChat = updateActiveChat((chat) => {
      const prev = chat.notes ?? '';
      const separator = prev.trim() ? '\n\n' : '';
      return { ...chat, notes: prev + separator + text };
    });

    if (updatedChat && !isDraftChat) {
      scheduleDraftSyncToServer(updatedChat);
    }
  }

  async function handleAuthSuccess() {
    localStorage.setItem('isLoggedIn', 'true');
    setLeftPanelView('chats');
    setIsAuthenticated(true);
    lastAckedRef.current = {};
    saveChainRef.current = {};
    setChatList([]);
    setActiveChatId('');
    setDraftChat(null);
    // Los mapas de paginación hablan de los chats de la sesión anterior: entrar con otra
    // cuenta y arrastrarlos daría por cargado un chat que este usuario no ha abierto.
    setHasMoreMap({});
    setLoadedChatIds({});

    // Sin await: las claves se reconcilian en segundo plano y no deben retrasar la entrada
    syncApiKeysWithServer();

    try {
      const serverChats = await loadChatsFromServer();

      if (serverChats && serverChats.length > 0) {
        const chats = migrateRetiredModels(serverChats);
        rememberAckedChats(chats);
        setChatList(chats);
        setActiveChatId(sortChatList(serverChats)[0].id);
      } else {
        // Cuenta nueva: welcome real en servidor (id estable). No pisar chats locales.
        const session = await checkSession();
        if (!session.userId) {
          console.error('Active session without userId; cannot materialize the welcome chat.');
          return;
        }
        const welcome = await materializeOnlineWelcomeChat(session.userId);
        rememberAckedChats([welcome]);
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
    lastAckedRef.current = {};
    saveChainRef.current = {};

    // Restaurar chats offline intactos; solo persistir tutorial si no había ninguno.
    let localChats = loadLocalChats() || [];
    let localActiveId = loadActiveChatId() || '';
    if (localChats.length === 0) {
      localChats = getTutorialChat();
      localActiveId = 'tutorial-welcome';
      saveToLocalDisk(localChats);
    } else if (!localChats.some((chat) => chat.id === localActiveId)) {
      localActiveId = sortChatList(localChats)[0].id;
    }

    setChatList(migrateRetiredModels(localChats));
    setActiveChatId(localActiveId);
    setDraftChat(null);
    setHasMoreMap({});
    setLoadedChatIds({});
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
      // Save-and-reply already PATCHed the user message. Posting it again would
      // duplicate it and rewrite createdAt.
      saveUserMessage?: boolean;
    } = {}
  ) {
    // La convención de arriba, comprobada: sin mensaje de usuario al final no hay nada
    // que responder, y seguir adelante dejaría dos respuestas del modelo seguidas y un
    // _id de usuario pegado al mensaje equivocado.
    const userMessage = historyToSend[historyToSend.length - 1];
    if (!userMessage || userMessage.role !== 'user') return;

    const targetChat = chats.find((chat) => chat.id === chatId);
    // Del chat DESTINO, no del activo. Hoy solo se envía desde el chat abierto, pero con
    // varias generaciones a la vez el chat abierto ya no identifica a quién le toca este
    // modelo: enviar en uno y saltar a otro mandaría la respuesta con el modelo del vecino.
    const targetModel = targetChat?.model || defaultModel;
    const targetReasoning = resolveReasoningLevel(targetModel, targetChat?.reasoningLevel);
    const thinkingMessage ={ role: "model" as const, parts: [{ text: "Thinking..." }], isTemporary: true, createdAt: new Date().toISOString() };

    // Pintamos el "pensando" antes de nada para que la UI reaccione al instante
    const chatsWithThinking = chats.map(chat =>
      chat.id === chatId
        ? { ...chat, messages: [...historyToSend, thinkingMessage] }
        : chat
    );
    setChatList(chatsWithThinking);
    // Síncrono, sin awaits de por medio: aquí la foto todavía es la lista viva, y trae
    // además el chat que acaba de nacer del borrador. A partir de este punto manda el ref.
    chatListRef.current = chatsWithThinking;
    const controller = new AbortController();
    abortControllersRef.current.set(chatId, controller);
    setGeneratingChatIds(prev => prev.includes(chatId) ? prev : [...prev, chatId]);

    // El prompt se guarda ANTES de generar para que cerrar la pestaña a mitad no se lleve
    // lo que el usuario acaba de escribir: se pierde la respuesta, nunca la pregunta.
    // Persistimos historyToSend y no chatsWithThinking a propósito: el "pensando" es
    // isTemporary y en disco quedaría congelado y sin botón de reintentar (handleRetryMessage
    // descarta los isTemporary). El estado que queda es el mismo que ya deja abortar.
    persistIfOffline(chatsWithThinking.map(chat => chat.id === chatId ? { ...chat, messages: historyToSend } : chat));

    // Se asigna dentro del try, no aquí: el servidor comprueba que el chat exista y sea
    // tuyo, y es beforeRequest quien lo materializa en Mongo. Vive fuera para que el catch
    // pueda sellar el _id aunque la generación acabe fallando o abortada.
    let pendingUserMessageId: Promise<string | undefined> = Promise.resolve(undefined);

    try {
      await options.beforeRequest?.();

      if (isAuthenticatedRef.current && options.saveUserMessage !== false) {
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
        targetModel,
        targetReasoning,
        // The system prompt only travels if this chat's switch is on
        targetChat?.systemPromptEnabled === false ? undefined : targetChat?.systemPrompt,
        controller.signal,
        isNotesEnabled(targetChat?.notesEnabled) ? targetChat?.notes : undefined,
        isNotesEnabled(targetChat?.notesEnabled)
      );

      // Si el prompt no llegó a guardarse, este await relanza y no persistimos la respuesta.
      // Es deliberado: una conversación sin su última respuesta se reintenta, pero una
      // respuesta sin su pregunta rompe handleRetryMessage, que da por hecho que todo
      // mensaje del modelo va precedido del usuario que lo provocó.
      const userMessageId = await pendingUserMessageId;

      const aiMessageId = isAuthenticatedRef.current
        ? await saveMessageToServer(chatId, { sender: 'ai', content: response.text, model: targetModel, reasoningLevel: targetReasoning })
        : undefined;

      // Reemplazamos el "pensando" por la respuesta real y sellamos los _id de MongoDB.
      // El || rescata el _id que el mensaje ya tuviera: al reintentar existe, al enviar no.
      commitChatMessages(chatId, [
        ...historyToSend.slice(0, -1),
        { ...userMessage, _id: userMessageId || userMessage._id },
        { role: "model", parts: [{ text: response.text }], _id: aiMessageId, createdAt: new Date().toISOString(), model: targetModel, reasoningLevel: targetReasoning }
      ]);

      options.onSuccess?.(response.text);
    } catch (error) {
      const err = error as Error;

      if (err.name === 'AbortError') {
        // Abortar deja la conversación tal y como se envió, sin respuesta. El botón se
        // libera ya mismo: lo único que puede seguir en vuelo es el guardado del mensaje de
        // usuario, no la generación, que ya está cortada. Su _id se sella en cuanto llegue,
        // parcheando el mensaje que comparte createdAt, no el objeto original: un edit
        // in-place lo sustituye, y un segundo prompt nace con otra fecha.
        if (abortControllersRef.current.get(chatId) === controller) {
          abortControllersRef.current.delete(chatId);
          setGeneratingChatIds(prev => prev.filter(id => id !== chatId));
        }
        commitChatMessages(chatId, historyToSend);
        pendingUserMessageId.catch(() => undefined).then((savedUserMessageId) => {
          if (!savedUserMessageId) return;
          const chat = chatListRef.current.find((item) => item.id === chatId);
          if (!chat) return;
          // By createdAt, not by object identity: an in-place edit replaces the
          // object, and stamping only the original would leave the prompt without
          // an _id and skip every later PATCH.
          const patched = chat.messages.map((message) =>
            message.role === 'user' &&
            userMessage.createdAt &&
            message.createdAt === userMessage.createdAt
              ? { ...message, _id: savedUserMessageId }
              : message
          );
          commitChatMessages(chatId, patched);
        });
        return;
      }

      // El prompt puede haberse guardado aunque la generación fallara. Sin sellar su _id el
      // mensaje queda huérfano en Mongo: el cliente lo borraría solo de la pantalla y
      // reaparecería en la siguiente recarga.
      const savedUserMessageId = await pendingUserMessageId.catch(() => undefined);
      const sealedHistory = [
        ...historyToSend.slice(0, -1),
        { ...userMessage, _id: savedUserMessageId || userMessage._id },
      ];

      if (err.message === 'SESSION_EXPIRED') {
        resetSessionToDefault();
        showNotice("Session expired. Please log in again.");
      } else {
        // El error ocupa el sitio del "pensando", pero no es parte de la conversación: se
        // enseña unos segundos y se retira, dejando la pregunta lista para reintentar. Se
        // persiste el historial SIN él, igual que con el "pensando": en disco un error se
        // queda para siempre, y lo que cuenta el error casi nunca sigue siendo verdad en
        // la siguiente sesión.
        const errorMessage: Message = {
          role: "model",
          parts: [{ text: `Error: ${err.message}` }],
          isTemporary: true,
          createdAt: new Date().toISOString(),
        };
        commitChatMessages(chatId, [...sealedHistory, errorMessage], sealedHistory);
        scheduleTemporaryMessageRemoval(chatId, errorMessage);
      }
    } finally {
      // Solo si sigue siendo el nuestro: un reintento sobre el mismo chat ya habrá dejado
      // el suyo en el mapa, y borrarlo dejaría su Stop sin nada que abortar.
      if (abortControllersRef.current.get(chatId) === controller) {
        abortControllersRef.current.delete(chatId);
        setGeneratingChatIds(prev => prev.filter(id => id !== chatId));
      }
    }
  }

  async function handleSendMessage() {
    // 1. Validaciones iniciales (Reemplaza a tu document.getElementById)
    // Bloquea solo si ESTE chat ya está generando: otro chat ocupado no es asunto suyo.
    if (!currentChat || !currentChat.draft.trim() || generatingChatIds.includes(currentChat.id)) return;
    clearDraftSyncTimer(); // Avoid syncing a stale draft after send clears it
    const promptText = currentChat.draft.trim();
    // Fijamos el chat destino: durante los await el chat activo puede cambiar
    const chatId = currentChat.id;
    const isFirstMessage = currentChat.messages.length === 0;
    // Enviar el primer mensaje es el acto de nacimiento del borrador: aquí entra en la lista.
    // Se parte del ref y no de chatList: si otro chat acaba de recibir su respuesta, su
    // commit ya adelantó el ref pero este render todavía no se ha repintado, y arrancar de
    // la copia vieja volvería a tirar por la borda lo que acaba de llegar.
    const baseChats = isDraftChat ? [...chatListRef.current, currentChat] : chatListRef.current;

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
        // El otro sitio que puede crear: aquí es donde un borrador se convierte en chat real.
        if (chatToSync) await saveChatToServer({ ...chatToSync, messages: [] }, { allowCreate: true });
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

  // Por referencia y no por el cierre del render: handleDeleteMessage llama aquí después
  // de dos await, y para entonces su copia de chatList puede haber envejecido.
  function handleDeleteChat(chatId: string) {
    if (!chatId) return;
    // Si estaba generando, su respuesta ya no tiene dónde aterrizar (commitChatMessages la
    // descarta). Abortarla evita seguir pagando tokens por algo que nadie va a leer.
    abortControllersRef.current.get(chatId)?.abort();
    // Un borrador suyo esperando a salir lo resucitaría: la ruta de sincronización hace
    // upsert, así que ese envío tardío recrea en Mongo el chat que acabas de borrar.
    if (draftSyncChatIdRef.current === chatId) clearDraftSyncTimer();
    delete lastAckedRef.current[chatId];
    const activeId = activeChatIdRef.current;
    const updatedChats = chatListRef.current.filter(chat => chat.id !== chatId);
    chatListRef.current = updatedChats;
    setChatList(updatedChats);

    if (chatId === activeId && updatedChats.length === 0) {
      // Sin chats a los que caer: abrimos la vista de chat nuevo
      startDraftChat(updatedChats);
    } else {
      const newActiveId = chatId === activeId ? sortChatList(updatedChats)[0].id : activeId;
      setActiveChatId(newActiveId);
      persistIfOffline(updatedChats);
    }

    if (isAuthenticatedRef.current) {
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

  async function handleSaveMessage(messageIndex: number, text: string) {
    if (!currentChat || isDraftChat || generatingChatIds.includes(currentChat.id)) return;

    const trimmed = text.trim();
    if (!trimmed) return;

    const message = currentChat.messages[messageIndex];
    if (!message || message.role !== 'user' || message.isTemporary) return;

    const chatId = currentChat.id;
    const originalText = message.parts[0]?.text ?? '';
    const updatedMessages = currentChat.messages.map((msg, index) =>
      index === messageIndex ? { ...msg, parts: [{ text: trimmed }] } : msg
    );
    commitChatMessages(chatId, updatedMessages);

    if (isAuthenticatedRef.current && message._id) {
      try {
        await updateMessageOnServer(chatId, message._id, trimmed);
      } catch (error) {
        const err = error as Error;
        if (err.message === 'SESSION_EXPIRED') {
          // Nothing to put back: resetSessionToDefault swaps the whole list for the offline
          // chats, and this one is not among them.
          resetSessionToDefault();
          showNotice('Session expired. Please log in again.');
        } else {
          console.error('Failed to update the message on the server:', err);
          // Put the bubble back to the wording the server still holds. Only this message, and
          // over the live list: the array this handler closed over is older than the await.
          const live = chatListRef.current.find((chat) => chat.id === chatId);
          if (live) {
            commitChatMessages(chatId, live.messages.map((msg) =>
              msg._id === message._id ? { ...msg, parts: [{ text: originalText }] } : msg
            ));
          }
          showNotice(EDIT_NOT_SAVED);
        }
      }
    }
  }

  async function handleSaveAndReply(messageIndex: number, text: string) {
    if (!currentChat || isDraftChat || generatingChatIds.includes(currentChat.id)) return;

    const trimmed = text.trim();
    if (!trimmed) return;

    const message = currentChat.messages[messageIndex];
    if (!message || message.role !== 'user' || message.isTemporary) return;

    const chatId = currentChat.id;
    const editedMessage = { ...message, parts: [{ text: trimmed }] };
    const historyToSend = [
      ...currentChat.messages.slice(0, messageIndex),
      editedMessage,
    ];
    const messagesToDelete = currentChat.messages.slice(messageIndex + 1);

    // The edit is written to the server BEFORE anything moves on screen. sendChatHistory paints
    // the cut branch the moment it starts, so a PATCH failing from inside beforeRequest left the
    // later turns gone from the screen and still in Mongo, and brought them back on the next
    // reload. Convince the server first; move the screen after.
    if (isAuthenticatedRef.current && message._id) {
      try {
        await updateMessageOnServer(chatId, message._id, trimmed);
      } catch (error) {
        const err = error as Error;
        if (err.message === 'SESSION_EXPIRED') {
          resetSessionToDefault();
          showNotice('Session expired. Please log in again.');
        } else {
          console.error('Failed to update the message on the server:', err);
          showNotice(EDIT_NOT_SAVED);
        }
        // Nothing to undo: the screen still shows the conversation as it was.
        return;
      }
    }

    await sendChatHistory(historyToSend, chatListRef.current, chatId, {
      saveUserMessage: false,
      beforeRequest: async () => {
        if (!isAuthenticatedRef.current) return;
        messagesToDelete.forEach((msg) => {
          if (msg._id) {
            deleteMessageFromServer(chatId, msg._id);
          }
        });
      },
    });
  }

  async function handleRetryMessage(messageIndex: number) {
    if (!currentChat || generatingChatIds.includes(currentChat.id)) return;

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

    await sendChatHistory(historyToSend, chatListRef.current, chatId, {
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
    // El Stop de la barra pertenece al chat que estás mirando, y solo aborta ese.
    abortControllersRef.current.get(activeChatId)?.abort();
  }

  function handleReTitleChat(chatId: string, newTitle: string) {
    const trimmedTitle = newTitle.trim();
    if (!trimmedTitle) return;

    // The live list, not the render snapshot: an answer that landed a moment ago has already
    // advanced the ref while this render has not caught up, so starting from chatList would
    // write that answer out of existence. Same rule as commitChatMessages.
    const chats = chatListRef.current;
    const targetChat = chats.find((chat) => chat.id === chatId);
    if (!targetChat || targetChat.title === trimmedTitle) return;

    const retitledChat = { ...targetChat, title: trimmedTitle };
    const updatedChats = chats.map((chat) => (chat.id === chatId ? retitledChat : chat));

    // Advanced by hand for the same reason: the effect that syncs the ref runs a turn later
    // than this call, and an answer landing in that gap would read a ref without the new
    // title and hand the old one back.
    chatListRef.current = updatedChats;
    setChatList(updatedChats);
    persistIfOffline(updatedChats);

    if (isAuthenticated) {
      void saveChatFieldsToServer(
        { ...retitledChat, messages: [] },
        { title: targetChat.title },
        { title: retitledChat.title },
      );
    }
  }

  // Pinning writes one more field of the chat, so it walks the same path as handleReTitleChat:
  // the list, the disk while offline, and the server when there is a session.
  function handleTogglePinChat(chatId: string) {
    // Read AND write the ref: the list this click starts from must be the live one, or the
    // hand-off below would put a stale list in charge. An answer that landed a moment ago
    // already advanced the ref while this render still holds the list from before it, and
    // pinning from that snapshot would erase the answer from the screen — and, offline,
    // persistIfOffline would erase it from localStorage for good.
    const chats = chatListRef.current;
    const targetChat = chats.find((chat) => chat.id === chatId);
    if (!targetChat) return;

    const pinnedChat = { ...targetChat, pinned: !targetChat.pinned };
    const updatedChats = chats.map((chat) => (chat.id === chatId ? pinnedChat : chat));

    // The ref is advanced by hand, same as in commitChatMessages and handleDeleteChat. The
    // effect that syncs it runs one turn later than this click, and an answer can land in that
    // gap: it would read the list from before the pin and write the whole thing back. The pin
    // would not only vanish from the screen — applyGeneratedTitle saves that same stale chat to
    // the server, and since syncChat writes every field it receives, the chat would come back
    // unpinned from the database too.
    chatListRef.current = updatedChats;
    setChatList(updatedChats);
    persistIfOffline(updatedChats);

    if (!isAuthenticated) return;

    // messages: [] as in applyGeneratedTitle: this route updates one field, and syncChat's
    // message seeding has no business running here.
    void saveChatFieldsToServer(
      { ...pinnedChat, messages: [] },
      { pinned: targetChat.pinned },
      { pinned: pinnedChat.pinned },
    );
  }

  return (
    <>
      {/* 1. Inyectamos los símbolos en el DOM */}
      <SvgIcons />
      <SelectionToolbar onReply={handleReplyWithSelection} onSendToNotes={handleSendToNotes} />
      {notice ? (
        <div className="app-notice" role="status" aria-live="polite">
          <span className="app-notice-text">{notice}</span>
          <button
            type="button"
            className="app-notice-dismiss"
            aria-label="Dismiss notice"
            onClick={dismissNotice}
          >
            <svg width="14" height="14" aria-hidden="true">
              <use xlinkHref="#icon-x" />
            </svg>
          </button>
        </div>
      ) : null}
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
                  onOpenTerms={openLegal}
                  onNotice={showNotice}
                />
              )}
              {activeLeftPanel === 'chats' && (
                <ChatView
                  chatList={chatList}
                  activeChatId={activeChatId}
                  onChatClick={handleSelectChat}
                  onCreateNewChat={handleCreateNewChat}
                  onDeleteChat={handleDeleteChat}
                  onReTitleChat={handleReTitleChat}
                  onTogglePin={handleTogglePinChat}
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
          {isLegalOpen ? (
            <LegalView onClose={() => setIsLegalOpen(false)} />
          ) : (
            <MessageView
              key={activeChatId}
              messages={currentChat?.messages || []}
              chatId={activeChatId}
              isNewChat={isDraftChat}
              hasMoreMap={hasMoreMap}
              loadedChatIds={loadedChatIds}
              onLoadMore={() => handleLoadMoreMessages(activeChatId)}
              onDeleteMessage={handleDeleteMessage}
              onRetryMessage={handleRetryMessage}
              onSaveMessage={handleSaveMessage}
              onSaveAndReply={handleSaveAndReply}
              token={isAuthenticated ? 'active' : null}
              draft={currentChat?.draft || ''}
              onDraftChange={handleDraftChange}
              onSendMessage={handleSendMessage}
              isGenerating={isActiveChatGenerating}
              onStopGeneration={handleStopGeneration}
              isLeftSidebarOpen={activeLeftPanel !== null}
              isRightSidebarOpen={activeRightPanel !== null}
              onToggleLeftSidebar={toggleLeftPanel}
              onToggleRightSidebar={toggleRightPanel}
            />
          )}
        </main>

        {activeRightPanel !== null && (
          <>
            <div className="resizer resizer-right" id="right-resizer"></div>
            <aside className="settings-section" id='settings-section' aria-label="Secondary panel">
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
                  notesEnabled={currentChat?.notesEnabled === true}
                  onNotesEnabledChange={handleNotesEnabledChange}
                />
              )}
              {activeRightPanel === 'notes' && (
                <NotesView
                  notes={currentChat?.notes ?? ''}
                  onChange={handleNotesChange}
                  onReply={handleReplyWithSelection}
                />
              )}
              <Toolbar
                onNavNotes={() => setRightPanelView('notes')}
                onNavConfig={() => setRightPanelView('settings')}
              />
            </aside>
          </>
        )}

      </div>
    </>
  );
} 