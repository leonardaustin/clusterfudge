import { useEffect } from "react";
import { useUIStore } from "../stores/uiStore";

function safeGetItem(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const { theme, setTheme } = useUIStore();

  // Sync system preference on first load if no saved preference
  useEffect(() => {
    const saved = safeGetItem("clusterfudge-ui");
    if (!saved) {
      const prefersDark = window.matchMedia(
        "(prefers-color-scheme: dark)"
      ).matches;
      setTheme(prefersDark ? "dark" : "light");
    }
  }, [setTheme]);

  // Resolve "system" to the OS-preferred theme
  const resolvedTheme = theme === "system"
    ? (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light")
    : theme;

  // Apply theme class to root element
  useEffect(() => {
    const root = document.documentElement;
    const validClasses = ["theme-light", "theme-monokai", "theme-solarized"] as const;
    root.classList.remove(...validClasses);
    const cls = `theme-${resolvedTheme}` as string;
    if ((validClasses as readonly string[]).includes(cls)) {
      root.classList.add(cls);
    }
  }, [resolvedTheme]);

  // Listen for OS-level preference changes when theme is "system" or unset
  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = () => {
      // Force a re-render so resolvedTheme updates
      if (theme === "system") {
        const root = document.documentElement;
        const validClasses = ["theme-light", "theme-monokai", "theme-solarized"] as const;
        root.classList.remove(...validClasses);
        if (!mq.matches) {
          root.classList.add("theme-light");
        }
      }
      const saved = safeGetItem("clusterfudge-ui");
      if (!saved) {
        setTheme(mq.matches ? "dark" : "light");
      }
    };
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, [theme, setTheme]);

  return <>{children}</>;
}
