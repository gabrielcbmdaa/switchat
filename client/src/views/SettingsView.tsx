import { useState } from "react";
import styles from './SettingsView.module.css'
import { getModelConfig, getProviderIconId, MODEL_REGISTRY } from "../config/models.config";

interface SettingViewProps {
    currentModel: string;
    onModelChange: (model: string) => void;
    systemPrompt: string;
    onSystemPromptChange: (value: string) => void;
    onClose?: () => void;
}

export default function SettingView({ currentModel, onModelChange, systemPrompt, onSystemPromptChange, onClose }: SettingViewProps) {
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
