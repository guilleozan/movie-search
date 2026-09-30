import React from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { ListPlus } from 'lucide-react';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { toast } from '@/components/ui/use-toast';
import { supabase } from '@/lib/supabase';
import { mediaOf } from '@/lib/tmdb';
import { useLists } from '@/features/social/hooks';

/** "Add to list" on a title page: the shared lists the user can add to. */
export default function AddToList({ title }) {
  const lists = useLists();
  const queryClient = useQueryClient();
  const editable = (lists.data ?? []).filter((l) => l.role === 'owner' || l.role === 'editor');

  const add = async (list) => {
    const { error } = await supabase
      .from('list_items')
      .upsert({ list_id: list.id, tmdb_id: title.id, media_type: mediaOf(title) }, { onConflict: 'list_id,media_type,tmdb_id', ignoreDuplicates: true });
    if (error) {
      toast({ variant: 'destructive', title: "Couldn't add it", description: error.message });
      return;
    }
    queryClient.invalidateQueries({ queryKey: ['lists'] });
    queryClient.invalidateQueries({ queryKey: ['list-items', list.id] });
    toast({ title: `Added to ${list.name}` });
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-medium text-slate-200 transition-colors hover:border-white/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400">
        <ListPlus className="h-4 w-4" aria-hidden="true" /> Add to list
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56 border-white/10 bg-slate-950 text-slate-100">
        <DropdownMenuLabel className="text-xs text-slate-400">Shared lists</DropdownMenuLabel>
        {editable.length === 0 && <p className="px-2 py-1.5 text-sm text-slate-500">No lists you can add to yet.</p>}
        {editable.map((l) => (
          <DropdownMenuItem key={l.id} onSelect={() => add(l)} className="cursor-pointer focus:bg-white/10 focus:text-white">
            {l.name}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator className="bg-white/10" />
        <DropdownMenuItem asChild className="cursor-pointer focus:bg-white/10 focus:text-white">
          <Link to="/together">New list…</Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
