import React from "react";
import ReactDOM from "react-dom/client";
import "./index.css";
import "./App.css";
import App from "./App";
import Picker from "./components/Picker";
import { getCurrentWindow } from "@tauri-apps/api/window";

async function mount() {
  const label = (await getCurrentWindow()).label;
  const Root = label === "picker" ? Picker : App;

  ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
    <React.StrictMode>
      <Root />
    </React.StrictMode>,
  );
}

mount();
