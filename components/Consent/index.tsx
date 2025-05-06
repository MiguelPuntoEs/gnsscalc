import clsx from 'clsx';
import { useEffect, useState } from 'react';
import useCookie from '@/hooks/cookie';
import styles from './consent.module.scss';
import Button from '../Button';

const COOKIE_NAME: string = 'accepts-cookies';

type CookieSetter = (value: string) => void;

export default function Consent() {
  const [cookie, setCookie]: [string, CookieSetter] = useCookie(COOKIE_NAME);
  const [shouldShow, setShouldShow] = useState(false);

  useEffect(() => {
    setShouldShow(cookie.length === 0);
  }, [cookie.length]);

  return (
    <div className={clsx(styles.consentBanner, { [styles.show]: shouldShow })}>
      <p>
        This website uses cookies to ensure you receive the best possible
        service. By accessing further pages of our website, you are agreeing to
        our use of cookies.
      </p>

      <div className="buttons">
        <Button
          onClick={() => {
            setCookie('false');
            setShouldShow(false);
          }}
          secondary
        >
          Deny
        </Button>
        <Button
          onClick={() => {
            setCookie('true');
            setShouldShow(false);
          }}
        >
          Allow
        </Button>
      </div>
    </div>
  );
}
