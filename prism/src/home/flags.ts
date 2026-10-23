// URL flags for the home page. The mock flags only exist in the dev server
// (`import.meta.env.DEV`), so a production build can never fake a submit.
//
//   ?mockSubmit=1        POST /api/questions is faked: success, href of the newest running study
//   ?mockSubmit=error    fake 400 {"error":"问题太短了。"}
//   ?mockSubmit=network  fake network failure
//   ?mockDelete=1        DELETE is faked: success after 700 ms
//   ?mockDelete=error    fake 500 {"error":"删除失败，请重试。"}
//   ?mockEmpty=1         history is faked as [] (first-run state)
//   ?navigate=0          the submit and card links play out but never leave the page

const params = typeof location === "undefined" ? new URLSearchParams() : new URLSearchParams(location.search);
const dev = import.meta.env.DEV;

export const flags = {
  mockSubmit: dev ? params.get("mockSubmit") : null,
  mockDelete: dev ? params.get("mockDelete") : null,
  mockEmpty: dev && params.get("mockEmpty") === "1",
  stay: dev && params.get("navigate") === "0",
};

/** Set once the page is leaving, so the submit flight and its watchdog navigate only once. */
let leaving = false;

/** Leave for a study page (or log it when `?navigate=0`). Later calls are ignored until `resetNavigation()`. */
export function navigate(href: string): void {
  if (flags.stay) {
    console.info("[home] navigate", href);
    return;
  }
  if (leaving) return;
  leaving = true;
  location.assign(href);
}

/** Back from a study through the bfcache: allow navigating again. */
export function resetNavigation(): void {
  leaving = false;
}
