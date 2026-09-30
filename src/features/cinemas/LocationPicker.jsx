import React, { useState } from 'react';
import { Loader2, LocateFixed, MapPin, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from '@/components/ui/use-toast';
import { useProfile } from '@/hooks/use-profile';
import { usePlaceSearch, useReversePlace, useSaveLocation } from '@/features/cinemas/hooks';

const GEO_ERRORS = {
  1: 'Location permission was denied. Search for your town or city instead.',
  2: "Your browser couldn't work out where you are. Search for your town or city instead.",
  3: 'Finding your location took too long. Search for your town or city instead.',
};

/**
 * Set the user's location: the browser's position, or a town/city search.
 * Only the town and a ~1 km rounded position are saved.
 *
 * @param {{ onSaved?: () => void }} props
 */
export default function LocationPicker({ onSaved }) {
  const { data: profile } = useProfile();
  const reverse = useReversePlace();
  const search = usePlaceSearch();
  const save = useSaveLocation();
  const [locating, setLocating] = useState(false);
  const [geoError, setGeoError] = useState('');
  const [query, setQuery] = useState('');

  const saveLocation = (place) =>
    save.mutate(place, {
      onSuccess: () => {
        toast({ title: `Location set to ${place.city ?? place.label}` });
        onSaved?.();
      },
      onError: (error) => toast({ variant: 'destructive', title: "Couldn't save your location", description: error.message }),
    });

  const locateMe = () => {
    setGeoError('');
    if (!('geolocation' in navigator)) {
      setGeoError(GEO_ERRORS[2]);
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        const point = { lat: coords.latitude, lng: coords.longitude };
        reverse.mutate(point, {
          onSuccess: (place) => saveLocation(place ?? { ...point, label: 'Your location', city: null, country_code: null }),
          onError: (error) => setGeoError(error.message),
          onSettled: () => setLocating(false),
        });
      },
      (error) => {
        setLocating(false);
        setGeoError(GEO_ERRORS[error.code] ?? GEO_ERRORS[2]);
      },
      { enableHighAccuracy: false, timeout: 15000, maximumAge: 10 * 60 * 1000 }
    );
  };

  const busy = locating || reverse.isPending || save.isPending;

  return (
    <div className="space-y-4">
      <Button type="button" onClick={locateMe} disabled={busy} className="w-full sm:w-auto">
        {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" /> : <LocateFixed className="mr-2 h-4 w-4" aria-hidden="true" />}
        {busy ? 'Finding you…' : 'Use my location'}
      </Button>
      {geoError && <p className="text-sm text-amber-200" role="alert">{geoError}</p>}

      <form
        role="search"
        onSubmit={(e) => {
          e.preventDefault();
          if (query.trim().length >= 2) search.mutate({ query: query.trim() });
        }}
        className="flex gap-2"
      >
        <label htmlFor="place-search" className="sr-only">Town or city</label>
        <div className="relative min-w-0 flex-1">
          <MapPin className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" aria-hidden="true" />
          <input
            id="place-search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={profile?.city ? `e.g. ${profile.city}` : 'Or search a town or city'}
            className="h-10 w-full rounded-lg border border-white/10 bg-white/5 pl-9 pr-3 text-sm text-slate-100 placeholder:text-slate-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400"
          />
        </div>
        <Button type="submit" variant="outline" aria-label="Search places" disabled={search.isPending || query.trim().length < 2} className="border-white/10 bg-white/5 text-slate-200 hover:bg-white/10">
          {search.isPending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Search className="h-4 w-4" aria-hidden="true" />}
          <span className="ml-1.5 hidden sm:inline" aria-hidden="true">Search</span>
        </Button>
      </form>

      {search.isError && <p className="text-sm text-rose-300">{search.error.message}</p>}
      {search.isSuccess && search.data.length === 0 && (
        <p className="text-sm text-slate-500">No towns or cities match “{search.variables.query}”.</p>
      )}
      {search.isSuccess && search.data.length > 0 && (
        <ul className="overflow-hidden rounded-xl border border-white/10" aria-label="Places">
          {search.data.map((place) => (
            <li key={`${place.lat},${place.lng},${place.label}`} className="border-b border-white/5 last:border-0">
              <button
                type="button"
                disabled={save.isPending}
                onClick={() => saveLocation(place)}
                className="flex w-full items-center gap-3 px-3 py-2.5 text-left text-sm text-slate-200 transition-colors hover:bg-white/5 focus-visible:bg-white/10 focus-visible:outline-none"
              >
                <MapPin className="h-4 w-4 shrink-0 text-slate-500" aria-hidden="true" />
                {place.label}
              </button>
            </li>
          ))}
        </ul>
      )}
      <p className="text-xs text-slate-500">
        We save only your town and an approximate position (about 1 km), to find cinemas near you.
      </p>
    </div>
  );
}
