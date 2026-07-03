import { useEffect, useState } from "react";
import {
  fetchSharedLoadout,
  readShareFromHash,
  readSlugFromPath,
  type SharedLoadout,
} from "./lib/share";
import { HowItWorks } from "./views/HowItWorks/HowItWorks";
import { Landing } from "./views/Landing";
import { SharePage } from "./views/SharePage";
import { Builder } from "./views/Builder";
import { Gallery } from "./views/Gallery";

export default function App() {
  const [shared, setShared] = useState<SharedLoadout | null>(() => readShareFromHash());
  const [building, setBuilding] = useState(() => location.hash === "#share");
  const slug = readSlugFromPath();

  useEffect(() => {
    const onHash = () => {
      setShared(readShareFromHash());
      setBuilding(location.hash === "#share");
    };
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  if (location.pathname === "/how-it-works") return <HowItWorks />;
  if (location.pathname === "/gallery") return <Gallery />;
  if (slug) return <ShortShare slug={slug} />;
  if (shared) return <SharePage loadout={shared} />;
  if (building) return <Builder />;
  return <Landing />;
}

function ShortShare({ slug }: { slug: string }) {
  const [state, setState] = useState<"loading" | "missing" | SharedLoadout>("loading");

  useEffect(() => {
    fetchSharedLoadout(slug).then((l) => setState(l ?? "missing"));
  }, [slug]);

  if (state === "loading") {
    return (
      <div className="min-h-screen flex items-center justify-center text-ink-faint text-[14px]">
        Loading loadout…
      </div>
    );
  }
  if (state === "missing") {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-3">
        <div className="text-[20px] font-bold tracking-tight">This loadout doesn't exist</div>
        <p className="text-ink-soft text-[14px]">The link may be mistyped or was never created.</p>
        <a href="/" className="text-accent-deep underline text-[14px]">
          Back to Loadout
        </a>
      </div>
    );
  }
  return <SharePage loadout={state} />;
}
