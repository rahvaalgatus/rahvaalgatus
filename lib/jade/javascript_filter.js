var PROLOGUE = "<script>(function() {\n"
var EPILOGUE = "\n})()</script>"

module.exports = function(code) { return PROLOGUE + code + EPILOGUE }
