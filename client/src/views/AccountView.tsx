// src/views/ConfigView.tsx
import { useState, useRef, useEffect } from 'react';
import { loginOrRegister } from '../services/api'; // Asegúrate de que la ruta sea correcta
import styles from './AccountView.module.css'
import DefaultInput from '../components/DefaultInput';

interface ConfigViewProps {
    token: string | null;
    onAuthSuccess: (newToken: string) => void;
    onLogoutAction: () => void;
}

export default function ConfigView({ token, onAuthSuccess, onLogoutAction }: ConfigViewProps) {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const logoutButtonRef = useRef<HTMLButtonElement>(null);

    // Enfocar automáticamente el botón de cerrar sesión cuando se muestra
    useEffect(() => {
        if (token && logoutButtonRef.current) {
            logoutButtonRef.current.focus();
        }
    }, [token]);

    const handleAuth = async (isSignUp: boolean) => {
        try {
            const data = await loginOrRegister(email, password, isSignUp);
            if (isSignUp) {
                alert("¡Registro exitoso! Ya puedes ingresar.");
            } else if (data.token) {
                localStorage.setItem('userToken', data.token);
                onAuthSuccess(data.token);
            }
        } catch (err: unknown) {
            const errorMessage = err instanceof Error ? err.message : String(err);
            alert("Error: " + errorMessage);
        }
    };

    return (
        <div className={styles.accountViewContainer}>
            {/* --- SECCIÓN 1: CUENTA --- */}
            {!token ? (
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
                    ref={logoutButtonRef}
                    onClick={onLogoutAction} 
                    className={styles.btnAuth}
                >
                    Sign Out
                </button>
            )}
        </div>
    );
}