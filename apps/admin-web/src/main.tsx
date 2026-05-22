import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import "./styles/global.css";

const routerBasename = import.meta.env.VITE_ROUTER_BASENAME || (import.meta.env.PROD ? "/admin" : "/");

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter basename={routerBasename}>
      <App />
    </BrowserRouter>
  </React.StrictMode>
);
