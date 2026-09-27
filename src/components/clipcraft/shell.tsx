"use client";

import { cn } from "@/lib/utils";
import {
  Home,
  PlusSquare,
  FolderOpen,
  LayoutGrid,
  Image as ImageIcon,
  Settings as SettingsIcon,
  CircleHelp,
  Crown,
  Play,
  Moon,
  Check,
} from "lucide-react";
import { useCC } from "./store";

const QUOTES = [
  "Good ideas deserve great videos.",
  "Better visuals. Bigger impact.",
  "Polish today, go viral tomorrow.",
  "Great videos aren't just edited, they're orchestrated.",
  "From raw footage to remarkable stories.",
  "Same content. Bigger impact.",
];

const NAV_ITEMS = [
  { id: "home", label: "Home", icon: Home },
  { id: "new", label: "New Project", icon: PlusSquare },
  { id: "projects", label: "My Projects", icon: FolderOpen },
  { id: "templates", label: "Templates", icon: LayoutGrid },
  { id: "media", label: "Media Library", icon: ImageIcon },
] as const;

export function Sidebar({
  onOpenSettings,
  onOpenHelp,
}: {
  onOpenSettings: () => void;
  onOpenHelp: () => void;
}) {
  const { nav, setNav, project } = useCC();
  const quote = QUOTES[Math.floor(Date.now() / 3.6e6) % QUOTES.length];

  return (
    <aside className="hidden md:flex w-60 shrink-0 flex-col bg-cc-panel border-r border-cc-border/70">
      <div className="px-4 pt-5 pb-4">
        <button
          className="flex items-center gap-2.5 group"
          onClick={() => setNav("home")}
        >
          <span className="w-9 h-9 rounded-lg bg-gradient-to-br from-cc-accent to-cc-accent2 flex items-center justify-center shadow-lg shadow-indigo-500/30">
            <Play className="w-4 h-4 text-white fill-white ml-0.5" />
          </span>
          <span className="text-left leading-tight">
            <span className="block font-bold text-[15px] text-white">ClipCraft AI</span>
            <span className="block text-[11px] text-cc-dim">
              Turn Conversations into Captivating Videos
            </span>
          </span>
        </button>
      </div>

      <nav className="flex-1 px-3 space-y-1 overflow-y-auto cc-scroll">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const active =
            nav === item.id ||
            (item.id === "home" && nav === "wizard" && !project) ||
            (item.id === "new" && nav === "wizard");
          return (
            <button
              key={item.id}
              onClick={() => setNav(item.id as any)}
              className={cn(
                "w-full flex items-center gap-3 px-3 h-10 rounded-lg text-sm font-medium transition-all",
                active
                  ? "bg-gradient-to-r from-indigo-600/90 to-indigo-600/70 text-white shadow-lg shadow-indigo-950/40"
                  : "text-cc-muted hover:text-white hover:bg-cc-panel2"
              )}
            >
              <Icon className="w-[18px] h-[18px]" />
              {item.label}
            </button>
          );
        })}

        <div className="h-px bg-cc-border/60 my-3 mx-2" />

        <button
          onClick={onOpenSettings}
          className={cn(
            "w-full flex items-center gap-3 px-3 h-10 rounded-lg text-sm font-medium transition-all",
            "text-cc-muted hover:text-white hover:bg-cc-panel2"
          )}
        >
          <SettingsIcon className="w-[18px] h-[18px]" />
          Settings
        </button>
        <button
          onClick={onOpenHelp}
          className="w-full flex items-center gap-3 px-3 h-10 rounded-lg text-sm font-medium text-cc-muted hover:text-white hover:bg-cc-panel2 transition-all"
        >
          <CircleHelp className="w-[18px] h-[18px]" />
          Help &amp; Docs
        </button>
      </nav>

      <div className="p-3">
        <div className="rounded-xl border border-indigo-500/40 bg-gradient-to-br from-indigo-600/20 via-cc-panel2 to-cc-panel2 p-3.5">
          <div className="flex items-center gap-2 mb-1.5">
            <Crown className="w-4 h-4 text-amber-400" />
            <span className="font-semibold text-white text-sm">Pro Plan</span>
          </div>
          <p className="text-[11px] text-cc-muted mb-3">Unlock more creativity</p>
          <button className="cc-btn-primary w-full text-white text-xs font-semibold rounded-lg py-2">
            Upgrade
          </button>
        </div>
        <p className="text-[10px] italic text-cc-dim/80 text-center mt-3 px-1">
          &ldquo;{quote}&rdquo;
        </p>
      </div>
    </aside>
  );
}

