import { useCallback, useEffect, useState } from "react";
import { Link as RouterLink } from "react-router-dom";
import { Alert, Box, Button, Card, CardContent, CircularProgress, Grid, Typography } from "@mui/material";
import AllInboxOutlinedIcon from "@mui/icons-material/AllInboxOutlined";
import ScheduleOutlinedIcon from "@mui/icons-material/ScheduleOutlined";
import CheckCircleOutlineIcon from "@mui/icons-material/CheckCircleOutline";
import ErrorOutlineIcon from "@mui/icons-material/ErrorOutline";
import api, { errorMessage } from "../api";
import PageHeader from "../components/PageHeader";
import StatusChip from "../components/StatusChip";

const cards = [
  { key: "total", label: "Total Messages", icon: <AllInboxOutlinedIcon />, color: "#1971c2" },
  { key: "pending", label: "Pending Messages", icon: <ScheduleOutlinedIcon />, color: "#e67700" },
  { key: "sent", label: "Sent Messages", icon: <CheckCircleOutlineIcon />, color: "#087f5b" },
  { key: "failed", label: "Failed Messages", icon: <ErrorOutlineIcon />, color: "#c92a2a" },
];

const emptyStats = { total: 0, pending: 0, sent: 0, failed: 0 };

export default function Dashboard() {
  const [stats, setStats] = useState(emptyStats);
  const [status, setStatus] = useState("Connecting");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  const load = useCallback(async () => {
    try {
      const [statsResponse, statusResponse] = await Promise.all([
        api.get("/messages/stats"),
        api.get("/whatsapp/status"),
      ]);
      setStats(statsResponse.data?.data || emptyStats);
      setStatus(statusResponse.data?.data?.status || "Disconnected");
      setLoadError("");
    } catch (error) {
      setLoadError(errorMessage(error));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    // Polling pauses on a hidden tab so a backgrounded dashboard does not keep
    // spending the API rate limit.
    const timer = setInterval(() => {
      if (!document.hidden) load();
    }, 10000);
    return () => clearInterval(timer);
  }, [load]);

  return (
    <>
      <PageHeader title="Dashboard" subtitle="A live overview of your scheduled WhatsApp messages." />

      {loadError && <Alert severity="error" sx={{ mb: 3 }}>{loadError}</Alert>}

      {loading ? (
        <CircularProgress />
      ) : (
        <>
          <Grid container spacing={3}>
            {cards.map((card) => (
              <Grid item xs={12} sm={6} lg={3} key={card.key}>
                <Card>
                  <CardContent sx={{ display: "flex", alignItems: "center", gap: 2 }}>
                    <Box
                      sx={{
                        width: 56,
                        height: 56,
                        display: "grid",
                        placeItems: "center",
                        borderRadius: 2,
                        backgroundColor: `${card.color}20`,
                        color: card.color,
                      }}
                    >
                      {card.icon}
                    </Box>
                    <Box>
                      <Typography variant="h4">{stats?.[card.key] ?? 0}</Typography>
                      <Typography variant="body2" color="text.secondary">{card.label}</Typography>
                    </Box>
                  </CardContent>
                </Card>
              </Grid>
            ))}
          </Grid>

          <Card sx={{ mt: 3 }}>
            <CardContent>
              <Typography variant="h6" sx={{ mb: 2 }}>WhatsApp Connection</Typography>
              <Box sx={{ display: "flex", alignItems: "center", gap: 2, flexWrap: "wrap" }}>
                <StatusChip status={status} />
                <Typography color="text.secondary" sx={{ flexGrow: 1 }}>
                  Status refreshes automatically every 10 seconds.
                </Typography>
                {status !== "Connected" && (
                  <Button component={RouterLink} to="/settings" size="small" variant="outlined">
                    Connect WhatsApp
                  </Button>
                )}
              </Box>
              {status !== "Connected" && (
                <Alert severity="warning" sx={{ mt: 2 }}>
                  Scheduled messages are held until WhatsApp is connected. They are not marked as failed
                  while the connection is down.
                </Alert>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </>
  );
}
