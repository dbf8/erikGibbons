#./app/controllers/concerns/get_data.rb
module GetData
  extend ActiveSupport::Concern

  def get_tmdb_info(imdb_id, show_title)
    def get_json(agent, endpoint)
      JSON.parse(agent.get("https://api.themoviedb.org/3/#{endpoint}&api_key=#{ENV['TMDB_API_KEY']}").body)
    end

    begin
      agent = Mechanize.new
      
      # get TMDB id
      response = get_json(agent, "find/#{imdb_id}?external_source=imdb_id")
      result = response['tv_results'].first
      raise "No TV show found for #{imdb_id}" unless result
      tmdb_id = result['id']

      # get tmdb results
      show = get_json(agent,  "tv/#{tmdb_id}?language=en-US")

      # get episode info
      output = {}
      # { '1': [{ "Show Title" => "Error retrieving show data", "Title" => "N/A", "Released" => '1970-01-01', "Episode" => "1", "imdbRating" => "0.0", "imdbId" => "N/A" }]}
      # Collect all season/episode data from TMDB
      seasons_data = {}
      all_episode_ids = []
      show['seasons'].each do |s|
        next if s['season_number'] == 0
        season = get_json(agent, "tv/#{tmdb_id}/season/#{s['season_number']}?language=en-US")
        seasons_data[s['season_number']] = season['episodes']
        season['episodes'].each { |ep| all_episode_ids << ep['id'] }
        sleep 0.1
      end

      # Batch-fetch all cached IMDB mappings in one query
      cached = TmdbImdbMapping.where(tmdb_episode_id: all_episode_ids).index_by(&:tmdb_episode_id)

      # Fetch IMDB IDs from TMDB API for all uncached episodes, then bulk-insert
      uncached_mappings = []
      seasons_data.each do |season_num, episodes|
        episodes.each do |ep|
          next if cached.key?(ep['id'])
          url = "tv/#{tmdb_id}/season/#{season_num}/episode/#{ep['episode_number']}/external_ids?api_key=#{ENV['TMDB_API_KEY']}"
          imdb_id_result = get_json(agent, url)['imdb_id']
          uncached_mappings << { tmdb_episode_id: ep['id'], imdb_id: imdb_id_result }
          sleep 0.05
        end
      end

      if uncached_mappings.any?
        now = Time.current.utc.iso8601
        values = uncached_mappings.map do |m|
          "(#{m[:tmdb_episode_id]}, #{ActiveRecord::Base.connection.quote(m[:imdb_id])}, '#{now}', '#{now}')"
        end.join(", ")
        ActiveRecord::Base.connection.execute(
          "INSERT OR IGNORE INTO tmdb_imdb_mappings (tmdb_episode_id, imdb_id, created_at, updated_at) VALUES #{values}"
        )
        new_ids = uncached_mappings.map { |m| m[:tmdb_episode_id] }
        TmdbImdbMapping.where(tmdb_episode_id: new_ids).each { |r| cached[r.tmdb_episode_id] = r }
      end

      # Build output from cached mappings
      seasons_data.each do |season_num, episodes|
        output[season_num.to_s] = []
        episodes.each do |ep|
          mapping = cached[ep['id']]

          output[season_num.to_s] << {
            "Show Title" => show_title,
            "Title" => ep['name'],
            "Released" => ep['air_date'],
            "Episode" => ep['episode_number'].to_s,
            "imdbRating" => ep['vote_average'].to_s,
            "imdbId" => mapping&.imdb_id
          }
        end
      end
    rescue => error
      puts "GetData error: #{error.class}: #{error.message}"
      puts error.backtrace.first(10).join("\n")
      output = { '1': [{ "Show Title" => "Error retrieving show data", "Title" => "N/A", "Released" => '1970-01-01', "Episode" => "1", "imdbRating" => "0.0", "imdbId" => "N/A" }]}
    end

    return output
  end

  def get_balloonerismm_info(imdb_id, show_title)
    monotonic = ->{ Process.clock_gettime(Process::CLOCK_MONOTONIC) }
    wall_start = monotonic.call
    requests = []
    sleep_total = 0.0

    timed_get = lambda do |agent, label, url|
      t0 = monotonic.call
      response = agent.get(url)
      elapsed_ms = ((monotonic.call - t0) * 1000).round(1)
      requests << { label: label, ms: elapsed_ms, bytes: response.body.bytesize, status: response.code }
      response.body
    end

    cache_hits = 0

    begin
      agent = Mechanize.new
      base = "https://api.balloonerismm.workers.dev"
      max_seasons = 100
      # Past seasons are immutable, so they are cached permanently. Only the
      # highest cached season is refreshed, and only once it has gone stale —
      # that is where new episodes and rating changes still land.
      latest_ttl = 7.days

      cached = BalloonerismmSeason.where(imdb_id: imdb_id).index_by(&:season_number)
      highest_cached = cached.keys.max

      output = {}
      season_number = 1
      while season_number <= max_seasons
        row = cached[season_number]
        is_latest_cached = row && season_number == highest_cached
        fresh = row && (!is_latest_cached || row.updated_at > latest_ttl.ago)

        if fresh
          episodes = row.episodes_data
          cache_hits += 1
        else
          body = timed_get.call(agent, "season-#{season_number}", "#{base}/tv/#{imdb_id}/season/#{season_number}?language=en-US")
          season = JSON.parse(body)
          episodes = season['episodes'] || []
          # Empty `episodes` is the API's stub for "no data for this season" — also our stop signal.
          break if episodes.empty?

          BalloonerismmSeason.upsert_season(imdb_id, season_number, episodes)

          t_sleep = monotonic.call
          sleep 0.1
          sleep_total += monotonic.call - t_sleep
        end

        output[season_number.to_s] = episodes.map do |ep|
          {
            "Show Title" => show_title,
            "Title" => ep['name'],
            "Released" => ep['air_date'],
            "Episode" => ep['episode_number'].to_s,
            "imdbRating" => ep['vote_average'].to_s,
            "imdbId" => ep['id']
          }
        end

        season_number += 1
      end

      raise "No TV show found for #{imdb_id}" if output.empty?
    rescue => error
      puts "GetData error: #{error.class}: #{error.message}"
      puts error.backtrace.first(10).join("\n")
      output = { '1': [{ "Show Title" => "Error retrieving show data", "Title" => "N/A", "Released" => '1970-01-01', "Episode" => "1", "imdbRating" => "0.0", "imdbId" => "N/A" }]}
    end

    wall_ms = ((monotonic.call - wall_start) * 1000).round(1)
    http_ms = requests.sum { |r| r[:ms] }.round(1)
    bytes_total = requests.sum { |r| r[:bytes] }
    sleep_ms = (sleep_total * 1000).round(1)
    overhead_ms = (wall_ms - http_ms - sleep_ms).round(1)
    avg_ms = requests.empty? ? 0 : (http_ms / requests.size).round(1)

    puts "[balloonerismm] #{imdb_id} #{show_title.inspect}: #{requests.size} reqs, #{cache_hits} cached, wall=#{wall_ms}ms (http=#{http_ms}ms avg=#{avg_ms}ms, sleep=#{sleep_ms}ms, other=#{overhead_ms}ms), #{bytes_total}B"
    requests.each { |r| puts "  - #{r[:label]} [#{r[:status]}]: #{r[:ms]}ms, #{r[:bytes]}B" }

    return output
  end


  ### DEPRECATED IMDB-SCRAPER
  # def get_episode_info(imdb_id, show_title)
  #   def episode_data(data)
  #     output = []
  #     begin
  #       season = data.search('a[data-testid="tab-season-entry"]').css('.ipc-tab--active')[0].text
  #       episodes = data.css('.episode-item-wrapper')
  #       episodes.each do |ep|
  #         link = ep.css('.ipc-title-link-wrapper')[0]
  #         ep_data = {}
  #         ep_data['season'] = season
  #         ep_data['ep_number'] = link.attributes['href'].text.match(/ttep_ep_(\d{1,3})/)[1]
  #         ep_data['title'] = link.text.match(/ ∙ (.*)/)[1]
  #         ep_data['imdb_id'] = link.attributes['href'].text.match(/tt\d{1,10}/)[0]
  #         begin
  #           air_date_reg = ep.css('h4')[0].next.text[5..-1]
  #           if air_date_reg.nil?
  #             # break if no date is listed
  #             next
  #           end
  #           air_date = DateTime.strptime(air_date_reg, "%b %d, %Y").strftime("%F")
  #           if air_date > Date.today.strftime("%F")
  #             # break if date is in the future
  #             next
  #           end
  #           ep_data['air_date'] = air_date
  #         rescue
  #           ep_data['air_date'] = 'Could not parse'
  #         end
  #         begin
  #           ep_data['rating'] = ep.search('div[data-testid="ratingGroup--container"]')[0].search('span')[0].attributes['aria-label'].text.match(/IMDb rating: (.*)/)[1]
  #         rescue
  #           # use 0.0 as placeholder if episode doesn't have rating
  #           ep_data['ration'] = '0.0'
  #         end
  #         output << ep_data
  #       end

  #       return output
  #     rescue => error
  #       puts error.backtrace
  #       return 'invalid season'
  #     end
  #   end

  #   begin
  #     output = {}

  #     agent = Mechanize.new { |agent| agent.user_agent_alias = 'Windows Chrome'; agent.user_agent = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.31 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.31" }

  #     # first season and set seasons
  #     response = agent.get("https://www.imdb.com/title/#{imdb_id}/episodes/?season=1")
  #     s_list = response.search('a[data-testid="tab-season-entry"]')
  #     sel = s_list.css('.ipc-tab--active')[0].text
  #     seasons = s_list.map { |s| s.text }

  #     ep_data = episode_data(response)

  #     output[sel] = ep_data.map { |ep| {"Show Title" => show_title, "Title" => ep["title"], "Released" => ep["air_date"], "Episode" => ep["ep_number"], "imdbRating" => ep["rating"], "imdbId" => ep["imdb_id"]} }

  #     # get data for each other season
  #     (seasons - [sel]).each do |season|
  #       # skip seasons that aren't parsed as numbers
  #       if season[/\d*/].blank?
  #         next
  #       end
  #       response = agent.get("https://www.imdb.com/title/#{imdb_id}/episodes/?season=#{season}")
        
  #       ep_data = episode_data(response)
  #       if ep_data == "break"
  #         break
  #       elsif ep_data == "invalid season"
  #         next
  #       else
  #         output[season] = ep_data.map { |ep| {"Show Title" => show_title, "Title" => ep["title"], "Released" => ep["air_date"], "Episode" => ep["ep_number"], "imdbRating" => ep["rating"], "imdbId" => ep["imdb_id"]} }
  #       end
  #     end
  #   rescue => error
  #     puts $!.backtrace
  #     output = { '1': [{ "Show Title" => "Error retrieving show data", "Title" => "N/A", "Released" => '1970-01-01', "Episode" => "1", "imdbRating" => "0.0", "imdbId" => "N/A" }]}
  #   end

  #   return output
  # end

  def get_omdb_info(q)
    agent = Mechanize.new

    response = agent.get("https://www.omdbapi.com/?apikey=#{ENV['OMDB_API_KEY']}&#{q}&type=series")

    return JSON.parse(response.body)
  end

  def get_info_ng2(q)
    agent = Mechanize.new

    res = agent.get("https://www.omdbapi.com/?apikey=#{ENV['OMDB_API_KEY']}&#{q}")

    basic_info = JSON.parse(res.body)

    if basic_info["Response"] == "False"
      return basic_info
    end

    def episode_data(data)
      output = []
      season_base = data.css('#episode_top').text.match(/Season\p{Zs}(.*)/)
      return "invalid season" if season_base.nil? # skip if season doesn't parse correctly
      season = season_base[1]
      episodes = data.css('.list_item')
      episodes.each do |ep|
        info = ep.css('.info')
        ep_data = {}
        ep_data['season'] = season
        ep_data['ep_number'] = info.css('meta').attr('content').value
        ep_data['title'] = info.css('strong').text
        ep_data['imdb_id'] = info.css('strong').css('a').attr('href').value.match(/tt\d{1,10}/)[0]
        air_date_reg = info.css('.airdate')[0].text.match(/\d{1,2}\s[A-Za-z]{3}\.?\s\d{4}/)
        if air_date_reg.nil?
          # break if no date is listed
          next
        end
        air_date_raw = air_date_reg[0].gsub(".", "")
        air_date = DateTime.strptime(air_date_raw, "%d %b %Y").strftime("%F")
        if air_date > Date.today.strftime("%F")
          # break if date is in the future
          next
        end
        ep_data['air_date'] = air_date
        ep_data['rating'] = info.css('.ipl-rating-star.small .ipl-rating-star__rating').text
        output << ep_data
      end

      return output
    end

    output = []

    # first season and set seasons
    response = agent.get("https://www.imdb.com/title/#{basic_info['imdbID']}/episodes/_ajax?season=1")
    s_list = response.css('#bySeason')
    sel = s_list.css('[selected=selected]')[0].attr('value')
    seasons = s_list.css('option').map { |o| o.attr('value') }

    ep_data = episode_data(response)

    output << ep_data.map { |ep| {"showTitle" => basic_info['Title'], "epTitle" => ep["title"], "released" => ep["air_date"], "season" => sel, "epNumber" => ep["ep_number"], "imdbRating" => ep["rating"], "imdbId" => ep["imdb_id"] } }

    # get data for each other season
    (seasons - [sel]).each do |season|
      response = agent.get("https://www.imdb.com/title/#{basic_info['imdbID']}/episodes/_ajax?season=#{season}")
      
      ep_data = episode_data(response)
      if ep_data == "break"
        break
      elsif ep_data == "invalid season" || ep_data.empty?
        next
      else
        output << ep_data.map { |ep| {"showTitle" => basic_info['Title'], "epTitle" => ep["title"], "released" => ep["air_date"], "season" => season, "epNumber" => ep["ep_number"], "imdbRating" => ep["rating"], "imdbId" => ep["imdb_id"] } }
      end
    end

    return output
  end
end