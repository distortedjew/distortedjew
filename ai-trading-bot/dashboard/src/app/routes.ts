import { lazy } from "react";
import type { RouteObject } from "react-router";
import { AppShell } from "@/components/layout/AppShell";
import { RouteErrorBoundary } from "@/components/layout/RouteErrorBoundary";
import NotFoundPage from "@/pages/NotFoundPage";

// One lazily loaded chunk per page: heavy chart libraries load only where they are used.
const OverviewPage = lazy(() => import("@/pages/OverviewPage"));
const MarketsPage = lazy(() => import("@/pages/MarketsPage"));
const PositionsPage = lazy(() => import("@/pages/PositionsPage"));
const TradesPage = lazy(() => import("@/pages/TradesPage"));
const AiPage = lazy(() => import("@/pages/AiPage"));
const PerformancePage = lazy(() => import("@/pages/PerformancePage"));
const RiskPage = lazy(() => import("@/pages/RiskPage"));
const BacktestsPage = lazy(() => import("@/pages/BacktestsPage"));
const SystemPage = lazy(() => import("@/pages/SystemPage"));
const SettingsPage = lazy(() => import("@/pages/SettingsPage"));

function page(path: string | undefined, title: string, Component: RouteObject["Component"]): RouteObject {
  return path === undefined
    ? { index: true, Component, ErrorBoundary: RouteErrorBoundary, handle: { title } }
    : { path, Component, ErrorBoundary: RouteErrorBoundary, handle: { title } };
}

export const routes: RouteObject[] = [
  {
    path: "/",
    Component: AppShell,
    ErrorBoundary: RouteErrorBoundary,
    children: [
      page(undefined, "Overview", OverviewPage),
      page("markets", "Markets", MarketsPage),
      page("positions", "Positions", PositionsPage),
      page("trades", "Trades", TradesPage),
      page("ai", "AI Analysis", AiPage),
      page("performance", "Performance", PerformancePage),
      page("risk", "Risk", RiskPage),
      page("backtests", "Backtests", BacktestsPage),
      page("system", "System", SystemPage),
      page("settings", "Settings", SettingsPage),
      // Dev-only design showcase (the only place static sample data is allowed).
      ...(import.meta.env.DEV
        ? [
            page(
              "_design",
              "Design system",
              lazy(() => import("@/pages/DesignPage")),
            ),
          ]
        : []),
      { path: "*", Component: NotFoundPage, handle: { title: "Not found" } },
    ],
  },
];
