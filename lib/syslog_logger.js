var Syslog = require("syslogh")
module.exports = SyslogLogger

function SyslogLogger(name) {
  Syslog.openlog(name || "node", Syslog.PID, Syslog.LOCAL7)
}

SyslogLogger.prototype.info = function(...args) {
  Syslog.syslog(Syslog.INFO, ...args)
}

SyslogLogger.prototype.warn = function(...args) {
  Syslog.syslog(Syslog.WARNING, ...args)
}

SyslogLogger.prototype.error = function(...args) {
  Syslog.syslog(Syslog.ERR, ...args)
}

SyslogLogger.prototype.log = SyslogLogger.prototype.info
