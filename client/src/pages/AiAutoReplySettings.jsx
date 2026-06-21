import { useCallback, useEffect, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  CircularProgress,
  Divider,
  FormControlLabel,
  Grid,
  IconButton,
  Paper,
  Snackbar,
  Stack,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from "@mui/material";
import SaveOutlinedIcon from "@mui/icons-material/SaveOutlined";
import RefreshOutlinedIcon from "@mui/icons-material/RefreshOutlined";
import InfoOutlinedIcon from "@mui/icons-material/InfoOutlined";
import api, { errorMessage } from "../api";
import PageHeader from "../components/PageHeader";

export default function AiAutoReplySettings() {
  const [form, setForm] = useState({
    IsEnabled: 1,
    FixedReplyEnabled: 1,
    FixedReplyText: "",
    AIEnabled: 1,
    CooldownMinutes: 30,
    IgnoreGroups: 1,
    IgnoreCommunities: 1,
    BusinessHoursEnabled: 0,
    BusinessStartTime: "09:00",
    BusinessEndTime: "17:00",
  });

  const [loading, setLoading] = useState(true);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [history, setHistory] = useState([]);
  const [notice, setNotice] = useState({ open: false, severity: "success", message: "" });

  const notify = (severity, message) => setNotice({ open: true, severity, message });

  const fetchSettings = useCallback(async () => {
    try {
      const response = await api.get("/ai/settings");
      if (response.data.success && response.data.data) {
        setForm(response.data.data);
      }
    } catch (err) {
      notify("error", "Failed to load AI settings: " + errorMessage(err));
    }
  }, []);

  const fetchHistory = useCallback(async (quiet = false) => {
    if (!quiet) setHistoryLoading(true);
    try {
      const response = await api.get("/ai/history");
      if (response.data.success && response.data.data) {
        setHistory(response.data.data);
      }
    } catch (err) {
      if (!quiet) notify("error", "Failed to load reply history: " + errorMessage(err));
    } finally {
      if (!quiet) setHistoryLoading(false);
    }
  }, []);

  useEffect(() => {
    const init = async () => {
      setLoading(true);
      await Promise.all([fetchSettings(), fetchHistory(true)]);
      setLoading(false);
    };
    init();
  }, [fetchSettings, fetchHistory]);

  const handleChange = (field, value) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleSwitchChange = (field, e) => {
    handleChange(field, e.target.checked ? 1 : 0);
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const response = await api.put("/ai/settings", form);
      if (response.data.success) {
        setForm(response.data.data);
        notify("success", "AI settings saved successfully!");
      }
    } catch (err) {
      notify("error", "Failed to save settings: " + errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const formatTime = (isoString) => {
    if (!isoString) return "-";
    const date = new Date(isoString);
    return date.toLocaleString();
  };

  if (loading) {
    return (
      <Box sx={{ display: "flex", justifyContent: "center", alignItems: "center", minHeight: 400 }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <>
      <PageHeader
        title="AI Auto Reply Settings"
        subtitle="Configure the AI Assistant to automatically respond to incoming WhatsApp messages."
        actions={
          <Button
            variant="outlined"
            startIcon={<RefreshOutlinedIcon />}
            onClick={() => {
              fetchSettings();
              fetchHistory(false);
            }}
          >
            Refresh Data
          </Button>
        }
      />

      <Grid container spacing={3}>
        {/* Settings Configuration Column */}
        <Grid item xs={12} lg={6}>
          <Card>
            <CardContent sx={{ p: { xs: 2.5, sm: 4 } }}>
              <Typography variant="h6" sx={{ mb: 3 }}>
                Configuration
              </Typography>
              <Box component="form" onSubmit={handleSave}>
                <Stack spacing={3}>
                  <FormControlLabel
                    control={
                      <Switch
                        checked={form.IsEnabled === 1}
                        onChange={(e) => handleSwitchChange("IsEnabled", e)}
                        color="primary"
                      />
                    }
                    label={
                      <Box>
                        <Typography variant="body1" fontWeight="medium">
                          Enable Auto Reply
                        </Typography>
                        <Typography variant="body2" color="text.secondary">
                          Globally toggle the auto-reply assistant on or off.
                        </Typography>
                      </Box>
                    }
                  />

                  <Divider />

                  <FormControlLabel
                    control={
                      <Switch
                        checked={form.FixedReplyEnabled === 1}
                        onChange={(e) => handleSwitchChange("FixedReplyEnabled", e)}
                        color="primary"
                      />
                    }
                    label={
                      <Box>
                        <Typography variant="body1" fontWeight="medium">
                          Enable Fixed Welcome Message
                        </Typography>
                        <Typography variant="body2" color="text.secondary">
                          Send a welcome response immediately prior to generating the AI response.
                        </Typography>
                      </Box>
                    }
                  />

                  {form.FixedReplyEnabled === 1 && (
                    <TextField
                      label="Fixed Reply Message"
                      multiline
                      rows={3}
                      value={form.FixedReplyText || ""}
                      onChange={(e) => handleChange("FixedReplyText", e.target.value)}
                      required
                      fullWidth
                    />
                  )}

                  <Divider />

                  <FormControlLabel
                    control={
                      <Switch
                        checked={form.AIEnabled === 1}
                        onChange={(e) => handleSwitchChange("AIEnabled", e)}
                        color="primary"
                      />
                    }
                    label={
                      <Box>
                        <Typography variant="body1" fontWeight="medium">
                          Enable AI Smart Reply
                        </Typography>
                        <Typography variant="body2" color="text.secondary">
                          Generate contextual answers using Google Gemini AI.
                        </Typography>
                      </Box>
                    }
                  />

                  <TextField
                    label="Cooldown Period (Minutes)"
                    type="number"
                    value={form.CooldownMinutes}
                    onChange={(e) => handleChange("CooldownMinutes", parseInt(e.target.value) || 0)}
                    required
                    fullWidth
                    helperText="Time interval before another auto-reply can be sent to the same contact."
                    inputProps={{ min: 0 }}
                  />

                  <Divider />

                  <Typography variant="subtitle2" color="text.secondary">
                    Ignore Restrictions
                  </Typography>

                  <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
                    <FormControlLabel
                      control={
                        <Switch
                          checked={form.IgnoreGroups === 1}
                          onChange={(e) => handleSwitchChange("IgnoreGroups", e)}
                          disabled
                          color="primary"
                        />
                      }
                      label="Ignore Group Messages"
                    />
                    <FormControlLabel
                      control={
                        <Switch
                          checked={form.IgnoreCommunities === 1}
                          onChange={(e) => handleSwitchChange("IgnoreCommunities", e)}
                          disabled
                          color="primary"
                        />
                      }
                      label="Ignore Communities"
                    />
                  </Stack>

                  <Divider />

                  <FormControlLabel
                    control={
                      <Switch
                        checked={form.BusinessHoursEnabled === 1}
                        onChange={(e) => handleSwitchChange("BusinessHoursEnabled", e)}
                        color="primary"
                      />
                    }
                    label={
                      <Box>
                        <Typography variant="body1" fontWeight="medium">
                          Enable Business Hours
                        </Typography>
                        <Typography variant="body2" color="text.secondary">
                          Auto-reply only during specific business hours. Sends a generic offline message outside hours.
                        </Typography>
                      </Box>
                    }
                  />

                  {form.BusinessHoursEnabled === 1 && (
                    <Stack direction="row" spacing={2}>
                      <TextField
                        label="Start Time"
                        type="time"
                        value={form.BusinessStartTime}
                        onChange={(e) => handleChange("BusinessStartTime", e.target.value)}
                        required
                        fullWidth
                        InputLabelProps={{ shrink: true }}
                      />
                      <TextField
                        label="End Time"
                        type="time"
                        value={form.BusinessEndTime}
                        onChange={(e) => handleChange("BusinessEndTime", e.target.value)}
                        required
                        fullWidth
                        InputLabelProps={{ shrink: true }}
                      />
                    </Stack>
                  )}

                  <Box sx={{ pt: 1 }}>
                    <Button
                      type="submit"
                      variant="contained"
                      startIcon={<SaveOutlinedIcon />}
                      disabled={saving}
                      size="large"
                    >
                      {saving ? "Saving Settings..." : "Save Settings"}
                    </Button>
                  </Box>
                </Stack>
              </Box>
            </CardContent>
          </Card>
        </Grid>

        {/* Live Auto Reply History Logs Column */}
        <Grid item xs={12} lg={6}>
          <Card sx={{ height: "100%", display: "flex", flexDirection: "column" }}>
            <CardContent sx={{ p: { xs: 2.5, sm: 4 }, flexGrow: 1, display: "flex", flexDirection: "column" }}>
              <Box sx={{ display: "flex", justifyContent: "between", alignItems: "center", mb: 3 }}>
                <Typography variant="h6" sx={{ flexGrow: 1 }}>
                  Auto Reply History
                </Typography>
                <IconButton onClick={() => fetchHistory(false)} disabled={historyLoading} size="small">
                  <RefreshOutlinedIcon />
                </IconButton>
              </Box>

              {historyLoading && (
                <Box sx={{ display: "flex", justifyContent: "center", py: 4 }}>
                  <CircularProgress size={24} />
                </Box>
              )}

              {!historyLoading && history.length === 0 && (
                <Box sx={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", py: 8, flexGrow: 1, textAlign: "center" }}>
                  <InfoOutlinedIcon sx={{ fontSize: 40, color: "text.secondary", mb: 1 }} />
                  <Typography variant="body1" color="text.secondary">
                    No replies have been recorded yet.
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Auto-replies will appear here as they are processed.
                  </Typography>
                </Box>
              )}

              {!historyLoading && history.length > 0 && (
                <TableContainer component={Paper} variant="outlined" sx={{ flexGrow: 1, maxHeight: 600 }}>
                  <Table stickyHeader size="small">
                    <TableHead>
                      <TableRow>
                        <TableCell>Phone</TableCell>
                        <TableCell>Incoming Message</TableCell>
                        <TableCell>AI Response</TableCell>
                        <TableCell align="right">Time</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {history.map((row) => (
                        <TableRow key={row.Id} hover>
                          <TableCell sx={{ fontWeight: "medium", whiteSpace: "nowrap" }}>
                            {row.Phone}
                          </TableCell>
                          <TableCell sx={{ maxWidth: 150, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {row.IncomingMessage}
                          </TableCell>
                          <TableCell
                            sx={{
                              maxWidth: 200,
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              whiteSpace: "nowrap",
                              color: row.AIResponse.startsWith("[AI") || row.AIResponse.includes("currently unavailable")
                                ? "warning.main"
                                : "text.primary",
                            }}
                          >
                            {row.AIResponse}
                          </TableCell>
                          <TableCell align="right" sx={{ whiteSpace: "nowrap" }}>
                            {formatTime(row.CreatedOn)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              )}
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      <Snackbar open={notice.open} autoHideDuration={5000} onClose={() => setNotice((n) => ({ ...n, open: false }))}>
        <Alert severity={notice.severity} variant="filled" onClose={() => setNotice((n) => ({ ...n, open: false }))}>
          {notice.message}
        </Alert>
      </Snackbar>
    </>
  );
}
