import { Heart } from "lucide-react";
import { useOS } from "@/hooks/useOS";
import { TrafficLights } from "./TrafficLights";
import { BrowserOpenURL } from "@/wailsjs/runtime/runtime";

const SPONSOR_URL = "https://github.com/sponsors/leonardaustin";

export function TitleBar() {
  const isMac = useOS() === "mac";
  if (!isMac) return null;

  return (
    <div
      className="h-7 w-full bg-bg-secondary border-b border-border flex-shrink-0 flex items-center"
      style={{ ["--wails-draggable" as string]: "drag" }}
    >
      <TrafficLights />
      <div className="flex-1" />
      <div className="px-3 flex items-center" style={{ ["--wails-draggable" as string]: "no-drag" }}>
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
