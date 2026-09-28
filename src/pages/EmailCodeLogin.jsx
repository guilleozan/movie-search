import React, { useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { KeyRound, Mail, ArrowLeft, Loader2 } from "lucide-react";
import AuthLayout from "@/components/AuthLayout";
import OtpStep from "@/components/OtpStep";
import { authCallbackUrl, safeReturnTo, withReturnTo } from "@/lib/authReturnTo";

/** Passwordless sign in: Supabase emails a 6-digit code and a magic link. */
export default function EmailCodeLogin() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const returnTo = safeReturnTo();

  // Creates the account on first use, so this also works as passwordless sign up.
  const sendCode = async () => {
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: authCallbackUrl(returnTo) },
    });
    return error ? error.message || "Could not send the code" : null;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    const message = await sendCode();
    setLoading(false);
    if (message) setError(message);
    else setSent(true);
  };

  const backToLogin = (
    <Link to={withReturnTo("/login", returnTo)} className="text-primary font-medium hover:underline">
      <ArrowLeft className="w-3 h-3 inline mr-1" aria-hidden="true" />Back to log in
    </Link>
  );

  if (sent) {
    return (
      <OtpStep
        email={email}
        title="Check your email"
        footer={backToLogin}
        onVerify={async (token) => {
          const { error } = await supabase.auth.verifyOtp({ email, token, type: "email" });
          return error ? error.message || "Invalid code" : null;
        }}
        onResend={sendCode}
      />
    );
  }

  return (
    <AuthLayout
      icon={KeyRound}
      title="Sign in with a code"
      subtitle="We'll email you a one-time code"
      footer={backToLogin}
    >
      {error && (
        <div role="alert" className="mb-4 p-3 rounded-lg bg-destructive/10 text-destructive text-sm">
          {error}
        </div>
      )}
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="email">Email address</Label>
          <div className="relative">
            <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" aria-hidden="true" />
            <Input
              id="email"
              type="email"
              autoComplete="email"
              autoFocus
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="pl-10 h-12"
              required
            />
          </div>
        </div>
        <Button type="submit" className="w-full h-12 font-medium" disabled={loading}>
          {loading ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Sending...
            </>
          ) : (
            "Send code"
          )}
        </Button>
      </form>
    </AuthLayout>
  );
}
