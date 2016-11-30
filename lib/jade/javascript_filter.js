var PROLOGUE = "<script>(function() {\n"
var EPILOGUE = "\n})()</script>"

module.exports = function(code, opts) { return PROLOGUE + code + EPILOGUE }
