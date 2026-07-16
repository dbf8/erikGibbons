/*global angular*/
/*global $*/

angular.module('ErikGibbons', [
  'ui.router', // router
  'templates', // templates for rails
  'ngMaterial', // angular material -- done correctly
  'ngAnimate', // angular animations
  'ErikGibbons.Home',
  'ErikGibbons.Resume',
  'ui.bootstrap'
])

.config(['$mdThemingProvider', function($mdThemingProvider) {
  $mdThemingProvider.theme('default')
    .primaryPalette('light-blue', {
    'default': '700', // by default use shade 400 from the pink palette for primary intentions
    'hue-1': '100', // use shade 100 for the <code>md-hue-1</code> class
    'hue-2': '600', // use shade 600 for the <code>md-hue-2</code> class
    'hue-3': 'A100'
  })
    .accentPalette('red', {
    'default': '700', // by default use shade 400 from the pink palette for primary intentions
    'hue-1': '100', // use shade 100 for the <code>md-hue-1</code> class
    'hue-2': '600', // use shade 600 for the <code>md-hue-2</code> class
    'hue-3': 'A100' // use shade A100 for the <code>md-hue-3</code> class
  });
}])


.config([
  '$stateProvider',
  '$urlRouterProvider',
  '$locationProvider',
  function($stateProvider, $urlRouterProvider, $locationProvider) {
    $locationProvider.html5Mode({
      enabled: true
    });
    $stateProvider
      .state('erikgibbons', {
      url: '',
      abstract: 'true'
    });

    $urlRouterProvider.otherwise('/');
  }])
  
.config(['$locationProvider', function($locationProvider) {
  $locationProvider.html5Mode({
    //enabled: true,
    //requireBase: false
  });
}]);

angular.module('TVCharts', [
  'ui.router', // router
  'templates', // templates for rails
  'ngMaterial', // angular material -- done correctly
  'ngAnimate', // angular animations
  'ngSanitize', // required for $mdDialog htmlContent
  'TVCharts.Charts',
  'ui.bootstrap'
])

.config(['$mdThemingProvider', function($mdThemingProvider) {
  $mdThemingProvider.theme('default')
    .primaryPalette('light-blue', {
    'default': '700', // by default use shade 400 from the pink palette for primary intentions
    'hue-1': '100', // use shade 100 for the <code>md-hue-1</code> class
    'hue-2': '600', // use shade 600 for the <code>md-hue-2</code> class
    'hue-3': 'A100'
  })
    .accentPalette('red', {
    'default': '700', // by default use shade 400 from the pink palette for primary intentions
    'hue-1': '100', // use shade 100 for the <code>md-hue-1</code> class
    'hue-2': '600', // use shade 600 for the <code>md-hue-2</code> class
    'hue-3': 'A100' // use shade A100 for the <code>md-hue-3</code> class
  });
}])


.config([
  '$stateProvider',
  '$urlRouterProvider',
  '$locationProvider',
  function($stateProvider, $urlRouterProvider, $locationProvider) {
    $locationProvider.html5Mode({
      enabled: true
    });
    $stateProvider
      .state('tvcharts', {
      url: ':query',
      abstract: 'true'
    });

    $urlRouterProvider.otherwise('/');
  }])
  
.config(['$locationProvider', function($locationProvider) {
  $locationProvider.html5Mode({
    //enabled: true,
    //requireBase: false
  });
}]);

angular.module('PPPLending', [
  'ui.router', // router
  'templates', // templates for rails
  'ngMaterial', // angular material -- done correctly
  'ngAnimate', // angular animations
  'PPPLending.Home',
  'ui.bootstrap'
])

.config(['$mdThemingProvider', function($mdThemingProvider) {
  $mdThemingProvider.theme('default')
    .primaryPalette('light-blue', {
    'default': '700', // by default use shade 400 from the pink palette for primary intentions
    'hue-1': '100', // use shade 100 for the <code>md-hue-1</code> class
    'hue-2': '600', // use shade 600 for the <code>md-hue-2</code> class
    'hue-3': 'A100'
  })
    .accentPalette('red', {
    'default': '700', // by default use shade 400 from the pink palette for primary intentions
    'hue-1': '100', // use shade 100 for the <code>md-hue-1</code> class
    'hue-2': '600', // use shade 600 for the <code>md-hue-2</code> class
    'hue-3': 'A100' // use shade A100 for the <code>md-hue-3</code> class
  });
}])


.config([
  '$stateProvider',
  '$urlRouterProvider',
  '$locationProvider',
  function($stateProvider, $urlRouterProvider, $locationProvider) {
    $locationProvider.html5Mode({
      enabled: true
    });
    $stateProvider
      .state('ppp-lending', {
      url: '',
      abstract: 'true'
    });

    $urlRouterProvider.otherwise('/');
  }])
  
.config(['$locationProvider', function($locationProvider) {
  $locationProvider.html5Mode({
    //enabled: true,
    //requireBase: false
  });
}]);
