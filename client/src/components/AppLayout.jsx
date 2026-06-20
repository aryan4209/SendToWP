import { useState } from "react";
import { NavLink, Outlet } from "react-router-dom";
import {
  AppBar, Box, Drawer, IconButton, List, ListItemButton, ListItemIcon,
  ListItemText, Toolbar, Typography, useMediaQuery, useTheme,
} from "@mui/material";
import MenuIcon from "@mui/icons-material/Menu";
import DashboardOutlinedIcon from "@mui/icons-material/DashboardOutlined";
import ScheduleSendOutlinedIcon from "@mui/icons-material/ScheduleSendOutlined";
import ListAltOutlinedIcon from "@mui/icons-material/ListAltOutlined";
import SettingsOutlinedIcon from "@mui/icons-material/SettingsOutlined";
import WhatsAppIcon from "@mui/icons-material/WhatsApp";

const drawerWidth = 248;
const items = [
  { label: "Dashboard", path: "/", icon: <DashboardOutlinedIcon /> },
  { label: "Schedule Message", path: "/schedule", icon: <ScheduleSendOutlinedIcon /> },
  { label: "Scheduled Messages", path: "/messages", icon: <ListAltOutlinedIcon /> },
  { label: "Settings", path: "/settings", icon: <SettingsOutlinedIcon /> },
];

export default function AppLayout() {
  const theme = useTheme();
  const desktop = useMediaQuery(theme.breakpoints.up("md"));
  const [open, setOpen] = useState(false);

  const drawer = (
    <Box sx={{ height: "100%", bgcolor: "#075e54", color: "white" }}>
      <Toolbar sx={{ gap: 1.25, px: 2.5 }}>
        <WhatsAppIcon />
        <Typography variant="h6">SendToWP</Typography>
      </Toolbar>
      <List sx={{ px: 1.25, pt: 1 }}>
        {items.map((item) => (
          <ListItemButton
            key={item.path}
            component={NavLink}
            to={item.path}
            end={item.path === "/"}
            onClick={() => setOpen(false)}
            sx={{
              color: "rgba(255,255,255,.78)",
              mb: 0.5,
              "& .MuiListItemIcon-root": { color: "inherit", minWidth: 40 },
              "&.active": { bgcolor: "rgba(255,255,255,.15)", color: "white" },
              "&:hover": { bgcolor: "rgba(255,255,255,.1)" },
            }}
          >
            <ListItemIcon>{item.icon}</ListItemIcon>
            <ListItemText primary={item.label} />
          </ListItemButton>
        ))}
      </List>
    </Box>
  );

  return (
    <Box sx={{ display: "flex", minHeight: "100vh" }}>
      {!desktop && (
        <AppBar position="fixed" sx={{ bgcolor: "#075e54" }}>
          <Toolbar>
            <IconButton color="inherit" edge="start" onClick={() => setOpen(true)}><MenuIcon /></IconButton>
            <Typography variant="h6" sx={{ ml: 1 }}>SendToWP</Typography>
          </Toolbar>
        </AppBar>
      )}
      <Drawer
        variant={desktop ? "permanent" : "temporary"}
        open={desktop || open}
        onClose={() => setOpen(false)}
        ModalProps={{ keepMounted: true }}
        sx={{ width: desktop ? drawerWidth : 0, "& .MuiDrawer-paper": { width: drawerWidth, border: 0 } }}
      >
        {drawer}
      </Drawer>
      <Box component="main" sx={{ flexGrow: 1, minWidth: 0, p: { xs: 2, sm: 3, lg: 4 }, pt: { xs: 10, md: 4 } }}>
        <Box sx={{ maxWidth: 1320, mx: "auto" }}><Outlet /></Box>
      </Box>
    </Box>
  );
}
