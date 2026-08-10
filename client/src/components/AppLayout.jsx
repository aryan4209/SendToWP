import { useState } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import {
  AppBar, Avatar, Box, Button, Divider, Drawer, IconButton, List, ListItemButton, ListItemIcon,
  ListItemText, Menu, MenuItem, Toolbar, Tooltip, Typography, useMediaQuery, useTheme,
} from "@mui/material";
import MenuIcon from "@mui/icons-material/Menu";
import DashboardOutlinedIcon from "@mui/icons-material/DashboardOutlined";
import ScheduleSendOutlinedIcon from "@mui/icons-material/ScheduleSendOutlined";
import ListAltOutlinedIcon from "@mui/icons-material/ListAltOutlined";
import SettingsOutlinedIcon from "@mui/icons-material/SettingsOutlined";
import LogoutOutlinedIcon from "@mui/icons-material/LogoutOutlined";
import WhatsAppIcon from "@mui/icons-material/WhatsApp";
import { useAuth } from "../context/AuthContext";

const drawerWidth = 248;
const items = [
  { label: "Dashboard", path: "/", icon: <DashboardOutlinedIcon /> },
  { label: "Schedule Message", path: "/schedule", icon: <ScheduleSendOutlinedIcon /> },
  { label: "Scheduled Messages", path: "/messages", icon: <ListAltOutlinedIcon /> },
  { label: "Settings", path: "/settings", icon: <SettingsOutlinedIcon /> },
];

const initials = (name = "") =>
  name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() || "")
    .join("") || "?";

export default function AppLayout() {
  const theme = useTheme();
  const desktop = useMediaQuery(theme.breakpoints.up("md"));
  const navigate = useNavigate();
  const { user, signOut } = useAuth();

  const [open, setOpen] = useState(false);
  const [menuAnchor, setMenuAnchor] = useState(null);

  const handleSignOut = () => {
    setMenuAnchor(null);
    signOut();
    navigate("/login", { replace: true });
  };

  const drawer = (
    <Box sx={{ height: "100%", bgcolor: "#075e54", color: "white", display: "flex", flexDirection: "column" }}>
      <Toolbar sx={{ gap: 1.25, px: 2.5 }}>
        <WhatsAppIcon />
        <Typography variant="h6">SendToWP</Typography>
      </Toolbar>

      <List sx={{ px: 1.25, pt: 1, flexGrow: 1 }}>
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

      <Divider sx={{ borderColor: "rgba(255,255,255,.15)" }} />
      <Box sx={{ p: 2 }}>
        <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, mb: 1.5, minWidth: 0 }}>
          <Avatar sx={{ bgcolor: "rgba(255,255,255,.2)", width: 36, height: 36, fontSize: 14 }}>
            {initials(user?.name)}
          </Avatar>
          <Box sx={{ minWidth: 0 }}>
            <Typography variant="body2" noWrap sx={{ fontWeight: 600 }}>{user?.name}</Typography>
            <Typography variant="caption" noWrap sx={{ display: "block", color: "rgba(255,255,255,.68)" }}>
              {user?.email}
            </Typography>
          </Box>
        </Box>
        <Button
          fullWidth
          size="small"
          startIcon={<LogoutOutlinedIcon />}
          onClick={handleSignOut}
          sx={{
            color: "rgba(255,255,255,.85)",
            justifyContent: "flex-start",
            "&:hover": { bgcolor: "rgba(255,255,255,.1)" },
          }}
        >
          Sign Out
        </Button>
      </Box>
    </Box>
  );

  return (
    <Box sx={{ display: "flex", minHeight: "100vh" }}>
      {!desktop && (
        <AppBar position="fixed" sx={{ bgcolor: "#075e54" }}>
          <Toolbar>
            <IconButton color="inherit" edge="start" onClick={() => setOpen(true)} aria-label="Open navigation">
              <MenuIcon />
            </IconButton>
            <Typography variant="h6" sx={{ ml: 1, flexGrow: 1 }}>SendToWP</Typography>

            <Tooltip title={user?.email || ""}>
              <IconButton onClick={(event) => setMenuAnchor(event.currentTarget)} aria-label="Account menu">
                <Avatar sx={{ bgcolor: "rgba(255,255,255,.2)", width: 32, height: 32, fontSize: 13 }}>
                  {initials(user?.name)}
                </Avatar>
              </IconButton>
            </Tooltip>
            <Menu anchorEl={menuAnchor} open={Boolean(menuAnchor)} onClose={() => setMenuAnchor(null)}>
              <MenuItem disabled sx={{ opacity: "1 !important" }}>
                <Box>
                  <Typography variant="body2" sx={{ fontWeight: 600 }}>{user?.name}</Typography>
                  <Typography variant="caption" color="text.secondary">{user?.email}</Typography>
                </Box>
              </MenuItem>
              <Divider />
              <MenuItem onClick={handleSignOut}>
                <ListItemIcon><LogoutOutlinedIcon fontSize="small" /></ListItemIcon>
                Sign Out
              </MenuItem>
            </Menu>
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
