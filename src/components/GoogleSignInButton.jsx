import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import GoogleIcon from "@/components/GoogleIcon";
import { supabase } from "@/lib/supabase";
import { authCallbackUrl } from "@/lib/authReturnTo";

/** "Continue with Google" plus the "or" divider, shared by Login and Register. */
export default function GoogleSignInButton({ returnTo, onError }) {
  const [loading, setLoading] = useState(false);

  const handleClick = async () => {
    setLoading(true);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: authCallbackUrl(returnTo) },
    });
    // On success the browser is already navigating to Google.
    if (error) {
      onError(error.message || "Google sign-in is not available right now");
      setLoading(false);
    }
  };

  return (
    <>
      <Button
        type="button"
        variant="outline"
        className="w-full h-12 text-sm font-medium mb-6"
        onClick={handleClick}
        disabled={loading}
      >
        <GoogleIcon className="w-5 h-5 mr-2" />
        Continue with Google
      </Button>

      <div className="relative mb-6">
        <div className="absolute inset-0 flex items-center">
          <div className="w-full border-t border-border" />
        </div>
        <div className="relative flex justify-center text-xs uppercase">
          <span className="bg-card px-3 text-muted-foreground">or</span>
        </div>
      </div>
    </>
  );
}
