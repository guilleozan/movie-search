import React, { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { joinByToken } from '@/features/social/hooks';

/** /join/list/:token and /join/night/:token: join, then open it. Signed-out users log in first (ProtectedRoute keeps the link). */
export default function JoinPage() {
  const { kind, token } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [error, setError] = useState('');

  useEffect(() => {
    if (kind !== 'list' && kind !== 'night') {
      setError("This invite link isn't valid.");
      return;
    }
    let cancelled = false;
    joinByToken(kind, token)
      .then((id) => {
        if (cancelled) return;
        queryClient.invalidateQueries({ queryKey: [kind === 'list' ? 'lists' : 'nights'] });
        navigate(kind === 'list' ? `/lists/${id}` : `/nights/${id}`, { replace: true });
      })
      .catch((err) => !cancelled && setError(err.message));
    return () => {
      cancelled = true;
    };
  }, [kind, token, navigate, queryClient]);

  return (
    <div className="px-5 py-24 text-center">
      {error ? (
        <>
          <p className="text-rose-300">{error}</p>
          <Link to="/together" className="mt-4 inline-block text-sm text-amber-300 hover:underline">Go to Together</Link>
        </>
      ) : (
        <p className="inline-flex items-center gap-2 text-slate-300"><Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Joining…</p>
      )}
    </div>
  );
}
