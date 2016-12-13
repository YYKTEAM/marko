var markoWidgets = require('./');
var widgetLookup = require('./lookup').widgets;
var includeTag = require('./taglib/include-tag');
var repeatedId = require('./repeated-id');

function resolveWidgetRef(out, ref, scope) {
    if (ref.charAt(0) === '#') {
        return ref.substring(1);
    } else {
        var resolvedId;

        if (ref.endsWith('[]')) {
            resolvedId = repeatedId.nextId(out, scope, ref);
        } else {
            resolvedId = scope + '-' + ref;
        }

        return resolvedId;
    }
}

function preserveWidgetEl(existingWidget, out, widgetsContext, widgetBody) {
    var tagName = existingWidget.el.tagName;
    var hasUnpreservedBody = false;

    // We put a placeholder element in the output stream to ensure that the existing
    // DOM node is matched up correctly when using morphdom.

    out.beginElement(tagName, { id: existingWidget.id });

    if (widgetBody && existingWidget.bodyEl) {
        hasUnpreservedBody = true;
        includeTag({
            _target: widgetBody,
            _widgetId: existingWidget.bodyEl.id
        }, out);
    }

    out.endElement();

    existingWidget._reset(); // The widget is no longer dirty so reset internal flags
    widgetsContext.addPreservedDOMNode(existingWidget.el, null, hasUnpreservedBody); // Mark the element as being preserved (for morphdom)
}


function handleBeginAsync(event) {
    var parentOut = event.parentOut;
    var asyncOut = event.out;
    var widgetsContext = asyncOut.global.widgets;
    var widgetStack;

    if (widgetsContext && (widgetStack = widgetsContext.widgetStack).length) {
        // All of the widgets in this async block should be
        // initialized after the widgets in the parent. Therefore,
        // we will create a new WidgetsContext for the nested
        // async block and will create a new widget stack where the current
        // widget in the parent block is the only widget in the nested
        // stack (to begin with). This will result in top-level widgets
        // of the async block being added as children of the widget in the
        // parent block.
        var nestedWidgetsContext = new markoWidgets.WidgetsContext(asyncOut);
        nestedWidgetsContext.widgetStack = [widgetStack[widgetStack.length-1]];
        asyncOut.data.widgets = nestedWidgetsContext;
    }
    asyncOut.data.$w = parentOut.data.$w;
}

