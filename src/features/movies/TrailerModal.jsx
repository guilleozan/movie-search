import React, { useRef } from 'react';
import { ExternalLink } from 'lucide-react';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';

/**
 * YouTube trailer in a modal, using the privacy-enhanced nocookie player.
 * The iframe only exists while the modal is open, so closing it stops playback.
 *
 * @param {{ video: { key: string, name: string } | null, open: boolean, onOpenChange: (open: boolean) => void }} props
 */
export default function TrailerModal({ video, open, onOpenChange }) {
  const contentRef = useRef(null);
  if (!video) return null;
  const youtubeUrl = `https://www.youtube.com/watch?v=${encodeURIComponent(video.key)}`;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        ref={contentRef}
        className="max-w-4xl gap-3 border-white/10 bg-slate-950 p-3 sm:p-4"
        aria-describedby={undefined}
        // Keep focus on the dialog, not the iframe: key presses inside a YouTube
        // iframe never reach the page, so Escape couldn't close the modal.
        onOpenAutoFocus={(e) => {
          e.preventDefault();
          contentRef.current?.focus();
        }}
      >
        <DialogTitle className="pr-8 text-sm font-medium text-slate-200">{video.name}</DialogTitle>
        <div className="aspect-video w-full overflow-hidden rounded-lg bg-black">
          {open && (
            <iframe
              src={`https://www.youtube-nocookie.com/embed/${encodeURIComponent(video.key)}?autoplay=1&rel=0`}
              title={video.name}
              allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
              className="h-full w-full"
            />
          )}
        </div>
        <a
          href={youtubeUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 self-start text-sm text-amber-300 hover:underline"
        >
          <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" /> Open on YouTube
        </a>
      </DialogContent>
    </Dialog>
  );
}
