import { reportPilotEvent } from "./lib/pilot";

window.addEventListener("error", () => {
  reportPilotEvent("browser_error", window.location.pathname, "error");
});

window.addEventListener("unhandledrejection", () => {
  reportPilotEvent("browser_error", window.location.pathname, "unhandled_rejection");
});
