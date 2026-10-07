import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "@/App";
import { initAuthToken } from "@/lib/api";
import "./index.css";

// Pick up ?token=… before the first request or WebSocket connection.
initAuthToken();

const root = document.getElementById("root");
if (!root) throw new Error("#root element missing from index.html");

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
