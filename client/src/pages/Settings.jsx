import { useCallback, useEffect, useState } from "react";
import { Alert, Box, Button, Card, CardContent, CircularProgress, Snackbar, Stack, Typography } from "@mui/material";
import RefreshIcon from "@mui/icons-material/Refresh";
import RestartAltIcon from "@mui/icons-material/RestartAlt";
import LinkOffIcon from "@mui/icons-material/LinkOff";
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
    // Poll quickly while pairing (the QR rotates), then back off once connected.
    const intervalMs = status === "Connected" ? 30000 : 5000;
    const timer = setInterval(() => {
      if (!document.hidden) load(true);
    }, intervalMs);
    return () => clearInterval(timer);
  }, [load, status]);

  // Reopens the socket using the session already stored. Safe to run any time.
  const reconnect = async () => {
    setBusy(true);
    try {
      await api.post("/whatsapp/reconnect", { reset: false });
      notify("success", "Reconnecting to WhatsApp");
      setTimeout(() => load(true), 1500);
    } catch (error) {
      notify("error", errorMessage(error));
    } finally {
      setBusy(false);
    }
  };

  // Destructive: throws the linked session away and starts pairing from zero.
  const resetPairing = async () => {
    if (!window.confirm("This deletes the saved WhatsApp session and you will have to scan a new QR code. Continue?")) {
      return;
    }
    setBusy(true);
    try {
      await api.post("/whatsapp/reconnect", { reset: true });
      notify("success", "Session cleared. Scan the new QR code below.");
      setTimeout(() => load(true), 1500);
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
                Reconnect
              </Button>
              <Button variant="outlined" color="error" startIcon={<LinkOffIcon />} disabled={busy} onClick={resetPairing}>
                Unlink &amp; Pair Again
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
