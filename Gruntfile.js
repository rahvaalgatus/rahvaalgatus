'use strict';

module.exports = function (grunt) {
    grunt.initConfig({
        pkg: grunt.file.readJSON('package.json'),
        concurrent: {
            dev: {
                tasks: ['uglify:dev', 'less:dev', 'watch'],
                options: {
                    logConcurrentOutput: true
                }
            }
        },
        less: {
            dev: {
                options: {
                    paths: ['public/styles'],
                    compress: true,
                    cleancss: false
                },
                files: {
                    'public/styles/default.css': [
                        'public/styles/lib/*.css',
                        'public/styles/build.less'
                    ],
                    'public/styles/etherpad.css': [
                        'public/styles/buildEtherpad.less'
                    ]
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
                    sourceMap: true,
                    sourceMapName: 'js/<%= pkg.name %>.bundle.js.map'
                },
                files: {
                    'js/<%= pkg.name %>.bundle.js': [
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
        cachebreaker: {
            js: {
                options: {
                    match: ['app.bundle.js'],
                    replacement: 'md5',
                    src: {
                        path: 'js/app.bundle.js'
                    }
                },
                files: {
                    src: ['index.html']
                }
            },
            css: {
                options: {
                    match: ['style.css'],
                    replacement: 'md5',
                    src: {
                        path: 'style.css'
                    }
                },
                files: {
                    src: ['index.html']
                }
            }
        },
        watch: {
            js: {
                files: ['js/**/*.js', '!js/<%= pkg.name %>.bundle.js'],
                tasks: ['uglify:dev', 'cachebreaker:js']
            },
            css: {
                files: ['public/styles/**/*.less', 'public/styles/lib/**/*.css', '!public/styles/default.css', '!public/styles/fonts.css'],
                tasks: ['less:dev', 'cachebreaker:css']
            }
        }
    });

    // Load the plugins
    grunt.loadNpmTasks('grunt-contrib-cssmin');
    grunt.loadNpmTasks('grunt-contrib-less');
    grunt.loadNpmTasks('grunt-contrib-uglify');
    grunt.loadNpmTasks('grunt-cache-breaker');
    grunt.loadNpmTasks('grunt-contrib-watch');
    grunt.loadNpmTasks('grunt-concurrent');

    // Default task(s).
    grunt.registerTask('default', ['concurrent:dev']);
    grunt.registerTask('start', ['concurrent:dev']);
};
