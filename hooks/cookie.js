import { useState } from 'react';

const useCookie = (cookieName) => {
  const getCookie = () => {
    if (typeof window === 'undefined') {
      return '';
    }

    return document.cookie.split(';').reduce((r, v) => {
      const parts = v.split('=');
      return parts[0].trim() === cookieName ? decodeURIComponent(parts[1]) : r;
    }, '');
  };

  const setCookie = (value) => {
    const expires = new Date(
      Date.now() + 15330 * 864e5 // ~42 years
    ).toUTCString();

    document.cookie = `${cookieName}=${encodeURIComponent(
      value
    )};expires=${expires};path=/;SameSite=Lax;`;
  };

  const [value, setValue] = useState(getCookie());

  return [
    value,
    (v) => {
      setCookie(v);
      setValue(v);
    },
  ];
};

export default useCookie;
