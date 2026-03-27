import { useState, useEffect } from "react";
import {
  CheckForUpdate,
  InstallSource,
  type UpdateInfo,
} from "@/wailsjs/go/handlers/UpdateHandler";

export type { UpdateInfo };

const UPGRADE_COMMANDS: Record<string, string> = {
  brew: "brew upgrade clusterfudge",
  apt: "sudo apt update && sudo apt upgrade clusterfudge",
};

export function useUpdateCheck() {
  const [update, setUpdate] = useState<UpdateInfo | null>(null);
  const [installSource, setInstallSource] = useState("");

  useEffect(() => {
    // Delay to ensure Wails runtime bindings are available.
    const timer = setTimeout(() => {
      CheckForUpdate()
        .then((info) => {
          if (info?.version) setUpdate(info);
        })
        .catch((err) => console.error("Failed to check for update:", err));
      InstallSource()
        .then((src) => setInstallSource(src || ""))
        .catch((err) => console.error("Failed to get install source:", err));
    }, 3000);
    return () => clearTimeout(timer);
  }, []);

  const upgradeCommand = UPGRADE_COMMANDS[installSource] || "";

  return { update, installSource, upgradeCommand };
}
