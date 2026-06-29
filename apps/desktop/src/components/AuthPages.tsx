import { useState } from "react";
import axios from "axios";
import { Clock } from "lucide-react";
import ThemeToggle from "@/components/ThemeToggle";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { TOKEN_KEYS } from "@/utils/api";

const baseURL = import.meta.env.VITE_API_URL ?? "http://localhost:3001";

interface AuthPagesProps {
  onAuthSuccess: (token: string) => void;
}

export function AuthPages({ onAuthSuccess }: AuthPagesProps) {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!isLogin && password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setIsLoading(true);
    const url = isLogin
      ? `${baseURL}/auth/login`
      : `${baseURL}/auth/register`;

    try {
      const response = await axios.post(url, { email, password });
      const { accessToken, refreshToken } = response.data;
      localStorage.setItem(TOKEN_KEYS.access, accessToken);
      localStorage.setItem(TOKEN_KEYS.refresh, refreshToken);
      localStorage.setItem(TOKEN_KEYS.email, email);
      onAuthSuccess(accessToken);
    } catch (err: unknown) {
      const axiosErr = err as {
        response?: { data?: { error?: unknown } };
      };
      const apiError = axiosErr.response?.data?.error;
      setError(
        typeof apiError === "string"
          ? apiError
          : "An unexpected error occurred. Please check your connection.",
      );
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="fixed top-4 right-4">
        <ThemeToggle />
      </div>

      <div className="w-full max-w-md">
        <div className="space-y-6">
          <div className="text-center space-y-2">
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-lg bg-primary text-primary-foreground">
              <Clock className="w-6 h-6" />
            </div>
            <h1 className="text-3xl font-semibold text-foreground">Pulse</h1>
            <p className="text-muted-foreground">
              {isLogin
                ? "Welcome back. Let's track your productivity."
                : "Create an account to start tracking your time."}
            </p>
          </div>

          {error && (
            <p className="text-sm text-destructive text-center">{error}</p>
          )}

          <form className="space-y-4" onSubmit={handleSubmit}>
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                placeholder="you@example.com"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                placeholder="••••••••"
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>

            {!isLogin && (
              <div className="space-y-2">
                <Label htmlFor="confirm">Confirm Password</Label>
                <Input
                  id="confirm"
                  placeholder="••••••••"
                  type="password"
                  required
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                />
              </div>
            )}

            <Button
              className="w-full"
              size="lg"
              type="submit"
              disabled={isLoading}
            >
              {isLogin ? "Sign In" : "Create Account"}
            </Button>
          </form>

          <div className="text-center text-sm">
            <span className="text-muted-foreground">
              {isLogin ? "Don't have an account? " : "Already have an account? "}
            </span>
            <button
              type="button"
              onClick={() => {
                setIsLogin(!isLogin);
                setError(null);
              }}
              className="text-primary font-medium hover:underline"
            >
              {isLogin ? "Sign up" : "Sign in"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
