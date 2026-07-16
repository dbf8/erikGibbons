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

ActiveRecord::Schema[8.0].define(version: 2026_07_15_130000) do
  create_table "balloonerismm_seasons", force: :cascade do |t|
    t.string "imdb_id", null: false
    t.integer "season_number", null: false
    t.text "episodes", null: false
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["imdb_id", "season_number"], name: "index_balloonerismm_seasons_on_imdb_id_and_season_number", unique: true
  end

  create_table "balloonerismm_shows", force: :cascade do |t|
    t.string "imdb_id", null: false
    t.string "title"
    t.datetime "last_searched_at"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["imdb_id"], name: "index_balloonerismm_shows_on_imdb_id", unique: true
    t.index ["last_searched_at"], name: "index_balloonerismm_shows_on_last_searched_at"
  end

  create_table "tmdb_imdb_mappings", force: :cascade do |t|
    t.integer "tmdb_episode_id"
    t.string "imdb_id"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["tmdb_episode_id"], name: "index_tmdb_imdb_mappings_on_tmdb_episode_id", unique: true
  end
end
