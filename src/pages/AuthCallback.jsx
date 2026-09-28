import React from "react";
import { Link, Navigate, useLocation } from "react-router-dom";
import { AlertTriangle } from "lucide-react";
import { useAuth } from "@/lib/AuthContext";
import { safeReturnTo } from "@/lib/authReturnTo";
import AuthLayout from "@/components/AuthLayout";
import FullScreenSpinner from "@/components/FullScreenSpinner";

/**
 * Where Supabase sends the browser back after Google sign in, a magic link or an
 * email confirmation link. The Supabase client exchanges the ?code= for a session
 * on load; this page waits for that, then continues to ?returnTo=.
 */
export default function AuthCallback() {
  const { isAuthenticated, isLoadingAuth } = useAuth();
  const location = useLocation();

  const query = new URLSearchParams(location.search);
  const hash = new URLSearchParams(location.hash.slice(1));
  const providerError = query.get("error_description") || hash.get("error_description");

  if (isLoadingAuth) return <FullScreenSpinner />;
  if (isAuthenticated) return <Navigate to={safeReturnTo(location.search)} replace />;

  return (
    <AuthLayout
      icon={AlertTriangle}
      title="Couldn't sign you in"
      subtitle={providerError || "This link is invalid or has expired"}
      footer={
        <Link to="/login" className="text-primary font-medium hover:underline">
          Back to log in
        </Link>
      }
    >
      <p className="text-sm text-foreground text-center">
        Sign-in links work once, expire after an hour, and must be opened in the same browser
        you started from. Please try again.
      </p>
    </AuthLayout>
  );
}
