export function useOS(): "mac" | "windows" | "linux" {
  if (typeof navigator === "undefined") return "linux";
  const p = navigator.platform.toLowerCase();
  if (p.startsWith("mac")) return "mac";
  if (p.startsWith("win")) return "windows";
  return "linux";
}
