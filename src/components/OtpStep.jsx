import React, { useState } from "react";
import { Mail, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { toast } from "@/components/ui/use-toast";
import AuthLayout from "@/components/AuthLayout";

/**
 * "Check your email" step with a 6-digit code, used after sign up and for
 * email-code sign in. Both callbacks resolve to an error message, or null on success.
 *
 * @param {Object} props
 * @param {string} props.email
 * @param {string} props.title
 * @param {(code: string) => Promise<string | null>} props.onVerify
 * @param {() => Promise<string | null>} props.onResend
 * @param {React.ReactNode} [props.footer]
 */
export default function OtpStep({ email, title, onVerify, onResend, footer }) {
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleVerify = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    const message = await onVerify(code);
    // On success the new session triggers a redirect, so only handle failure here.
    if (message) {
      setError(message);
      setLoading(false);
    }
  };

  const handleResend = async () => {
    setError("");
    const message = await onResend();
    if (message) {
      setError(message);
    } else {
      toast({ title: "Code sent", description: "Check your email for the new code." });
    }
  };

  return (
    <AuthLayout
      icon={Mail}
      title={title}
      subtitle={`We sent a 6-digit code to ${email}. You can also click the link in that email.`}
      footer={footer}
    >
      {error && (
        <div role="alert" className="mb-4 p-3 rounded-lg bg-destructive/10 text-destructive text-sm">
          {error}
        </div>
      )}
      <form onSubmit={handleVerify}>
        <div className="flex justify-center mb-6">
          <InputOTP
            maxLength={6}
            value={code}
            onChange={setCode}
            autoFocus
            autoComplete="one-time-code"
            aria-label="6-digit code"
          >
            <InputOTPGroup>
              {[0, 1, 2, 3, 4, 5].map((i) => (
                <InputOTPSlot key={i} index={i} />
              ))}
            </InputOTPGroup>
          </InputOTP>
        </div>
        <Button type="submit" className="w-full h-12 font-medium" disabled={loading || code.length < 6}>
          {loading ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Verifying...
            </>
          ) : (
            "Verify"
          )}
        </Button>
      </form>
      <p className="text-center text-sm text-muted-foreground mt-4">
        Didn't receive the code?{" "}
        <button type="button" onClick={handleResend} className="text-primary font-medium hover:underline">
          Resend
        </button>
      </p>
    </AuthLayout>
  );
}
