require "json"

# Lazy, self-healing cache of episode air dates + titles sourced from OMDB, one
# row per (series, season). IMDb's datasets carry ratings but no air dates, so
# those come from OMDB on demand and are cached here.
#
# This is a CACHE: it lives in the app's local SQLite and is allowed to be cold
# after a deploy. It re-warms one search at a time (bounded by the shows people
# actually look up, not the whole catalog), which stays well within OMDB's free
# tier. Past seasons are immutable and cached permanently; only the latest
# requested season is re-checked once it goes stale (new episodes / firmed-up
# TBA dates land there).
class OmdbSeason < ApplicationRecord
  API_BASE  = "https://www.omdbapi.com".freeze
  LATEST_TTL = 7.days

  # A single flaky OMDB call used to leave a season with no air dates, which the
  # chart renders as a broken/partial season. Retrying transient failures a few
  # times with backoff does automatically what a manual page reload does.
  MAX_FETCH_ATTEMPTS = 3
  RETRY_BACKOFF = 0.3

  # Nested air-date/title lookup for the given seasons of a series:
  #   { season_number(Integer) => { episode_number(Integer) => {"title"=>, "released"=>} } }
  # Fetches missing (and stale-latest) seasons from OMDB and caches them.
  def self.episodes_for(imdb_id, season_numbers, agent:, latest_ttl: LATEST_TTL)
    wanted = season_numbers.map(&:to_i).uniq.sort
    return {} if wanted.empty?

    latest = wanted.max
    cached = where(imdb_id: imdb_id, season_number: wanted).index_by(&:season_number)

    result = {}
    wanted.each do |s|
      row = cached[s]
      is_latest = (s == latest)
      fresh = row && (!is_latest || row.updated_at > latest_ttl.ago)

      episodes = if fresh
        row.episodes_data
      else
        fetched = fetch_season_with_retry(agent, imdb_id, s)
        if fetched
          # Caching is best-effort: we already have the air dates, so a failed
          # cache write must never blank the chart — just log and move on.
          begin
            upsert_season(imdb_id, s, fetched)
          rescue => e
            Rails.logger.warn("[omdb_seasons] #{imdb_id} S#{s} cache write failed: #{e.class}: #{e.message}")
          end
          fetched
        else
          # Every attempt failed. Reuse any prior air dates and let a later load
          # retry; never cache the failure. Ratings render regardless of dates.
          row&.episodes_data || []
        end
      end

      result[s] = episodes.each_with_object({}) do |ep, h|
        h[ep["episode"].to_i] = { "title" => ep["title"], "released" => ep["released"] }
      end
    end
    result
  end

  # Fetch one season, retrying transient failures (a nil/unusable response or a
  # raised network error) up to MAX_FETCH_ATTEMPTS with growing backoff. Returns
  # the episode array on success, or nil only if every attempt failed — never
  # raises, so a bad season can't blank the chart.
  def self.fetch_season_with_retry(agent, imdb_id, season_number)
    attempts = 0
    begin
      attempts += 1
      result = fetch_from_omdb(agent, imdb_id, season_number)
      raise "OMDB returned no usable data" if result.nil?
      result
    rescue => e
      if attempts < MAX_FETCH_ATTEMPTS
        sleep(RETRY_BACKOFF * attempts)
        retry
      end
      Rails.logger.warn("[omdb_seasons] #{imdb_id} S#{season_number} air-date fetch failed after #{attempts} attempts: #{e.class}: #{e.message}")
      nil
    end
  end

  # Fetch one season from OMDB and return compact episode hashes:
  #   [{ "episode" => Integer, "title" => String|nil, "released" => "YYYY-MM-DD"|nil }]
  # Returns nil when OMDB gives an error/unusable response (rate limit, "False",
  # etc.) so the caller can skip caching and retry later, versus [] for a season
  # OMDB genuinely reports has no episodes (safe to cache).
  def self.fetch_from_omdb(agent, imdb_id, season_number)
    url  = "#{API_BASE}/?apikey=#{ENV['OMDB_API_KEY']}&i=#{imdb_id}&Season=#{season_number}"
    body = JSON.parse(agent.get(url).body)
    return nil unless body["Response"] == "True" && body["Episodes"].is_a?(Array)

    body["Episodes"].map do |ep|
      {
        "episode"  => ep["Episode"].to_i,
        "title"    => normalize(ep["Title"]),
        "released" => normalize(ep["Released"])
      }
    end
  end

  def self.normalize(value)
    value.nil? || value == "N/A" ? nil : value
  end
  private_class_method :normalize

  def self.upsert_season(imdb_id, season_number, episodes)
    # Atomic INSERT ... ON CONFLICT DO UPDATE so two concurrent requests fetching
    # the same show can't collide on the (imdb_id, season_number) unique index.
    # (The previous find_or_initialize_by + save! raised RecordNotUnique on that
    # race, and the old retry guard matched libsql's "SQLITE_*" wording, not the
    # sqlite3 gem's "UNIQUE constraint failed", so it propagated and blanked the
    # chart.) A briefly locked sqlite file is still transient, so retry on BUSY.
    now = Time.current
    retries = 0
    begin
      upsert(
        { imdb_id: imdb_id, season_number: season_number,
          episodes: episodes.to_json, created_at: now, updated_at: now },
        unique_by: [:imdb_id, :season_number]
      )
    rescue ActiveRecord::StatementInvalid => e
      if (e.message.include?("database is locked") || e.message.include?("SQLITE_BUSY")) && retries < 5
        retries += 1
        sleep(0.1 * retries)
        retry
      end
      raise
    end
  end

  def episodes_data
    JSON.parse(episodes)
  end
end
