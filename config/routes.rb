Rails.application.routes.draw do

  constraints subdomain: "tvcharts" do
    get '/(:query)' => 'application#angular_charts'
    get '/api/episodes/:imdb_id' => 'application#get_episode_data'
    get '/api/episodes_batch/:q' => 'application#get_episode_batch_data'
    get '/api/omdb/:q' => 'application#get_omdb_data'
    get '/api/omdb_batch/:q' => 'application#get_omdb_batch_data'
    get '/api/ng_episodes/:q' => 'application#get_episode_data_ng2'

    match "*path", to: 'application#angular', via: :all
  end

  constraints subdomain: "ppp-lending" do
    get '/' => 'application#ppp_lending'
    post '/api/contact' => 'application#ppp_contact'
  end
  
  root to: "application#angular"
  post '/api/contact' => 'application#contact'
  
  # make sure that other addresses are routed to the root page
  match "*path", to: "application#angular", via: :all

  # The priority is based upon order of creation: first created -> highest priority.
  # See how all your routes lay out with "rake routes".

  # You can have the root of your site routed with "root"
  # root 'welcome#index'

  # Example of regular route:
  #   get 'products/:id' => 'catalog#view'

  # Example of named route that can be invoked with purchase_url(id: product.id)
  #   get 'products/:id/purchase' => 'catalog#purchase', as: :purchase

  # Example resource route (maps HTTP verbs to controller actions automatically):
  #   resources :products

  # Example resource route with options:
  #   resources :products do
  #     member do
  #       get 'short'
  #       post 'toggle'
  #     end
  #
  #     collection do
  #       get 'sold'
  #     end
  #   end

  # Example resource route with sub-resources:
  #   resources :products do
  #     resources :comments, :sales
  #     resource :seller
  #   end

  # Example resource route with more complex sub-resources:
  #   resources :products do
  #     resources :comments
  #     resources :sales do
  #       get 'recent', on: :collection
  #     end
  #   end

  # Example resource route with concerns:
  #   concern :toggleable do
  #     post 'toggle'
  #   end
  #   resources :posts, concerns: :toggleable
  #   resources :photos, concerns: :toggleable

  # Example resource route within a namespace:
  #   namespace :admin do
  #     # Directs /admin/products/* to Admin::ProductsController
  #     # (app/controllers/admin/products_controller.rb)
  #     resources :products
  #   end
end
