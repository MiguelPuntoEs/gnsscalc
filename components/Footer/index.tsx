import Image from 'next/image';
import Link from 'next/link';
import styles from './footer.module.scss';

export default function Footer() {
  return (
    <footer className={styles.footer}>
      <ul>
        <li>
          <span>Made by </span>
          <a
            href="https://www.miguel.es"
            className={styles.company}
            target="_blank"
            rel="noreferrer noopener"
          >
            Miguel González
          </a>
        </li>
        <li>
          <ul>
            <li>
              <a
                href="https://www.linkedin.com/in/mgcalvo/"
                target="_blank"
                rel="noreferrer"
              >
                <Image
                  src="/icons/linkedin.svg"
                  alt="linkedIn"
                  className={styles.footerIcon}
                  height="30"
                  width="30"
                />
              </a>
            </li>
            <li>
              <a
                href="https://github.com/MiguelPuntoEs/gnsscalc/"
                target="_blank"
                rel="noreferrer"
              >
                <Image
                  src="/icons/github.svg"
                  alt="GitHub"
                  className={styles.footerIcon}
                  height="30"
                  width="30"
                />
              </a>
            </li>
          </ul>
        </li>
        <li>
          <Link href="/privacy">Privacy Policy</Link>
        </li>
      </ul>
    </footer>
  );
}
