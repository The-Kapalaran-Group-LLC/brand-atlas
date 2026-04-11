#!/bin/bash
# Run the Supabase pull script every 5 minutes forever
while true; do
  VITE_SUPABASE_ANON_KEY="$VITE_SUPABASE_ANON_KEY" node ./pullSupabaseSearches.js
  sleep 300
done
