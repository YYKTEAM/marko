var marko_template = require("marko/html").t(__filename);

module.exports = marko_template;

var marko_widgets = require("marko/widgets"),
    marko_registerWidget = marko_widgets.registerWidget,
    marko_widgetType = marko_registerWidget("/marko-test$1.0.0/autotests/widgets-compilation/bind-component/index", function() {
      return require("./");
    }),
    marko_helpers = require("marko/runtime/html/helpers"),
    marko_attr = marko_helpers.a;

function render(data, out, widget, state) {
  out.w("<div" +
    marko_attr("id", widget.id) +
    "></div>");
}

marko_template._ = marko_widgets.r(render, {
    type: marko_widgetType
  });
