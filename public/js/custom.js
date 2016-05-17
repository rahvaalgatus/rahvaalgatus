$(document).ready(function(){
  //Header scrolling	
  var previousScroll = 0,
    headerOrgOffset = $('header').height();
  /*$(window).scroll(function () {
    var currentScroll = $(this).scrollTop();
    if (currentScroll > headerOrgOffset) {
      if (currentScroll > previousScroll) {
        $('.header-top').slideUp(200);
      } else {
        $('.header-top').slideDown(200);
      }
    } else {
        $('.header-top').slideDown(200);
    }
  });*/
  //Help tip
  $('.help-switch > a').click(function(){
    $(this).toggleClass('active');
    $('.help-tip').toggle();
    return false;
  });
  $('.help-tip a').click(function(){
    $('.help-tip').remove();
    return false;
  });
  //metatoggle
  $('.metamore > a').click(function(){
    $(this).parent().parent().find('.toggle-meta').slideToggle();
    return false;
  });
  //Login/register
  $('.login > a').click(function(){
    $('.tp-layer, .log-pop').show();
    $('.log-pop #reg').remove();
    $('.log-pop #emailLogin').show();
    return false;
  });
  $('html').click(function() {
    $('.tp-layer, .log-pop').hide(); 
  });
  $('.log-pop').click(function(event){
    event.stopPropagation();
  });
  //
  $('.mobile-set').click(function(){
    $(this).toggleClass('active');
    $('.admin-role-box > .right').slideToggle(300);
    $('.pp-layer').toggle();
    return false;
  });		
  //
  $('.mobile-menu').click(function(){
    $(this).toggleClass('open');
    $('.main-navi').slideToggle(300);
    $('.log-pop').hide();
    return false;
  });
  //
  
      
  $('.open-profile, .m-profile').click(function(){
    $('.main-navi').hide();
    $('.pp-layer, .my-profile.private').show();
    $('.mobile-menu').removeClass('open');
    return false;
  });	

  $('.profile-close, .cancel').click(function(){
    $('.pp-layer, .my-profile').hide();
    return false;
  });
  //
  var wh=$(window).height();
  var ww=$(window).width();
  var mh=wh-53;
  if(wh < 490 && ww < 767){
    $('.main-navi').css({'height':mh,'overflow':'scroll'});
  } else {
    $('.main-navi').css({'height':'auto','overflow':'inherit'});
  }
  if(wh < 540 && ww < 767){
    $('.log-pop').css({'height':mh,'overflow':'scroll'});
  } else {
    $('.log-pop').css({'height':'auto','overflow':'inherit'});
  }			
  $(window).resize(function(){
    var wh=$(window).height();
    var ww=$(window).width();
    var mh=wh-53;
    if(wh < 490 && ww < 767){
      $('.main-navi').css({'height':mh,'overflow':'scroll'});
    } else {
      $('.main-navi').css({'height':'auto','overflow':'inherit'});
    }
    if(wh < 540 && ww < 767){
      $('.log-pop').css({'height':mh,'overflow':'scroll'});
    } else {
      $('.log-pop').css({'height':'auto','overflow':'inherit'});
    }
  });
  //
  $('.m-login').click(function(){
    $('.main-navi').hide();
    $('.log-pop').show();
    $('.mobile-menu').removeClass('open');
    return false;
  });
  //		
  $('.profile-tabs, .original, .version1, .version2, .signing').each(function(){
    var $active, $content, $links = $(this).find('a');
    $active = $($links.filter('[href="'+location.hash+'"]')[0] || $links[0]);
    $active.addClass('active');
    $content = $($active.attr('href'));
    $links.not($active).each(function () {
      $($(this).attr('href')).hide();
    });
    $(this).on('click', 'a', function(e){
      $active.removeClass('active');
      $content.hide();
      $active = $(this);
      $content = $($(this).attr('href'));
      $active.addClass('active');
      $content.show();
      e.preventDefault();
    });
  });
  //
  var icons = {
    header: "icon-right",
    activeHeader: "icon-down"
  };
  $( ".chapters" ).accordion({
    icons: icons,
    collapsible: true,
    heightStyle: "content"
  });
  //
  $(function() {
    var dialog;
    dialog = $( "#hashtag" ).dialog({autoOpen: false, modal: true, width: 440});
    $( ".pop-hashatg" ).on( "click", function() {
      dialog.dialog( "open" );
      return false;
    });
  });
  $(function() {
    var dialog;
    dialog = $( "#signpop" ).dialog({autoOpen: false, modal: true, width: 680});
    $( ".sign-in a" ).on( "click", function() {
      dialog.dialog( "open" );
      return false;
    });
  });
  /*********/
});
