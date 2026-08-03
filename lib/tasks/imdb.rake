require "open-uri"
require "tmpdir"

# Rebuilds the static imdb_episode_ratings table from IMDb's downloadable
# datasets. This is BOTH the initial seed and the weekly refresh — re-running it
# picks up new episodes and rating changes.
#
# Only episodes that have a season/episode number AND an IMDb rating are kept
# (an unrated episode makes no chart point), which collapses ~9.8M raw episode
# rows to ~0.86M — a ~52 MB table.
#
# The join is done with a coreutils pipeline (zcat|awk|sort|join): fast (~20s)
# and memory-light (external merge sort), which matters on small dynos. Rows are
# then streamed into SQLite in batched multi-row INSERTs — never row-by-row
# ActiveRecord, which would take many minutes.
module ImdbDatasetSeeder
  EPISODE_URL = "https://datasets.imdbws.com/title.episode.tsv.gz".freeze
  RATINGS_URL = "https://datasets.imdbws.com/title.ratings.tsv.gz".freeze

  # Refuse to replace the live table with an implausibly small build (e.g. a
  # truncated download). The real dataset is ~857K rows; anything under this is
  # treated as a failed fetch and the existing table is left untouched.
  MIN_EXPECTED_ROWS = 500_000
  BATCH_SIZE = 5_000

  module_function

  def run!(logger: Rails.logger)
    started = Process.clock_gettime(Process::CLOCK_MONOTONIC)
    Dir.mktmpdir("imdb-seed") do |dir|
      episode_gz = File.join(dir, "title.episode.tsv.gz")
      ratings_gz = File.join(dir, "title.ratings.tsv.gz")
      joined     = File.join(dir, "joined.tsv")

      if (src = ENV["IMDB_DATA_DIR"]).present?
        logger.info "[imdb:seed] using local datasets in #{src}"
        FileUtils.cp(File.join(src, "title.episode.tsv.gz"), episode_gz)
        FileUtils.cp(File.join(src, "title.ratings.tsv.gz"), ratings_gz)
      else
        download(EPISODE_URL, episode_gz, logger)
        download(RATINGS_URL, ratings_gz, logger)
      end

      build_join(episode_gz, ratings_gz, joined, dir, logger)

      rows = count_lines(joined)
      logger.info "[imdb:seed] joined rated episodes: #{rows}"
      if rows < MIN_EXPECTED_ROWS
        raise "refusing to load only #{rows} rows (< #{MIN_EXPECTED_ROWS}); " \
              "likely a bad download. Leaving imdb_episode_ratings untouched."
      end

      loaded = load_rows(joined, logger)
      elapsed = (Process.clock_gettime(Process::CLOCK_MONOTONIC) - started).round(1)
      logger.info "[imdb:seed] done: #{loaded} rows loaded in #{elapsed}s"
      loaded
    end
  end

  def download(url, dest, logger)
    logger.info "[imdb:seed] downloading #{url}"
    URI.open(url, "rb", read_timeout: 120) do |remote|
      File.open(dest, "wb") { |f| IO.copy_stream(remote, f) }
    end
  end

  # Produces a TSV of: ep_tconst \t parent_tconst \t season \t episode \t rating \t votes
  def build_join(episode_gz, ratings_gz, out, tmp, logger)
    logger.info "[imdb:seed] joining episode + ratings datasets"
    e_sorted = File.join(tmp, "e.sorted")
    r_sorted = File.join(tmp, "r.sorted")
    raw      = File.join(tmp, "joined.raw")
    # IMDb data occasionally has two distinct episode tconsts in the same
    # (series, season, episode) slot. That would break the unique index and
    # double-plot a point, so the final step keeps only the highest-voted entry
    # per slot: sort by (parent, season, episode, votes desc) then take the first
    # row of each slot.
    cmd = <<~SH
      set -o pipefail
      export LC_ALL=C
      zcat #{ratings_gz} | tail -n +2 | awk -F'\\t' 'BEGIN{OFS="\\t"} {print $1,$2,$3}' | sort -T #{tmp} -k1,1 > #{r_sorted}
      zcat #{episode_gz} | tail -n +2 | awk -F'\\t' 'BEGIN{OFS="\\t"} $3!="\\\\N" && $4!="\\\\N" {print $1,$2,$3,$4}' | sort -T #{tmp} -k1,1 > #{e_sorted}
      join -t $'\\t' -1 1 -2 1 #{e_sorted} #{r_sorted} > #{raw}
      sort -T #{tmp} -t $'\\t' -k2,2 -k3,3n -k4,4n -k6,6nr #{raw} | awk -F'\\t' '!seen[$2 FS $3 FS $4]++' > #{out}
    SH
    unless system("bash", "-c", cmd)
      raise "[imdb:seed] join pipeline failed (need zcat/awk/sort/join on PATH)"
    end
  end

  def count_lines(path)
    File.foreach(path).count
  end

  def load_rows(path, logger)
    conn = ActiveRecord::Base.connection
    quote = ->(s) { conn.quote(s) }
    total = 0
    conn.transaction do
      conn.execute("DELETE FROM imdb_episode_ratings")
      buffer = []
      flush = lambda do
        next if buffer.empty?
        conn.execute(
          "INSERT INTO imdb_episode_ratings " \
          "(ep_tconst, parent_tconst, season, episode, average_rating, num_votes) VALUES " +
          buffer.join(",")
        )
        total += buffer.size
        buffer.clear
      end

      File.foreach(path) do |line|
        ep_tconst, parent, season, episode, rating, votes = line.chomp.split("\t")
        next if ep_tconst.nil? || rating.nil?
        buffer << "(#{quote.call(ep_tconst)},#{quote.call(parent)}," \
                  "#{season.to_i},#{episode.to_i},#{rating.to_f},#{votes.to_i})"
        flush.call if buffer.size >= BATCH_SIZE
      end
      flush.call
    end
    total
  end
end

namespace :imdb do
  desc "Download IMDb datasets and (re)build imdb_episode_ratings. Also the weekly refresh."
  task seed: :environment do
    ImdbDatasetSeeder.run!(logger: Logger.new($stdout))
  end
end
