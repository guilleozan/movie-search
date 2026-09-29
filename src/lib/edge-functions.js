import { FunctionsHttpError } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';

/**
 * Call a Supabase Edge Function with a JSON body. Throws an Error with the
 * function's `{ error }` message and `.status` on failure.
 *
 * @param {string} name
 * @param {Record<string, unknown>} body
 * @param {string} [fallbackMessage] shown when the function gives no message
 */
export async function invokeFunction(name, body, fallbackMessage = 'Something went wrong. Please try again.') {
  const { data, error } = await supabase.functions.invoke(name, { body });
  if (error) {
    let message = fallbackMessage;
    let status;
    if (error instanceof FunctionsHttpError) {
      status = error.context.status;
      try {
        message = (await error.context.json()).error || message;
      } catch {
        // keep the fallback message
      }
    }
    const err = new Error(message);
    err.status = status;
    throw err;
  }
  return data;
}

// Don't retry "not found" or bad requests, only server/network failures.
export const retryServerErrors = (count, error) => !(error?.status < 500) && count < 1;
