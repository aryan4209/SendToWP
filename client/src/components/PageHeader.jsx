import { Box, Typography } from "@mui/material";

export default function PageHeader({ title, subtitle, actions }) {
  return (
    <Box sx={{ display: "flex", alignItems: { xs: "flex-start", sm: "center" }, justifyContent: "space-between", gap: 2, mb: 3, flexDirection: { xs: "column", sm: "row" } }}>
      <Box>
        <Typography variant="h4" sx={{ fontSize: { xs: 25, sm: 30 } }}>{title}</Typography>
        {subtitle && <Typography color="text.secondary" sx={{ mt: 0.5 }}>{subtitle}</Typography>}
      </Box>
      {actions}
    </Box>
  );
}
