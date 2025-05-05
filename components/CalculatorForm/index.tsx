import clsx from "clsx";
import styles from "./calculatorform.module.scss";

export default function CalculatorForm({ children, className }) {
  return (
    <form className={clsx(styles.containerForm, className)}>{children}</form>
  );
}
