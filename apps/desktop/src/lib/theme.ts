import { useSyncExternalStore } from "react";

export type ThemePref = "system" | "light" | "dark";

const STORAGE_KEY = "loadout-theme";
const listeners = new Set<() => void>();

export function getThemePref(): ThemePref {
  const v = localStorage.getItem(STORAGE_KEY);
  return v === "light" || v === "dark" ? v : "system";
}

function apply() {
  const pref = getThemePref();
  const systemDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  const dark = pref === "dark" || (pref === "system" && systemDark);
  document.documentElement.classList.toggle("dark", dark);
}

/** Call once at startup: applies the saved preference and follows the OS. */
export function initTheme() {
  apply();
  window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", apply);
}

export function setThemePref(pref: ThemePref) {
  localStorage.setItem(STORAGE_KEY, pref);
  apply();
  listeners.forEach((l) => l());
}

export function useThemePref(): ThemePref {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    getThemePref,
  );
}
