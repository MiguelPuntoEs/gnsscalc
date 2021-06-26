(function CookieBanner() {
  const COOKIE_NAME = "accepts-cookies";
  const banner = document.querySelector("#consent-banner");
  const allowButton = banner.querySelector("#consent-allow");
  const denyButton = banner.querySelector("#consent-deny");

  const getCookie = () => {
    return document.cookie.split(";").reduce((r, v) => {
      const parts = v.split("=");
      return parts[0] === COOKIE_NAME ? decodeURIComponent(parts[1]) : r;
    }, "");
  }

  const setCookie = (value) => {
    const expires = new Date(
      Date.now() + 15330 * 864e5 // ~42 years
    ).toUTCString();

    document.cookie = `${COOKIE_NAME}=${encodeURIComponent(
      value
    )};expires=${expires};path=/;SameSite=Lax;`;
  };

  const updateUI = () => {
    const shouldShowBanner = getCookie().length === 0;
    
    if (shouldShowBanner) {
      banner.classList.add("show");
    } else {
      banner.classList.remove("show");
    }
  }

  allowButton.addEventListener("click", () => {
    setCookie("true");
    updateUI();
  });

  denyButton.addEventListener("click", () => {
    setCookie("false");
    updateUI();
  })

  updateUI();

})();
