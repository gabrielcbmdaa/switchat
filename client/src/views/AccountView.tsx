// src/views/ConfigView.tsx
import { useState, useEffect } from 'react';
import { loginOrRegister, checkSession, updateEmail, updatePassword, deleteAccountFromServer } from '../services/api'; // Asegúrate de que la ruta sea correcta
import styles from './AccountView.module.css'
import DefaultInput from '../components/DefaultInput';
import DefaultButton from '../components/DefaultButton';

interface ConfigViewProps {
    isAuthenticated: boolean;
    onAuthSuccess: () => void;
    onLogoutAction: () => void;
}

export default function ConfigView({ isAuthenticated, onAuthSuccess, onLogoutAction }: ConfigViewProps) {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');

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

    const handleAuth = async (isSignUp: boolean) => {
        try {
            // El registro también deja la sesión iniciada (cookie), igual que el login.
            await loginOrRegister(email, password, isSignUp);
            onAuthSuccess();
        } catch (err: unknown) {
            const errorMessage = err instanceof Error ? err.message : String(err);
            alert("Error: " + errorMessage);
        }
    };

    const [currentEmail, setCurrentEmail] = useState('');
    const [newEmailValue, setNewEmailValue] = useState('');
    const [emailCurrentPassword, setEmailCurrentPassword] = useState('');
    const [newPasswordValue, setNewPasswordValue] = useState('');
    const [passwordCurrentPassword, setPasswordCurrentPassword] = useState('');

    useEffect(() => {
        if (!isAuthenticated) return;
        checkSession().then((session) => {
            if (session.email) setCurrentEmail(session.email);
        });
    }, [isAuthenticated]);

    const handleUpdateEmail = async () => {
        if (!newEmailValue.trim() || !emailCurrentPassword) return;
        try {
            const { email } = await updateEmail(newEmailValue.trim(), emailCurrentPassword);
            setCurrentEmail(email);
            setNewEmailValue('');
            setEmailCurrentPassword('');
            alert('Correo actualizado con éxito');
        } catch (err: unknown) {
            const errorMessage = err instanceof Error ? err.message : String(err);
            alert('Error: ' + errorMessage);
        }
    };

    const handleUpdatePassword = async () => {
        if (!newPasswordValue || !passwordCurrentPassword) return;
        try {
            await updatePassword(newPasswordValue, passwordCurrentPassword);
            setNewPasswordValue('');
            setPasswordCurrentPassword('');
            alert('Contraseña actualizada con éxito');
        } catch (err: unknown) {
            const errorMessage = err instanceof Error ? err.message : String(err);
            alert('Error: ' + errorMessage);
        }
    };

    const [deletePassword, setDeletePassword] = useState('');
    const [confirmingDelete, setConfirmingDelete] = useState(false);
    const [isDeleting, setIsDeleting] = useState(false);

    useEffect(() => {
        let timer: ReturnType<typeof setTimeout>;
        if (confirmingDelete) {
            timer = setTimeout(() => setConfirmingDelete(false), 5000);
        }
        return () => clearTimeout(timer);
    }, [confirmingDelete]);

    const handleDeleteAccount = async () => {
        if (!confirmingDelete) {
            setConfirmingDelete(true);
            return;
        }

        if (!deletePassword) {
            alert('Por favor, ingresa tu contraseña actual');
            setConfirmingDelete(false);
            return;
        }

        setIsDeleting(true);
        try {
            await deleteAccountFromServer(deletePassword);
            setDeletePassword('');
            setConfirmingDelete(false);
            setIsDeleting(false);
            onLogoutAction();
        } catch (err: unknown) {
            const errorMessage = err instanceof Error ? err.message : String(err);
            alert('Error: ' + errorMessage);
            setConfirmingDelete(false);
            setIsDeleting(false);
        }
    };

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

    return (
        <div className={styles.accountViewContainer}>
            {/* --- SECCIÓN 1: CUENTA --- */}
            {!isAuthenticated ? (
                <form
                    className={styles.authForm}
                    onSubmit={(e) => {
                        e.preventDefault();
                        handleAuth(false); // Iniciar sesión al presionar Enter en los campos
                    }}
                >
                    <DefaultInput
                        type="email"
                        placeholder="Your email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)} // 👈 Vinculamos la escritura al estado
                        required
                    />
                    <DefaultInput
                        type="password"
                        placeholder="Password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)} // 👈 Vinculamos la escritura al estado
                        required
                    />
                    <div className={styles.buttonAuthContainer}>
                        {/* Tipo submit para aprovechar el comportamiento nativo de HTML */}
                        <button type="submit" className={styles.btnAuth}>Sign In</button>
                        <button type="button" className={styles.btnAuth} onClick={() => handleAuth(true)}>Sign Up</button>
                    </div>
                </form>
            ) : (
                <button
                    onClick={onLogoutAction}
                    className={styles.btnAuth}
                >
                    Sign Out
                </button>
            )}

            {isAuthenticated && (
                <div className={styles.accountSettingsSection}>
                    <span className={styles.currentEmailText}>{currentEmail}</span>

                    <div className={styles.accountSettingsRow}>
                        <DefaultInput
                            type="email"
                            placeholder="New email"
                            value={newEmailValue}
                            onChange={(e) => setNewEmailValue(e.target.value)}
                        />
                        <DefaultInput
                            type="password"
                            placeholder="Current password"
                            value={emailCurrentPassword}
                            onChange={(e) => setEmailCurrentPassword(e.target.value)}
                        />
                        <DefaultButton
                            iconId="icon-confirm"
                            title="Update email"
                            onClick={handleUpdateEmail}
                        />
                    </div>

                    <div className={styles.accountSettingsRow}>
                        <DefaultInput
                            type="password"
                            placeholder="New password"
                            value={newPasswordValue}
                            onChange={(e) => setNewPasswordValue(e.target.value)}
                        />
                        <DefaultInput
                            type="password"
                            placeholder="Current password"
                            value={passwordCurrentPassword}
                            onChange={(e) => setPasswordCurrentPassword(e.target.value)}
                        />
                        <DefaultButton
                            iconId="icon-confirm"
                            title="Update password"
                            onClick={handleUpdatePassword}
                        />
                    </div>

                    <div className={styles.dangerZone}>
                        <div className={styles.accountSettingsRow}>
                            <DefaultInput
                                type="password"
                                placeholder="Current password"
                                value={deletePassword}
                                onChange={(e) => setDeletePassword(e.target.value)}
                            />
                            <DefaultButton
                                iconId={confirmingDelete ? 'icon-confirm' : 'icon-trash'}
                                title={confirmingDelete ? 'Click again to confirm' : 'Delete account'}
                                onClick={handleDeleteAccount}
                                disabled={isDeleting}
                            />
                        </div>
                    </div>
                </div>
            )}

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
        </div>
    );
}