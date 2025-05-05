import clsx from 'clsx';
import styles from './button.module.scss';
import { ButtonHTMLAttributes } from 'react';

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  className?: string;
  secondary?: boolean;
};

export default function Button({
  className,
  secondary = false,
  ...props
}: ButtonProps) {
  return (
    <button
      type="button"
      className={clsx(className, styles.button, {
        [styles.secondary]: secondary,
      })}
      {...props}
    />
  );
}
