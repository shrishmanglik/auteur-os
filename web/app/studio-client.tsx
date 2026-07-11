"use client";

import dynamic from "next/dynamic";
import { useEffect } from "react";
import { PersistenceBridge } from "../../src/PersistenceBridge";

const AuteurStudio = dynamic(() => import("../../src/AppV2").then((module) => module.AppV2), {
  ssr: false,
  loading: () => <main className="web-boot"><span>A</span><strong>Loading AUTEUR Studio</strong><small>Preparing the production workspace...</small></main>,
});

export default function StudioClient() {
  useEffect(() => {
    if ("serviceWorker" in navigator && process.env.NODE_ENV === "production") {
      navigator.serviceWorker.register("/sw.js").catch(() => undefined);
    }
  }, []);
  return <PersistenceBridge><AuteurStudio /></PersistenceBridge>;
}
