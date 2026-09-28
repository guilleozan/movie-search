import React from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '@/lib/AuthContext';
import { safeReturnTo } from '@/lib/authReturnTo';
import FullScreenSpinner from '@/components/FullScreenSpinner';

/**
 * Layout route for login/register pages. As soon as a session exists (already
 * signed in, or a sign-in on the page just succeeded) it sends the user to ?returnTo=.
 */
export default function GuestRoute() {
  const { isAuthenticated, isLoadingAuth } = useAuth();
  const location = useLocation();

  if (isLoadingAuth) return <FullScreenSpinner />;
  if (isAuthenticated) return <Navigate to={safeReturnTo(location.search)} replace />;

  return <Outlet />;
}
