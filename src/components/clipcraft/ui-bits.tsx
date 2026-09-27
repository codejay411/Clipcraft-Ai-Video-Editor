"use client";

import { cn } from "@/lib/utils";
import { type ReactNode } from "react";

export function Panel({
  className,
  children,
  ...rest
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "rounded-xl border border-cc-border/70 bg-cc-panel",
        className
      )}
      {...rest}
    >
      {children}
    </div>
  );
}

export function SectionTitle({
  icon,
  children,
  right,
  className,
}: {
  icon?: ReactNode;
  children: ReactNode;
  right?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex items-center justify-between gap-2", className)}>
      <div className="flex items-center gap-2 min-w-0">
        {icon}
        <h3 className="font-semibold text-[15px] text-white truncate">{children}</h3>
      </div>
      {right}
    </div>
  );
}

export function GradientButton({
  children,
  className,
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      className={cn(
        "cc-btn-primary text-white font-semibold rounded-lg px-5 py-2.5 text-sm inline-flex items-center justify-center gap-2",
        className
      )}
      {...rest}
    >
      {children}
    </button>
  );
}

export function GhostButton({
  children,
  className,
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      className={cn(
        "rounded-lg border border-cc-border bg-transparent text-cc-muted hover:text-white hover:border-cc-dim hover:bg-cc-panel2 transition-colors px-4 py-2 text-sm font-medium inline-flex items-center justify-center gap-2",
        className
      )}
      {...rest}
    >
      {children}
    </button>
  );
}

const STATUS_STYLES: Record<string, string> = {
  keep: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  cut: "bg-red-500/15 text-red-400 border-red-500/30",
  silence: "bg-blue-500/15 text-blue-400 border-blue-500/30",
  success: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  warn: "bg-amber-500/15 text-amber-400 border-amber-500/30",
  info: "bg-blue-500/15 text-blue-400 border-blue-500/30",
  accent: "bg-indigo-500/15 text-indigo-300 border-indigo-500/30",
  neutral: "bg-cc-panel2 text-cc-muted border-cc-border",
};

export function Badge({
  tone = "neutral",
  className,
  children,
  ...rest
}: React.HTMLAttributes<HTMLSpanElement> & { tone?: keyof typeof STATUS_STYLES | string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-medium leading-4 whitespace-nowrap",
        STATUS_STYLES[tone] || STATUS_STYLES.neutral,
        className
      )}
      {...rest}
    >
      {children}
    </span>
  );
}

// Deterministic pseudo-waveform bars for segment cards
function computeWaveHeights(seed: string, bars: number, level: string): number[] {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  const out: number[] = [];
  for (let i = 0; i < bars; i++) {
    h = (h * 1103515245 + 12345) >>> 0;
    const r = (h % 1000) / 1000;
    if (level === "flat") out.push(0.12 + r * 0.06);
    else if (level === "low") out.push(0.2 + r * 0.25);
    else out.push(0.35 + r * 0.65);
  }
  return out;
}

export function Waveform({
  seed,
  bars = 28,
  level = "high",
  className,
  color,
}: {
  seed: string;
  bars?: number;
  level?: "high" | "flat" | "low";
  className?: string;
  color?: string;
}) {
  const heights = computeWaveHeights(seed, bars, level);
  return (
    <div className={cn("flex items-center gap-[2px] h-6", className)}>
      {heights.map((v, i) => (
        <div
          key={i}
          className="w-[2px] rounded-full"
          style={{
            height: `${Math.max(2, v * 100)}%`,
            backgroundColor: color || "currentColor",
            opacity: 0.55 + v * 0.4,
          }}
        />
      ))}
    </div>
  );
}

export function Spinner({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "w-4 h-4 border-2 border-white/25 border-t-white rounded-full animate-spin",
        className
      )}
    />
  );
}

export function EmptyState({
  icon,
  title,
  hint,
}: {
  icon?: ReactNode;
  title: string;
  hint?: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-10 px-6 text-center">
      {icon && <div className="mb-3 text-cc-dim">{icon}</div>}
      <p className="text-sm font-medium text-cc-muted">{title}</p>
      {hint && <p className="text-xs text-cc-dim mt-1 max-w-sm">{hint}</p>}
    </div>
  );
}

export function LabeledToggle({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex items-center justify-between gap-3 cursor-pointer py-1.5">
      <span className="text-sm">
        <span className="text-white">{label}</span>
        {hint && <span className="block text-xs text-cc-dim mt-0.5">{hint}</span>}
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={cn(
          "relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors",
          checked ? "bg-cc-accent" : "bg-cc-border"
        )}
      >
        <span
          className={cn(
            "inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform",
            checked ? "translate-x-[22px]" : "translate-x-0.5"
          )}
        />
      </button>
    </label>
  );
}
