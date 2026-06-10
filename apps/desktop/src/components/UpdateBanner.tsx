import { useEffect, useState } from "react";
import { check, type Update } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";
import { Button, Spinner } from "./ui";
import { useToast } from "./Toast";

/**
 * F10 — app self-update, same philosophy as skill updates: notify, then
 * one click. Checks GitHub Releases on launch; nothing installs silently.
 */
export function UpdateBanner() {
  const [update, setUpdate] = useState<Update | null>(null);
  const [installing, setInstalling] = useState(false);
  const toast = useToast();

  useEffect(() => {
    check()
      .then((u) => {
        if (u) setUpdate(u);
      })
      .catch(() => {
        // offline or unsigned dev build — never bother the user about it
      });
  }, []);

  if (!update) return null;

  return (
    <div className="mx-2 mb-2 px-2.5 py-2 rounded-md border border-accent/40 bg-accent-wash/60 text-[12px] rise-in">
      <div className="font-semibold">Loadout {update.version} is out</div>
      <div className="text-ink-soft mt-0.5">Signed update from GitHub Releases.</div>
      <Button
        variant="primary"
        className="mt-1.5 w-full"
        disabled={installing}
        onClick={async () => {
          setInstalling(true);
          try {
            await update.downloadAndInstall();
            await relaunch();
          } catch (e) {
            setInstalling(false);
            toast(String(e), "error");
          }
        }}
      >
        {installing ? <Spinner /> : "Update & restart"}
      </Button>
    </div>
  );
}
