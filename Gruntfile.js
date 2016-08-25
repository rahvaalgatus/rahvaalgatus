'use strict';

module.exports = function (grunt) {
    grunt.initConfig({
        pkg: grunt.file.readJSON('package.json'),
        env: process.env.ENV,

        concurrent: {
            dev: {
                tasks: ['uglify:dev', 'watch'],
                options: {
                    logConcurrentOutput: true
                }
            }
        },
        uglify: {
            dev: {
                options: {
                    mangle: false,
                    compress: false,
                    beautify: true,
                    preserveComments: 'all',
                    sourceMap: false,
                    sourceMapName: 'public/js/<%= pkg.name %>.bundle.js.map'
                },
                files: {
                    'public/js/<%= pkg.name %>.bundle.js': [
                        'config/index.js',
                        'config/<%= env %>.js',
                        'js/lib/ext/device.min.js',
                        'js/lib/ext/jquery-1.11.1.min.js',
                        'js/lib/ext/jquery.autosize.min.js',
                        'js/lib/ext/tooltipster/jquery.tooltipster.js',
                        'js/lib/ext/jquery.functions.js',
                        'js/lib/moment-with-locales.js',
                        'js/lib/hwcrypto-legacy.js',
                        'js/lib/hwcrypto.js',
                        'js/lib/*.js',
                        'js/lib/angular/angular.js',
                        'js/lib/angular/angular-sanitize.js',
                        'js/lib/angular/angular-ui-router.js',
                        'js/lib/angular/angular-translate.js',
                        'js/lib/angular/angular-translate-loader-static-files.js',
                        'js/lib/angular/angular-moment.js',
                        'js/lib/angular/ngKookies.js',
                        'js/lib/angular/angular-translate-storage-kookies.js',
                        'js/lib/angular/**/*.js',
                        'js/app.js',
                        'js/services/**/*.js',
                        'js/controllers/**/*.js'
                    ]
                }
            }
        },

        watch: {
            js: {
                files: ['js/**/*.js'],
                tasks: ['uglify:dev']
            }
        }
    });

    grunt.loadNpmTasks('grunt-contrib-uglify');
    grunt.loadNpmTasks('grunt-contrib-watch');
    grunt.loadNpmTasks('grunt-concurrent');

    // Default task(s).
    grunt.registerTask('default', ['concurrent:dev']);
    grunt.registerTask('start', ['concurrent:dev']);
};
