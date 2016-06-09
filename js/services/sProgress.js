/**
 * Handles a topic progress calculations
 */
 app.factory("sProgress", function() {
   function Progress() {
     this.items = [];
   }

   Progress.prototype.recalculate = function(topic, vote, hasVotesRequired) {
     var end, daysToDeadline, today=new Date();
     var topicended = false;
     var start = new Date(topic.createdAt);
     var fullwidth = 850;

     this.items.splice(0, this.items.length);

     if (topic.status == "voting") {
         end = new Date(vote.endsAt);
     } else {
         end = new Date(topic.endsAt);
     }

     if (end >= new Date()) {
         daysToDeadline = Math.round((end - today) / (1e3 * 60 * 60 * 24));
         topic.numberOfDaysLeft = daysToDeadline;
         this.daynow = Math.round((new Date() - start) / (1e3 * 60 * 60 * 24));
         this.fullDiff = Math.round((end - start) / (1e3 * 60 * 60 * 24));
         if (topic.status == "voting") {
             vote.numberOfDaysLeft = (daysToDeadline +1);
             var createdate = new Date(vote.createdAt);
             var day = Math.round((createdate - start) / (1e3 * 60 * 60 * 24));
             if (day != 0) this.items.push({
                 date: createdate,
                 day: day,
                 type: "voteitem"
             });
         }
     } else {
         daysToDeadline = Math.round((new Date() - start) / (1e3 * 60 * 60 * 24));
         topic.numberOfDaysLeft = daysToDeadline;
         this.daynow = Math.round((new Date() - start) / (1e3 * 60 * 60 * 24));
         topicended = true;
         this.fullDiff = Math.round((new Date() - start) / (1e3 * 60 * 60 * 24));
         if (end < today) {
             var day = Math.round((today - end) / (1e3 * 60 * 60 * 24));
             if (topic.status == "voting") {
                 this.items.push({
                     date: vote.endsAt,
                     day: day,
                     type: "voteitem"
                 });
             }
         }
     }
     var extra = 0;
     var nowitem = {
         day: this.daynow,
         date: new Date(),
         id: "nowProgress",
         type: "now"
     };
     if (topicended) {
         nowitem.ended = true;
         if(!hasVotesRequired){
             nowitem.src = "images/role-not.png";
         }
         else{
             nowitem.src = "images/role-active-green.png";

         }
         nowitem.width = 30;
         extra = extra+30;
     }
     else{
         extra = extra + 136;
         nowitem.width = 136;
     }
     var itemcount  = Object.keys(this.items).length;
     extra = extra+(itemcount*30);
     this.items.push(nowitem);
     itemcount++;
     fullwidth = fullwidth-extra;
     var daylength = Math.floor(fullwidth/this.fullDiff);
     var lastday = 0;
     angular.forEach(this.items, function(item, key) {
         item.id = "item-" + key;
         if (item.type == "voteitem") {
             item.src = "images/role-active-green.png";
             item.left = ((item.day - lastday) * daylength)
         }
         else if(item.type !='now'){
             item.src = "images/role-active.png";
             item.left = ((item.day - lastday) * daylength)
         }
         else{
              item.left = ((item.day - lastday) * daylength)
         }
         this.items[key] = item;
         lastday = item.day;
     }, this);
   };

   return Progress;
});
