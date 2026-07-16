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
  chartsCtrl.myCharts = {};
  chartsCtrl.loading = false;
  chartsCtrl.showCanvas = false;
  chartsCtrl.series_list = [];
  chartsCtrl.datasets = [];
  chartsCtrl.labels = [];
  chartsCtrl.series_labels = [];
  chartsCtrl.chart_title = [];
  chartsCtrl.compType = 'norm';
  chartsCtrl.compNormType = 's-left';
  chartsCtrl.compSeasonAlign = 'left';
  chartsCtrl.compEpAlign = 'left';
  chartsCtrl.connectSeasons = false;
  chartsCtrl.fill = true;

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
            '<p>Shows that have never been searched before will take longer to load while IMDb IDs are gathered.</p>' +
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
    var shows = $state.params['query'].split(",")
    paramsMap = shows.map(function(el){
      imdb_id = null;
      series = null;
      year = null;
      if(el.match(/i=/)){
        imdb_id = el.match(/i=([^&]*)/)[1];
      }
      if(el.match(/t=/)){
        series = el.match(/t=([^&]*)/)[1];
      }
      if(el.match(/y=/)){
        year = el.match(/y=(\d{2,4})/)[1];
      }
      if(series != null || imdb_id != null){
        return [series, year, imdb_id]
      }
    });
    if(paramsMap[0] != undefined){
      get_trend_from_url(paramsMap);
    }
  } // end of init
  
  init();
  
  /*********************
  *  Private functions *
  * *******************/

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
    chartsCtrl.watch_link = [];
    paramsArr = arr.map(function(el){
      if(!el[2]){
        param = 't=' + encodeURI(el[0])
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
        // [chartsCtrl.loading, chartsCtrl.showCanvas, chartsCtrl.series_list] = returnError()
        if(canvas){
          var ctx = canvas.getContext('2d');
          ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height)
        }
        chartsCtrl.chart_title.push(["Series not found", "#"]);
        return false;
      }

      episodeQuery = response.data.map(function(el){ return [el.imdbID, el.Title] });
      chartsCtrl.imdbId = episodeQuery.map(function(el){ return el[0] });
      chartsCtrl.chart_title = episodeQuery.map(function(el){ return [el[1], "https://www.justwatch.com/us/search?q=" + encodeURI(el[1])] });
      
      // get actual episode data
      episodesFactory.getEpisodesBatch(episodeQuery.join("|"))
      .then(function(response){
        chartsCtrl.series_list = response.data

        // draw chart
        organize_chart_data(chartsCtrl.series_list);
      })
    });
  }

  function get_trend(series, year, imdb_id, add) {
    var canvas = document.getElementById('chart');
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
    // set params
    if(!imdb_id){
      var params = 't=' + encodeURI(series);
      if(year){
        params = params + '&y=' + year;
      }
    }else{
      var params = 'i=' + imdb_id;
    }
    // set url based on params provided
    window.history.pushState('abcdef', 'Title', '/' + [params, chartsCtrl.imdbId.map(function(el){ return 'i=' + el }).join(',')].filter(function(el){ return el }).join(','));
    chartsCtrl.loading = true;

    // get imdb ID and clean title
    episodesFactory.getOmdbData(params)
    .then(function(response){
      if(response.data.Response == "False"){
        chartsCtrl.loading = false;
        chartsCtrl.showCanvas = false;
        chartsCtrl.series_list = [];
        if(canvas){
          canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height);
        }
        chartsCtrl.chart_title.push(["Series not found", "#"]);
        return;
      }
      var imdb_id = response.data.imdbID;
      chartsCtrl.imdbId.push(imdb_id);
      var title = response.data.Title;
      chartsCtrl.chart_title.push([title, "https://www.justwatch.com/us/search?q=" + encodeURI(title)]);

      // get actual episode data
      return episodesFactory.getEpisodes(imdb_id, title)
      .then(function(response){
        chartsCtrl.series_list.push(response.data);
        organize_chart_data(chartsCtrl.series_list);
      });
    })
    ['catch'](function(err) {
      $log.log('get_trend error: ' + err);
      chartsCtrl.loading = false;
      chartsCtrl.showCanvas = false;
      chartsCtrl.series_list = [];
      if(canvas){
        canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height);
      }
      chartsCtrl.chart_title.push(["Error loading series data", "#"]);
      if(!$scope.$$phase){ $scope.$apply(); }
    });
  }
  
  function set_options(opts){
    var seasons = opts['seasons'];
    if(chartsCtrl.connectSeasons){
      shows = [...new Set(opts['ep_data'].flat().map(function(e){ return e['Show Title'] }) )];
      var ep_data = [];
      opts['ep_data'].flat().forEach(function(e){
        var arr = ep_data[shows.indexOf(e['Show Title'])]
        if(!arr){
          ep_data.push([e]);
        }else{
          arr.push(e);
        }
      })
    }else{
      var ep_data = opts['ep_data'];
    }

    if(chartsCtrl.chart_title.length > 1){
      var label_store = []
      for(var i = 0; i < opts['label_store'].length; i++){
        label_store.push(i)
      }
    }else{
      var label_store = opts['label_store'];
    }
    var link_base = "https://www.imdb.com/title/";
    
    chartsCtrl.options = {
      elements: {
        line: {
          fill: chartsCtrl.fill,
        }
      },
      legend: {
        display: true,
        labels: {
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
            if(legendItem.text != "trend"){
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
            metaTrend.hidden = metaTrend.hidden === null ? !ci.data.datasets[index + 1].hidden : null;
          }else{
            metaTrend.hidden = true;
          }
          
          ci.update();
        },
      },
      hover: {
        mode: 'single'
      },
			tooltips: {
			  mode: 'single',
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
              return "Aired: " + ep_data[tooltipItem.datasetIndex / 2][tooltipItem.index]["Released"];
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
            userCallback: function(label, index, labels){
              return label_store[label];
            }
          }
        }],
        yAxes: [{
          scaleLabel: {
            display: true,
            labelString: "IMDB Rating"
          },
          ticks: {
            min: 0,
            max: 10
          }
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
    opts = chartsCtrl.options_object;

    // ignore if opts isn't set yet
    if(opts == null){
      return true;
    }
    if(chartsCtrl.connectSeasons){
      var series_labels = [...new Set(opts['ep_data'].map(function(e){ return e[0]['Show Title'] }) )];
    }else{
      var series_labels = opts['series_labels'];
    }
    var colors = opts['colors'];
    
    chartsCtrl.dataset_override = [];

    i = 0;
    // handle seasons with one single episode
    chartsCtrl.datasets = chartsCtrl.datasets.filter(function(e){ return e.length > 0 });

    titles = chartsCtrl.datasets.filter(function(e){ return e[0]['type'] == "ep" }).map(function(e){ return e[0]['show'] });
    titlesUniq = [...new Set(titles)]
    series_labels.forEach(function(s){
      chartsCtrl.dataset_override.push(
        {
          label: s,
          borderWidth: 2,
          type: "line",
          borderColor: colors[multi ? titlesUniq.indexOf(titles[i]) : series_labels.indexOf(s)].replace("1)", "0.8)"),
          backgroundColor: colors[multi ? titlesUniq.indexOf(titles[i]) : series_labels.indexOf(s)].replace("1)", "0.1)"),
          pointBorderColor: colors[multi ? titlesUniq.indexOf(titles[i]) : series_labels.indexOf(s)].replace("1)", "0.8)"),
          pointBackgroundColor: colors[multi ? titlesUniq.indexOf(titles[i]) : series_labels.indexOf(s)].replace("1)", "0.8)"),
          pointHoverBorderColor: colors[multi ? titlesUniq.indexOf(titles[i]) : series_labels.indexOf(s)].replace("1)", "0.8)"),
          pointHoverBackgroundColor: colors[multi ? titlesUniq.indexOf(titles[i]) : series_labels.indexOf(s)].replace("1)", "0.8)"),
          hidden: !chartsCtrl.episode_data
        },{
          label: "trend",
          borderWidth: 1,
          type: 'line',
          borderDash: [10,5],
          borderColor: chartsCtrl.episode_data ? colors[multi ? titlesUniq.indexOf(titles[i]) : series_labels.indexOf(s)].replace("1)", "0.4)") : colors[multi ? titlesUniq.indexOf(titles[i]) : series_labels.indexOf(s)].replace("opac", "0.8"), // light trendlines unless only trendlines are being shown
          backgroundColor: colors[multi ? titlesUniq.indexOf(titles[i]) : series_labels.indexOf(s)].replace("1)", "0.1)"),
          pointBorderColor: colors[multi ? titlesUniq.indexOf(titles[i]) : series_labels.indexOf(s)].replace("1)", "0.5)"),
          pointBackgroundColor: colors[multi ? titlesUniq.indexOf(titles[i]) : series_labels.indexOf(s)].replace("1)", "0.2)"),
          pointHoverBorderColor: colors[multi ? titlesUniq.indexOf(titles[i]) : series_labels.indexOf(s)].replace("1)", "0.5)"),
          pointHoverBackgroundColor: colors[multi ? titlesUniq.indexOf(titles[i]) : series_labels.indexOf(s)].replace("1)", "0.2)"),
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
    
    colors = [];
    // cycle through and create colors
    if(n < 1) { return [hslToRgb(1.0, 1.0, .7)] }
    for(var i = 0; i < n; i++){
      colors.push(hslToRgb((i * (360.0 / n) % 360)/360.0,1.0,.4));
    }

    // sort colors randomly
    if(rnd){
      return colors.sort(function(){ return Math.random() - 0.5 });
    }else{
      return colors
    }
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
      var seasons_i = Object.keys(series).sort(function(e){ parseInt(e) });
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
        series_labels_i.push("Season " + s.padStart(2, '0'));
        var season_ix = parseInt(s) - 1;
        // for each episode
        series[s].forEach(function(e){
          // skip episodes that haven't aired yet
          var airDate = e['Released'] ? new Date(e['Released']) : null;
          if (!airDate || isNaN(airDate.getTime()) || airDate > new Date()) { return; }

          label_store_i.push("S" + s.padStart(2, '0') + "E" + e.Episode.padStart(2, '0'));
          // season_ix * 2 because each season has two datasets (ep_data and best fit)
          datasets_i[season_ix * 2].push({ x: i, y: parseFloat(e['imdbRating']), type: "ep", show: e['Show Title'], season: s, episode: e.Episode });

          e['season'] = s;
          ep_data_i[season_ix].push(e);
          i++;
          // push in imdb rating value if correct dataset -- otherwise, push NaN
        });
      });
      
      // remove any seasons with empty data
      datasets_i = datasets_i.filter(function(arr){
        return arr[0] != null;
      });
      
      // dataset = [[{ x, y },{...}], [ { best fit x, y } ], [{..}]] // alternates: dataset[0] is array of episode data, dataset[1] is array of best fit for dataset[0]
      chartsCtrl.datasets = chartsCtrl.datasets.concat(datasets_i).flat();
      seasons = seasons.concat(seasons_i);
      ep_data = ep_data.concat(ep_data_i);
      label_store = label_store.concat(label_store_i);
      series_labels = series_labels.concat(series_labels_i);
    });

    chartsCtrl.series_labels = series_labels;

    if(chartsCtrl.chart_title.length > 1){
      chartsCtrl.colors = getColors(chartsCtrl.chart_title.length, false);
    }else{
      chartsCtrl.colors = getColors(series_labels.length, true);
    }

    // { season #, {title, release, ep#, rating, id}, "S##E##", "Season ##", colors}
    chartsCtrl.options_object = { seasons: seasons, ep_data: ep_data, label_store: label_store, series_labels: series_labels, colors: chartsCtrl.colors, multi: raw.length > 1 ? true : false };
    chartsCtrl.datasets = scrubDatasets(chartsCtrl.datasets.flat());
    chartsCtrl.loading = false;
    chartsCtrl.showCanvas = true;
    // window.history.pushState('/abcdef', 'Title', '/' + chartsCtrl.imdbId.map(function(el){ return 'i=' + el }).join(','));
  } 
}]);