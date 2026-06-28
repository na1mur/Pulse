import { useState } from "react";
import { Login } from "./components/Login";
import { Dashboard } from "./components/Dashboard";
import { useSocketSync } from "./hooks/useSocketSync";
import { useSyncManager } from "./hooks/useSyncManager";

function PulseApp({ onLogout }: { onLogout: () => void }) {
  // Mount background sync and real-time socket listeners
  useSyncManager();
  useSocketSync();

  return <Dashboard onLogout={onLogout} />;
}

function App() {
  const [token, setToken] = useState<string | null>(
    localStorage.getItem("pulse-access-token"),
  );

  if (!token) {
    return <Login onSuccess={(accessToken) => setToken(accessToken)} />;
  }

  return <PulseApp onLogout={() => setToken(null)} />;
}

export default App;
