import { lazy, StrictMode, Suspense } from "react";
import { createRoot } from "react-dom/client";
import "katex/dist/katex.min.css";
import "./styles/tokens.css";
import "./styles/app.css";
import "./styles/design-system.css";

const isDesignSystem = window.location.pathname.startsWith("/design-system");
const App = lazy(() => import("./App"));
const DesignSystem = lazy(() => import("./DesignSystem"));

createRoot(document.getElementById("root")!).render(
  <StrictMode><Suspense fallback={null}>{isDesignSystem ? <DesignSystem /> : <App />}</Suspense></StrictMode>,
);
