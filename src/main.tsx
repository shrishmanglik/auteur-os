import React from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";
import { PersistenceBridge } from "./PersistenceBridge";

const rootElement = document.getElementById("root");

if (!rootElement) throw new Error("AUTEUR root element is missing.");

const root = createRoot(rootElement);

import("./AppV2")
  .then(({ AppV2 }) => root.render(<React.StrictMode><PersistenceBridge><AppV2 /></PersistenceBridge></React.StrictMode>))
  .catch((error: unknown) => {
    console.error("AUTEUR failed to start", error);
    root.render(<main className="boot-error"><strong>AUTEUR could not start.</strong><span>Reload the studio. If the problem continues, inspect the local runtime log.</span></main>);
  });
