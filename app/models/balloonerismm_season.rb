class BalloonerismmSeason < ApplicationRecord
    API_BASE = "https://api.balloonerismm.workers.dev".freeze

    # Only the fields the episode-list output actually renders are cached.
    # `Show Title` is intentionally excluded — it is a per-request parameter and
    # is injected at read time in GetData#get_balloonerismm_info.
    KEEP_FIELDS = %w[name air_date episode_number vote_average id].freeze

    # Re-fetch every season of a show live and overwrite the cache, picking up
    # score (vote_average) changes on ALL seasons — including old ones, which the
    # on-request path caches permanently and never re-checks. Also discovers any
    # newly added season. Returns the number of seasons refreshed.
    def self.refresh_show!(imdb_id, agent: Mechanize.new, sleep_between: 0.1)
        refreshed = 0
        season_number = 1
        loop do
            episodes = fetch_season(agent, imdb_id, season_number)
            # Empty season is the API's stop signal — no more seasons exist.
            break if episodes.nil? || episodes.empty?

            upsert_season(imdb_id, season_number, episodes)
            refreshed += 1
            season_number += 1
            sleep(sleep_between) if sleep_between&.positive?
        end
        refreshed
    end

    def self.fetch_season(agent, imdb_id, season_number)
        body = agent.get("#{API_BASE}/tv/#{imdb_id}/season/#{season_number}?language=en-US").body
        JSON.parse(body)['episodes'] || []
    end
    private_class_method :fetch_season

    def self.upsert_season(imdb_id, season_number, episodes)
        compact = episodes.map { |ep| ep.slice(*KEEP_FIELDS) }
        retries = 0
        begin
            row = find_or_initialize_by(imdb_id: imdb_id, season_number: season_number)
            row.episodes = compact.to_json
            row.save!
        rescue ActiveRecord::RecordNotUnique, ActiveRecord::StatementInvalid => e
            # A concurrent request may insert the same (imdb_id, season) first, or
            # the libsql/sqlite file may be momentarily locked. Retry and let the
            # find_or_initialize_by re-resolve to the now-existing row.
            if (e.message.include?('SQLITE_BUSY') || e.message.include?('SQLITE_CONSTRAINT')) && retries < 5
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
