import { useOS } from "@/hooks/useOS";
import { TrafficLights } from "./TrafficLights";
import { SponsorButton } from "@/components/welcome/SponsorButton";

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
      <div className="pr-2" style={{ ["--wails-draggable" as string]: "no-drag" }}>
        <SponsorButton compact />
      </div>
    </div>
  );
}
