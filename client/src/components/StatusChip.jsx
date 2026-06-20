import { Chip } from "@mui/material";

const colors = {
  Connected: "success",
  Sent: "success",
  Pending: "warning",
  "QR Available": "info",
  Connecting: "info",
  Processing: "info",
  Failed: "error",
  Disconnected: "default",
  "Logged Out": "error",
};

export default function StatusChip({ status }) {
  return <Chip size="small" label={status} color={colors[status] || "default"} variant={status === "Disconnected" ? "outlined" : "filled"} />;
}
