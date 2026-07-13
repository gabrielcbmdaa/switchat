import { useState, useEffect, useRef } from "react";
import styles from './SettingsView.module.css'
import DefaultInput from "../components/DefaultInput";
import DefaultButton from "../components/DefaultButton";
import { getLiveModels } from "../services/api";


const REASONING_LEVELS = ['off', 'low', 'medium', 'high'] as const;
const REASONING_LABELS = ['Off', 'Low', 'Medium', 'High'];

interface SettingViewProps {
    currentTitle: string;
    currentModel: string;
    currentProvider: string;
    onRenameChat: (newTitle: string) => void;
    onModelChange: (model: string) => void;
    onProviderChange: (provider: string) => void;
}

export default function SettingView({ currentTitle, onRenameChat, currentModel, currentProvider, onModelChange, onProviderChange }: SettingViewProps) {
    const [title, setTitle] = useState(currentTitle);
    const [prevTitle, setPrevTitle] = useState(currentTitle);
    const [apiKey, setApiKey] = useState(localStorage.getItem('geminiApiKey') || '');
    const [reasoningLevel, setReasoningLevel] = useState<number>(() => {
        const stored = localStorage.getItem('reasoningLevel');
        const index = REASONING_LEVELS.indexOf(stored as typeof REASONING_LEVELS[number]);
        return index !== -1 ? index : 0;
    });

    const handleReasoningChange = (val: number) => {
        setReasoningLevel(val);
        localStorage.setItem('reasoningLevel', REASONING_LEVELS[val]);
    };

    const [savedModels, setSavedModels] = useState<string[]>(() => {
        const stored = localStorage.getItem('savedModels'); //ADD CLOUD ROUTE
        if (stored) {
            try {
                return JSON.parse(stored);
            } catch (e) {
                console.error("Error parsing savedModels:", e);
            }
        }
        return [currentModel];
    });

    const [savedProviders, setSavedProviders] = useState<string[]>(() => {
        const stored = localStorage.getItem('savedProviders'); //ADD CLOUD ROUTE
        if (stored) {
            try {
                return JSON.parse(stored);
            } catch (e) {
                console.error("Error parsing savedProviders:", e);
            }
        }
        return [currentProvider];
    });

    const [showModelDropdown, setShowModelDropdown] = useState(false);
    const [showProviderDropdown, setShowProviderDropdown] = useState(false);

    const modelContainerRef = useRef<HTMLDivElement>(null);
    const providerContainerRef = useRef<HTMLDivElement>(null);

    // Close dropdown when clicking outside
    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (modelContainerRef.current && !modelContainerRef.current.contains(event.target as Node)) {
                setShowModelDropdown(false);
            }
            if (providerContainerRef.current && !providerContainerRef.current.contains(event.target as Node)) {
                setShowProviderDropdown(false);
            }
        }
        document.addEventListener("mousedown", handleClickOutside);
        return () => {
            document.removeEventListener("mousedown", handleClickOutside);
        };
    }, []);

    if (currentTitle !== prevTitle) {
        setTitle(currentTitle);
        setPrevTitle(currentTitle);
    }

    // Lógica para buscar modelos en vivo desde la API de Google
    const handleConfirmApiKey = async () => {
        try {
            const trimmedKey = apiKey.trim();
            localStorage.setItem('geminiApiKey', trimmedKey);
            if (trimmedKey === '') {
                return;
            }
            const liveModels = await getLiveModels(trimmedKey);
            if (liveModels.length > 0) {
                const firstModel = liveModels[0].value;
                onModelChange(firstModel);

                // Mezclar los modelos obtenidos en la lista local de modelos guardados
                setSavedModels(prev => {
                    const fetchedNames = liveModels.map(m => m.value);
                    const merged = Array.from(new Set([...prev, ...fetchedNames]));
                    localStorage.setItem('savedModels', JSON.stringify(merged));
                    return merged;
                });

            }
        } catch (err) {
            console.error("Error al cargar modelos:", err);
            alert("No se pudieron cargar los modelos. Verifica tu API Key.");
        }
    };

    const handleSaveModel = () => {
        const trimmedModel = currentModel.trim();
        if (!trimmedModel) return;

        if (!savedModels.includes(trimmedModel)) {
            const updated = [...savedModels, trimmedModel];
            setSavedModels(updated);
            localStorage.setItem('savedModels', JSON.stringify(updated));
        }
        localStorage.setItem('model', trimmedModel);
        alert("¡Modelo guardado!");
    };

    const handleSaveProvider = () => {
        const trimmedProvider = currentProvider.trim();
        if (!trimmedProvider) return;

        if (!savedProviders.includes(trimmedProvider)) {
            const updated = [...savedProviders, trimmedProvider];
            setSavedProviders(updated);
            localStorage.setItem('savedProviders', JSON.stringify(updated));
        }
        localStorage.setItem('provider', trimmedProvider);
        alert("¡Provider guardado!");
    };

    const handleDeleteModel = (modelToDelete: string) => {
        const updated = savedModels.filter(m => m !== modelToDelete);
        setSavedModels(updated);
        localStorage.setItem('savedModels', JSON.stringify(updated));
    };

    const handleDeleteProvider = (providerToDelete: string) => {
        const updated = savedProviders.filter(p => p !== providerToDelete);
        setSavedProviders(updated);
        localStorage.setItem('savedProviders', JSON.stringify(updated));
    };

    const filteredModels = savedModels.filter(model =>
        model.toLowerCase().includes(currentModel.toLowerCase())
    );

    const filteredProviders = savedProviders.filter(provider =>
        provider.toLowerCase().includes(currentProvider.toLowerCase())
    );

    return (
        <div className={styles.settingsViewContainer}>
            {/* CHANGE TITLE SECTION */}
            <div className={styles.changeTitleSection}>
                <label htmlFor="titleInput" className={styles.configLabel}>Chat Name</label>
                <DefaultInput
                    id="titleInput"
                    type="text"
                    maxLength={26}
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    required
                />
                <DefaultButton
                    onClick={() => onRenameChat(title.trim())}
                    disabled={!title.trim()}
                />
            </div>
            {/* MODEL SECTION */}
            <div className={styles.modelSection}>
                {/* PROVIDER */}
                <div className={styles.providerContainer}>
                    <label className={styles.configLabel} htmlFor="providerSelect">Provider</label>
                    <div className={styles.comboboxWrapper}>
                        <DefaultInput
                            id="providerSelect"
                            type="text"
                            placeholder="Provider..."
                            value={currentProvider}
                            onChange={(e) => onProviderChange(e.target.value)}
                            onFocus={() => setShowProviderDropdown(true)}
                        />
                        <button
                            type="button"
                            className={styles.dropdownToggle}
                            onClick={() => setShowProviderDropdown(!showProviderDropdown)}
                        >
                            ▼
                        </button>
                    </div>
                    <DefaultButton
                        onClick={handleSaveProvider}
                        iconId="icon-save"
                    />
                    {showProviderDropdown && (
                        <div className={styles.dropdownList} ref={providerContainerRef}>
                            {filteredProviders.length > 0 ? (
                                filteredProviders.map(provider => (
                                    <div
                                        key={provider}
                                        className={styles.dropdownItem}
                                    >
                                        <span
                                            className={styles.modelName}
                                            onClick={() => {
                                                onProviderChange(provider);
                                                setShowProviderDropdown(false);
                                            }}
                                        >
                                            {provider}
                                        </span>
                                        <button
                                            type="button"
                                            className={styles.deleteModelBtn}
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                handleDeleteProvider(provider);
                                            }}
                                            title="Eliminar proveedor"
                                        >
                                            ✕
                                        </button>
                                    </div>
                                ))
                            ) : (
                                <div className={styles.noMatches}>
                                    No hay coincidencias
                                </div>
                            )}
                        </div>
                    )}
                </div>
                {/* MODELS */}
                <div className={styles.modelContainer}>
                    <label className={styles.configLabel}>Model</label>
                    <div className={styles.comboboxWrapper}>
                        <DefaultInput
                            type="text"
                            placeholder="Enter custom model ID"
                            value={currentModel}
                            onChange={(e) => {
                                const val = e.target.value;
                                onModelChange(val);
                            }}
                            onFocus={() => setShowModelDropdown(true)}
                            required
                        />
                        <button
                            type="button"
                            className={styles.dropdownToggle}
                            onClick={() => setShowModelDropdown(!showModelDropdown)}
                        >
                            ▼
                        </button>
                    </div>
                    <DefaultButton
                        onClick={handleSaveModel}
                        iconId="icon-save"
                    />
                    {showModelDropdown && (
                        <div className={styles.dropdownList} ref={modelContainerRef}>
                            {filteredModels.length > 0 ? (
                                filteredModels.map(model => (
                                    <div
                                        key={model}
                                        className={styles.dropdownItem}
                                    >
                                        <span
                                            className={styles.modelName}
                                            onClick={() => {
                                                onModelChange(model);
                                                setShowModelDropdown(false);
                                            }}
                                        >
                                            {model}
                                        </span>
                                        <button
                                            type="button"
                                            className={styles.deleteModelBtn}
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                handleDeleteModel(model);
                                            }}
                                            title="Eliminar modelo"
                                        >
                                            ✕
                                        </button>
                                    </div>
                                ))
                            ) : (
                                <div className={styles.noMatches}>
                                    No hay coincidencias
                                </div>
                            )}
                        </div>
                    )}
                </div>
                {/* API KEY */}
                <div className={styles.apiKeyContainer}>
                    <label className={styles.configLabel} htmlFor="apiKeyInput">API Key</label>
                    <DefaultInput
                        id="apiKeyInput"
                        type="password"
                        placeholder="Paste your API key here..."
                        value={apiKey}
                        onChange={(e) => setApiKey(e.target.value)}
                    />
                    <DefaultButton
                        onClick={handleConfirmApiKey}
                    />
                </div>
                {/* REASONING */}
                <div className={styles.reasoningContainer}>
                    <div className={styles.reasoningHeader}>
                        <label className={styles.configLabel} htmlFor="reasoningInput">Reasoning</label>
                        <span className={styles.reasoningValueLabel}>
                            {REASONING_LABELS[reasoningLevel]}
                        </span>
                    </div>
                    <input
                        id="reasoningInput"
                        type="range"
                        min="0"
                        max="3"
                        step="1"
                        value={reasoningLevel}
                        onChange={(e) => handleReasoningChange(Number(e.target.value))}
                        className={styles.reasoningSlider}
                    />
                </div>
            </div>
        </div>
    );
}
