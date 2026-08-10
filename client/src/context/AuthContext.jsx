import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import api, { clearToken, getToken, setToken, setUnauthorizedHandler } from "../api";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const signOut = useCallback(() => {
    clearToken();
    setUser(null);
  }, []);

  useEffect(() => {
    setUnauthorizedHandler(signOut);
    return () => setUnauthorizedHandler(null);
  }, [signOut]);

  // Restore the session on load so a refresh does not sign the user out.
  useEffect(() => {
    let active = true;

    const restore = async () => {
      if (!getToken()) {
        if (active) setLoading(false);
        return;
      }
      try {
        const response = await api.get("/auth/me");
        if (active) setUser(response.data.data.user);
      } catch {
        clearToken();
      } finally {
        if (active) setLoading(false);
      }
    };

    restore();
    return () => {
      active = false;
    };
  }, []);

  const authenticate = useCallback(async (path, payload) => {
    const response = await api.post(path, payload);
    const { token, user: signedInUser } = response.data.data;
    setToken(token);
    setUser(signedInUser);
    return signedInUser;
  }, []);

  const value = useMemo(
    () => ({
      user,
      loading,
      signIn: (email, password) => authenticate("/auth/login", { email, password }),
      signUp: (name, email, password) => authenticate("/auth/register", { name, email, password }),
      signOut,
    }),
    [user, loading, authenticate, signOut]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used inside an AuthProvider");
  return context;
}
