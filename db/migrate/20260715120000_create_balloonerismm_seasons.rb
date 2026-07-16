class CreateBalloonerismmSeasons < ActiveRecord::Migration[8.0]
  def change
    create_table :balloonerismm_seasons do |t|
      t.string :imdb_id, null: false
      t.integer :season_number, null: false
      t.text :episodes, null: false

      t.timestamps
    end

    add_index :balloonerismm_seasons, [:imdb_id, :season_number], unique: true
  end
end
