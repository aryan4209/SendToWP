import { Route, Routes } from "react-router-dom";
import AppLayout from "./components/AppLayout";
import Dashboard from "./pages/Dashboard";
import ScheduleMessage from "./pages/ScheduleMessage";
import ScheduledMessages from "./pages/ScheduledMessages";
import Settings from "./pages/Settings";

export default function App() {
  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route path="/" element={<Dashboard />} />
        <Route path="/schedule" element={<ScheduleMessage />} />
        <Route path="/messages" element={<ScheduledMessages />} />
        <Route path="/settings" element={<Settings />} />
      </Route>
    </Routes>
  );
}
