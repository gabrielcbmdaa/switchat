import React from 'react';
import styles from './DefaultButton.module.css';

interface DefaultButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  onClick: (e: React.MouseEvent<HTMLButtonElement>) => void;
  size?: number;     // Button size (width and height)
  iconSize?: number; // SVG Icon size (width and height)
  iconId?: string;   // custom icon ID, e.g. "icon-pencil"
}

export default function DefaultButton({
  onClick,
  disabled,
  className = '',
  size = 30,
  iconSize = 22,
  iconId = 'icon-confirm',
  ...props
}: DefaultButtonProps) {
  return (
    <button
      className={`${styles.defaultButton} ${className}`}
      onClick={onClick}
      disabled={disabled}
      style={{ width: size, height: size }}
      {...props}
    >
      <svg width={iconSize} height={iconSize} viewBox="0 0 24 24">
        <use xlinkHref={`#${iconId}`} />
      </svg>
    </button>
  );
}
