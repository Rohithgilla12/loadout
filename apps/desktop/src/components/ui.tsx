import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes } from "react";

export function cx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";

const buttonStyles: Record<ButtonVariant, string> = {
  primary:
    "bg-accent text-paper-raised hover:bg-accent-deep border border-accent-deep/30 font-medium",
  secondary:
    "bg-paper-raised text-ink border border-line-strong hover:border-ink-faint",
  ghost: "text-ink-soft hover:text-ink hover:bg-paper-sunken border border-transparent",
  danger: "text-danger border border-danger/30 hover:bg-danger-wash",
};

export function Button({
  variant = "secondary",
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant }) {
  return (
    <button
      className={cx(
        "px-2.5 py-1 rounded text-[12.5px] leading-5 transition-colors duration-100 disabled:opacity-40 disabled:pointer-events-none whitespace-nowrap",
        buttonStyles[variant],
        className,
      )}
      {...props}
    />
  );
}

export function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={cx(
        "bg-paper-raised border border-line rounded px-2.5 py-1 text-[13px] outline-none focus:border-accent placeholder:text-ink-faint w-full select-text",
        props.className,
      )}
      style={{ userSelect: "text", cursor: "text", ...props.style }}
    />
  );
}

export function Select(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...props}
      className={cx(
        "bg-paper-raised border border-line rounded px-2 py-1 text-[12.5px] outline-none focus:border-accent",
        props.className,
      )}
    />
  );
}

type BadgeTone = "neutral" | "accent" | "ok" | "warn" | "danger";

const badgeStyles: Record<BadgeTone, string> = {
  neutral: "bg-paper-sunken text-ink-soft border-line",
  accent: "bg-accent-wash text-accent-deep border-accent/25",
  ok: "bg-ok-wash text-ok border-ok/25",
  warn: "bg-warn-wash text-warn border-warn/30",
  danger: "bg-danger-wash text-danger border-danger/25",
};

export function Badge({ tone = "neutral", children }: { tone?: BadgeTone; children: ReactNode }) {
  return (
    <span
      className={cx(
        "inline-flex items-center gap-1 px-1.5 py-px rounded-[3px] border text-[11px] font-medium leading-4",
        badgeStyles[tone],
      )}
    >
      {children}
    </span>
  );
}

export function Mono({
  children,
  className,
  title,
}: {
  children: ReactNode;
  className?: string;
  title?: string;
}) {
  return (
    <span title={title} className={cx("font-mono text-[11.5px] text-ink-soft", className)}>
      {children}
    </span>
  );
}

export function Sha({ sha }: { sha?: string | null }) {
  if (!sha) return <Mono>—</Mono>;
  return <Mono title={sha}>{sha.slice(0, 7)}</Mono>;
}

export function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <div className="text-[10.5px] uppercase tracking-[0.12em] text-ink-faint font-semibold mb-1.5">
      {children}
    </div>
  );
}

export function EmptyState({
  title,
  body,
  action,
}: {
  title: string;
  body: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-start gap-2 max-w-md mx-auto mt-24 rise-in">
      <div className="w-8 h-1 bg-accent rounded-full mb-2" />
      <h2 className="text-[17px] font-semibold tracking-tight">{title}</h2>
      <p className="text-ink-soft text-[13px]">{body}</p>
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

export function Spinner() {
  return (
    <span className="inline-block w-3.5 h-3.5 border-[1.5px] border-line-strong border-t-accent rounded-full animate-spin align-middle" />
  );
}
