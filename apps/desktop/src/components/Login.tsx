import React, { useState } from "react";
import axios from "axios";
import { LogIn, UserPlus, Timer, Lock, Mail, AlertCircle } from "lucide-react";

interface LoginProps {
  onSuccess: (token: string) => void;
}

export function Login({ onSuccess }: LoginProps) {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    const url = isLogin
      ? "http://localhost:3001/auth/login"
      : "http://localhost:3001/auth/register";

    try {
      const response = await axios.post(url, { email, password });
      const { accessToken, refreshToken } = response.data;

      localStorage.setItem("pulse-access-token", accessToken);
      localStorage.setItem("pulse-refresh-token", refreshToken);
      localStorage.setItem("pulse-user-email", email);

      onSuccess(accessToken);
    } catch (err: any) {
      console.error(err);
      setError(
        err.response?.data?.error ||
          err.response?.data?.error?.email?._errors?.[0] ||
          err.response?.data?.error?.password?._errors?.[0] ||
          "An unexpected error occurred. Please check your connection.",
      );
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col items-center justify-center p-6 font-sans relative overflow-hidden">
      {/* Background glowing blobs */}
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-purple-600/10 rounded-full blur-3xl" />
      <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-blue-600/10 rounded-full blur-3xl" />

      <div className="max-w-md w-full bg-slate-900/60 border border-slate-800/80 rounded-2xl p-8 shadow-2xl backdrop-blur-xl flex flex-col items-center relative z-10">
        <div className="p-4 bg-purple-600/15 rounded-2xl border border-purple-500/20 mb-4 animate-pulse">
          <Timer className="w-10 h-10 text-purple-400" />
        </div>

        <h1 className="text-3xl font-bold tracking-tight text-white mb-2">
          Pulse
        </h1>
        <p className="text-sm text-slate-400 mb-6 text-center">
          {isLogin
            ? "Sign in to sync your productivity sessions"
            : "Create an account to track your focus"}
        </p>

        {error && (
          <div className="w-full p-4 mb-4 rounded-xl bg-red-950/40 border border-red-500/30 flex items-start gap-3 text-red-200 text-sm">
            <AlertCircle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="w-full space-y-4">
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
              Email Address
            </label>
            <div className="relative">
              <Mail className="absolute left-3.5 top-3.5 w-5 h-5 text-slate-500" />
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="w-full pl-11 pr-4 py-3 bg-slate-950 border border-slate-800 rounded-xl text-slate-100 placeholder-slate-600 focus:outline-none focus:border-purple-500 transition duration-200"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
              Password
            </label>
            <div className="relative">
              <Lock className="absolute left-3.5 top-3.5 w-5 h-5 text-slate-500" />
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full pl-11 pr-4 py-3 bg-slate-950 border border-slate-800 rounded-xl text-slate-100 placeholder-slate-600 focus:outline-none focus:border-purple-500 transition duration-200"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="w-full mt-2 py-3 px-4 rounded-xl bg-purple-600 hover:bg-purple-500 active:bg-purple-700 text-white font-medium transition duration-200 shadow-lg shadow-purple-600/20 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {isLoading ? (
              <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : isLogin ? (
              <>
                <LogIn className="w-5 h-5" /> Sign In
              </>
            ) : (
              <>
                <UserPlus className="w-5 h-5" /> Create Account
              </>
            )}
          </button>
        </form>

        <div className="mt-6 text-center text-sm">
          <span className="text-slate-500">
            {isLogin ? "New to Pulse?" : "Already have an account?"}{" "}
          </span>
          <button
            onClick={() => {
              setIsLogin(!isLogin);
              setError(null);
            }}
            className="text-purple-400 hover:text-purple-300 font-medium transition duration-200"
          >
            {isLogin ? "Sign Up" : "Sign In"}
          </button>
        </div>
      </div>
    </div>
  );
}
