import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { CssBaseline, ThemeProvider, createTheme } from "@mui/material";
import App from "./App";

const theme = createTheme({
  palette: {
    primary: { main: "#087f5b", dark: "#075e54" },
    secondary: { main: "#1971c2" },
    background: { default: "#f5f7f8", paper: "#ffffff" },
  },
  shape: { borderRadius: 8 },
  typography: {
    fontFamily: '"Inter", "Segoe UI", Arial, sans-serif',
    h4: { fontWeight: 700, letterSpacing: 0 },
    h6: { fontWeight: 700, letterSpacing: 0 },
    button: { textTransform: "none", fontWeight: 600, letterSpacing: 0 },
  },
  components: {
    MuiCard: { styleOverrides: { root: { border: "1px solid #e7ebed", boxShadow: "none" } } },
    MuiButton: { defaultProps: { disableElevation: true } },
  },
});

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </ThemeProvider>
  </React.StrictMode>
);
