import clsx from 'clsx';
import { ReactNode } from 'react';
import styles from './calculatorform.module.scss';

interface CalculatorFormProps {
  children: ReactNode;
  className?: string;
}

export default function CalculatorForm({ children, className }: CalculatorFormProps) {
  return (
    <form className={clsx(styles.containerForm, className)}>{children}</form>
  );
}
