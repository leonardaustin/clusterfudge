import { useState, useCallback } from "react";
import { Heart, Check, Copy } from "lucide-react";
import { useOS } from "@/hooks/useOS";
import { useUpdateCheck } from "@/hooks/useUpdateCheck";
import { TrafficLights } from "./TrafficLights";
import { BrowserOpenURL } from "@/wailsjs/runtime/runtime";

const SPONSOR_URL = "https://github.com/sponsors/leonardaustin";

export function TitleBar() {
  const isMac = useOS() === "mac";
  const { update, upgradeCommand } = useUpdateCheck();
  const [copied, setCopied] = useState(false);

  const copyCommand = useCallback(() => {
    if (!upgradeCommand) return;
    navigator.clipboard.writeText(upgradeCommand).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [upgradeCommand]);

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
          upgradeCommand ? (
            <button
              onClick={copyCommand}
              className="text-2xs font-medium flex items-center gap-1 transition-colors cursor-pointer font-mono"
              style={{ color: "#e8723a" }}
              title={copied ? "Copied!" : `Copy upgrade command (${update.version})`}
            >
              {upgradeCommand}
              {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
            </button>
          ) : (
            <button
              onClick={() => BrowserOpenURL(update.releaseUrl)}
              className="text-2xs font-medium hover:underline transition-colors cursor-pointer"
              style={{ color: "#e8723a" }}
              title={`Update to ${update.version}`}
            >
              New version available
            </button>
          )
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
