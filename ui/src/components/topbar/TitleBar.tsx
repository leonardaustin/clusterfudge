import { useOS } from "@/hooks/useOS";
import { TrafficLights } from "./TrafficLights";

export function TitleBar() {
  const isMac = useOS() === "mac";
  if (!isMac) return null;

  return (
    <div
      className="h-7 w-full bg-bg-secondary border-b border-border flex-shrink-0 flex items-center"
      style={{ ["--wails-draggable" as string]: "drag" }}
    >
      <TrafficLights />
    </div>
  );
}
