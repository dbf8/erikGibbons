class CreateBalloonerismmShows < ActiveRecord::Migration[8.0]
  def change
    create_table :balloonerismm_shows do |t|
      t.string :imdb_id, null: false
      t.string :title
      t.datetime :last_searched_at

      t.timestamps
    end

    add_index :balloonerismm_shows, :imdb_id, unique: true
    add_index :balloonerismm_shows, :last_searched_at
  end
end
