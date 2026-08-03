class DropBalloonerismmAndTmdbTables < ActiveRecord::Migration[8.0]
  # Retired: ratings now come from the IMDb datasets (imdb_episode_ratings) and
  # air dates from OMDB (omdb_seasons). The balloonerismm proxy and the TMDB
  # episode-id mapping are no longer used.
  def up
    drop_table :balloonerismm_seasons, if_exists: true
    drop_table :balloonerismm_shows,   if_exists: true
    drop_table :tmdb_imdb_mappings,    if_exists: true
  end

  def down
    raise ActiveRecord::IrreversibleMigration
  end
end
