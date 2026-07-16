namespace :balloonerismm do
  desc "Refresh cached shows searched recently, to keep episode scores up-to-date"
  task refresh: :environment do
    # Tunable via env so the scheduler can throttle without a code change.
    BalloonerismmShow.refresh_due!(
      within: (ENV["REFRESH_WINDOW_HOURS"] || "24").to_f.hours,
      limit: (ENV["REFRESH_MAX_SHOWS"] || "25").to_i,
      sleep_between: (ENV["REFRESH_SLEEP_SECONDS"] || "0.5").to_f
    )
  end
end
