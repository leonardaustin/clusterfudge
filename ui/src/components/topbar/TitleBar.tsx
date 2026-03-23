import { useState, useEffect } from "react";
import { Heart } from "lucide-react";
import { useOS } from "@/hooks/useOS";
import { TrafficLights } from "./TrafficLights";
import { BrowserOpenURL } from "@/wailsjs/runtime/runtime";
import { CheckForUpdate, type UpdateInfo } from "@/wailsjs/go/handlers/UpdateHandler";

const SPONSOR_URL = "https://github.com/sponsors/leonardaustin";

export function TitleBar() {
  const isMac = useOS() === "mac";
  const [update, setUpdate] = useState<UpdateInfo | null>(null);

  useEffect(() => {
    // Delay the check to ensure Wails runtime bindings are available.
    // On mount, window.go may not yet be injected.
    const timer = setTimeout(() => {
      CheckForUpdate()
        .then((info) => { if (info?.version) setUpdate(info) })
        .catch(() => {})
    }, 3000)
    return () => clearTimeout(timer)
  }, [])

  if (!isMac) return null;

  return (
    <div
      className="h-7 w-full bg-bg-secondary border-b border-border flex-shrink-0 flex items-center"
      style={{ ["--wails-draggable" as string]: "drag" }}
    >
      <TrafficLights />
      <div className="flex-1" />
      <div className="px-3 flex items-center gap-2" style={{ ["--wails-draggable" as string]: "no-drag" }}>
        {update && (
          <button
            onClick={() => BrowserOpenURL(update.releaseUrl)}
            className="text-2xs font-medium hover:underline transition-colors cursor-pointer"
            style={{ color: "#e8723a" }}
            title={`Update to ${update.version}`}
          >
            New version available
          </button>
        )}
        <button
          onClick={() => BrowserOpenURL(SPONSOR_URL)}
          className="flex items-center justify-center w-7 h-7 rounded
                     hover:bg-bg-hover transition-colors"
          title="Sponsor this project"
        >
          <Heart
            className="w-3.5 h-3.5 fill-current"
            style={{ color: "#e05688" }}
          />
        </button>
      </div>
    </div>
  );
}
