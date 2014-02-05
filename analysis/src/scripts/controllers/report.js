'use strict';

angular.module('sumaAnalysis')
  .controller('ReportCtrl', function ($scope, $rootScope, $http, $location, $anchorScroll, $timeout, initiatives, actsLocs, data, promiseTracker, uiStates, sumaConfig, $routeParams, $q) {

    // Initialize controller
    $scope.initialize = function () {
      var urlParams = $location.search();

      // Set default scope values from config
      $scope.setDefaults();

      // Attach listener for URL changes
      $scope.$on('$routeUpdate', $scope.routeUpdate);

      // Get initiatives
      $scope.getInitiatives().then(function () {
        if (_.isEmpty(urlParams)) {
          $scope.state = uiStates.setUIState('initial');
        } else {
          $scope.setScope(urlParams);
          $scope.getData();
        }
      });
    };

    // Set default form values
    $scope.setDefaults = function () {
      // Form data
      _.each(sumaConfig.formData, function (e, i) {
        $scope[i] = e;
      });

      // Form defaults
      $scope.params = {};
      _.each(sumaConfig.formDefaults, function (e, i) {
        $scope.params[i] = $scope[e][0];
      });

      // Date defaults
      $scope.params.sdate = moment().subtract('months', 6).add('days', 1).format('YYYY-MM-DD');
      $scope.params.edate = moment().add('days', 1).format('YYYY-MM-DD');
    };

    // Set scope.params based on urlParams
    $scope.setScope = function (p) {
      $scope.params.init = _.find($scope.inits, function (e, i) {
        return String(e.id) === String(p.id);
      });

      $scope.params.classifyCounts = _.find($scope.countOptions, function (e, i) {
        return String(e.id) === String(p.classifyCounts);
      });

      $scope.params.wholeSession = _.find($scope.sessionOptions, function (e, i) {
        return String(e.id) === String(p.wholeSession);
      });

      $scope.params.daygroup = _.find($scope.dayOptions, function (e, i) {
        return String(e.id) === String(p.daygroup);
      });

      $scope.getMetadata();

      $scope.params.activity = _.find($scope.activities, function (e, i) {
        return String(e.id) === String(p.activity);
      });

      $scope.params.location = _.find($scope.locations, function (e, i) {
        return String(e.id) === String(p.location);
      });

      $scope.params.sdate = p.sdate;
      $scope.params.edate = p.edate;
      $scope.params.stime = p.stime ? p.stime : '';
      $scope.params.etime = p.etime ? p.etime : '';
    };

    // Attach params to URL
    $scope.submit = function () {
      var currentUrl,
          currentScope;

      currentUrl = $location.search();

      currentScope = {
        id: String($scope.params.init.id),
        sdate: $scope.params.sdate,
        edate: $scope.params.edate,
        stime: $scope.params.stime || '',
        etime: $scope.params.etime || '',
        classifyCounts: $scope.params.classifyCounts ? $scope.params.classifyCounts.id : null,
        wholeSession: $scope.params.wholeSession ? $scope.params.wholeSession.id : null,
        activity: $scope.params.activity ? $scope.params.activity.id : null,
        location: $scope.params.location ? $scope.params.location.id : null,
        daygroup: $scope.params.daygroup ? $scope.params.daygroup.id : null
      };

      if (_.isEqual(currentUrl, currentScope)) {
        $scope.getData();
      } else {
        $location.search(currentScope);
      }
    };

    // Get initiatives
    $scope.getInitiatives = function () {
      var cfg,
          dfd = $q.defer();

      $scope.initTimeoutPromise = $q.defer();

      cfg = {
        timeoutPromise: $scope.initTimeoutPromise,
        timeout: 180000
      };

      $scope.loadInits = initiatives.get(cfg).then(function (data) {
        $scope.inits = data;
        dfd.resolve();
      }, $scope.error);

      // Setup promise tracker for spinner on initial load
      $scope.finder = promiseTracker('initTracker');
      $scope.finder.addPromise($scope.loadInits);

      return dfd.promise;
    };

    // Get initiative metadata
    $scope.getMetadata = function () {
      $scope.actsLocs = actsLocs.get($scope.params.init);

      $scope.activities = $scope.actsLocs.activities;
      $scope.locations = $scope.actsLocs.locations;

      $scope.params.activity = $scope.actsLocs.activities[0];
      $scope.params.location = $scope.actsLocs.locations[0];
    };

    // Update metadata UI wrapper
    $scope.updateMetadata = function () {
      if ($scope.params.init) {
        $scope.processMetadata = true;

        $scope.getMetadata();

        // Artificially add a delay for UI
        $timeout(function () {
          $scope.processMetadata = false;
        }, 400);
      }
    };

    // Submit request and draw chart
    $scope.getData = function () {
      var cfg;

      $scope.dataTimeoutPromise = $q.defer();
      $scope.state = uiStates.setUIState('loading');

      cfg = {
        params: $scope.params,
        acts: $scope.activities,
        locs: $scope.locations,
        dataProcessor: sumaConfig.dataProcessor,
        timeoutPromise: $scope.dataTimeoutPromise,
        timeout: 180000
      };

      data[sumaConfig.dataSource](cfg)
        .then($scope.success, $scope.error);
    };

    // Respond to routeUpdate event
    $scope.routeUpdate = function () {
      var urlParams = $location.search();

      // Resolve active requests
      if ($scope.dataTimeoutPromise) {
        $scope.dataTimeoutPromise.resolve();
      }

      if ($scope.initTimeoutPromise) {
        $scope.initTimeoutPromise.resolve();
        $scope.finder.cancel();
      }

      if (_.isEmpty(urlParams)) { // True when navigating back to initial
        $scope.state = uiStates.setUIState('initial');
        $scope.setDefaults();
      } else if ($scope.params.init){ // Typical navigation between reports (most common case)
        $scope.setScope(urlParams);
        $scope.getData();
      } else { // Navigation from initial to completed report
        $scope.getInitiatives().then(function () {
          $scope.setScope(urlParams);
          $scope.getData();
        });
      }
    };

    // Display error message
    $scope.error = function (data) {
      if (!data.promiseTimeout) {
        $scope.state = uiStates.setUIState('error');
        $scope.errorMessage = data.message;
        $scope.errorCode = data.code;
      }
    };

    // Assign data to scope and set state
    $scope.success = function (processedData) {
      $scope.state = uiStates.setUIState('success');
      $scope.data = processedData;

      if (sumaConfig.suppWatch) {
        $scope.$watch('data.actsLocsData', function () {
          var index = _.findIndex($scope.data.actsLocsData.items, function (item) {
            return item.title === $scope.data.barChartData.title;
          });

          $scope.data.barChartData = $scope.data.actsLocsData.items[index];
        });
      }
    };

    // Handle anchor links
    $scope.scrollTo = function (id) {
      var old = $location.hash();
      $location.hash(id);
      $anchorScroll();

      // Reset to old to suppress routing logic
      $location.hash(old);
    };

    $scope.initialize();
  });
