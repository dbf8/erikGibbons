class BalloonerismmShow < ApplicationRecord
    # Records that a show was looked up, so the scheduled refresh can target only
    # shows that are of recent interest. Called on every successful search,
    # including cache hits (where no season row is written).
    def self.touch_search(imdb_id, title)
        retries = 0
        begin
            row = find_or_initialize_by(imdb_id: imdb_id)
            row.title = title if title.present?
            row.last_searched_at = Time.current
            row.save!
        rescue ActiveRecord::RecordNotUnique, ActiveRecord::StatementInvalid => e
            if (e.message.include?('SQLITE_BUSY') || e.message.include?('SQLITE_CONSTRAINT')) && retries < 5
                retries += 1
                sleep(0.1 * retries)
                retry
            end
            raise
        end
    end

    # Shows worth refreshing: searched within `within`, and actually cached
    # already (so a refresh re-fetches known seasons rather than building anew).
    # Most-recently-searched first, capped by `limit` to bound API load per run.
    def self.due_for_refresh(within: 1.day, limit: 200)
        where("last_searched_at > ?", within.ago)
            .where(imdb_id: BalloonerismmSeason.select(:imdb_id))
            .order(last_searched_at: :desc)
            .limit(limit)
    end

    # Refresh every due show's cached seasons. Shared by the balloonerismm:refresh
    # rake task and the HTTP trigger endpoint so both behave identically. Passing
    # a `logger` routes output to Rails logs; otherwise it prints (rake). Returns
    # a summary hash.
    def self.refresh_due!(within: 1.day, limit: 25, sleep_between: 0.5, logger: nil)
        log = ->(msg) { logger ? logger.info(msg) : puts(msg) }
        shows = due_for_refresh(within: within, limit: limit).to_a
        started = Process.clock_gettime(Process::CLOCK_MONOTONIC)
        log.call "[balloonerismm:refresh] #{shows.size} show(s) searched in last #{(within / 1.hour).round(1)}h (cap #{limit})"

        seasons_total = 0
        failures = 0
        agent = Mechanize.new

        shows.each do |show|
            begin
                n = BalloonerismmSeason.refresh_show!(show.imdb_id, agent: agent)
                seasons_total += n
                log.call "  - #{show.imdb_id} #{show.title.inspect}: #{n} season(s) refreshed"
            rescue => e
                failures += 1
                log.call "  ! #{show.imdb_id} #{show.title.inspect}: #{e.class}: #{e.message}"
            end
            sleep(sleep_between) if sleep_between.positive?
        end

        elapsed = (Process.clock_gettime(Process::CLOCK_MONOTONIC) - started).round(1)
        log.call "[balloonerismm:refresh] done: #{shows.size} shows, #{seasons_total} seasons, #{failures} failures, #{elapsed}s"
        { shows: shows.size, seasons: seasons_total, failures: failures, elapsed: elapsed }
    end
end
