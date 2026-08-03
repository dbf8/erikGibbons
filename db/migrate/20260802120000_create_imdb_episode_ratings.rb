class CreateImdbEpisodeRatings < ActiveRecord::Migration[8.0]
  def change
    create_table :imdb_episode_ratings do |t|
      t.string  :ep_tconst,      null: false   # the episode's own IMDb id (ttXXXXXXX)
      t.string  :parent_tconst,  null: false   # the series' IMDb id
      t.integer :season,         null: false
      t.integer :episode,        null: false
      t.float   :average_rating, null: false
      t.integer :num_votes,      null: false
    end

    # Lookups are always "all rated episodes for this series"; the composite
    # covers the read and keeps the per-series scan ordered.
    add_index :imdb_episode_ratings, [:parent_tconst, :season, :episode],
              unique: true, name: "index_imdb_episode_ratings_on_series_season_episode"
  end
end