module.exports = function createRendererFunc(templateRenderFunc, widgetProps, renderingLogic) {
    var onInput;
    var getInitialProps;
    var getTemplateData;
    var getInitialState;
    var getWidgetConfig;
    var getInitialBody;

    function initRendereringLogic() {
        onInput = renderingLogic.onInput;
        getInitialProps = renderingLogic.getInitialProps; //deprecate
        getTemplateData = renderingLogic.getTemplateData;
        getInitialState = renderingLogic.getInitialState; //deprecate
        getWidgetConfig = renderingLogic.getWidgetConfig; //deprecate
        getInitialBody = renderingLogic.getInitialBody;
    }

    if (renderingLogic) {
        initRendereringLogic();
    }

    var typeName = widgetProps.type;
    var bodyElId = widgetProps.body;
    var roots = widgetProps.roots;
    var assignedId = widgetProps.id;

    return function renderer(input, out, renderingLogicLegacy /* needed by defineRenderer */) {
        var outGlobal = out.global;

        if (!outGlobal.__widgetsBeginAsyncAdded) {
            outGlobal.__widgetsBeginAsyncAdded = true;
            out.on('beginAsync', handleBeginAsync);
        }

        if (!input) {
            // Make sure we always have a non-null input object
            input = {};
        }

        if (renderingLogic === undefined) {
            // LEGACY - This should be removed when `defineRenderer` is removed but we use it
            // now to run the rendering logic that is passed in at render time. The reason we don't
            // get the rendering logic until now is that in older versions the `defineRenderer` was
            // invoked before template rendering
            if ((renderingLogic = renderingLogicLegacy)) {
                initRendereringLogic();
            }
        }

        var widgetState;
        var widgetConfig;
        var widgetBody;

        if (outGlobal.__rerenderWidget && outGlobal.__rerenderState) {
            // This is a state-ful widget. If this is a rerender then the "input"
            // will be the new state. If we have state then we should use the input
            // as the widget state and skip the steps of converting the input
            // to a widget state.
            var isFirstWidget = !outGlobal.__firstWidgetFound;

            if (isFirstWidget) {
                // We are the first widget and we are not being extended
                // and we are not extending so use the input as the state
                widgetState = input;
                input = null;
            }
        }

        var widgetArgs;

        if (input) {
            if (onInput) {
                var lightweightWidget = Object.create(renderingLogic);
                lightweightWidget.onInput(input);
                widgetState = lightweightWidget.state;
                widgetConfig = lightweightWidget;
                delete widgetConfig.state;
            } else {
                if (getWidgetConfig) {
                    // If getWidgetConfig() was implemented then use that to
                    // get the widget config. The widget config will be passed
                    // to the widget constructor. If rendered on the server the
                    // widget config will be serialized to a JSON-like data
                    // structure and stored in a "data-w-config" attribute.
                    widgetConfig = getWidgetConfig(input, out);
                } else {
                    widgetConfig = input.widgetConfig;
                }
            }

            if (getInitialBody) {
                // If we have widget a widget body then pass it to the template
                // so that it is available to the widget tag and can be inserted
                // at the w-body marker
                widgetBody = getInitialBody(input, out);
            } else {
                // Default to using the nested content as the widget body
                // getInitialBody was not implemented
                widgetBody = input.renderBody;
            }

            if (!widgetState) {
                // If we do not have state then we need to go through the process
                // of converting the input to a widget state, or simply normalizing
                // the input using getInitialProps

                if (getInitialProps) {
                    // This optional method is used to normalize input state
                    input = getInitialProps(input, out) || {};
                }

                if (getInitialState) {
                    // This optional method is used to derive the widget state
                    // from the input properties
                    widgetState = getInitialState(input, out);
                }
            }

            widgetArgs = input.$w;
        }

        outGlobal.__firstWidgetFound = true;

        var customEvents;
        var scope;



        var id = assignedId;

        if (!widgetArgs) {
            widgetArgs = out.data.$w;
        }

        if (widgetArgs) {
            scope = widgetArgs[0];

            if (scope) {
                scope = scope.id;
            }

            var ref = widgetArgs[1];
            if (ref != null) {
                ref = ref.toString();
            }
            id = id || resolveWidgetRef(out, ref, scope);
            customEvents = widgetArgs[2];
        }

        var rerenderWidget = outGlobal.__rerenderWidget;
        var isRerender = outGlobal.__rerender === true;

        var widgetsContext = markoWidgets.getWidgetsContext(out);

        if (!id) {
            var parentWidget = widgetsContext.getCurrentWidget();

            if (parentWidget) {
                id = parentWidget.nextId();
            }
        }

        var existingWidget;

        if (rerenderWidget) {
            existingWidget = rerenderWidget;
            id = rerenderWidget.id;
            delete outGlobal.__rerenderWidget;
        } else if (isRerender) {
            // Look in in the DOM to see if a widget with the same ID and type already exists.
            existingWidget = widgetLookup[id];
            if (existingWidget && existingWidget.__type !== typeName) {
                existingWidget = undefined;
            }
        }

        if (!id && widgetProps.hasOwnProperty('id')) {
            throw new Error('Invalid widget ID for "' + typeName + '"');
        }

        var shouldRenderBody = true;

        if (existingWidget && !rerenderWidget) {
            // This is a nested widget found during a rerender. We don't want to needlessly
            // rerender the widget if that is not necessary. If the widget is a stateful
            // widget then we update the existing widget with the new state.
            if (widgetState) {
                existingWidget._replaceState(widgetState); // Update the existing widget state using the internal/private
                                                     // method to ensure that another update is not queued up

                // If the widget has custom state update handlers then we will use those methods
                // to update the widget.
                if (existingWidget._processUpdateHandlers() === true) {
                    // If _processUpdateHandlers() returns true then that means
                    // that the widget is now up-to-date and we can skip rerendering it.
                    shouldRenderBody = false;
                    preserveWidgetEl(existingWidget, out, widgetsContext, widgetBody);
                    return;
                }
            }

            // If the widget is not dirty (no state changes) and shouldUpdate() returns false
            // then skip rerendering the widget.
            if (!existingWidget.isDirty() && !existingWidget.shouldUpdate(input, widgetState)) {
                shouldRenderBody = false;
                preserveWidgetEl(existingWidget, out, widgetsContext, widgetBody);
                return;
            }
        }

        // Use getTemplateData(state, props, out) to get the template
        // data. If that method is not provided then just use the
        // the state (if provided) or the input data.
        var templateData = (getTemplateData ?
            getTemplateData(widgetState, input, out) :
            (getInitialState && widgetState /*legacy*/) || input) || {};

        if (existingWidget) {
            existingWidget._emitLifecycleEvent('beforeUpdate');
        }

        var widgetDef = widgetsContext.beginWidget({
            type: typeName,
            id: id,
            config: widgetConfig,
            state: widgetState,
            customEvents: customEvents,
            scope: scope,
            existingWidget: existingWidget,
            bodyElId: bodyElId,
            roots: roots,
            body: widgetBody
        });

        // Only render the widget if it needs to be rerendered
        if (shouldRenderBody) {
            // Render the template associated with the component using the final template
            // data that we constructed
            templateRenderFunc(templateData, out, widgetDef, widgetState);
        }

        widgetDef.end();
    };
};