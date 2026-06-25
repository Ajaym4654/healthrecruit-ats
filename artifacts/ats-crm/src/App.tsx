import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as SonnerToaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/lib/auth";
import NotFound from "@/pages/not-found";
import { AppLayout } from "@/components/layout";

// Pages
import LoginPage from "@/pages/login";
import DashboardPage from "@/pages/dashboard";
import CandidatesPage from "@/pages/candidates/index";
import NewCandidatePage from "@/pages/candidates/new";
import CandidateDetailPage from "@/pages/candidates/[id]";
import PipelinePage from "@/pages/pipeline";
import SearchPage from "@/pages/search";
import ImportPage from "@/pages/import";
import DuplicatesPage from "@/pages/duplicates";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 30_000,
    },
  },
});

function Router() {
  const { isAuthenticated } = useAuth();

  if (!isAuthenticated) {
    return (
      <Switch>
        <Route path="/login" component={LoginPage} />
        <Route component={LoginPage} />
      </Switch>
    );
  }

  return (
    <AppLayout>
      <Switch>
        <Route path="/" component={DashboardPage} />
        <Route path="/dashboard" component={DashboardPage} />
        <Route path="/candidates/new" component={NewCandidatePage} />
        <Route path="/candidates/:id" component={CandidateDetailPage} />
        <Route path="/candidates" component={CandidatesPage} />
        <Route path="/pipeline" component={PipelinePage} />
        <Route path="/search" component={SearchPage} />
        <Route path="/import" component={ImportPage} />
        <Route path="/duplicates" component={DuplicatesPage} />
        <Route path="/login" component={DashboardPage} />
        <Route component={NotFound} />
      </Switch>
    </AppLayout>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <AuthProvider>
            <Router />
          </AuthProvider>
        </WouterRouter>
        <Toaster />
        <SonnerToaster richColors position="top-right" />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
