import clsx from "clsx";
import { useEffect, useState } from "react";
import { useCookie } from "../../hooks/cookie";
import styles from "./consent.module.scss";

const COOKIE_NAME = "accepts-cookies";

export default function Consent() {
  const [cookie, setCookie] = useCookie(COOKIE_NAME);
  const [shouldShow, setShouldShow] = useState(false);

  useEffect(() => {
    setShouldShow(cookie.length === 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className={clsx(styles.consentBanner, { [styles.show]: shouldShow })}>
      <p>
        This website uses cookies to ensure you receive the best possible
        service. By accessing further pages of our website, you are agreeing to
        our use of cookies.
      </p>
      <button
        onClick={() => {
          setCookie("false");
          setShouldShow(false);
        }}
        className={styles.deny}
      >
        Deny
      </button>
      <button
        onClick={() => {
          setCookie("true");
          setShouldShow(false);
        }}
      >
        Allow
      </button>
    </div>
  );
}
