import styles from "./footer.module.scss";
import Link from "next/link";

export default function Footer() {
  return (
    <footer className={styles.footer}>
      <ul>
        <li>
          <span>Made with ❤️ @</span>
          <a
            href="https://www.varheight.com"
            className={styles.company}
            target="_blank"
            rel="noopener"
          >
            <em>var</em>height
          </a>
        </li>
        <li>
          <ul>
            <li>
              <a
                href="https://www.linkedin.com/company/varheight/about/"
                target="_blank"
                rel="noreferrer"
              >
                <img
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
                href="https://twitter.com/varheight"
                target="_blank"
                rel="noreferrer"
              >
                <img
                  src="/icons/twitter.svg"
                  alt="twitter"
                  className={styles.footerIcon}
                  height="30"
                  width="30"
                />
              </a>
            </li>
            <li>
              <a
                href="https://www.facebook.com/varheight"
                target="_blank"
                rel="noreferrer"
              >
                <img
                  src="/icons/facebook.svg"
                  alt="facebook"
                  className={styles.footerIcon}
                  height="30"
                  width="30"
                />
              </a>
            </li>
            <li>
              <a
                href="https://www.instagram.com/varheight/"
                target="_blank"
                rel="noreferrer"
              >
                <img
                  src="/icons/instagram.svg"
                  alt="Instagram"
                  className={styles.footerIcon}
                  height="30"
                  width="30"
                />
              </a>
            </li>
          </ul>
        </li>
        <li>
          <Link href="/privacy">
            <a>Privacy Policy</a>
          </Link>
        </li>
      </ul>
    </footer>
  );
}
