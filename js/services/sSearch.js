"use strict";

app.service("sSearch", [ "$http", "$log", function($http, $log) {
    var Search = this;
    Search.search = function(str) {
        $log.log("search service", str);
        return $http.get("/api/search", {
            params: {
                str: str
            }
        });
    };
} ]);
