import { useParams } from "react-router-dom";

export function useResourceParams() {
  const { namespace, name, group, resource } = useParams<{
    namespace?: string;
    name?: string;
    group?: string;
    resource?: string;
  }>();
  return { namespace, name, group, resource };
}
