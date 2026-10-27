import { QueryClientProvider } from "@tanstack/react-query";
import { MotionConfig } from "framer-motion";
import { createBrowserRouter } from "react-router";
import { RouterProvider } from "react-router/dom";
import { LiveDataProvider } from "@/app/LiveDataProvider";
import { routes } from "@/app/routes";
import { createQueryClient } from "@/lib/query-client";
import { TooltipProvider } from "@/components/ui/Tooltip";

const queryClient = createQueryClient();
const router = createBrowserRouter(routes);

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <MotionConfig reducedMotion="user">
        <TooltipProvider>
          <LiveDataProvider />
          <RouterProvider router={router} />
        </TooltipProvider>
      </MotionConfig>
    </QueryClientProvider>
  );
}
