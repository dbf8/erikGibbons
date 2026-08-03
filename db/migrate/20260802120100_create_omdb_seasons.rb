class CreateOmdbSeasons < ActiveRecord::Migration[8.0]
  def change
    create_table :omdb_seasons do |t|
      t.string  :imdb_id,       null: false   # series IMDb id
      t.integer :season_number, null: false
      t.text    :episodes,      null: false   # JSON: [{episode, title, released}]

      t.timestamps
    end

    add_index :omdb_seasons, [:imdb_id, :season_number], unique: true
  end
end
