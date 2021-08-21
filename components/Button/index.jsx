import clsx from 'clsx';
import styles from './button.module.scss';

export default function Button({ className, secondary = false, ...props }) {
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
