# This file is auto-generated from the current state of the database. Instead
# of editing this file, please use the migrations feature of Active Record to
# incrementally modify your database, and then regenerate this schema definition.
#
# This file is the source Rails uses to define your schema when running `bin/rails
# db:schema:load`. When creating a new database, `bin/rails db:schema:load` tends to
# be faster and is potentially less error prone than running all of your
# migrations from scratch. Old migrations may fail to apply correctly if those
# migrations use external dependencies or application code.
#
# It's strongly recommended that you check this file into your version control system.

ActiveRecord::Schema[8.0].define(version: 2026_08_02_120200) do
  create_table "imdb_episode_ratings", force: :cascade do |t|
    t.string "ep_tconst", null: false
    t.string "parent_tconst", null: false
    t.integer "season", null: false
    t.integer "episode", null: false
    t.float "average_rating", null: false
    t.integer "num_votes", null: false
    t.index ["parent_tconst", "season", "episode"], name: "index_imdb_episode_ratings_on_series_season_episode", unique: true
  end

  create_table "omdb_seasons", force: :cascade do |t|
    t.string "imdb_id", null: false
    t.integer "season_number", null: false
    t.text "episodes", null: false
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["imdb_id", "season_number"], name: "index_omdb_seasons_on_imdb_id_and_season_number", unique: true
  end
end