export const STEPS = ["Input", "Analyze", "Visuals", "Polish", "Assemble", "Review"];

export function Header({ onOpenSettings }: { onOpenSettings: () => void }) {
  const { step, setStep, project } = useCC();

  return (
    <header className="h-16 shrink-0 flex items-center gap-4 px-4 md:px-6 border-b border-cc-border/70 bg-cc-bg/80 backdrop-blur-sm sticky top-0 z-40">
      <div className="hidden lg:flex items-center gap-2.5 w-56 shrink-0">
        <span className="w-8 h-8 rounded-lg bg-gradient-to-br from-cc-accent to-cc-accent2 flex items-center justify-center">
          <Play className="w-3.5 h-3.5 text-white fill-white ml-0.5" />
        </span>
        <span className="leading-tight">
          <span className="block font-bold text-sm text-white">ClipCraft AI</span>
          <span className="block text-[10px] text-cc-dim">Turn Conversations into Videos</span>
        </span>
      </div>

      {/* Stepper */}
      <div className="flex-1 flex items-center justify-center min-w-0">
        <div className="flex items-center w-full max-w-2xl">
          {STEPS.map((label, i) => {
            const n = i + 1;
            const isCurrent = n === step;
            const isDone = n < step;
            return (
              <div key={label} className="flex-1 flex items-center last:flex-none">
                <button
                  onClick={() => project && n <= step && setStep(n)}
                  className={cn(
                    "flex flex-col items-center gap-1.5 group",
                    project && n <= step ? "cursor-pointer" : "cursor-default"
                  )}
                  aria-current={isCurrent ? "step" : undefined}
                >
                  <span
                    className={cn(
                      "w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-semibold border-2 transition-all",
                      isCurrent
                        ? "bg-cc-accent border-cc-accent text-white shadow-lg shadow-indigo-500/40"
                        : isDone
                          ? "bg-indigo-500/20 border-indigo-500/60 text-indigo-300"
                          : "bg-cc-panel2 border-cc-border text-cc-dim"
                    )}
                  >
                    {isDone ? <Check className="w-3.5 h-3.5" /> : n}
                  </span>
                  <span
                    className={cn(
                      "text-[11px] font-medium whitespace-nowrap",
                      isCurrent ? "text-white" : isDone ? "text-cc-muted" : "text-cc-dim"
                    )}
                  >
                    {label}
                  </span>
                </button>
                {i < STEPS.length - 1 && (
                  <div
                    className={cn(
                      "flex-1 h-px mx-1.5 mb-5 -translate-y-[7px]",
                      n < step ? "bg-indigo-500/60" : "bg-cc-border"
                    )}
                  />
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div className="flex items-center gap-3 shrink-0">
        <span className="hidden xl:inline text-[11px] text-cc-muted italic">
          Create Better Videos, Faster ✨
        </span>
        <button
          className="w-8 h-8 rounded-lg border border-cc-border bg-cc-panel flex items-center justify-center text-cc-muted hover:text-white transition-colors"
          title="Dark mode"
          onClick={onOpenSettings}
        >
          <Moon className="w-4 h-4" />
        </button>
        <span className="w-8 h-8 rounded-full bg-gradient-to-br from-sky-300 to-blue-500 flex items-center justify-center text-[11px] font-bold text-slate-900">
          JB
        </span>
      </div>
    </header>
  );
}
