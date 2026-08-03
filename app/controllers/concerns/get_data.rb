#./app/controllers/concerns/get_data.rb
module GetData
  extend ActiveSupport::Concern

  # Build the season/episode chart payload for a series.
  #
  # Ratings are authoritative from IMDb's downloadable datasets
  # (imdb_episode_ratings) and drive which episodes exist. Air dates + titles are
  # layered on from OMDB (cached per season in omdb_seasons) and merged by
  # (season, episode). The output shape is exactly what the Angular charts
  # consume, so `imdbRating` is now the real IMDb rating and `imdbId` is the
  # episode's own tconst (which fixes click-through to the episode's IMDb page).
  def get_episode_info(imdb_id, show_title)
    started = Process.clock_gettime(Process::CLOCK_MONOTONIC)

    begin
      ratings_by_season = ImdbEpisodeRating.by_season(imdb_id)
      raise "No rated episodes in dataset for #{imdb_id}" if ratings_by_season.empty?

      agent   = Mechanize.new
      # Bound each OMDB call so a slow/hanging season fails fast; OmdbSeason then
      # fails soft (ratings still render) rather than stalling the whole request.
      agent.open_timeout = 5
      agent.read_timeout = 8
      seasons = ratings_by_season.keys.map(&:to_i)
      air     = OmdbSeason.episodes_for(imdb_id, seasons, agent: agent)

      output = {}
      ratings_by_season.each do |season_str, rows|
        season_air = air[season_str.to_i] || {}
        output[season_str] = rows.map do |r|
          meta = season_air[r.episode] || {}
          {
            "Show Title" => show_title,
            "Title"      => meta["title"],
            "Released"   => meta["released"],
            "Episode"    => r.episode.to_s,
            "imdbRating" => r.average_rating.to_s,
            "imdbId"     => r.ep_tconst,
            "numVotes"   => r.num_votes
          }
        end
      end
    rescue => error
      puts "GetData error: #{error.class}: #{error.message}"
      puts error.backtrace.first(10).join("\n")
      output = { '1': [{ "Show Title" => "Error retrieving show data", "Title" => "N/A", "Released" => '1970-01-01', "Episode" => "1", "imdbRating" => "0.0", "imdbId" => "N/A" }] }
    end

    elapsed_ms = ((Process.clock_gettime(Process::CLOCK_MONOTONIC) - started) * 1000).round(1)
    puts "[episodes] #{imdb_id} #{show_title.inspect}: #{output.size} seasons, #{elapsed_ms}ms"

    return output
  end

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
