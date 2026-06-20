import { useEffect, useState } from "react";
import {
  Alert,
  Box,
  Card,
  CardContent,
  CircularProgress,
  Grid,
  Typography,
} from "@mui/material";

import AllInboxOutlinedIcon from "@mui/icons-material/AllInboxOutlined";
import ScheduleOutlinedIcon from "@mui/icons-material/ScheduleOutlined";
import CheckCircleOutlineIcon from "@mui/icons-material/CheckCircleOutline";
import ErrorOutlineIcon from "@mui/icons-material/ErrorOutline";

import api, { errorMessage } from "../api";
import PageHeader from "../components/PageHeader";
import StatusChip from "../components/StatusChip";

const cards = [
  {
    key: "total",
    label: "Total Messages",
    icon: <AllInboxOutlinedIcon />,
    color: "#1971c2",
  },
  {
    key: "pending",
    label: "Pending Messages",
    icon: <ScheduleOutlinedIcon />,
    color: "#e67700",
  },
  {
    key: "sent",
    label: "Sent Messages",
    icon: <CheckCircleOutlineIcon />,
    color: "#087f5b",
  },
  {
    key: "failed",
    label: "Failed Messages",
    icon: <ErrorOutlineIcon />,
    color: "#c92a2a",
  },
];

export default function Dashboard() {
  const [stats, setStats] = useState({
    total: 0,
    pending: 0,
    sent: 0,
    failed: 0,
  });

  const [status, setStatus] = useState("Connecting");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  useEffect(() => {
    const loadDashboard = async () => {
      try {
        const [statsResponse, statusResponse] = await Promise.all([
          api.get("/messages/stats"),
          api.get("/whatsapp/status"),
        ]);

        console.log("Stats Response:", statsResponse.data);
        console.log("Status Response:", statusResponse.data);

        const statsData = statsResponse?.data?.data || {
          total: 0,
          pending: 0,
          sent: 0,
          failed: 0,
        };

        const whatsappData = statusResponse?.data?.data || {
          status: "Disconnected",
        };

        setStats(statsData);
        setStatus(whatsappData.status || "Disconnected");
        setLoadError("");
      } catch (error) {
        console.error("Dashboard Error:", error);
        setLoadError(errorMessage(error));
      } finally {
        setLoading(false);
      }
    };

    loadDashboard();

    const interval = setInterval(() => {
      loadDashboard();
    }, 10000);

    return () => clearInterval(interval);
  }, []);

  return (
    <>
      <PageHeader
        title="Dashboard"
        subtitle="A live overview of scheduled WhatsApp messages."
      />

      {loadError && (
        <Alert severity="error" sx={{ mb: 3 }}>
          {loadError}
        </Alert>
      )}

      {loading ? (
        <CircularProgress />
      ) : (
        <>
          <Grid container spacing={3}>
            {cards.map((card) => (
              <Grid item xs={12} sm={6} lg={3} key={card.key}>
                <Card>
                  <CardContent
                    sx={{
                      display: "flex",
                      alignItems: "center",
                      gap: 2,
                    }}
                  >
                    <Box
                      sx={{
                        width: 56,
                        height: 56,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        borderRadius: 2,
                        backgroundColor: `${card.color}20`,
                        color: card.color,
                      }}
                    >
                      {card.icon}
                    </Box>

                    <Box>
                      <Typography variant="h4">
                        {stats?.[card.key] ?? 0}
                      </Typography>

                      <Typography
                        variant="body2"
                        color="text.secondary"
                      >
                        {card.label}
                      </Typography>
                    </Box>
                  </CardContent>
                </Card>
              </Grid>
            ))}
          </Grid>

          <Card sx={{ mt: 3 }}>
            <CardContent>
              <Typography
                variant="h6"
                sx={{ mb: 2 }}
              >
                WhatsApp Connection
              </Typography>

              <Box
                sx={{
                  display: "flex",
                  alignItems: "center",
                  gap: 2,
                }}
              >
                <StatusChip status={status || "Disconnected"} />

                <Typography color="text.secondary">
                  Status refreshes automatically every 10 seconds.
                </Typography>
              </Box>
            </CardContent>
          </Card>
        </>
      )}
    </>
  );
}