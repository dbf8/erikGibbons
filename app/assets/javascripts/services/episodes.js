(function(){
  var episodesFactory = ['$http', function($http){
    var factory = {};

    function bustCache(url){
      var sep = url.indexOf('?') === -1 ? '?' : '&';
      return url + sep + '_=' + Date.now();
    }

    factory.getEpisodes = function(imdb_id, title){
      return $http.get(bustCache("api/episodes/" + imdb_id + "?title=" + encodeURIComponent(title)));
    }

    factory.getEpisodesBatch = function(params){
      return $http.get(bustCache("api/episodes_batch/" + params));
    }

    factory.getOmdbData = function(q){
      return $http.get(bustCache("api/omdb/" + q));
    }

    factory.getOmdbBatchData = function(q){
      return $http.get(bustCache("api/omdb_batch/" + q));
    }

    return factory;
  }];

  angular.module('TVCharts').factory('episodesFactory', episodesFactory);

}());
