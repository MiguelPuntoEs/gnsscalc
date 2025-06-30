import Link from 'next/link';
import styles from './header.module.scss';

export default function Header() {
  return (
    <header className={styles.header}>
      <span className={styles.title}>
        <Link href="/">gnsscalc</Link>
      </span>
      <Link href="/contact" className={styles.link}>
        Contact
      </Link>
    </header>
  );
}
