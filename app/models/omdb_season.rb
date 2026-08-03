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
        fetched = fetch_from_omdb(agent, imdb_id, s)
        upsert_season(imdb_id, s, fetched)
        fetched
      end

      result[s] = episodes.each_with_object({}) do |ep, h|
        h[ep["episode"].to_i] = { "title" => ep["title"], "released" => ep["released"] }
      end
    end
    result
  end

  # Fetch one season from OMDB and return compact episode hashes:
  #   [{ "episode" => Integer, "title" => String|nil, "released" => "YYYY-MM-DD"|nil }]
  # Returns [] for a season OMDB has no data for, so it is cached and not refetched.
  def self.fetch_from_omdb(agent, imdb_id, season_number)
    url  = "#{API_BASE}/?apikey=#{ENV['OMDB_API_KEY']}&i=#{imdb_id}&Season=#{season_number}"
    body = JSON.parse(agent.get(url).body)
    return [] unless body["Response"] == "True" && body["Episodes"].is_a?(Array)

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
    retries = 0
    begin
      row = find_or_initialize_by(imdb_id: imdb_id, season_number: season_number)
      row.episodes = episodes.to_json
      row.save!
    rescue ActiveRecord::RecordNotUnique, ActiveRecord::StatementInvalid => e
      # A concurrent request may insert the same (imdb_id, season) first, or the
      # sqlite file may be momentarily locked. Retry and let find_or_initialize_by
      # re-resolve to the now-existing row.
      if (e.message.include?("SQLITE_BUSY") || e.message.include?("SQLITE_CONSTRAINT")) && retries < 5
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
