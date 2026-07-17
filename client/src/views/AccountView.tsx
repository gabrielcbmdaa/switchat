// src/views/ConfigView.tsx
import { useState, useRef, useEffect } from 'react';
import { loginOrRegister } from '../services/api'; // Asegúrate de que la ruta sea correcta
import styles from './AccountView.module.css'
import DefaultInput from '../components/DefaultInput';

interface ConfigViewProps {
    isAuthenticated: boolean;
    onAuthSuccess: () => void;
    onLogoutAction: () => void;
}

export default function ConfigView({ isAuthenticated, onAuthSuccess, onLogoutAction }: ConfigViewProps) {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const logoutButtonRef = useRef<HTMLButtonElement>(null);

    // Enfocar automáticamente el botón de cerrar sesión cuando se muestra
    useEffect(() => {
        if (isAuthenticated && logoutButtonRef.current) {
            logoutButtonRef.current.focus();
        }
    }, [isAuthenticated]);

    const handleAuth = async (isSignUp: boolean) => {
        try {
            await loginOrRegister(email, password, isSignUp); // 👈 Ya no guardamos la respuesta en una variable 'data'
            if (isSignUp) {
                alert("¡Registro exitoso! Ya puedes ingresar.");
            } else {
                onAuthSuccess();
            }
        } catch (err: unknown) {
            const errorMessage = err instanceof Error ? err.message : String(err);
            alert("Error: " + errorMessage);
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