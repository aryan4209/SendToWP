import { useEffect, useState } from "react";
import { Link as RouterLink, Navigate, useLocation, useNavigate } from "react-router-dom";
import {
  Alert, Button, Divider, IconButton, InputAdornment, Link, Stack, TextField, Typography,
} from "@mui/material";
import LoginIcon from "@mui/icons-material/Login";
import VisibilityOutlinedIcon from "@mui/icons-material/VisibilityOutlined";
import VisibilityOffOutlinedIcon from "@mui/icons-material/VisibilityOffOutlined";
import api, { errorMessage } from "../api";
import AuthCard from "../components/AuthCard";
import { useAuth } from "../context/AuthContext";

export default function Login() {
  const { user, signIn } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [form, setForm] = useState({ email: "", password: "" });
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState("");
  const [registrationOpen, setRegistrationOpen] = useState(true);

  const update = (event) => setForm((current) => ({ ...current, [event.target.name]: event.target.value }));

  useEffect(() => {
    api
      .get("/auth/config")
      .then((response) => setRegistrationOpen(response.data.data.registrationOpen))
      .catch(() => setRegistrationOpen(true));
  }, []);

  if (user) return <Navigate to={location.state?.from?.pathname || "/"} replace />;

  const submit = async (event) => {
    event.preventDefault();
    if (!form.email.trim() || !form.password) return setProblem("Enter your email and password");

    setBusy(true);
    setProblem("");
    try {
      await signIn(form.email.trim(), form.password);
      navigate(location.state?.from?.pathname || "/", { replace: true });
    } catch (error) {
      setProblem(errorMessage(error));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthCard title="Welcome back" subtitle="Sign in to manage your scheduled WhatsApp messages.">
      <form onSubmit={submit} noValidate>
        <Stack spacing={2.25}>
          {problem && <Alert severity="error">{problem}</Alert>}

          <TextField
            name="email"
            type="email"
            label="Email"
            value={form.email}
            onChange={update}
            autoComplete="email"
            autoFocus
            fullWidth
          />

          <TextField
            name="password"
            type={showPassword ? "text" : "password"}
            label="Password"
            value={form.password}
            onChange={update}
            autoComplete="current-password"
            fullWidth
            InputProps={{
              endAdornment: (
                <InputAdornment position="end">
                  <IconButton
                    onClick={() => setShowPassword((visible) => !visible)}
                    edge="end"
                    aria-label={showPassword ? "Hide password" : "Show password"}
                  >
                    {showPassword ? <VisibilityOffOutlinedIcon /> : <VisibilityOutlinedIcon />}
                  </IconButton>
                </InputAdornment>
              ),
            }}
          />

          <Button type="submit" variant="contained" size="large" disabled={busy} startIcon={<LoginIcon />}>
            {busy ? "Signing in..." : "Sign In"}
          </Button>

          {registrationOpen && (
            <>
              <Divider sx={{ pt: 0.5 }}>
                <Typography variant="caption" color="text.secondary">NEW HERE?</Typography>
              </Divider>
              <Typography variant="body2" align="center" color="text.secondary">
                <Link component={RouterLink} to="/register" underline="hover" fontWeight={600}>
                  Create an account
                </Link>{" "}
                to get started.
              </Typography>
            </>
          )}
        </Stack>
      </form>
    </AuthCard>
  );
}
