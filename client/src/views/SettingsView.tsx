import { useState } from "react";
import styles from './SettingsView.module.css'
import DefaultInput from "../components/DefaultInput";
import DefaultButton from "../components/DefaultButton";
import { getModelConfig, getProviderIconId, MODEL_REGISTRY } from "../config/models.config";

interface SettingViewProps {
    currentModel: string;
    onModelChange: (model: string) => void;
    systemPrompt: string;
    onSystemPromptChange: (value: string) => void;
    onClose?: () => void;
}

export default function SettingView({ currentModel, onModelChange, systemPrompt, onSystemPromptChange, onClose }: SettingViewProps) {
    const [apiKey, setApiKey] = useState('');
    const [showProviderSelectorForApiKey, setShowProviderSelectorForApiKey] = useState(false);

    const [savedApiKeys, setSavedApiKeys] = useState<{ key: string, provider: string }[]>(() => {
        const stored = localStorage.getItem('savedApiKeys');
        if (stored) {
            try {
                return JSON.parse(stored);
            } catch (e) {
                console.error("Error parsing savedApiKeys:", e);
            }
        }

        const migrated: { key: string, provider: string }[] = [];
        const gemini = localStorage.getItem('geminiApiKey');
        const anthropic = localStorage.getItem('anthropicApiKey');
        const openai = localStorage.getItem('openaiApiKey');

        if (gemini) migrated.push({ key: gemini, provider: 'Google' });
        if (anthropic) migrated.push({ key: anthropic, provider: 'Anthropic' });
        if (openai) migrated.push({ key: openai, provider: 'OpenAI' });

        if (migrated.length > 0) {
            localStorage.setItem('savedApiKeys', JSON.stringify(migrated));
        }

        return migrated;
    });

    const [activeKeys, setActiveKeys] = useState<Record<string, string>>(() => ({
        google: localStorage.getItem('geminiApiKey') || '',
        anthropic: localStorage.getItem('anthropicApiKey') || '',
        openai: localStorage.getItem('openaiApiKey') || ''
    }));

    const getActiveKey = (providerName: string) => {
        return activeKeys[providerName.toLowerCase()] || '';
    };

    const setActiveKeyForProvider = (providerName: string, key: string) => {
        const p = providerName.toLowerCase();
        if (p === 'google') localStorage.setItem('geminiApiKey', key);
        else if (p === 'anthropic') localStorage.setItem('anthropicApiKey', key);
        else if (p === 'openai') localStorage.setItem('openaiApiKey', key);

        setActiveKeys(prev => ({ ...prev, [p]: key }));
    };
    // 1. Derivamos los niveles directamente del modelo actual (Estado Derivado)
    const config = getModelConfig(currentModel);
    const thinkingLevels = config ? ['off', ...config.thinkingLevels] : [];

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

    const [searchQuery, setSearchQuery] = useState('');

    const handleSaveApiKeyInitiate = () => {
        if (apiKey.trim() === '') return;
        setShowProviderSelectorForApiKey(true);
    };

    const saveKeyWithProvider = (providerName: string) => {
        const trimmedKey = apiKey.trim();
        if (!trimmedKey) return;

        const exists = savedApiKeys.some(k => k.key === trimmedKey && k.provider === providerName);
        if (!exists) {
            const newList = [...savedApiKeys, { key: trimmedKey, provider: providerName }];
            setSavedApiKeys(newList);
            localStorage.setItem('savedApiKeys', JSON.stringify(newList));
        }

        setActiveKeyForProvider(providerName, trimmedKey);

        setApiKey('');
        setShowProviderSelectorForApiKey(false);
    };

    const handleDeleteApiKey = (keyToDelete: string, provider: string) => {
        const updated = savedApiKeys.filter(k => !(k.key === keyToDelete && k.provider === provider));
        setSavedApiKeys(updated);
        localStorage.setItem('savedApiKeys', JSON.stringify(updated));

        if (getActiveKey(provider) === keyToDelete) {
            setActiveKeyForProvider(provider, '');
        }
    };

    const availableModels = Object.keys(MODEL_REGISTRY);
    const filteredModels = availableModels.filter(model =>
        model.toLowerCase().includes(searchQuery.toLowerCase())
    );

    const handleSelectModel = (modelName: string) => {
        onModelChange(modelName);
        setSearchQuery('');
    };

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
            <div className={styles.modelSection}>
                {/* MODELS */}
                <div className={styles.modelContainer}>
                    <label className={styles.configLabel}>Model</label>
                    <div className={styles.modelSelected}>
                        {(() => {
                            const iconId = getProviderIconId(currentModel);
                            return iconId ? (
                                <svg className={styles.providerIcon} width="16" height="16">
                                    <use xlinkHref={`#${iconId}`} />
                                </svg>
                            ) : null;
                        })()}
                        {currentModel}
                    </div>
                    <div className={styles.dropdownList}>
                        <input
                            type="text"
                            value={searchQuery}
                            className={styles.searchBox}
                            placeholder="Search model ID..."
                            onChange={(e) => setSearchQuery(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter' && searchQuery.trim()) {
                                    handleSelectModel(searchQuery.trim());
                                }
                            }}
                        />
                        {filteredModels.length > 0 ? (
                            filteredModels.map(model => {
                                const iconId = getProviderIconId(model);
                                return (
                                    <div
                                        key={model}
                                        className={styles.dropdownItem}
                                        onClick={() => handleSelectModel(model)}
                                    >
                                        <span className={styles.modelName}>
                                            {iconId && (
                                                <svg className={styles.providerIcon} width="16" height="16">
                                                    <use xlinkHref={`#${iconId}`} />
                                                </svg>
                                            )}
                                            {model}
                                        </span>
                                    </div>
                                );
                            })
                        ) : (
                            <div className={styles.noMatches}>
                                There are no coincidences
                            </div>
                        )}
                    </div>
                </div>
                {/* SYSTEM PROMPT */}
                <div className={styles.systemPromptContainer}>
                    <label className={styles.configLabel} htmlFor="systemPromptInput">System Prompt</label>
                    <textarea
                        id="systemPromptInput"
                        className={styles.systemPromptTextarea}
                        placeholder="Optional instructions the AI should always follow (tone, role, constraints)..."
                        value={systemPrompt}
                        onChange={(e) => onSystemPromptChange(e.target.value)}
                    />
                </div>
                {/* API KEY */}
                <div className={styles.apiKeySection}>
                    <div className={styles.apiKeyContainer}>
                        <label className={styles.configLabel} htmlFor="apiKeyInput">API Key</label>
                        <DefaultInput
                            id="apiKeyInput"
                            type="password"
                            placeholder="Paste your API key here..."
                            value={apiKey}
                            onChange={(e) => {
                                setApiKey(e.target.value);
                                if (showProviderSelectorForApiKey && e.target.value === '') {
                                    setShowProviderSelectorForApiKey(false);
                                }
                            }}
                        />
                        {!showProviderSelectorForApiKey ? (
                            <DefaultButton
                                onClick={handleSaveApiKeyInitiate}
                                title="Save API Key"
                            />
                        ) : (
                            <div className={styles.providerButtonsContainer}>
                                <DefaultButton
                                    iconId="icon-google"
                                    iconSize={16}
                                    title="Google"
                                    onClick={() => saveKeyWithProvider('Google')}
                                />
                                <DefaultButton
                                    iconId="icon-anthropic"
                                    iconSize={16}
                                    title="Anthropic"
                                    onClick={() => saveKeyWithProvider('Anthropic')}
                                />
                                <DefaultButton
                                    iconId="icon-openai"
                                    iconSize={16}
                                    title="OpenAI"
                                    onClick={() => saveKeyWithProvider('OpenAI')}
                                />
                            </div>
                        )}
                    </div>

                    {savedApiKeys.length > 0 && (
                        <div className={styles.apiKeysListContainer}>
                            {savedApiKeys.map((item, index) => {
                                const isActive = getActiveKey(item.provider) === item.key;
                                const iconId = `icon-${item.provider.toLowerCase()}`;
                                return (
                                    <div
                                        key={index}
                                        className={styles.apiKeyDropdownItem}
                                        onClick={() => setActiveKeyForProvider(item.provider, item.key)}
                                    >
                                        <div className={styles.apiKeyItemContent}>
                                            <span className={`${styles.activeDot} ${isActive ? styles.activeDotVisible : ''}`} />
                                            <svg className={styles.providerIcon} width="16" height="16">
                                                <use xlinkHref={`#${iconId}`} />
                                            </svg>
                                            <span className={styles.apiKeyText}>
                                                {item.key.length > 10 ? `${item.key.slice(0, 5)}...${item.key.slice(-4)}` : item.key}
                                            </span>
                                        </div>
                                        <button
                                            type="button"
                                            className={styles.deleteApiKeyBtn}
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                handleDeleteApiKey(item.key, item.provider);
                                            }}
                                            title="Delete API Key"
                                        >✕</button>
                                    </div>
                                );
                            })}
                        </div>
                    )}
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
