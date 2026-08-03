#!/usr/bin/env bash
# Render build command. On Render, the build command's filesystem changes are
# baked into the deployed service, so this is where the static ratings DB is
# built: it will be present (read-only baseline) when the web service starts.
#
# Point Render's "Build Command" at this script:  ./bin/render-build.sh
#
# Data freshness: re-running this build re-downloads the IMDb datasets and
# rebuilds the ratings table, so "refresh ratings" == "redeploy". Trigger a
# weekly deploy via a Render Deploy Hook (see comment at bottom).
set -o errexit

bundle install
bundle exec rake assets:precompile
bundle exec rake assets:clean

# Fresh SQLite each build (ephemeral FS): create it and load the schema.
bundle exec rake db:prepare

# Rebuild imdb_episode_ratings from IMDb's downloadable datasets (~1 min).
# Bakes ~52 MB into the deploy; air dates are fetched lazily from OMDB at runtime.
bundle exec rake imdb:seed

# --- Weekly refresh (no code, no cost) --------------------------------------
# 1. Render dashboard -> your service -> Settings -> Deploy Hook: copy the URL.
# 2. In cron-job.org (already used for this app), add a weekly job that POSTs
#    that URL. Each fire triggers a redeploy, which re-runs this script and
#    rebuilds the ratings table from the latest IMDb data.
