module.exports = function(config){
  config.set({

    basePath : '../',

    files : [
      'rahvaalgatus/js/app.bundle.js',
      'rahvaalgatus/bower_components/angular-route/angular-route.js',
      'rahvaalgatus/bower_components/angular-mocks/angular-mocks.js',
      'rahvaalgatus/js/jquery.js',
      'rahvaalgatus/js/jquery-ui.min.js',
      'rahvaalgatus/templates/**/*.html',
      'rahvaalgatus/test/unit/*.js'
    ],
    exclude:[        
        'rahvaalgatus/js/app.bundle.js.map',
        'rahvaalgatus/js/services/STopic_1.js',
    ],

    autoWatch : true,

    frameworks: ['jasmine'],

    browsers : ['Chrome'],

    plugins : [
            'karma-chrome-launcher',
            'karma-firefox-launcher',
            'karma-jasmine'
            ],

    junitReporter : {
      outputFile: 'test_out/unit.xml',
      suite: 'unit'
    }

  });
};