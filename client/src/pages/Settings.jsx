import { useCallback, useEffect, useState } from "react";
import { Alert, Box, Button, Card, CardContent, CircularProgress, Snackbar, Stack, Typography } from "@mui/material";
import RefreshIcon from "@mui/icons-material/Refresh";
import RestartAltIcon from "@mui/icons-material/RestartAlt";
import api, { errorMessage } from "../api";
import PageHeader from "../components/PageHeader";
import StatusChip from "../components/StatusChip";

export default function Settings() {
  const [status, setStatus] = useState("Connecting");
  const [lastError, setLastError] = useState(null);
  const [qr, setQr] = useState(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState({ open: false, severity: "success", message: "" });
  const notify = (severity, message) => setNotice({ open: true, severity, message });

  const load = useCallback(async (quiet = false) => {
    try {
      const response = await api.get("/whatsapp/status");
      setStatus(response.data.data.status);
      setLastError(response.data.data.lastError);
      if (response.data.data.hasQr) {
        const qrResponse = await api.get("/whatsapp/qr");
        setQr(qrResponse.data.data.qr);
      } else {
        setQr(null);
      }
      if (!quiet) notify("success", "WhatsApp status refreshed");
    } catch (error) {
      if (!quiet) notify("error", errorMessage(error));
    }
  }, []);

  useEffect(() => {
    load(true);
    const timer = setInterval(() => load(true), 5000);
    return () => clearInterval(timer);
  }, [load]);

  const reconnect = async () => {
    setBusy(true);
    try {
      await api.post("/whatsapp/reconnect");
      notify("success", "WhatsApp reconnect started");
      setTimeout(() => load(true), 1000);
    } catch (error) {
      notify("error", errorMessage(error));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <PageHeader title="Settings" subtitle="Manage the WhatsApp connection used to send messages." />
      <Card sx={{ maxWidth: 700 }}>
        <CardContent sx={{ p: { xs: 2.5, sm: 4 }, "&:last-child": { pb: { xs: 2.5, sm: 4 } } }}>
          <Stack spacing={3} alignItems="flex-start">
            <Box>
              <Typography variant="h6" sx={{ mb: 1.5 }}>WhatsApp Status</Typography>
              <StatusChip status={status} />
            </Box>
            {lastError && <Alert severity="warning">Last connection error: {lastError}</Alert>}
            {status === "Connecting" && <CircularProgress size={28} />}
            {qr && <Box>
              <Typography color="text.secondary" sx={{ mb: 2 }}>Scan this QR code with WhatsApp to connect.</Typography>
              <Box component="img" src={qr} alt="WhatsApp pairing QR code" sx={{ width: "min(100%, 320px)", display: "block", border: "1px solid #e2e7e5" }} />
            </Box>}
            <Stack direction="row" spacing={1.5} flexWrap="wrap" useFlexGap>
              <Button variant="outlined" startIcon={<RefreshIcon />} onClick={() => load(false)}>Refresh Status</Button>
              <Button variant="contained" startIcon={<RestartAltIcon />} disabled={busy} onClick={reconnect}>
                {status === "Connected" ? "Reconnect WhatsApp" : "Reset & Pair WhatsApp"}
              </Button>
            </Stack>
          </Stack>
        </CardContent>
      </Card>
      <Snackbar open={notice.open} autoHideDuration={5000} onClose={() => setNotice((n) => ({ ...n, open: false }))}>
        <Alert severity={notice.severity} variant="filled" onClose={() => setNotice((n) => ({ ...n, open: false }))}>{notice.message}</Alert>
      </Snackbar>
    </>
  );
}
