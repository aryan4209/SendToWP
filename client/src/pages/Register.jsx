import { useState } from "react";
import { Link as RouterLink, Navigate, useNavigate } from "react-router-dom";
import {
  Alert, Button, IconButton, InputAdornment, Link, Stack, TextField, Typography,
} from "@mui/material";
import PersonAddAltOutlinedIcon from "@mui/icons-material/PersonAddAltOutlined";
import VisibilityOutlinedIcon from "@mui/icons-material/VisibilityOutlined";
import VisibilityOffOutlinedIcon from "@mui/icons-material/VisibilityOffOutlined";
import { errorMessage } from "../api";
import AuthCard from "../components/AuthCard";
import { useAuth } from "../context/AuthContext";

const initialForm = { name: "", email: "", password: "", confirmPassword: "" };

const validate = ({ name, email, password, confirmPassword }) => {
  if (name.trim().length < 2) return "Enter your name (at least 2 characters)";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return "Enter a valid email address";
  if (password.length < 8) return "Password must be at least 8 characters";
  if (password !== confirmPassword) return "Passwords do not match";
  return "";
};

export default function Register() {
  const { user, signUp } = useAuth();
  const navigate = useNavigate();

  const [form, setForm] = useState(initialForm);
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState("");

  const update = (event) => setForm((current) => ({ ...current, [event.target.name]: event.target.value }));

  if (user) return <Navigate to="/" replace />;

  const submit = async (event) => {
    event.preventDefault();
    const issue = validate(form);
    if (issue) return setProblem(issue);

    setBusy(true);
    setProblem("");
    try {
      await signUp(form.name.trim(), form.email.trim(), form.password);
      navigate("/", { replace: true });
    } catch (error) {
      setProblem(errorMessage(error));
    } finally {
      setBusy(false);
    }
  };

  const passwordAdornment = (
    <InputAdornment position="end">
      <IconButton
        onClick={() => setShowPassword((visible) => !visible)}
        edge="end"
        aria-label={showPassword ? "Hide password" : "Show password"}
      >
        {showPassword ? <VisibilityOffOutlinedIcon /> : <VisibilityOutlinedIcon />}
      </IconButton>
    </InputAdornment>
  );

  return (
    <AuthCard title="Create your account" subtitle="Schedule WhatsApp messages from one place.">
      <form onSubmit={submit} noValidate>
        <Stack spacing={2.25}>
          {problem && <Alert severity="error">{problem}</Alert>}

          <TextField
            name="name"
            label="Full Name"
            value={form.name}
            onChange={update}
            autoComplete="name"
            autoFocus
            fullWidth
          />

          <TextField
            name="email"
            type="email"
            label="Email"
            value={form.email}
            onChange={update}
            autoComplete="email"
            fullWidth
          />

          <TextField
            name="password"
            type={showPassword ? "text" : "password"}
            label="Password"
            value={form.password}
            onChange={update}
            autoComplete="new-password"
            helperText="At least 8 characters"
            fullWidth
            InputProps={{ endAdornment: passwordAdornment }}
          />

          <TextField
            name="confirmPassword"
            type={showPassword ? "text" : "password"}
            label="Confirm Password"
            value={form.confirmPassword}
            onChange={update}
            autoComplete="new-password"
            error={Boolean(form.confirmPassword) && form.password !== form.confirmPassword}
            helperText={
              form.confirmPassword && form.password !== form.confirmPassword ? "Passwords do not match" : " "
            }
            fullWidth
          />

          <Button
            type="submit"
            variant="contained"
            size="large"
            disabled={busy}
            startIcon={<PersonAddAltOutlinedIcon />}
          >
            {busy ? "Creating account..." : "Create Account"}
          </Button>

          <Typography variant="body2" align="center" color="text.secondary">
            Already have an account?{" "}
            <Link component={RouterLink} to="/login" underline="hover" fontWeight={600}>
              Sign in
            </Link>
          </Typography>
        </Stack>
      </form>
    </AuthCard>
  );
}
