/* !function to prevent library conflicts */

!function ($) {

    /* document.ready */
    $(function () {
        $(".sidebar").sidebar();
        $("#popup").popup();
    });

    $.fn.popup = function () {
        var main = $(this);
        if (main.size() == 0) {
            return false;
        }

        var inline = main.find(".inline:first");
        var scroller = inline.find(".scroller:first");
        var siblings = inline.children("*").not(".scroller, .buttons");

        var computedHeight = 0;

        siblings.each(function () {
            var obj = $(this);
            var tmpHeight = 0;
            tmpHeight += obj.outerHeight();
            tmpHeight += parseFloat(obj.css("marginTop"));
            tmpHeight += parseFloat(obj.css("marginBottom"));
            computedHeight += tmpHeight;
        });

        if (siblings.size() == 0) {
            computedHeight = 16;
        }
        scroller.css("top", computedHeight);

    };

    $.fn.sidebar = function () {
        var main = $(this);
        if (main.size() == 0) {
            return false;
        }

        var images = main.find("img");
        var totalImages = images.size();
        var loadedImages = 0;

        images.each(function () {
            var tmp = new Image();
            var src = $(this).attr("src");
            tmp.onload = function () {
                checkProgress();
            };
            tmp.onerror = function () {
                checkProgress();
            };
            tmp.src = src;
        });

        function checkProgress() {
            loadedImages++;
            if (loadedImages == totalImages) {
                bindScrollEvent();
            }
        }

        function bindScrollEvent() {

            var mainHeight = main.outerHeight();
            var windowHeight = $(window).height();
            var floating = false;

            $(window).bind("resize", function () {
                mainHeight = main.outerHeight();
                windowHeight = $(window).height();
                $(window).trigger("dynamic-scroll");
            });

            $(window).bind("scroll dynamic-scroll", function () {
                if (mainHeight >= windowHeight) {
                    var scrollTop = $(window).scrollTop();

                    if (windowHeight + scrollTop > mainHeight) {
                        if (!floating) {
                            var top = windowHeight - mainHeight;
                            main.css({
                                position: "fixed",
                                top: top
                            });
                            floating = true;
                        }
                    } else {
                        if (floating) {
                            main.removeAttr("style");
                            floating = false;
                        }
                    }

                } else {
                    if (floating) {
                        main.removeAttr("style");
                        floating = false;
                    }
                }
            }).trigger("dynamic-scroll");
        }
    };
}(window.jQuery);
/* window.jQuery to end !function */

document.createElement('header');
document.createElement('nav');
document.createElement('section');
document.createElement('article');
document.createElement('aside');
document.createElement('footer');
document.createElement('figure');


$(document).ready(function () {

    <!-- =============================================== -->
    <!-- ================= Tooltip  ==================== -->
    <!-- =============================================== -->

    if ($('.vote-tooltip').length > 0) {
        $('.vote-tooltip').tooltipster({
            functionBefore: function (origin, continueTooltip) {
                var content = origin.find('.tooltip-content');
                if (content.length > 0) {
                    origin.tooltipster('content', content);
                    continueTooltip();
                }
            },
            trigger: 'hover',
            position: 'right',
            maxWidth: 240
        });
    }

    if ($('.confirm-tooltip').length > 0) {
        $('.confirm-tooltip').tooltipster({
            functionBefore: function (origin, continueTooltip) {
                var content = origin.find('.tooltip-content');
                if (content.length > 0) {
                    origin.tooltipster('content', content);
                    continueTooltip();
                }
            },
            trigger: 'click',
            position: 'top',
            maxWidth: 240,
            interactive: true,
        });
    }
    if ($('#notification-close').length > 0) {
        $('#notification-close').on('click', function (e) {
            e.preventDefault();
            $(this).parents('.disclaimer').hide();
        })
    }

});// Document ready
