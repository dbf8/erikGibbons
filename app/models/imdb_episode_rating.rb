class ImdbEpisodeRating < ApplicationRecord
  # Static, read-only data sourced from IMDb's downloadable datasets
  # (title.episode + title.ratings), rebuilt by `rake imdb:seed`. Only episodes
  # that have BOTH a season/episode number and an IMDb rating are stored, since
  # an unrated episode produces no chart point.

  # All rated episodes for a series, grouped by season number (as a string, to
  # match the episode-list output shape) and ordered by episode within a season.
  # Returns {} when the series is not in the dataset.
  def self.by_season(parent_tconst)
    where(parent_tconst: parent_tconst)
      .order(:season, :episode)
      .group_by { |r| r.season.to_s }
  end
end
