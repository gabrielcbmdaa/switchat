import { useState, useEffect, useRef } from "react";
import styles from './SettingsView.module.css'
import DefaultInput from "../components/DefaultInput";
import DefaultButton from "../components/DefaultButton";
import { getLiveModels } from "../services/api";
import { getModelConfig } from "../config/models.config";

interface SettingViewProps {
    currentModel: string;
    currentProvider: string;
    onModelChange: (model: string) => void;
    onProviderChange: (provider: string) => void;
    onClose?: () => void;
}

export default function SettingView({ currentModel, currentProvider, onModelChange, onProviderChange, onClose }: SettingViewProps) {
    const [apiKey, setApiKey] = useState(localStorage.getItem('geminiApiKey') || '');
    // 1. Derivamos los niveles directamente del modelo actual (Estado Derivado)
    // Usamos la tabla estática y agregamos fallback dinámico para modelos de la API
    const config = getModelConfig(currentModel);
    let thinkingLevels: string[] = [];

    if (config) {
        thinkingLevels = ['off', ...config.thinkingLevels];
    } else {
        const apiThinkingModels = JSON.parse(localStorage.getItem('apiThinkingModels') || '[]');
        if (apiThinkingModels.includes(currentModel.toLowerCase())) {
            // Nivel genérico para modelos dinámicos que reportan soporte de thinking
            thinkingLevels = ['off', 'low', 'medium', 'high'];
        }
    }

    const [prevModel, setPrevModel] = useState(currentModel);
    const [reasoningLevel, setReasoningLevel] = useState<number>(() => {
        const stored = localStorage.getItem('reasoningLevel');
        if (stored && thinkingLevels.includes(stored)) {
            return thinkingLevels.indexOf(stored);
        }
        return 0;
    });

    // 2. Si el modelo cambia, ajustamos el reasoningLevel durante el render (evita cascada de useEffect)
    if (currentModel !== prevModel) {
        setPrevModel(currentModel);
        if (thinkingLevels.length > 0) {
            const stored = localStorage.getItem('reasoningLevel');
            if (stored && thinkingLevels.includes(stored)) {
                setReasoningLevel(thinkingLevels.indexOf(stored));
            } else {
                setReasoningLevel(0);
                localStorage.setItem('reasoningLevel', thinkingLevels[0]);
            }
        }
    }

    const handleReasoningChange = (val: number) => {
        setReasoningLevel(val);
        localStorage.setItem('reasoningLevel', thinkingLevels[val]);
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

                // Guardar la lista de modelos de la API que soportan thinking
                const thinkingModelNames = liveModels
                    .filter(m => m.thinking === true)
                    .map(m => m.value.toLowerCase());
                localStorage.setItem('apiThinkingModels', JSON.stringify(thinkingModelNames));

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
            {onClose && (
                <div className={styles.headerSection}>
                    <span className={styles.configLabel}>Settings</span>
                    <button type="button" className={styles.closeBtn} onClick={onClose} title="Cerrar">
                        ✕
                    </button>
                </div>
            )}
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
                {/* REASONING — Solo se muestra si el modelo soporta thinking */}
                {thinkingLevels.length > 0 && (
                    <div className={styles.reasoningContainer}>
                        <div className={styles.reasoningHeader}>
                            <label className={styles.configLabel} htmlFor="reasoningInput">Reasoning</label>
                            <span className={styles.reasoningValueLabel}>
                                {thinkingLevels[reasoningLevel]}
                            </span>
                        </div>
                        <input
                            id="reasoningInput"
                            type="range"
                            min="0"
                            max={thinkingLevels.length - 1}
                            step="1"
                            value={reasoningLevel}
                            onChange={(e) => handleReasoningChange(Number(e.target.value))}
                            className={styles.reasoningSlider}
                        />
                    </div>
                )}
            </div>
        </div>
    );
}
