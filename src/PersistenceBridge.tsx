import { useEffect, useRef, type ReactNode } from "react";
import { chooseNewestSnapshot, createStudioSnapshot, readBackendSnapshot, readIndexedSnapshot, workspacePatch, writeBackendSnapshot, writeIndexedSnapshot } from "./persistence";
import { useStudio } from "./store";

export function PersistenceBridge({ children }: { children: ReactNode }) {
  const hydrated = useRef(false);
  const backendVault = useRef(false);
  useEffect(() => {
    let disposed = false;
    let timer: number | undefined;
    let writing = false;
    let queued = false;

    const persist = async () => {
      if (!hydrated.current || writing) { queued = true; return; }
      writing = true;
      queued = false;
      const snapshot = createStudioSnapshot();
      const indexed = await writeIndexedSnapshot(snapshot);
      if (backendVault.current) void writeBackendSnapshot(snapshot);
      if (!disposed && indexed && useStudio.getState().persistenceStatus !== "saved") {
        useStudio.setState({ persistenceStatus: "saved" });
      }
      writing = false;
      if (queued && !disposed) void persist();
    };

    const runtime = globalThis as typeof globalThis & { __AUTEUR_STATE_VAULT__?: boolean };
    const backendSnapshot = runtime.__AUTEUR_STATE_VAULT__
      ? readBackendSnapshot()
      : Promise.resolve({ available: false, snapshot: null });
    Promise.all([readIndexedSnapshot(), backendSnapshot]).then(([indexed, backend]) => {
      if (disposed) return;
      backendVault.current = backend.available;
      const snapshot = chooseNewestSnapshot(indexed, backend.snapshot);
      if (snapshot) useStudio.setState(workspacePatch(snapshot));
      hydrated.current = true;
      if (!snapshot) void persist();
    });

    const unsubscribe = useStudio.subscribe(() => {
      if (!hydrated.current) return;
      window.clearTimeout(timer);
      timer = window.setTimeout(() => void persist(), 350);
    });
    const flush = () => { window.clearTimeout(timer); void persist(); };
    const visibility = () => { if (document.visibilityState === "hidden") flush(); };
    window.addEventListener("pagehide", flush);
    document.addEventListener("visibilitychange", visibility);
    return () => {
      disposed = true;
      unsubscribe();
      window.clearTimeout(timer);
      window.removeEventListener("pagehide", flush);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, []);
  return children;
}
