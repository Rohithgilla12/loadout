import { useEffect, useState } from "react";
import { readShareFromHash, type SharedLoadout } from "./lib/share";
import { Landing } from "./views/Landing";
import { SharePage } from "./views/SharePage";
import { Builder } from "./views/Builder";

export default function App() {
  const [shared, setShared] = useState<SharedLoadout | null>(() => readShareFromHash());
  const [building, setBuilding] = useState(() => location.hash === "#share");

  useEffect(() => {
    const onHash = () => {
      setShared(readShareFromHash());
      setBuilding(location.hash === "#share");
    };
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  if (shared) return <SharePage loadout={shared} />;
  if (building) return <Builder />;
  return <Landing />;
}
