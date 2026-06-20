import { useState } from "react";
import {
  Alert, Box, Button, Card, CardContent, FormControl, InputLabel, MenuItem,
  Select, Snackbar, Stack, TextField,
} from "@mui/material";
import SendIcon from "@mui/icons-material/Send";
import ScheduleSendIcon from "@mui/icons-material/ScheduleSend";
import api, { errorMessage } from "../api";
import PageHeader from "../components/PageHeader";

const initialForm = { phone: "", message: "", scheduleTime: "", repeatType: "None" };

export default function ScheduleMessage() {
  const [form, setForm] = useState(initialForm);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState({ open: false, severity: "success", message: "" });

  const notify = (severity, message) => setNotice({ open: true, severity, message });
  const update = (event) => setForm((current) => ({ ...current, [event.target.name]: event.target.value }));
  const validate = (forSchedule) => {
    if (!form.phone.trim()) return "Phone number is required";
    if (!form.message.trim()) return "Message is required";
    if (form.message.length > 1000) return "Message cannot exceed 1000 characters";
    if (forSchedule && (!form.scheduleTime || new Date(form.scheduleTime) <= new Date())) return "Schedule time must be in the future";
    return "";
  };

  const submit = async (sendNow) => {
    const problem = validate(!sendNow);
    if (problem) return notify("error", problem);
    setBusy(true);
    try {
      if (sendNow) {
        await api.post("/messages/send", { phone: form.phone, message: form.message });
        notify("success", "Message sent successfully");
      } else {
        await api.post("/messages/schedule", { ...form, scheduleTime: new Date(form.scheduleTime).toISOString() });
        notify("success", "Message scheduled successfully");
        setForm(initialForm);
      }
    } catch (error) {
      notify("error", errorMessage(error));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <PageHeader title="Schedule Message" subtitle="Send now or choose exactly when it should go out." />
      <Card sx={{ maxWidth: 760 }}>
        <CardContent sx={{ p: { xs: 2.5, sm: 4 }, "&:last-child": { pb: { xs: 2.5, sm: 4 } } }}>
          <Stack spacing={2.5}>
            <TextField name="phone" label="Phone Number" value={form.phone} onChange={update} required helperText="10-digit Indian numbers are automatically prefixed with 91." />
            <TextField name="message" label="Message" value={form.message} onChange={update} required multiline minRows={5} inputProps={{ maxLength: 1000 }} helperText={`${form.message.length}/1000`} />
            <TextField name="scheduleTime" label="Schedule Date & Time" type="datetime-local" value={form.scheduleTime} onChange={update} required InputLabelProps={{ shrink: true }} inputProps={{ min: new Date(Date.now() + 60000).toISOString().slice(0, 16) }} />
            <FormControl>
              <InputLabel>Repeat Type</InputLabel>
              <Select name="repeatType" value={form.repeatType} label="Repeat Type" onChange={update}>
                {["None", "Daily", "Weekly", "Monthly"].map((value) => <MenuItem key={value} value={value}>{value}</MenuItem>)}
              </Select>
            </FormControl>
            <Box sx={{ display: "flex", gap: 1.5, flexWrap: "wrap", pt: 1 }}>
              <Button variant="contained" startIcon={<ScheduleSendIcon />} disabled={busy} onClick={() => submit(false)}>Schedule Message</Button>
              <Button variant="outlined" startIcon={<SendIcon />} disabled={busy} onClick={() => submit(true)}>Send Now</Button>
            </Box>
          </Stack>
        </CardContent>
      </Card>
      <Snackbar open={notice.open} autoHideDuration={5000} onClose={() => setNotice((n) => ({ ...n, open: false }))}>
        <Alert severity={notice.severity} variant="filled" onClose={() => setNotice((n) => ({ ...n, open: false }))}>{notice.message}</Alert>
      </Snackbar>
    </>
  );
}
