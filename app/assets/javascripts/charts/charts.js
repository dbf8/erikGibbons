angular.module('TVCharts.Charts', [
  'ui.router',
  'templates',
  'ngMaterial',
  'ngMdIcons',
  'ui.bootstrap',
  'chart.js', // angular charts  
])

.config(['$stateProvider', function($stateProvider){
  $stateProvider
    .state('tvcharts.charts', {
      url: '/:query',
      views: {
        'main@': { // target the 'main' ng-view directive
          controller:  'ChartsCtrl as chartsCtrl',
          templateUrl: 'charts/charts.tmpl.html',
          reloadOnSearch: false,
          html5mode: true
        }
      }
    })
  }
])
  
.controller('ChartsCtrl', ['$q', '$uibModal', '$mdDialog', '$http', '$window', '$log', '$location', '$state', '$filter', '$timeout', '$document', '$scope', 'episodesFactory', function($q, $uibModal, $mdDialog, $http, $window, $log, $location, $state, $filter, $timeout, $document, $scope, episodesFactory){
  var chartsCtrl = this;
  chartsCtrl.get_trend = get_trend;
  chartsCtrl.organize_chart_data = organize_chart_data;
  chartsCtrl.imdbId = [];
  chartsCtrl.trends = true;
  chartsCtrl.episode_data = true;
  chartsCtrl.set_options = set_options;
  chartsCtrl.set_dataset_override = set_dataset_override;
  chartsCtrl.prevent_empty_switch = prevent_empty_switch;
  chartsCtrl.setOptSelect = setOptSelect;
  chartsCtrl.scrubDatasets = scrubDatasets;
  chartsCtrl.showHelp = showHelp;
  chartsCtrl.search = search;
  chartsCtrl.detectSearchInput = detectSearchInput;
  chartsCtrl.toggleTheme = toggleTheme;
  chartsCtrl.myCharts = {};
  chartsCtrl.loading = false;
  chartsCtrl.showCanvas = false;
  chartsCtrl.error_message = '';
  chartsCtrl.search_query = '';
  chartsCtrl.search_is_imdb = false;
  chartsCtrl.search_hint = 'Search by title, IMDb ID, or IMDb URL';
  chartsCtrl.summary_cards = [];
  chartsCtrl.series_list = [];
  chartsCtrl.datasets = [];
  chartsCtrl.labels = [];
  chartsCtrl.series_labels = [];
  chartsCtrl.chart_title = [];
  chartsCtrl.compType = 'norm';
  chartsCtrl.compNormType = 's-left';
  chartsCtrl.compSeasonAlign = 'left';
  chartsCtrl.compEpAlign = 'left';
  chartsCtrl.connectSeasons = true;
  chartsCtrl.fill = false;
  chartsCtrl.focusedScale = false;
  try {
    var storedTheme = $window.localStorage.getItem('tvcharts-theme');
    chartsCtrl.darkMode = storedTheme ? storedTheme == 'dark' : ($window.matchMedia && $window.matchMedia('(prefers-color-scheme: dark)').matches);
  } catch(e) {
    chartsCtrl.darkMode = false;
  }

  // comparison possibilities
  // 1. Normalization: full, season-left, season-right
  // 2. Season alignment: season-left, season-right // episode-left, episode-right
  // 3. Raw: episode-left, episode-right
  
  function showHelp(ev) {
    $mdDialog.show({
      template:
        '<md-dialog aria-label="Help">' +
          '<div style="background-color: #d0d0d0; padding: 16px 24px; text-align: center;">' +
            '<h2 style="margin: 0; font-weight: 500;">NOTES</h2>' +
          '</div>' +
          '<md-dialog-content style="padding: 16px 24px;">' +
            '<p>Shows that have never been searched before will take longer to load while scores are cached on a weekly basis.</p>' +
            '<br><br>' +
          '</md-dialog-content>' +
          '<md-dialog-actions style="justify-content: space-between; padding: 8px 16px;">' +
            // '<span style="font-size: 12px;">Data sourced from TMDB</span>' +
            '<md-button ng-click="closeDialog()" class="md-primary">Close</md-button>' +
          '</md-dialog-actions>' +
        '</md-dialog>',
      targetEvent: ev,
      clickOutsideToClose: true,
      controller: ['$scope', '$mdDialog', function($scope, $mdDialog) {
        $scope.closeDialog = function() { $mdDialog.hide(); };
      }]
    });
  }

  function init() {
    var query = $state.params['query'] || '';
    var shows = query.split(",");
    var paramsMap = shows.map(function(el){
      var imdb_id = null;
      var series = null;
      var year = null;
      if(el.match(/i=/)){
        imdb_id = el.match(/i=([^&]*)/)[1];
      }
      if(el.match(/t=/)){
        series = el.match(/t=([^&]*)/)[1];
        // The title is stored URI-encoded in the URL; decode back to the raw
        // title so it can be re-encoded cleanly when re-issued below.
        try { series = decodeURIComponent(series); } catch(e) { /* leave as-is if malformed */ }
      }
      if(el.match(/y=/)){
        year = el.match(/y=(\d{2,4})/)[1];
      }
      if(series != null || imdb_id != null){
        return [series, year, imdb_id]
      }
    }).filter(function(el){ return el != null; });
    if(paramsMap[0] != undefined){
      get_trend_from_url(paramsMap);
    }
  } // end of init
  
  init();
  
  /*********************
  *  Private functions *
  * *******************/

  function extractImdbId(value){
    var input = (value || '').trim();
    var directMatch = input.match(/^(tt\d{7,10})$/i);
    var urlMatch = input.match(/imdb\.com\/title\/(tt\d{7,10})/i);
    var match = directMatch || urlMatch;
    return match ? match[1].toLowerCase() : null;
  }

  function detectSearchInput(){
    var imdbId = extractImdbId(chartsCtrl.search_query);
    chartsCtrl.search_is_imdb = imdbId != null;
    chartsCtrl.search_hint = imdbId ? 'IMDb ID detected: ' + imdbId : 'Title search — year can help distinguish remakes';
    return imdbId;
  }

  function search(add){
    var query = (chartsCtrl.search_query || '').trim();
    if(!query || chartsCtrl.loading){ return; }

    var imdbId = extractImdbId(query);
    chartsCtrl.search_is_imdb = imdbId != null;
    chartsCtrl.error_message = '';
    get_trend(imdbId ? null : query, imdbId ? null : chartsCtrl.year, imdbId, add === true);
  }

  function toggleTheme(){
    chartsCtrl.darkMode = !chartsCtrl.darkMode;
    try {
      $window.localStorage.setItem('tvcharts-theme', chartsCtrl.darkMode ? 'dark' : 'light');
    } catch(e) { /* local storage may be unavailable */ }

    if(chartsCtrl.options_object){
      set_options(chartsCtrl.options_object);
      set_dataset_override(chartsCtrl.chart_title.length > 1);
    }
  }

  function setOptSelect(){
    if(chartsCtrl.compType == 's-align'){
      chartsCtrl.compType = 'norm';
    }
  }
  
  function prevent_empty_switch(hide){
    if(!chartsCtrl.trends && !chartsCtrl.episode_data){
      if(hide == 'trends'){
        chartsCtrl.episode_data = !chartsCtrl.episode_data;
      }else{
        chartsCtrl.trends = !chartsCtrl.trends;
      }
    }
  }

  // function returnError(){
  //   return [false, false, {}];
  // }
  
  function get_trend_from_url(arr){
    var canvas = document.getElementById('chart');
    chartsCtrl.loading = true;
    chartsCtrl.error_message = '';
    chartsCtrl.watch_link = [];
    var paramsArr = arr.map(function(el){
      if(!el[2]){
        var param = 't=' + encodeURIComponent(el[0]);
        if(el[1]){
          param += '&y=' + el[1];
        }
        return param
      }else{
        return 'i=' + el[2]
      }
    });

    episodesFactory.getOmdbBatchData(paramsArr.join("|"))
    .then(function(response){
      if(response.data[0].Response == "False"){
        chartsCtrl.loading = false;
        chartsCtrl.showCanvas = false;
        chartsCtrl.series_list = {};
        if(canvas){
          var ctx = canvas.getContext('2d');
          ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
        }
        chartsCtrl.error_message = 'We could not find that series. Check the title or IMDb ID and try again.';
        return false;
      }

      var episodeQuery = response.data.map(function(el){ return [el.imdbID, el.Title] });
      chartsCtrl.imdbId = episodeQuery.map(function(el){ return el[0] });
      chartsCtrl.chart_title = episodeQuery.map(function(el){ return [el[1], "https://www.justwatch.com/us/search?q=" + encodeURI(el[1])] });
      chartsCtrl.search_query = episodeQuery[0][1];
      detectSearchInput();
      
      // get actual episode data
      episodesFactory.getEpisodesBatch(episodeQuery.join("|"))
      .then(function(response){
        chartsCtrl.series_list = response.data;

        // draw chart
        organize_chart_data(chartsCtrl.series_list);
      });
    })
    ['catch'](function(err){
      $log.log('get_trend_from_url error: ' + err);
      chartsCtrl.loading = false;
      chartsCtrl.showCanvas = false;
      chartsCtrl.error_message = 'Something went wrong while loading the series. Please try again.';
    });
  }

  function get_trend(series, year, imdb_id, add) {
    var canvas = document.getElementById('chart');
    var existingSeries = chartsCtrl.series_list.slice ? chartsCtrl.series_list.slice() : [];
    var existingTitles = chartsCtrl.chart_title.slice();
    var existingIds = chartsCtrl.imdbId.slice();
    if(!add){
      // if this isn't an additive function, start over
      chartsCtrl.chart_title = [];
      chartsCtrl.watch_link = [];
      chartsCtrl.datasets = [];
      chartsCtrl.series_list = [];
      chartsCtrl.imdbId = [];
      chartsCtrl.showCanvas = false;
      // destroy existing chart via angular-chart.js event
      $scope.$broadcast('chart-destroy');
    }
    chartsCtrl.error_message = '';
    // set params
    var params;
    if(!imdb_id){
      params = 't=' + encodeURIComponent(series);
      if(year){
        params = params + '&y=' + year;
      }
    }else{
      params = 'i=' + imdb_id;
    }
    // set url based on params provided
    $window.history.pushState(null, 'TV Show Trends', '/' + [params, chartsCtrl.imdbId.map(function(el){ return 'i=' + el }).join(',')].filter(function(el){ return el; }).join(','));
    chartsCtrl.loading = true;

    // get imdb ID and clean title
    episodesFactory.getOmdbData(params)
    .then(function(response){
      if(response.data.Response == "False"){
        chartsCtrl.loading = false;
        chartsCtrl.error_message = 'We could not find that series. Check the title or IMDb ID and try again.';
        if(add){
          chartsCtrl.series_list = existingSeries;
          chartsCtrl.chart_title = existingTitles;
          chartsCtrl.imdbId = existingIds;
        }else{
          chartsCtrl.showCanvas = false;
          chartsCtrl.series_list = [];
        }
        if(canvas && !add){
          canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height);
        }
        return;
      }
      var resolvedImdbId = response.data.imdbID;
      chartsCtrl.imdbId.push(resolvedImdbId);
      var title = response.data.Title;
      chartsCtrl.chart_title.push([title, "https://www.justwatch.com/us/search?q=" + encodeURI(title)]);
      chartsCtrl.search_query = title;
      detectSearchInput();

      // get actual episode data
      return episodesFactory.getEpisodes(resolvedImdbId, title)
      .then(function(response){
        chartsCtrl.series_list.push(response.data);
        organize_chart_data(chartsCtrl.series_list);
      });
    })
    ['catch'](function(err) {
      $log.log('get_trend error: ' + err);
      chartsCtrl.loading = false;
      chartsCtrl.error_message = 'Something went wrong while loading the series. Please try again.';
      if(add){
        chartsCtrl.series_list = existingSeries;
        chartsCtrl.chart_title = existingTitles;
        chartsCtrl.imdbId = existingIds;
      }else{
        chartsCtrl.showCanvas = false;
        chartsCtrl.series_list = [];
      }
      if(canvas && !add){
        canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height);
      }
      if(!$scope.$$phase){ $scope.$apply(); }
    });
  }
  
  function set_options(opts){
    var seasons = opts['seasons'];
    var ep_data;
    if(chartsCtrl.connectSeasons){
      var shows = [...new Set(opts['ep_data'].flat().map(function(e){ return e['Show Title']; }) )];
      ep_data = [];
      opts['ep_data'].flat().forEach(function(e){
        var arr = ep_data[shows.indexOf(e['Show Title'])];
        if(!arr){
          ep_data.push([e]);
        }else{
          arr.push(e);
        }
      });
    }else{
      ep_data = opts['ep_data'];
    }

    var label_store;
    if(chartsCtrl.chart_title.length > 1){
      label_store = [];
      for(var i = 0; i < opts['label_store'].length; i++){
        label_store.push(i + 1);
      }
    }else{
      label_store = opts['label_store'];
    }
    var link_base = "https://www.imdb.com/title/";
    var ratings = ep_data.flat().map(function(e){ return parseFloat(e['imdbRating']); }).filter(function(rating){ return !isNaN(rating); });
    var lowestRating = ratings.length ? Math.min.apply(null, ratings) : 5;
    var axisMinimum = chartsCtrl.focusedScale ? (lowestRating < 5 ? Math.floor(lowestRating) : 5) : 0;
    var theme = chartsCtrl.darkMode ? {
      text: 'rgba(245,247,250,0.88)',
      muted: 'rgba(226,232,240,0.62)',
      grid: 'rgba(226,232,240,0.13)',
      tooltip: 'rgba(15,23,42,0.96)'
    } : {
      text: 'rgba(30,41,59,0.88)',
      muted: 'rgba(71,85,105,0.68)',
      grid: 'rgba(71,85,105,0.14)',
      tooltip: 'rgba(15,23,42,0.94)'
    };

    chartsCtrl.rating_axis_min = axisMinimum;
    
    chartsCtrl.options = {
      elements: {
        line: {
          fill: chartsCtrl.fill,
        }
      },
      legend: {
        display: true,
        labels: {
          fontColor: theme.text,
          generateLabels: function(chart){
            var theHelp = Chart.helpers;
            var data = chart.data;
            if (data.datasets.length) {
              return data.datasets.map(function(dataset, i) {
                var meta = chart.getDatasetMeta(i);
                var ds = data.datasets[i];
                var arc = meta.data[i];
                var custom = arc && arc.custom || {};
                var getValueAtIndexOrDefault = theHelp.getValueAtIndexOrDefault;
                var arcOpts = chart.options.elements.arc;
                var fill = custom.backgroundColor ? custom.backgroundColor : getValueAtIndexOrDefault(ds.backgroundColor, i, arcOpts.backgroundColor);
                var stroke = custom.borderColor ? custom.borderColor : getValueAtIndexOrDefault(ds.borderColor, i, arcOpts.borderColor);
                var bw = custom.borderWidth ? custom.borderWidth : getValueAtIndexOrDefault(ds.borderWidth, i, arcOpts.borderWidth);
                return {
                  // And finally : 
                  text: dataset.label,
                  fillStyle: fill,
                  strokeStyle: stroke,
                  lineWidth: bw,
                  hidden: chart.getDatasetMeta(i).hidden,
                  datasetIndex: i
                };
              });
            }
            return [];
          },
          filter: function(legendItem, chartData){
            if(legendItem.text.indexOf(' trend') == -1){
              return true;
            }
          }
        },
        onClick: function(e, legendItem){
          var index = legendItem.datasetIndex;
          var ci = this.chart;
          // get dataset
          var meta = ci.getDatasetMeta(index);
          // get associated trend dataset
          var metaTrend = ci.getDatasetMeta(index + 1);
          
          // hide/unhide dataset
          if(chartsCtrl.episode_data){
            meta.hidden = meta.hidden === null ? !ci.data.datasets[index].hidden : null;
          }else{
            meta.hidden = true;
          }
          // hide/unhide associated trend dataset
          if(chartsCtrl.trends){
            if(metaTrend){
              metaTrend.hidden = metaTrend.hidden === null ? !ci.data.datasets[index + 1].hidden : null;
            }
          }else{
            if(metaTrend){ metaTrend.hidden = true; }
          }
          
          ci.update();
        },
      },
      hover: {
        mode: 'single'
      },
			tooltips: {
			  mode: 'single',
        backgroundColor: theme.tooltip,
        titleFontColor: 'rgba(255,255,255,0.96)',
        bodyFontColor: 'rgba(255,255,255,0.92)',
        callbacks: {
          title: function(tooltipItem) {
            if(tooltipItem[0] != undefined){
              return "Season " + ep_data[tooltipItem[0].datasetIndex / 2][tooltipItem[0].index]["season"] + ' Episode ' + ep_data[tooltipItem[0].datasetIndex / 2][tooltipItem[0].index]["Episode"];
            }else{
              return "";
            }
          },
          beforeLabel: function(tooltipItem){
            if((tooltipItem.datasetIndex % 2) == 0){
              return "Title: " + ep_data[tooltipItem.datasetIndex / 2][tooltipItem.index]["Title"];
            }else{
              return "";
            }
          },
          label: function(tooltipItem){
            if((tooltipItem.datasetIndex % 2) == 0){
              return "Score: " + ep_data[tooltipItem.datasetIndex / 2][tooltipItem.index]["imdbRating"];
            }else{
              return "";
            }
          },
          afterLabel: function(tooltipItem){
            if((tooltipItem.datasetIndex % 2) == 0){
              var released = ep_data[tooltipItem.datasetIndex / 2][tooltipItem.index]["Released"];
              return "Aired: " + (released || "Unknown");
            }else{
              return "";
            }
          }
        },
        filter: function(tooltipItem, data){
          if((tooltipItem.datasetIndex % 2) == 0){
            return true;
          }
        }
      },
      maintainAspectRatio: false,
      responsive: true,
      scales: { 
        xAxes: [{ 
          type: 'linear', 
          position: 'bottom',
          ticks: {
            autoSkip: true,
            autoSkipPadding: 0,
            maxRotation: 75,
            minRotation: 25,
            stepSize: 1,
            fontColor: theme.muted,
            userCallback: function(label, index, labels){
              return label_store[label];
            }
          },
          gridLines: { color: theme.grid }
        }],
        yAxes: [{
          scaleLabel: {
            display: true,
            labelString: "IMDb rating",
            fontColor: theme.muted
          },
          ticks: {
            min: axisMinimum,
            max: 10,
            stepSize: axisMinimum < 3 ? 2 : 1,
            fontColor: theme.muted
          },
          gridLines: { color: theme.grid }
        }]
      },
      onClick: function(ev, el){
        var el = el[0];
        // if not clicking on an element
        if(!el || (el._datasetIndex % 2) == 1){ return; }
        var ep_url = 
        ep_data[el._datasetIndex / 2][el._index]["imdbId"];
        $window.open(link_base + ep_url, '_blank');
      }
    };
  }
  
  function set_dataset_override(multi){
    var opts = chartsCtrl.options_object;

    // ignore if opts isn't set yet
    if(opts == null){
      return true;
    }
    var series_labels;
    if(chartsCtrl.connectSeasons){
      series_labels = [...new Set(opts['ep_data'].map(function(e){ return e[0]['Show Title']; }) )];
    }else{
      series_labels = opts['series_labels'];
    }
    var colors = opts['colors'];
    
    chartsCtrl.dataset_override = [];

    var i = 0;
    // handle seasons with one single episode
    chartsCtrl.datasets = chartsCtrl.datasets.filter(function(e){ return e.length > 0 });

    var titles = chartsCtrl.datasets.filter(function(e){ return e[0]['type'] == "ep"; }).map(function(e){ return e[0]['show']; });
    var titlesUniq = [...new Set(titles)];
    series_labels.forEach(function(s){
      var colorIndex = multi ? titlesUniq.indexOf(titles[i]) : series_labels.indexOf(s);
      var color = colors[Math.max(0, colorIndex)] || colors[0];
      chartsCtrl.dataset_override.push(
        {
          label: s,
          borderWidth: 2,
          type: "line",
          borderColor: color.replace("1)", "0.88)"),
          backgroundColor: color.replace("1)", "0.10)"),
          pointBorderColor: color.replace("1)", "0.9)"),
          pointBackgroundColor: color.replace("1)", "0.9)"),
          pointHoverBorderColor: color,
          pointHoverBackgroundColor: color,
          fill: chartsCtrl.fill,
          hidden: !chartsCtrl.episode_data
        },{
          label: s + " trend",
          borderWidth: 2,
          type: 'line',
          borderDash: [10,5],
          borderColor: chartsCtrl.episode_data ? color.replace("1)", "0.58)") : color.replace("1)", "0.9)"),
          backgroundColor: 'transparent',
          pointRadius: 0,
          pointHoverRadius: 0,
          fill: false,
          hidden: !chartsCtrl.trends
        }
      );
      i++;
    });
  }

  function scrubDatasets(datasets){
    // datasets is fully flattened (shows, seasons, episodes, all listed in an array)
    // separate shows
    shows = [...new Set(datasets.map(function(e){ return e['show'] }) )]
    groups = [];
    for(var i = 0; i < shows.length; i++){
      groups.push([]);
    }

    datasets.filter(function(e){ return e['type'] == "ep" }).forEach(function(d){
      show = groups[shows.indexOf(d['show'])]
      if(chartsCtrl.connectSeasons){
        season = show[0]
        if(!season){
          show.push([d])
        }else{
          season.push(d);
        }
      }else{
        season = show[parseInt(d['season']) - 1];
        if(!season){
          show.push([d])
        }else{
          season.push(d);
        }
      }
    })

    // reset x vals
    dataLengths = groups.map(function(g){ return g.flat().length })
    maxLength = Math.max(...dataLengths);
    flatGroups = groups.map(function(g){ return g.flat() });
    for(var i = 0; i < maxLength; i++){
      flatGroups.forEach(function(g){
        if(g[i]){
          g[i]['x'] = i;
        }
      })
    }

    function secondMax(arr){ 
      var max = Math.max.apply(null, arr), // get the max of the array
          maxi = arr.indexOf(max);
      arr[maxi] = -Infinity; // replace max in the array with -infinity
      var secondMax = Math.max.apply(null, arr); // get the new max 
      arr[maxi] = max;
      return secondMax;
    };

    switch(chartsCtrl.compType){
      case 'norm':
        switch(chartsCtrl.compNormType){
          case 'full':
            // full
            lengths = groups.map(function(e){ l = e[e.length - 1]; return e[e.length - 1][l.length - 1]['x'] });
            maxLength = Math.max(...lengths);
            for(var i = 0; i < groups.length; i++){
              if(lengths[i] == maxLength){
                continue;
              }
              ratio = maxLength/lengths[i];
              groups[i].forEach(function(s){ s.forEach(function(e) { e['x'] = e['x'] * ratio }) });
            }
            break;
          case 's-left':
            // s-left
            // get number of seasons that need to be normalized
            sCounts = groups.map(function(e){ return e.length })
            nTimes = secondMax(sCounts);
            // set trailing x value of last modified episode
            sIndex = 0;

            // normalize for all overlapping seasons
            for(var i = 0; i < nTimes; i++){
              // get i-th season for each show
              seasons = groups.map(function(show){ return show[i] });

              // get the length of the season being normalized to
              sLengths = seasons.map(function(season){ if(season){ return season.length }else{ return 0 } })
              sLengthMaxIx = sLengths.indexOf(Math.max(...sLengths))
              compLength = seasons[sLengthMaxIx].length
              for(var j = 0; j < seasons.length; j++){
                if(!seasons[j]){
                  continue;
                }
                if(j == sLengthMaxIx){
                  seasons[j].forEach(function(s){
                    s['x'] = seasons[j].indexOf(s) + sIndex;
                  })
                }else{
                  ratio = (compLength - 1)/(seasons[j].length - 1);
                  // get starting x point for normalization
                  seasons[j].forEach(function(s){ 
                    s['x'] = seasons[j].indexOf(s) * ratio + sIndex;
                  })
                }
              }
              sIndex += compLength
            }

            // ensure that this only runs when a comparison show needs non-normalized space
            if(groups.length > 1 && Math.max(...sCounts) - nTimes > 0){
              // fix indices of non-overlapping-season episodes
              maxSeasonShowIx = sCounts.indexOf(Math.max(...sCounts));
              // index at which set of non-overlapping episodes starts
              soloStartIx = groups[maxSeasonShowIx][nTimes][0]['x'];
              groups[maxSeasonShowIx].slice(nTimes).forEach(function(season){
                season.forEach(function(ep){
                  ep['x'] += sIndex - soloStartIx;
                });
              });
            }

            break;
          case 's-right':
            // s-right

            // get number of seasons that need to be normalized
            sCounts = groups.map(function(e){ return e.length })
            sCountMax = Math.max(...sCounts);
            nTimes = secondMax(sCounts);
            // set trailing x value of last modified episode
            lastEpIx = 0;
            sIndex = 0;

            // normalize for all overlapping seasons
            for(var i = sCountMax; i > 0; i--){
              // get i-th season from the end for each show
              seasons = groups.map(function(show){ return show[show.length - i] });
              relSeasons = seasons.filter(function(s){ return s })

              // get the length of the season being normalized to
              sLengths = relSeasons.map(function(season){ return season.length });
              sLengthMaxIx = sLengths.indexOf(Math.max(...sLengths))
              compLength = relSeasons[sLengthMaxIx].length
              for(var j = 0; j < relSeasons.length; j++){
                ratio = (compLength - 1)/(relSeasons[j].length - 1);
                relSeasons[j].forEach(function(s){ 
                  s['x'] = relSeasons[j].indexOf(s) * ratio + sIndex;
                })
                // get starting x point for next normalization
                if(j == relSeasons.length - 1){
                  sIndex += compLength
                }
              }
            }
            break;
          default:
            // default
        }
        break;
      case 's-align':
        if(chartsCtrl.compSeasonAlign == "left"){
          if(chartsCtrl.compEpAlign == "left"){
            // s-l, e-l
            // get number of seasons that need to be aligned
            sCounts = groups.map(function(e){ return e.length })
            nTimes = Math.max(...sCounts);

            // instantiate alignTarget
            var alignTarget = 0;
            var acc = 0;

            for(var i = 0; i < nTimes; i++){
              // get i-th season for each show
              seasons = groups.map(function(show){ return show[i] });
              // set alignTarget and get max length for accumulator
              alignTarget = alignTarget + acc;
              acc = Math.max(...seasons.map(function(e){ if(!e){ return 0 }else{ return e.length } }) );
              // alignTarget = alignTarget + Math.max(...seasons.map(function(e){ if(!e) { return 0 }else{ return e.length } }) );
              for(var j = 0; j < seasons.length; j++){
                if(!seasons[j] || seasons[j][0] == alignTarget){
                  continue;
                }
                offset = seasons[j][0]['x'] - alignTarget;
                seasons[j].forEach(function(s){ s['x'] = s['x'] - offset })
              }
            }
          }else{
            // s-l, e-r
            sCounts = groups.map(function(e){ return e.length })
            nTimes = Math.max(...sCounts);

            // instantiate alignTarget
            var alignTarget = 0;

            for(var i = 0; i < nTimes; i++){
              // get i-th season for each show
              seasons = groups.map(function(show){ return show[i] });
              // get index of highest last x
              if(i == 0){
                alignTarget = alignTarget + Math.max(...seasons.map(function(e){ if(!e){ return 0 }else{ return e.length - 1 } }) );
              }else{
                acc = Math.max(...seasons.map(function(e){ if(!e){ return 0 }else{ return e.length } }) );
                alignTarget = alignTarget + acc
              }
              for(var j = 0; j < seasons.length; j++){
                if(!seasons[j] || seasons[j][seasons[j].length - 1]['x'] == alignTarget){
                  continue;
                }
                offset = alignTarget - seasons[j][seasons[j].length - 1]['x'];
                seasons[j].forEach(function(s){ s['x'] = s['x'] + offset })
              }
            }
          }
        }else{
          if(chartsCtrl.compEpAlign == "left"){
            // s-r, e-l
            // get number of seasons that need to be aligned
            sCounts = groups.map(function(e){ return e.length })
            sCountMax = Math.max(...sCounts);
            nStart = sCountMax - secondMax(sCounts);

            // instantiate alignTarget
            var alignTarget;
            var acc;

            for(var i = nStart; i < sCountMax; i++){
              // get i-th season for each show
              seasons = groups.map(function(show){ return show[show.length - (sCountMax - i)] });
              // set alignTarget and get max length for accumulator
              if(i == nStart){
                alignTarget = Math.max(...seasons.map(function(e){ if(!e){ return 0 }else{ return e[0]['x'] } }) );
              }else{
                alignTarget = alignTarget + acc;
              }
              acc = Math.max(...seasons.map(function(e){ if(!e){ return 0 }else{ return e.length } }) );
              for(var j = 0; j < seasons.length; j++){
                if(!seasons[j] || seasons[j][0] == alignTarget){
                  continue;
                }
                offset = seasons[j][0]['x'] - alignTarget;
                seasons[j].forEach(function(s){ s['x'] = s['x'] - offset })
              }
            }
          }else{
            // s-r, e-r
            // get number of seasons that need to be aligned
            sCounts = groups.map(function(e){ return e.length })
            sCountMax = Math.max(...sCounts);
            nStart = sCountMax - secondMax(sCounts);

            // instantiate alignTarget
            var alignTarget;

            for(var i = nStart; i < sCountMax; i++){
              // get i-th season for each show
              seasons = groups.map(function(show){ return show[show.length - (sCountMax - i)] });
              // set alignTarget and get max length for accumulator
              if(i == nStart){
                alignTarget = Math.max(...seasons.map(function(e){ if(!e){ return 0 }else{ return e[e.length - 1]['x'] } }) );
              }else{
                acc = Math.max(...seasons.map(function(e){ if(!e){ return 0 }else{ return e.length } }) );
                alignTarget = alignTarget + acc;
              }
              for(var j = 0; j < seasons.length; j++){
                if(!seasons[j] || seasons[j][0] == alignTarget){
                  continue;
                }
                offset = alignTarget - seasons[j][seasons[j].length - 1]['x'];
                seasons[j].forEach(function(s){ s['x'] = s['x'] + offset })
              }
            }
          }
        }
        break;
      case 'raw':
        if(chartsCtrl.compEpAlign == "left"){
          // left
          lengths = groups.map(function(e){ return e[0][0]['x'] });
          minLength = Math.min(...lengths);
          for(var i = 0; i < groups.length; i++){
            if(lengths[i] == minLength){
              continue
            }
            offset = lengths[i] - minLength;
            groups[i].forEach(function(s){ s.forEach(function(e) { e['x'] = e['x'] - offset }) });
          }
        }else{
          // right
          lengths = groups.map(function(e){ l = e[e.length - 1]; return e[e.length - 1][l.length - 1]['x'] });
          maxLength = Math.max(...lengths);
          for(var i = 0; i < groups.length; i++){
            if(lengths[i] == maxLength){
              continue
            }
            offset = maxLength - lengths[i];
            groups[i].forEach(function(s){ s.forEach(function(e) { e['x'] = e['x'] + offset }) });
          }
        }
        break;
      default:
        // default
    }

    trends = groups.map(function(e){ return e.map(function(s){ return getBestFit(s) }) }).flat();
    groups = groups.flat();
    output = []
    for(var i = 0; i < groups.length; i++){
      output.push(groups[i]);
      output.push(trends[i]);
    }

    chartsCtrl.datasets = output

    if(chartsCtrl.chart_title.length > 1){
      chartsCtrl.colors = getColors(chartsCtrl.chart_title.length, false);
    }else{
      chartsCtrl.colors = getColors(groups.length, true);
    }

    chartsCtrl.set_options(chartsCtrl.options_object);
    chartsCtrl.set_dataset_override(chartsCtrl.chart_title.length > 1);

    return output;
  }

  function getBestFit(data) {
    show = data[0]['show'];
    // remove null data
    data = data.filter(function(obj){
      if(!isNaN(obj['y'])){
        return true;
      }
    });

    var xData = data.map(function(v,k){ return v['x'] });
    // var yData = data.map(function(v,k){ return v['y'] });

    var rV = {},
      N = data.length,
      sumX = 0,
      sumY = 0,
      sumXx = 0,
      sumYy = 0,
      sumXy = 0;

    // can't fit with 0 or 1 point
    if (N < 2) {
      return rV;
    }

    for (var i = 0; i < N; i++) {
      var x = data[i]['x'],
        y = data[i]['y'];
      sumX += x;
      sumY += y;
      sumXx += (x * x);
      sumYy += (y * y);
      sumXy += (x * y);
    }

    // calc slope and intercept
    rV['slope'] = ((N * sumXy) - (sumX * sumY)) / (N * sumXx - (sumX * sumX));
    rV['intercept'] = (sumY - rV['slope'] * sumX) / N;

    var xMin = Math.min(...xData);
    var xMax = Math.max(...xData);

    var yLeft = rV['intercept'] + xMin * rV['slope'];
    var yRight = rV['intercept'] + xMax * rV['slope'];

    return [{x: xMin, y: yLeft, type: "trend", show: show }, {x: xMax, y: yRight, type: "trend", show: show }];
  }

  function getColors(n, rnd){
    // function to generate static random color scheme
    function hslToRgb(h, s, l){
      // function to convert hsl color to rgb
      var r, g, b;
  
      if(s == 0){
        r = g = b = l; // achromatic
      }else{
        var hue2rgb = function hue2rgb(p, q, t){
          if(t < 0) t += 1;
          if(t > 1) t -= 1;
          if(t < 1.0/6) return p + (q - p) * 6 * t;
          if(t < 1.0/2) return q;
          if(t < 2.0/3) return p + (q - p) * (2.0/3 - t) * 6;
          return p;
        }

        var q = l < 0.5 ? l * (1 + s) : l + s - l * s;
        var p = 2 * l - q;
        r = hue2rgb(p, q, h + 1.0/3);
        g = hue2rgb(p, q, h);
        b = hue2rgb(p, q, h - 1.0/3);
      }
      
      return "rgba(" + String(Math.round(r * 255)) + "," + String(Math.round(g * 255)) + "," + String(Math.round(b * 255)) + ",1)";
    }
    
    var colors = [];
    // cycle through and create colors
    if(n < 1) { return [hslToRgb(1.0, 1.0, .7)] }
    for(var i = 0; i < n; i++){
      colors.push(hslToRgb((i * (360.0 / n) % 360)/360.0,1.0,.4));
    }

    return colors;
  }

  function updateSummaryCards(raw){
    var stats = raw.map(function(series, seriesIndex){
      var episodes = [];
      Object.keys(series).sort(function(a, b){ return parseInt(a) - parseInt(b); }).forEach(function(season){
        series[season].forEach(function(episode){
          var rating = parseFloat(episode['imdbRating']);
          if(isNaN(rating)){ return; }
          episodes.push({
            rating: rating,
            title: episode['Title'],
            season: season,
            episode: episode['Episode']
          });
        });
      });

      if(!episodes.length){ return null; }
      var total = episodes.reduce(function(sum, episode){ return sum + episode.rating; }, 0);
      var highest = episodes.reduce(function(best, episode){ return episode.rating > best.rating ? episode : best; }, episodes[0]);
      return {
        title: chartsCtrl.chart_title[seriesIndex] ? chartsCtrl.chart_title[seriesIndex][0] : 'Series ' + (seriesIndex + 1),
        average: total / episodes.length,
        highest: highest,
        first: episodes[0].rating,
        last: episodes[episodes.length - 1].rating,
        count: episodes.length
      };
    }).filter(function(stat){ return stat != null; });

    if(!stats.length){
      chartsCtrl.summary_cards = [];
      return;
    }

    if(stats.length == 1){
      var stat = stats[0];
      var delta = stat.last - stat.first;
      var direction = delta > 0.15 ? 'Rising' : (delta < -0.15 ? 'Falling' : 'Steady');
      chartsCtrl.summary_cards = [
        { label: 'Series average', value: stat.average.toFixed(1), context: stat.count + ' rated episodes' },
        { label: 'Highest rated', value: stat.highest.rating.toFixed(1), context: (stat.highest.title || ('S' + stat.highest.season + ' E' + stat.highest.episode)) },
        { label: 'Overall trend', value: direction, context: (delta >= 0 ? '+' : '') + delta.toFixed(1) + ' premiere to finale' }
      ];
      return;
    }

    var averages = stats.map(function(stat){ return stat.average; });
    var finales = stats.map(function(stat){ return stat.last; });
    var leader = stats.reduce(function(best, stat){ return stat.average > best.average ? stat : best; }, stats[0]);
    chartsCtrl.summary_cards = [
      { label: 'Average gap', value: (Math.max.apply(null, averages) - Math.min.apply(null, averages)).toFixed(1), context: 'rating points' },
      { label: 'Higher average', value: leader.title, context: leader.average.toFixed(1) + ' average rating' },
      { label: 'Finale gap', value: (Math.max.apply(null, finales) - Math.min.apply(null, finales)).toFixed(1), context: 'rating points' }
    ];
  }

  function organize_chart_data(raw){
    // raw = [{ 1: [{...}, {...}], 2: [{...}, {...}] }]
    var seasons = []
    var series_labels = []
    var label_store = []
    var datasets = []
    var ep_data = []

    // reset data
    chartsCtrl.datasets = [];
    chartsCtrl.series_labels = [];
    
    raw.forEach(function(series){
      // scrub raw to make sure we're not trying to get null data
      for(var season in series){
        if(series[season].length == 0){
          delete series[season];
        }
      }
      var seasons_i = Object.keys(series).sort(function(a, b){ return parseInt(a) - parseInt(b); });
      var series_labels_i = [];
      var label_store_i = [];
      var datasets_i = [];
      var ep_data_i = [];
      // create an empty dataset for each season
      seasons_i.forEach(function(){
        // push in two empty datasets (one for data, one for trendline) and an empty episode data array
        datasets_i.push([]);
        datasets_i.push([]);
        ep_data_i.push([]);
      });

      // for each season
      var i = 0;
      seasons_i.forEach(function(s){
        var season_ix = seasons_i.indexOf(s);
        var aired_in_season = 0;
        // for each episode
        series[s].forEach(function(e){
          // Only skip episodes with a KNOWN, future air date. Every episode here
          // has an IMDb rating, so it aired; OMDB simply lacks air dates for some
          // (often older/obscure) titles, and a missing date must not hide a
          // rated episode from the chart.
          var airDate = e['Released'] ? new Date(e['Released']) : null;
          if (airDate && !isNaN(airDate.getTime()) && airDate > new Date()) { return; }

          label_store_i.push("S" + s.padStart(2, '0') + "E" + e.Episode.padStart(2, '0'));
          // season_ix * 2 because each season has two datasets (ep_data and best fit)
          datasets_i[season_ix * 2].push({ x: i, y: parseFloat(e['imdbRating']), type: "ep", show: e['Show Title'], season: s, episode: e.Episode });

          e['season'] = s;
          ep_data_i[season_ix].push(e);
          i++;
          aired_in_season++;
          // push in imdb rating value if correct dataset -- otherwise, push NaN
        });
        // Only label seasons that actually produced data. Seasons with no aired
        // episodes have their dataset filtered out below, so labeling them would
        // leave series_labels longer than the dataset list and desync the color
        // indexing in set_dataset_override (colors[undefined] -> crash).
        if(aired_in_season > 0){
          series_labels_i.push("Season " + s.padStart(2, '0'));
        }
      });
      
      // remove any seasons with empty data
      datasets_i = datasets_i.filter(function(arr){
        return arr[0] != null;
      });
      // Keep ep_data aligned with the filtered datasets. A season that produced
      // no aired episodes (e.g. air dates temporarily unavailable) leaves an
      // empty ep_data slot; dropping it in lockstep prevents the datasetIndex/2
      // lookups from desyncing (which surfaces as "undefined" legend entries and
      // mismatched trend-line colors on later seasons).
      ep_data_i = ep_data_i.filter(function(arr){
        return arr.length > 0;
      });
      
      // dataset = [[{ x, y },{...}], [ { best fit x, y } ], [{..}]] // alternates: dataset[0] is array of episode data, dataset[1] is array of best fit for dataset[0]
      chartsCtrl.datasets = chartsCtrl.datasets.concat(datasets_i).flat();
      seasons = seasons.concat(seasons_i);
      ep_data = ep_data.concat(ep_data_i);
      label_store = label_store.concat(label_store_i);
      series_labels = series_labels.concat(series_labels_i);
    });

    chartsCtrl.series_labels = series_labels;

    // Connected seasons create one continuous episode line and one distinct
    // full-series trendline per show, which is the clearest comparison view.
    if(raw.length > 1){ chartsCtrl.connectSeasons = true; }

    if(chartsCtrl.chart_title.length > 1){
      chartsCtrl.colors = getColors(chartsCtrl.chart_title.length, false);
    }else{
      chartsCtrl.colors = getColors(series_labels.length, true);
    }

    // { season #, {title, release, ep#, rating, id}, "S##E##", "Season ##", colors}
    chartsCtrl.options_object = { seasons: seasons, ep_data: ep_data, label_store: label_store, series_labels: series_labels, colors: chartsCtrl.colors, multi: raw.length > 1 ? true : false };
    chartsCtrl.datasets = scrubDatasets(chartsCtrl.datasets.flat());
    updateSummaryCards(raw);
    chartsCtrl.loading = false;
    chartsCtrl.showCanvas = true;
    // window.history.pushState('/abcdef', 'Title', '/' + chartsCtrl.imdbId.map(function(el){ return 'i=' + el }).join(','));
  } 
}]);
