import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react";
import { cx } from "./ui";

interface Toast {
  id: number;
  message: string;
  tone: "info" | "ok" | "error";
}

const ToastContext = createContext<(message: string, tone?: Toast["tone"]) => void>(() => {});

export const useToast = () => useContext(ToastContext);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const counter = useRef(0);

  const push = useCallback((message: string, tone: Toast["tone"] = "info") => {
    const id = ++counter.current;
    setToasts((t) => [...t, { id, message, tone }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4200);
  }, []);

  return (
    <ToastContext.Provider value={push}>
      {children}
      <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 items-end">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={cx(
              "rise-in px-3.5 py-2 rounded-md border text-[12.5px] shadow-sm bg-paper-raised max-w-sm",
              t.tone === "ok" && "border-ok/40 text-ok",
              t.tone === "error" && "border-danger/40 text-danger",
              t.tone === "info" && "border-line-strong text-ink",
            )}
          >
            {t.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
