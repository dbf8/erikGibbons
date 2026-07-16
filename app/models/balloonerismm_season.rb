class BalloonerismmSeason < ApplicationRecord
    # Only the fields the episode-list output actually renders are cached.
    # `Show Title` is intentionally excluded — it is a per-request parameter and
    # is injected at read time in GetData#get_balloonerismm_info.
    KEEP_FIELDS = %w[name air_date episode_number vote_average id].freeze

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
