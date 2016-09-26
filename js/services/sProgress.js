var app = window.app

app.factory("sProgress", function() {
   function toDays(ms) { return Math.round(ms / (1e3 * 60 * 60 * 24)); }

   function Progress() {
     this.items = [];
   }

   Progress.prototype.recalculate = function(topic, vote, hasVotesRequired, events) {
     var today=new Date();
     var topicended = false;
     var start = new Date(topic.createdAt);
     var fullwidth = 850;
     var end = new Date(topic.status == "voting" ? vote.endsAt : topic.endsAt);
     var day

     this.items.splice(0, this.items.length);

     if (end >= new Date()) {
         topic.numberOfDaysLeft = toDays(end - today);
         this.daynow = toDays(new Date() - start);
         this.fullDiff = toDays(end - start);
         if (topic.status == "voting") {
             vote.numberOfDaysLeft = (topic.numberOfDaysLeft +1);
             var createdate = new Date(vote.createdAt);
             day = toDays(createdate - start);

             if (day != 0) this.items.push({
                 date: createdate,
                 day: day,
                 type: "voteitem"
             });
         }
     } else {
         topicended = true;
         topic.numberOfDaysLeft = toDays(new Date() - start);
         this.daynow = toDays(new Date() - start);
         this.fullDiff = toDays(new Date() - start);
         if (end < today) {
             day = toDays(today - end);
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
     angular.forEach(this.items, function(item, i) {
         item.id = "item-" + i;
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
         lastday = item.day;
     });
   };

   return Progress;
});
