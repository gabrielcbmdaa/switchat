import React from 'react';
import styles from './DefaultInput.module.css';

// Reemplazamos la interface por un type alias
type DefaultInputProps = React.InputHTMLAttributes<HTMLInputElement>;


export default function DefaultInput({ className = '', ...props }: DefaultInputProps) {
  return (
    <input
      className={`${styles.defaultInput} ${className}`}
      {...props}
    />
  );
}
