import { useCallback, useEffect, useState } from "react";
import {
  Alert, Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, FormControl,
  IconButton, InputLabel, MenuItem, Paper, Select, Snackbar, Stack, Table, TableBody,
  TableCell, TableContainer, TableHead, TableRow, TextField, Tooltip, Typography,
} from "@mui/material";
import RefreshIcon from "@mui/icons-material/Refresh";
import EditOutlinedIcon from "@mui/icons-material/EditOutlined";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import api, { errorMessage } from "../api";
import PageHeader from "../components/PageHeader";
import StatusChip from "../components/StatusChip";

const toLocalInput = (iso) => {
  const date = new Date(iso);
  const offset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
};

export default function ScheduledMessages() {
  const [messages, setMessages] = useState([]);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [editing, setEditing] = useState(null);
  const [notice, setNotice] = useState({ open: false, severity: "success", message: "" });

  const notify = (severity, message) => setNotice({ open: true, severity, message });
  const load = useCallback(async () => {
    try {
      const response = await api.get("/messages/scheduled", { params: { search: search || undefined, status: status || undefined } });
      setMessages(response.data.data);
    } catch (error) {
      notify("error", errorMessage(error));
    }
  }, [search, status]);

  useEffect(() => {
    const timer = setTimeout(load, 250);
    return () => clearTimeout(timer);
  }, [load]);

  const remove = async (id) => {
    if (!window.confirm("Delete this scheduled message?")) return;
    try {
      await api.delete(`/messages/${id}`);
      notify("success", "Scheduled message deleted");
      load();
    } catch (error) {
      notify("error", errorMessage(error));
    }
  };

  const saveEdit = async () => {
    try {
      await api.put(`/messages/${editing.Id}`, {
        phone: editing.Phone,
        message: editing.Message,
        scheduleTime: new Date(editing.ScheduleTime).toISOString(),
        repeatType: editing.RepeatType,
      });
      setEditing(null);
      notify("success", "Scheduled message updated");
      load();
    } catch (error) {
      notify("error", errorMessage(error));
    }
  };

  return (
    <>
      <PageHeader title="Scheduled Messages" subtitle="Search, review, and manage every scheduled message." actions={
        <Button variant="outlined" startIcon={<RefreshIcon />} onClick={load}>Refresh</Button>
      } />
      <Stack direction={{ xs: "column", sm: "row" }} spacing={2} sx={{ mb: 2.5 }}>
        <TextField size="small" label="Search phone or message" value={search} onChange={(e) => setSearch(e.target.value)} sx={{ minWidth: { sm: 280 } }} />
        <FormControl size="small" sx={{ minWidth: 180 }}>
          <InputLabel>Status</InputLabel>
          <Select value={status} label="Status" onChange={(e) => setStatus(e.target.value)}>
            <MenuItem value="">All statuses</MenuItem>
            {["Pending", "Processing", "Sent", "Failed"].map((value) => <MenuItem key={value} value={value}>{value}</MenuItem>)}
          </Select>
        </FormControl>
      </Stack>
      <TableContainer component={Paper} variant="outlined">
        <Table sx={{ minWidth: 920 }}>
          <TableHead sx={{ bgcolor: "#f4f7f6" }}>
            <TableRow>
              {["ID", "Phone", "Message", "Schedule Time", "Repeat Type", "Status", "Actions"].map((heading) => <TableCell key={heading} sx={{ fontWeight: 700 }}>{heading}</TableCell>)}
            </TableRow>
          </TableHead>
          <TableBody>
            {messages.map((row) => (
              <TableRow key={row.Id} hover>
                <TableCell>{row.Id}</TableCell>
                <TableCell sx={{ whiteSpace: "nowrap" }}>{row.Phone}</TableCell>
                <TableCell sx={{ maxWidth: 320 }}><Typography variant="body2" noWrap title={row.Message}>{row.Message}</Typography></TableCell>
                <TableCell sx={{ whiteSpace: "nowrap" }}>{new Date(row.ScheduleTime).toLocaleString()}</TableCell>
                <TableCell>{row.RepeatType}</TableCell>
                <TableCell><StatusChip status={row.Status} /></TableCell>
                <TableCell sx={{ whiteSpace: "nowrap" }}>
                  <Tooltip title="Edit"><span><IconButton size="small" disabled={row.Status === "Processing"} onClick={() => setEditing({ ...row, ScheduleTime: toLocalInput(row.ScheduleTime) })}><EditOutlinedIcon fontSize="small" /></IconButton></span></Tooltip>
                  <Tooltip title="Delete"><span><IconButton size="small" color="error" disabled={row.Status === "Processing"} onClick={() => remove(row.Id)}><DeleteOutlineIcon fontSize="small" /></IconButton></span></Tooltip>
                </TableCell>
              </TableRow>
            ))}
            {!messages.length && <TableRow><TableCell colSpan={7} align="center" sx={{ py: 7, color: "text.secondary" }}>No scheduled messages found.</TableCell></TableRow>}
          </TableBody>
        </Table>
      </TableContainer>

      <Dialog open={Boolean(editing)} onClose={() => setEditing(null)} fullWidth maxWidth="sm">
        <DialogTitle>Edit Scheduled Message</DialogTitle>
        {editing && <DialogContent><Stack spacing={2.25} sx={{ pt: 1 }}>
          <TextField label="Phone Number" value={editing.Phone} onChange={(e) => setEditing({ ...editing, Phone: e.target.value })} />
          <TextField label="Message" multiline minRows={4} inputProps={{ maxLength: 1000 }} value={editing.Message} onChange={(e) => setEditing({ ...editing, Message: e.target.value })} />
          <TextField label="Schedule Date & Time" type="datetime-local" InputLabelProps={{ shrink: true }} value={editing.ScheduleTime} onChange={(e) => setEditing({ ...editing, ScheduleTime: e.target.value })} />
          <FormControl><InputLabel>Repeat Type</InputLabel><Select label="Repeat Type" value={editing.RepeatType} onChange={(e) => setEditing({ ...editing, RepeatType: e.target.value })}>
            {["None", "Daily", "Weekly", "Monthly"].map((value) => <MenuItem key={value} value={value}>{value}</MenuItem>)}
          </Select></FormControl>
        </Stack></DialogContent>}
        <DialogActions><Button onClick={() => setEditing(null)}>Cancel</Button><Button variant="contained" onClick={saveEdit}>Save Changes</Button></DialogActions>
      </Dialog>
      <Snackbar open={notice.open} autoHideDuration={5000} onClose={() => setNotice((n) => ({ ...n, open: false }))}>
        <Alert severity={notice.severity} variant="filled" onClose={() => setNotice((n) => ({ ...n, open: false }))}>{notice.message}</Alert>
      </Snackbar>
    </>
  );
}
