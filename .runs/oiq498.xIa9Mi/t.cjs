var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __commonJS = (cb, mod) => function __require() {
  return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// ../../../tmp/claude-0/repo/node_modules/react/cjs/react.production.min.js
var require_react_production_min = __commonJS({
  "../../../tmp/claude-0/repo/node_modules/react/cjs/react.production.min.js"(exports2) {
    "use strict";
    var l = Symbol.for("react.element");
    var n = Symbol.for("react.portal");
    var p = Symbol.for("react.fragment");
    var q = Symbol.for("react.strict_mode");
    var r = Symbol.for("react.profiler");
    var t = Symbol.for("react.provider");
    var u = Symbol.for("react.context");
    var v = Symbol.for("react.forward_ref");
    var w = Symbol.for("react.suspense");
    var x = Symbol.for("react.memo");
    var y = Symbol.for("react.lazy");
    var z = Symbol.iterator;
    function A(a) {
      if (null === a || "object" !== typeof a)
        return null;
      a = z && a[z] || a["@@iterator"];
      return "function" === typeof a ? a : null;
    }
    var B = { isMounted: function() {
      return false;
    }, enqueueForceUpdate: function() {
    }, enqueueReplaceState: function() {
    }, enqueueSetState: function() {
    } };
    var C = Object.assign;
    var D = {};
    function E(a, b, e) {
      this.props = a;
      this.context = b;
      this.refs = D;
      this.updater = e || B;
    }
    E.prototype.isReactComponent = {};
    E.prototype.setState = function(a, b) {
      if ("object" !== typeof a && "function" !== typeof a && null != a)
        throw Error("setState(...): takes an object of state variables to update or a function which returns an object of state variables.");
      this.updater.enqueueSetState(this, a, b, "setState");
    };
    E.prototype.forceUpdate = function(a) {
      this.updater.enqueueForceUpdate(this, a, "forceUpdate");
    };
    function F() {
    }
    F.prototype = E.prototype;
    function G(a, b, e) {
      this.props = a;
      this.context = b;
      this.refs = D;
      this.updater = e || B;
    }
    var H = G.prototype = new F();
    H.constructor = G;
    C(H, E.prototype);
    H.isPureReactComponent = true;
    var I = Array.isArray;
    var J = Object.prototype.hasOwnProperty;
    var K = { current: null };
    var L = { key: true, ref: true, __self: true, __source: true };
    function M(a, b, e) {
      var d, c = {}, k = null, h = null;
      if (null != b)
        for (d in void 0 !== b.ref && (h = b.ref), void 0 !== b.key && (k = "" + b.key), b)
          J.call(b, d) && !L.hasOwnProperty(d) && (c[d] = b[d]);
      var g = arguments.length - 2;
      if (1 === g)
        c.children = e;
      else if (1 < g) {
        for (var f = Array(g), m = 0; m < g; m++)
          f[m] = arguments[m + 2];
        c.children = f;
      }
      if (a && a.defaultProps)
        for (d in g = a.defaultProps, g)
          void 0 === c[d] && (c[d] = g[d]);
      return { $$typeof: l, type: a, key: k, ref: h, props: c, _owner: K.current };
    }
    function N(a, b) {
      return { $$typeof: l, type: a.type, key: b, ref: a.ref, props: a.props, _owner: a._owner };
    }
    function O(a) {
      return "object" === typeof a && null !== a && a.$$typeof === l;
    }
    function escape(a) {
      var b = { "=": "=0", ":": "=2" };
      return "$" + a.replace(/[=:]/g, function(a2) {
        return b[a2];
      });
    }
    var P = /\/+/g;
    function Q(a, b) {
      return "object" === typeof a && null !== a && null != a.key ? escape("" + a.key) : b.toString(36);
    }
    function R(a, b, e, d, c) {
      var k = typeof a;
      if ("undefined" === k || "boolean" === k)
        a = null;
      var h = false;
      if (null === a)
        h = true;
      else
        switch (k) {
          case "string":
          case "number":
            h = true;
            break;
          case "object":
            switch (a.$$typeof) {
              case l:
              case n:
                h = true;
            }
        }
      if (h)
        return h = a, c = c(h), a = "" === d ? "." + Q(h, 0) : d, I(c) ? (e = "", null != a && (e = a.replace(P, "$&/") + "/"), R(c, b, e, "", function(a2) {
          return a2;
        })) : null != c && (O(c) && (c = N(c, e + (!c.key || h && h.key === c.key ? "" : ("" + c.key).replace(P, "$&/") + "/") + a)), b.push(c)), 1;
      h = 0;
      d = "" === d ? "." : d + ":";
      if (I(a))
        for (var g = 0; g < a.length; g++) {
          k = a[g];
          var f = d + Q(k, g);
          h += R(k, b, e, f, c);
        }
      else if (f = A(a), "function" === typeof f)
        for (a = f.call(a), g = 0; !(k = a.next()).done; )
          k = k.value, f = d + Q(k, g++), h += R(k, b, e, f, c);
      else if ("object" === k)
        throw b = String(a), Error("Objects are not valid as a React child (found: " + ("[object Object]" === b ? "object with keys {" + Object.keys(a).join(", ") + "}" : b) + "). If you meant to render a collection of children, use an array instead.");
      return h;
    }
    function S(a, b, e) {
      if (null == a)
        return a;
      var d = [], c = 0;
      R(a, d, "", "", function(a2) {
        return b.call(e, a2, c++);
      });
      return d;
    }
    function T(a) {
      if (-1 === a._status) {
        var b = a._result;
        b = b();
        b.then(function(b2) {
          if (0 === a._status || -1 === a._status)
            a._status = 1, a._result = b2;
        }, function(b2) {
          if (0 === a._status || -1 === a._status)
            a._status = 2, a._result = b2;
        });
        -1 === a._status && (a._status = 0, a._result = b);
      }
      if (1 === a._status)
        return a._result.default;
      throw a._result;
    }
    var U = { current: null };
    var V = { transition: null };
    var W = { ReactCurrentDispatcher: U, ReactCurrentBatchConfig: V, ReactCurrentOwner: K };
    function X() {
      throw Error("act(...) is not supported in production builds of React.");
    }
    exports2.Children = { map: S, forEach: function(a, b, e) {
      S(a, function() {
        b.apply(this, arguments);
      }, e);
    }, count: function(a) {
      var b = 0;
      S(a, function() {
        b++;
      });
      return b;
    }, toArray: function(a) {
      return S(a, function(a2) {
        return a2;
      }) || [];
    }, only: function(a) {
      if (!O(a))
        throw Error("React.Children.only expected to receive a single React element child.");
      return a;
    } };
    exports2.Component = E;
    exports2.Fragment = p;
    exports2.Profiler = r;
    exports2.PureComponent = G;
    exports2.StrictMode = q;
    exports2.Suspense = w;
    exports2.__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED = W;
    exports2.act = X;
    exports2.cloneElement = function(a, b, e) {
      if (null === a || void 0 === a)
        throw Error("React.cloneElement(...): The argument must be a React element, but you passed " + a + ".");
      var d = C({}, a.props), c = a.key, k = a.ref, h = a._owner;
      if (null != b) {
        void 0 !== b.ref && (k = b.ref, h = K.current);
        void 0 !== b.key && (c = "" + b.key);
        if (a.type && a.type.defaultProps)
          var g = a.type.defaultProps;
        for (f in b)
          J.call(b, f) && !L.hasOwnProperty(f) && (d[f] = void 0 === b[f] && void 0 !== g ? g[f] : b[f]);
      }
      var f = arguments.length - 2;
      if (1 === f)
        d.children = e;
      else if (1 < f) {
        g = Array(f);
        for (var m = 0; m < f; m++)
          g[m] = arguments[m + 2];
        d.children = g;
      }
      return { $$typeof: l, type: a.type, key: c, ref: k, props: d, _owner: h };
    };
    exports2.createContext = function(a) {
      a = { $$typeof: u, _currentValue: a, _currentValue2: a, _threadCount: 0, Provider: null, Consumer: null, _defaultValue: null, _globalName: null };
      a.Provider = { $$typeof: t, _context: a };
      return a.Consumer = a;
    };
    exports2.createElement = M;
    exports2.createFactory = function(a) {
      var b = M.bind(null, a);
      b.type = a;
      return b;
    };
    exports2.createRef = function() {
      return { current: null };
    };
    exports2.forwardRef = function(a) {
      return { $$typeof: v, render: a };
    };
    exports2.isValidElement = O;
    exports2.lazy = function(a) {
      return { $$typeof: y, _payload: { _status: -1, _result: a }, _init: T };
    };
    exports2.memo = function(a, b) {
      return { $$typeof: x, type: a, compare: void 0 === b ? null : b };
    };
    exports2.startTransition = function(a) {
      var b = V.transition;
      V.transition = {};
      try {
        a();
      } finally {
        V.transition = b;
      }
    };
    exports2.unstable_act = X;
    exports2.useCallback = function(a, b) {
      return U.current.useCallback(a, b);
    };
    exports2.useContext = function(a) {
      return U.current.useContext(a);
    };
    exports2.useDebugValue = function() {
    };
    exports2.useDeferredValue = function(a) {
      return U.current.useDeferredValue(a);
    };
    exports2.useEffect = function(a, b) {
      return U.current.useEffect(a, b);
    };
    exports2.useId = function() {
      return U.current.useId();
    };
    exports2.useImperativeHandle = function(a, b, e) {
      return U.current.useImperativeHandle(a, b, e);
    };
    exports2.useInsertionEffect = function(a, b) {
      return U.current.useInsertionEffect(a, b);
    };
    exports2.useLayoutEffect = function(a, b) {
      return U.current.useLayoutEffect(a, b);
    };
    exports2.useMemo = function(a, b) {
      return U.current.useMemo(a, b);
    };
    exports2.useReducer = function(a, b, e) {
      return U.current.useReducer(a, b, e);
    };
    exports2.useRef = function(a) {
      return U.current.useRef(a);
    };
    exports2.useState = function(a) {
      return U.current.useState(a);
    };
    exports2.useSyncExternalStore = function(a, b, e) {
      return U.current.useSyncExternalStore(a, b, e);
    };
    exports2.useTransition = function() {
      return U.current.useTransition();
    };
    exports2.version = "18.3.1";
  }
});

// ../../../tmp/claude-0/repo/node_modules/react/cjs/react.development.js
var require_react_development = __commonJS({
  "../../../tmp/claude-0/repo/node_modules/react/cjs/react.development.js"(exports2, module2) {
    "use strict";
    if (process.env.NODE_ENV !== "production") {
      (function() {
        "use strict";
        if (typeof __REACT_DEVTOOLS_GLOBAL_HOOK__ !== "undefined" && typeof __REACT_DEVTOOLS_GLOBAL_HOOK__.registerInternalModuleStart === "function") {
          __REACT_DEVTOOLS_GLOBAL_HOOK__.registerInternalModuleStart(new Error());
        }
        var ReactVersion = "18.3.1";
        var REACT_ELEMENT_TYPE = Symbol.for("react.element");
        var REACT_PORTAL_TYPE = Symbol.for("react.portal");
        var REACT_FRAGMENT_TYPE = Symbol.for("react.fragment");
        var REACT_STRICT_MODE_TYPE = Symbol.for("react.strict_mode");
        var REACT_PROFILER_TYPE = Symbol.for("react.profiler");
        var REACT_PROVIDER_TYPE = Symbol.for("react.provider");
        var REACT_CONTEXT_TYPE = Symbol.for("react.context");
        var REACT_FORWARD_REF_TYPE = Symbol.for("react.forward_ref");
        var REACT_SUSPENSE_TYPE = Symbol.for("react.suspense");
        var REACT_SUSPENSE_LIST_TYPE = Symbol.for("react.suspense_list");
        var REACT_MEMO_TYPE = Symbol.for("react.memo");
        var REACT_LAZY_TYPE = Symbol.for("react.lazy");
        var REACT_OFFSCREEN_TYPE = Symbol.for("react.offscreen");
        var MAYBE_ITERATOR_SYMBOL = Symbol.iterator;
        var FAUX_ITERATOR_SYMBOL = "@@iterator";
        function getIteratorFn(maybeIterable) {
          if (maybeIterable === null || typeof maybeIterable !== "object") {
            return null;
          }
          var maybeIterator = MAYBE_ITERATOR_SYMBOL && maybeIterable[MAYBE_ITERATOR_SYMBOL] || maybeIterable[FAUX_ITERATOR_SYMBOL];
          if (typeof maybeIterator === "function") {
            return maybeIterator;
          }
          return null;
        }
        var ReactCurrentDispatcher = {
          /**
           * @internal
           * @type {ReactComponent}
           */
          current: null
        };
        var ReactCurrentBatchConfig = {
          transition: null
        };
        var ReactCurrentActQueue = {
          current: null,
          // Used to reproduce behavior of `batchedUpdates` in legacy mode.
          isBatchingLegacy: false,
          didScheduleLegacyUpdate: false
        };
        var ReactCurrentOwner = {
          /**
           * @internal
           * @type {ReactComponent}
           */
          current: null
        };
        var ReactDebugCurrentFrame = {};
        var currentExtraStackFrame = null;
        function setExtraStackFrame(stack) {
          {
            currentExtraStackFrame = stack;
          }
        }
        {
          ReactDebugCurrentFrame.setExtraStackFrame = function(stack) {
            {
              currentExtraStackFrame = stack;
            }
          };
          ReactDebugCurrentFrame.getCurrentStack = null;
          ReactDebugCurrentFrame.getStackAddendum = function() {
            var stack = "";
            if (currentExtraStackFrame) {
              stack += currentExtraStackFrame;
            }
            var impl = ReactDebugCurrentFrame.getCurrentStack;
            if (impl) {
              stack += impl() || "";
            }
            return stack;
          };
        }
        var enableScopeAPI = false;
        var enableCacheElement = false;
        var enableTransitionTracing = false;
        var enableLegacyHidden = false;
        var enableDebugTracing = false;
        var ReactSharedInternals = {
          ReactCurrentDispatcher,
          ReactCurrentBatchConfig,
          ReactCurrentOwner
        };
        {
          ReactSharedInternals.ReactDebugCurrentFrame = ReactDebugCurrentFrame;
          ReactSharedInternals.ReactCurrentActQueue = ReactCurrentActQueue;
        }
        function warn(format) {
          {
            {
              for (var _len = arguments.length, args = new Array(_len > 1 ? _len - 1 : 0), _key = 1; _key < _len; _key++) {
                args[_key - 1] = arguments[_key];
              }
              printWarning("warn", format, args);
            }
          }
        }
        function error(format) {
          {
            {
              for (var _len2 = arguments.length, args = new Array(_len2 > 1 ? _len2 - 1 : 0), _key2 = 1; _key2 < _len2; _key2++) {
                args[_key2 - 1] = arguments[_key2];
              }
              printWarning("error", format, args);
            }
          }
        }
        function printWarning(level, format, args) {
          {
            var ReactDebugCurrentFrame2 = ReactSharedInternals.ReactDebugCurrentFrame;
            var stack = ReactDebugCurrentFrame2.getStackAddendum();
            if (stack !== "") {
              format += "%s";
              args = args.concat([stack]);
            }
            var argsWithFormat = args.map(function(item) {
              return String(item);
            });
            argsWithFormat.unshift("Warning: " + format);
            Function.prototype.apply.call(console[level], console, argsWithFormat);
          }
        }
        var didWarnStateUpdateForUnmountedComponent = {};
        function warnNoop(publicInstance, callerName) {
          {
            var _constructor = publicInstance.constructor;
            var componentName = _constructor && (_constructor.displayName || _constructor.name) || "ReactClass";
            var warningKey = componentName + "." + callerName;
            if (didWarnStateUpdateForUnmountedComponent[warningKey]) {
              return;
            }
            error("Can't call %s on a component that is not yet mounted. This is a no-op, but it might indicate a bug in your application. Instead, assign to `this.state` directly or define a `state = {};` class property with the desired state in the %s component.", callerName, componentName);
            didWarnStateUpdateForUnmountedComponent[warningKey] = true;
          }
        }
        var ReactNoopUpdateQueue = {
          /**
           * Checks whether or not this composite component is mounted.
           * @param {ReactClass} publicInstance The instance we want to test.
           * @return {boolean} True if mounted, false otherwise.
           * @protected
           * @final
           */
          isMounted: function(publicInstance) {
            return false;
          },
          /**
           * Forces an update. This should only be invoked when it is known with
           * certainty that we are **not** in a DOM transaction.
           *
           * You may want to call this when you know that some deeper aspect of the
           * component's state has changed but `setState` was not called.
           *
           * This will not invoke `shouldComponentUpdate`, but it will invoke
           * `componentWillUpdate` and `componentDidUpdate`.
           *
           * @param {ReactClass} publicInstance The instance that should rerender.
           * @param {?function} callback Called after component is updated.
           * @param {?string} callerName name of the calling function in the public API.
           * @internal
           */
          enqueueForceUpdate: function(publicInstance, callback, callerName) {
            warnNoop(publicInstance, "forceUpdate");
          },
          /**
           * Replaces all of the state. Always use this or `setState` to mutate state.
           * You should treat `this.state` as immutable.
           *
           * There is no guarantee that `this.state` will be immediately updated, so
           * accessing `this.state` after calling this method may return the old value.
           *
           * @param {ReactClass} publicInstance The instance that should rerender.
           * @param {object} completeState Next state.
           * @param {?function} callback Called after component is updated.
           * @param {?string} callerName name of the calling function in the public API.
           * @internal
           */
          enqueueReplaceState: function(publicInstance, completeState, callback, callerName) {
            warnNoop(publicInstance, "replaceState");
          },
          /**
           * Sets a subset of the state. This only exists because _pendingState is
           * internal. This provides a merging strategy that is not available to deep
           * properties which is confusing. TODO: Expose pendingState or don't use it
           * during the merge.
           *
           * @param {ReactClass} publicInstance The instance that should rerender.
           * @param {object} partialState Next partial state to be merged with state.
           * @param {?function} callback Called after component is updated.
           * @param {?string} Name of the calling function in the public API.
           * @internal
           */
          enqueueSetState: function(publicInstance, partialState, callback, callerName) {
            warnNoop(publicInstance, "setState");
          }
        };
        var assign = Object.assign;
        var emptyObject = {};
        {
          Object.freeze(emptyObject);
        }
        function Component(props, context, updater) {
          this.props = props;
          this.context = context;
          this.refs = emptyObject;
          this.updater = updater || ReactNoopUpdateQueue;
        }
        Component.prototype.isReactComponent = {};
        Component.prototype.setState = function(partialState, callback) {
          if (typeof partialState !== "object" && typeof partialState !== "function" && partialState != null) {
            throw new Error("setState(...): takes an object of state variables to update or a function which returns an object of state variables.");
          }
          this.updater.enqueueSetState(this, partialState, callback, "setState");
        };
        Component.prototype.forceUpdate = function(callback) {
          this.updater.enqueueForceUpdate(this, callback, "forceUpdate");
        };
        {
          var deprecatedAPIs = {
            isMounted: ["isMounted", "Instead, make sure to clean up subscriptions and pending requests in componentWillUnmount to prevent memory leaks."],
            replaceState: ["replaceState", "Refactor your code to use setState instead (see https://github.com/facebook/react/issues/3236)."]
          };
          var defineDeprecationWarning = function(methodName, info) {
            Object.defineProperty(Component.prototype, methodName, {
              get: function() {
                warn("%s(...) is deprecated in plain JavaScript React classes. %s", info[0], info[1]);
                return void 0;
              }
            });
          };
          for (var fnName in deprecatedAPIs) {
            if (deprecatedAPIs.hasOwnProperty(fnName)) {
              defineDeprecationWarning(fnName, deprecatedAPIs[fnName]);
            }
          }
        }
        function ComponentDummy() {
        }
        ComponentDummy.prototype = Component.prototype;
        function PureComponent(props, context, updater) {
          this.props = props;
          this.context = context;
          this.refs = emptyObject;
          this.updater = updater || ReactNoopUpdateQueue;
        }
        var pureComponentPrototype = PureComponent.prototype = new ComponentDummy();
        pureComponentPrototype.constructor = PureComponent;
        assign(pureComponentPrototype, Component.prototype);
        pureComponentPrototype.isPureReactComponent = true;
        function createRef() {
          var refObject = {
            current: null
          };
          {
            Object.seal(refObject);
          }
          return refObject;
        }
        var isArrayImpl = Array.isArray;
        function isArray(a) {
          return isArrayImpl(a);
        }
        function typeName(value) {
          {
            var hasToStringTag = typeof Symbol === "function" && Symbol.toStringTag;
            var type = hasToStringTag && value[Symbol.toStringTag] || value.constructor.name || "Object";
            return type;
          }
        }
        function willCoercionThrow(value) {
          {
            try {
              testStringCoercion(value);
              return false;
            } catch (e) {
              return true;
            }
          }
        }
        function testStringCoercion(value) {
          return "" + value;
        }
        function checkKeyStringCoercion(value) {
          {
            if (willCoercionThrow(value)) {
              error("The provided key is an unsupported type %s. This value must be coerced to a string before before using it here.", typeName(value));
              return testStringCoercion(value);
            }
          }
        }
        function getWrappedName(outerType, innerType, wrapperName) {
          var displayName = outerType.displayName;
          if (displayName) {
            return displayName;
          }
          var functionName = innerType.displayName || innerType.name || "";
          return functionName !== "" ? wrapperName + "(" + functionName + ")" : wrapperName;
        }
        function getContextName(type) {
          return type.displayName || "Context";
        }
        function getComponentNameFromType(type) {
          if (type == null) {
            return null;
          }
          {
            if (typeof type.tag === "number") {
              error("Received an unexpected object in getComponentNameFromType(). This is likely a bug in React. Please file an issue.");
            }
          }
          if (typeof type === "function") {
            return type.displayName || type.name || null;
          }
          if (typeof type === "string") {
            return type;
          }
          switch (type) {
            case REACT_FRAGMENT_TYPE:
              return "Fragment";
            case REACT_PORTAL_TYPE:
              return "Portal";
            case REACT_PROFILER_TYPE:
              return "Profiler";
            case REACT_STRICT_MODE_TYPE:
              return "StrictMode";
            case REACT_SUSPENSE_TYPE:
              return "Suspense";
            case REACT_SUSPENSE_LIST_TYPE:
              return "SuspenseList";
          }
          if (typeof type === "object") {
            switch (type.$$typeof) {
              case REACT_CONTEXT_TYPE:
                var context = type;
                return getContextName(context) + ".Consumer";
              case REACT_PROVIDER_TYPE:
                var provider = type;
                return getContextName(provider._context) + ".Provider";
              case REACT_FORWARD_REF_TYPE:
                return getWrappedName(type, type.render, "ForwardRef");
              case REACT_MEMO_TYPE:
                var outerName = type.displayName || null;
                if (outerName !== null) {
                  return outerName;
                }
                return getComponentNameFromType(type.type) || "Memo";
              case REACT_LAZY_TYPE: {
                var lazyComponent = type;
                var payload = lazyComponent._payload;
                var init = lazyComponent._init;
                try {
                  return getComponentNameFromType(init(payload));
                } catch (x) {
                  return null;
                }
              }
            }
          }
          return null;
        }
        var hasOwnProperty = Object.prototype.hasOwnProperty;
        var RESERVED_PROPS = {
          key: true,
          ref: true,
          __self: true,
          __source: true
        };
        var specialPropKeyWarningShown, specialPropRefWarningShown, didWarnAboutStringRefs;
        {
          didWarnAboutStringRefs = {};
        }
        function hasValidRef(config) {
          {
            if (hasOwnProperty.call(config, "ref")) {
              var getter = Object.getOwnPropertyDescriptor(config, "ref").get;
              if (getter && getter.isReactWarning) {
                return false;
              }
            }
          }
          return config.ref !== void 0;
        }
        function hasValidKey(config) {
          {
            if (hasOwnProperty.call(config, "key")) {
              var getter = Object.getOwnPropertyDescriptor(config, "key").get;
              if (getter && getter.isReactWarning) {
                return false;
              }
            }
          }
          return config.key !== void 0;
        }
        function defineKeyPropWarningGetter(props, displayName) {
          var warnAboutAccessingKey = function() {
            {
              if (!specialPropKeyWarningShown) {
                specialPropKeyWarningShown = true;
                error("%s: `key` is not a prop. Trying to access it will result in `undefined` being returned. If you need to access the same value within the child component, you should pass it as a different prop. (https://reactjs.org/link/special-props)", displayName);
              }
            }
          };
          warnAboutAccessingKey.isReactWarning = true;
          Object.defineProperty(props, "key", {
            get: warnAboutAccessingKey,
            configurable: true
          });
        }
        function defineRefPropWarningGetter(props, displayName) {
          var warnAboutAccessingRef = function() {
            {
              if (!specialPropRefWarningShown) {
                specialPropRefWarningShown = true;
                error("%s: `ref` is not a prop. Trying to access it will result in `undefined` being returned. If you need to access the same value within the child component, you should pass it as a different prop. (https://reactjs.org/link/special-props)", displayName);
              }
            }
          };
          warnAboutAccessingRef.isReactWarning = true;
          Object.defineProperty(props, "ref", {
            get: warnAboutAccessingRef,
            configurable: true
          });
        }
        function warnIfStringRefCannotBeAutoConverted(config) {
          {
            if (typeof config.ref === "string" && ReactCurrentOwner.current && config.__self && ReactCurrentOwner.current.stateNode !== config.__self) {
              var componentName = getComponentNameFromType(ReactCurrentOwner.current.type);
              if (!didWarnAboutStringRefs[componentName]) {
                error('Component "%s" contains the string ref "%s". Support for string refs will be removed in a future major release. This case cannot be automatically converted to an arrow function. We ask you to manually fix this case by using useRef() or createRef() instead. Learn more about using refs safely here: https://reactjs.org/link/strict-mode-string-ref', componentName, config.ref);
                didWarnAboutStringRefs[componentName] = true;
              }
            }
          }
        }
        var ReactElement = function(type, key, ref2, self, source, owner, props) {
          var element = {
            // This tag allows us to uniquely identify this as a React Element
            $$typeof: REACT_ELEMENT_TYPE,
            // Built-in properties that belong on the element
            type,
            key,
            ref: ref2,
            props,
            // Record the component responsible for creating this element.
            _owner: owner
          };
          {
            element._store = {};
            Object.defineProperty(element._store, "validated", {
              configurable: false,
              enumerable: false,
              writable: true,
              value: false
            });
            Object.defineProperty(element, "_self", {
              configurable: false,
              enumerable: false,
              writable: false,
              value: self
            });
            Object.defineProperty(element, "_source", {
              configurable: false,
              enumerable: false,
              writable: false,
              value: source
            });
            if (Object.freeze) {
              Object.freeze(element.props);
              Object.freeze(element);
            }
          }
          return element;
        };
        function createElement(type, config, children) {
          var propName;
          var props = {};
          var key = null;
          var ref2 = null;
          var self = null;
          var source = null;
          if (config != null) {
            if (hasValidRef(config)) {
              ref2 = config.ref;
              {
                warnIfStringRefCannotBeAutoConverted(config);
              }
            }
            if (hasValidKey(config)) {
              {
                checkKeyStringCoercion(config.key);
              }
              key = "" + config.key;
            }
            self = config.__self === void 0 ? null : config.__self;
            source = config.__source === void 0 ? null : config.__source;
            for (propName in config) {
              if (hasOwnProperty.call(config, propName) && !RESERVED_PROPS.hasOwnProperty(propName)) {
                props[propName] = config[propName];
              }
            }
          }
          var childrenLength = arguments.length - 2;
          if (childrenLength === 1) {
            props.children = children;
          } else if (childrenLength > 1) {
            var childArray = Array(childrenLength);
            for (var i = 0; i < childrenLength; i++) {
              childArray[i] = arguments[i + 2];
            }
            {
              if (Object.freeze) {
                Object.freeze(childArray);
              }
            }
            props.children = childArray;
          }
          if (type && type.defaultProps) {
            var defaultProps = type.defaultProps;
            for (propName in defaultProps) {
              if (props[propName] === void 0) {
                props[propName] = defaultProps[propName];
              }
            }
          }
          {
            if (key || ref2) {
              var displayName = typeof type === "function" ? type.displayName || type.name || "Unknown" : type;
              if (key) {
                defineKeyPropWarningGetter(props, displayName);
              }
              if (ref2) {
                defineRefPropWarningGetter(props, displayName);
              }
            }
          }
          return ReactElement(type, key, ref2, self, source, ReactCurrentOwner.current, props);
        }
        function cloneAndReplaceKey(oldElement, newKey) {
          var newElement = ReactElement(oldElement.type, newKey, oldElement.ref, oldElement._self, oldElement._source, oldElement._owner, oldElement.props);
          return newElement;
        }
        function cloneElement(element, config, children) {
          if (element === null || element === void 0) {
            throw new Error("React.cloneElement(...): The argument must be a React element, but you passed " + element + ".");
          }
          var propName;
          var props = assign({}, element.props);
          var key = element.key;
          var ref2 = element.ref;
          var self = element._self;
          var source = element._source;
          var owner = element._owner;
          if (config != null) {
            if (hasValidRef(config)) {
              ref2 = config.ref;
              owner = ReactCurrentOwner.current;
            }
            if (hasValidKey(config)) {
              {
                checkKeyStringCoercion(config.key);
              }
              key = "" + config.key;
            }
            var defaultProps;
            if (element.type && element.type.defaultProps) {
              defaultProps = element.type.defaultProps;
            }
            for (propName in config) {
              if (hasOwnProperty.call(config, propName) && !RESERVED_PROPS.hasOwnProperty(propName)) {
                if (config[propName] === void 0 && defaultProps !== void 0) {
                  props[propName] = defaultProps[propName];
                } else {
                  props[propName] = config[propName];
                }
              }
            }
          }
          var childrenLength = arguments.length - 2;
          if (childrenLength === 1) {
            props.children = children;
          } else if (childrenLength > 1) {
            var childArray = Array(childrenLength);
            for (var i = 0; i < childrenLength; i++) {
              childArray[i] = arguments[i + 2];
            }
            props.children = childArray;
          }
          return ReactElement(element.type, key, ref2, self, source, owner, props);
        }
        function isValidElement(object) {
          return typeof object === "object" && object !== null && object.$$typeof === REACT_ELEMENT_TYPE;
        }
        var SEPARATOR = ".";
        var SUBSEPARATOR = ":";
        function escape(key) {
          var escapeRegex = /[=:]/g;
          var escaperLookup = {
            "=": "=0",
            ":": "=2"
          };
          var escapedString = key.replace(escapeRegex, function(match) {
            return escaperLookup[match];
          });
          return "$" + escapedString;
        }
        var didWarnAboutMaps = false;
        var userProvidedKeyEscapeRegex = /\/+/g;
        function escapeUserProvidedKey(text) {
          return text.replace(userProvidedKeyEscapeRegex, "$&/");
        }
        function getElementKey(element, index) {
          if (typeof element === "object" && element !== null && element.key != null) {
            {
              checkKeyStringCoercion(element.key);
            }
            return escape("" + element.key);
          }
          return index.toString(36);
        }
        function mapIntoArray(children, array, escapedPrefix, nameSoFar, callback) {
          var type = typeof children;
          if (type === "undefined" || type === "boolean") {
            children = null;
          }
          var invokeCallback = false;
          if (children === null) {
            invokeCallback = true;
          } else {
            switch (type) {
              case "string":
              case "number":
                invokeCallback = true;
                break;
              case "object":
                switch (children.$$typeof) {
                  case REACT_ELEMENT_TYPE:
                  case REACT_PORTAL_TYPE:
                    invokeCallback = true;
                }
            }
          }
          if (invokeCallback) {
            var _child = children;
            var mappedChild = callback(_child);
            var childKey = nameSoFar === "" ? SEPARATOR + getElementKey(_child, 0) : nameSoFar;
            if (isArray(mappedChild)) {
              var escapedChildKey = "";
              if (childKey != null) {
                escapedChildKey = escapeUserProvidedKey(childKey) + "/";
              }
              mapIntoArray(mappedChild, array, escapedChildKey, "", function(c) {
                return c;
              });
            } else if (mappedChild != null) {
              if (isValidElement(mappedChild)) {
                {
                  if (mappedChild.key && (!_child || _child.key !== mappedChild.key)) {
                    checkKeyStringCoercion(mappedChild.key);
                  }
                }
                mappedChild = cloneAndReplaceKey(
                  mappedChild,
                  // Keep both the (mapped) and old keys if they differ, just as
                  // traverseAllChildren used to do for objects as children
                  escapedPrefix + // $FlowFixMe Flow incorrectly thinks React.Portal doesn't have a key
                  (mappedChild.key && (!_child || _child.key !== mappedChild.key) ? (
                    // $FlowFixMe Flow incorrectly thinks existing element's key can be a number
                    // eslint-disable-next-line react-internal/safe-string-coercion
                    escapeUserProvidedKey("" + mappedChild.key) + "/"
                  ) : "") + childKey
                );
              }
              array.push(mappedChild);
            }
            return 1;
          }
          var child;
          var nextName;
          var subtreeCount = 0;
          var nextNamePrefix = nameSoFar === "" ? SEPARATOR : nameSoFar + SUBSEPARATOR;
          if (isArray(children)) {
            for (var i = 0; i < children.length; i++) {
              child = children[i];
              nextName = nextNamePrefix + getElementKey(child, i);
              subtreeCount += mapIntoArray(child, array, escapedPrefix, nextName, callback);
            }
          } else {
            var iteratorFn = getIteratorFn(children);
            if (typeof iteratorFn === "function") {
              var iterableChildren = children;
              {
                if (iteratorFn === iterableChildren.entries) {
                  if (!didWarnAboutMaps) {
                    warn("Using Maps as children is not supported. Use an array of keyed ReactElements instead.");
                  }
                  didWarnAboutMaps = true;
                }
              }
              var iterator = iteratorFn.call(iterableChildren);
              var step;
              var ii = 0;
              while (!(step = iterator.next()).done) {
                child = step.value;
                nextName = nextNamePrefix + getElementKey(child, ii++);
                subtreeCount += mapIntoArray(child, array, escapedPrefix, nextName, callback);
              }
            } else if (type === "object") {
              var childrenString = String(children);
              throw new Error("Objects are not valid as a React child (found: " + (childrenString === "[object Object]" ? "object with keys {" + Object.keys(children).join(", ") + "}" : childrenString) + "). If you meant to render a collection of children, use an array instead.");
            }
          }
          return subtreeCount;
        }
        function mapChildren(children, func, context) {
          if (children == null) {
            return children;
          }
          var result = [];
          var count = 0;
          mapIntoArray(children, result, "", "", function(child) {
            return func.call(context, child, count++);
          });
          return result;
        }
        function countChildren(children) {
          var n = 0;
          mapChildren(children, function() {
            n++;
          });
          return n;
        }
        function forEachChildren(children, forEachFunc, forEachContext) {
          mapChildren(children, function() {
            forEachFunc.apply(this, arguments);
          }, forEachContext);
        }
        function toArray(children) {
          return mapChildren(children, function(child) {
            return child;
          }) || [];
        }
        function onlyChild(children) {
          if (!isValidElement(children)) {
            throw new Error("React.Children.only expected to receive a single React element child.");
          }
          return children;
        }
        function createContext(defaultValue) {
          var context = {
            $$typeof: REACT_CONTEXT_TYPE,
            // As a workaround to support multiple concurrent renderers, we categorize
            // some renderers as primary and others as secondary. We only expect
            // there to be two concurrent renderers at most: React Native (primary) and
            // Fabric (secondary); React DOM (primary) and React ART (secondary).
            // Secondary renderers store their context values on separate fields.
            _currentValue: defaultValue,
            _currentValue2: defaultValue,
            // Used to track how many concurrent renderers this context currently
            // supports within in a single renderer. Such as parallel server rendering.
            _threadCount: 0,
            // These are circular
            Provider: null,
            Consumer: null,
            // Add these to use same hidden class in VM as ServerContext
            _defaultValue: null,
            _globalName: null
          };
          context.Provider = {
            $$typeof: REACT_PROVIDER_TYPE,
            _context: context
          };
          var hasWarnedAboutUsingNestedContextConsumers = false;
          var hasWarnedAboutUsingConsumerProvider = false;
          var hasWarnedAboutDisplayNameOnConsumer = false;
          {
            var Consumer = {
              $$typeof: REACT_CONTEXT_TYPE,
              _context: context
            };
            Object.defineProperties(Consumer, {
              Provider: {
                get: function() {
                  if (!hasWarnedAboutUsingConsumerProvider) {
                    hasWarnedAboutUsingConsumerProvider = true;
                    error("Rendering <Context.Consumer.Provider> is not supported and will be removed in a future major release. Did you mean to render <Context.Provider> instead?");
                  }
                  return context.Provider;
                },
                set: function(_Provider) {
                  context.Provider = _Provider;
                }
              },
              _currentValue: {
                get: function() {
                  return context._currentValue;
                },
                set: function(_currentValue) {
                  context._currentValue = _currentValue;
                }
              },
              _currentValue2: {
                get: function() {
                  return context._currentValue2;
                },
                set: function(_currentValue2) {
                  context._currentValue2 = _currentValue2;
                }
              },
              _threadCount: {
                get: function() {
                  return context._threadCount;
                },
                set: function(_threadCount) {
                  context._threadCount = _threadCount;
                }
              },
              Consumer: {
                get: function() {
                  if (!hasWarnedAboutUsingNestedContextConsumers) {
                    hasWarnedAboutUsingNestedContextConsumers = true;
                    error("Rendering <Context.Consumer.Consumer> is not supported and will be removed in a future major release. Did you mean to render <Context.Consumer> instead?");
                  }
                  return context.Consumer;
                }
              },
              displayName: {
                get: function() {
                  return context.displayName;
                },
                set: function(displayName) {
                  if (!hasWarnedAboutDisplayNameOnConsumer) {
                    warn("Setting `displayName` on Context.Consumer has no effect. You should set it directly on the context with Context.displayName = '%s'.", displayName);
                    hasWarnedAboutDisplayNameOnConsumer = true;
                  }
                }
              }
            });
            context.Consumer = Consumer;
          }
          {
            context._currentRenderer = null;
            context._currentRenderer2 = null;
          }
          return context;
        }
        var Uninitialized = -1;
        var Pending = 0;
        var Resolved = 1;
        var Rejected = 2;
        function lazyInitializer(payload) {
          if (payload._status === Uninitialized) {
            var ctor = payload._result;
            var thenable = ctor();
            thenable.then(function(moduleObject2) {
              if (payload._status === Pending || payload._status === Uninitialized) {
                var resolved = payload;
                resolved._status = Resolved;
                resolved._result = moduleObject2;
              }
            }, function(error2) {
              if (payload._status === Pending || payload._status === Uninitialized) {
                var rejected = payload;
                rejected._status = Rejected;
                rejected._result = error2;
              }
            });
            if (payload._status === Uninitialized) {
              var pending = payload;
              pending._status = Pending;
              pending._result = thenable;
            }
          }
          if (payload._status === Resolved) {
            var moduleObject = payload._result;
            {
              if (moduleObject === void 0) {
                error("lazy: Expected the result of a dynamic import() call. Instead received: %s\n\nYour code should look like: \n  const MyComponent = lazy(() => import('./MyComponent'))\n\nDid you accidentally put curly braces around the import?", moduleObject);
              }
            }
            {
              if (!("default" in moduleObject)) {
                error("lazy: Expected the result of a dynamic import() call. Instead received: %s\n\nYour code should look like: \n  const MyComponent = lazy(() => import('./MyComponent'))", moduleObject);
              }
            }
            return moduleObject.default;
          } else {
            throw payload._result;
          }
        }
        function lazy(ctor) {
          var payload = {
            // We use these fields to store the result.
            _status: Uninitialized,
            _result: ctor
          };
          var lazyType = {
            $$typeof: REACT_LAZY_TYPE,
            _payload: payload,
            _init: lazyInitializer
          };
          {
            var defaultProps;
            var propTypes;
            Object.defineProperties(lazyType, {
              defaultProps: {
                configurable: true,
                get: function() {
                  return defaultProps;
                },
                set: function(newDefaultProps) {
                  error("React.lazy(...): It is not supported to assign `defaultProps` to a lazy component import. Either specify them where the component is defined, or create a wrapping component around it.");
                  defaultProps = newDefaultProps;
                  Object.defineProperty(lazyType, "defaultProps", {
                    enumerable: true
                  });
                }
              },
              propTypes: {
                configurable: true,
                get: function() {
                  return propTypes;
                },
                set: function(newPropTypes) {
                  error("React.lazy(...): It is not supported to assign `propTypes` to a lazy component import. Either specify them where the component is defined, or create a wrapping component around it.");
                  propTypes = newPropTypes;
                  Object.defineProperty(lazyType, "propTypes", {
                    enumerable: true
                  });
                }
              }
            });
          }
          return lazyType;
        }
        function forwardRef(render) {
          {
            if (render != null && render.$$typeof === REACT_MEMO_TYPE) {
              error("forwardRef requires a render function but received a `memo` component. Instead of forwardRef(memo(...)), use memo(forwardRef(...)).");
            } else if (typeof render !== "function") {
              error("forwardRef requires a render function but was given %s.", render === null ? "null" : typeof render);
            } else {
              if (render.length !== 0 && render.length !== 2) {
                error("forwardRef render functions accept exactly two parameters: props and ref. %s", render.length === 1 ? "Did you forget to use the ref parameter?" : "Any additional parameter will be undefined.");
              }
            }
            if (render != null) {
              if (render.defaultProps != null || render.propTypes != null) {
                error("forwardRef render functions do not support propTypes or defaultProps. Did you accidentally pass a React component?");
              }
            }
          }
          var elementType = {
            $$typeof: REACT_FORWARD_REF_TYPE,
            render
          };
          {
            var ownName;
            Object.defineProperty(elementType, "displayName", {
              enumerable: false,
              configurable: true,
              get: function() {
                return ownName;
              },
              set: function(name) {
                ownName = name;
                if (!render.name && !render.displayName) {
                  render.displayName = name;
                }
              }
            });
          }
          return elementType;
        }
        var REACT_MODULE_REFERENCE;
        {
          REACT_MODULE_REFERENCE = Symbol.for("react.module.reference");
        }
        function isValidElementType(type) {
          if (typeof type === "string" || typeof type === "function") {
            return true;
          }
          if (type === REACT_FRAGMENT_TYPE || type === REACT_PROFILER_TYPE || enableDebugTracing || type === REACT_STRICT_MODE_TYPE || type === REACT_SUSPENSE_TYPE || type === REACT_SUSPENSE_LIST_TYPE || enableLegacyHidden || type === REACT_OFFSCREEN_TYPE || enableScopeAPI || enableCacheElement || enableTransitionTracing) {
            return true;
          }
          if (typeof type === "object" && type !== null) {
            if (type.$$typeof === REACT_LAZY_TYPE || type.$$typeof === REACT_MEMO_TYPE || type.$$typeof === REACT_PROVIDER_TYPE || type.$$typeof === REACT_CONTEXT_TYPE || type.$$typeof === REACT_FORWARD_REF_TYPE || // This needs to include all possible module reference object
            // types supported by any Flight configuration anywhere since
            // we don't know which Flight build this will end up being used
            // with.
            type.$$typeof === REACT_MODULE_REFERENCE || type.getModuleId !== void 0) {
              return true;
            }
          }
          return false;
        }
        function memo(type, compare) {
          {
            if (!isValidElementType(type)) {
              error("memo: The first argument must be a component. Instead received: %s", type === null ? "null" : typeof type);
            }
          }
          var elementType = {
            $$typeof: REACT_MEMO_TYPE,
            type,
            compare: compare === void 0 ? null : compare
          };
          {
            var ownName;
            Object.defineProperty(elementType, "displayName", {
              enumerable: false,
              configurable: true,
              get: function() {
                return ownName;
              },
              set: function(name) {
                ownName = name;
                if (!type.name && !type.displayName) {
                  type.displayName = name;
                }
              }
            });
          }
          return elementType;
        }
        function resolveDispatcher() {
          var dispatcher = ReactCurrentDispatcher.current;
          {
            if (dispatcher === null) {
              error("Invalid hook call. Hooks can only be called inside of the body of a function component. This could happen for one of the following reasons:\n1. You might have mismatching versions of React and the renderer (such as React DOM)\n2. You might be breaking the Rules of Hooks\n3. You might have more than one copy of React in the same app\nSee https://reactjs.org/link/invalid-hook-call for tips about how to debug and fix this problem.");
            }
          }
          return dispatcher;
        }
        function useContext(Context) {
          var dispatcher = resolveDispatcher();
          {
            if (Context._context !== void 0) {
              var realContext = Context._context;
              if (realContext.Consumer === Context) {
                error("Calling useContext(Context.Consumer) is not supported, may cause bugs, and will be removed in a future major release. Did you mean to call useContext(Context) instead?");
              } else if (realContext.Provider === Context) {
                error("Calling useContext(Context.Provider) is not supported. Did you mean to call useContext(Context) instead?");
              }
            }
          }
          return dispatcher.useContext(Context);
        }
        function useState2(initialState) {
          var dispatcher = resolveDispatcher();
          return dispatcher.useState(initialState);
        }
        function useReducer(reducer, initialArg, init) {
          var dispatcher = resolveDispatcher();
          return dispatcher.useReducer(reducer, initialArg, init);
        }
        function useRef2(initialValue) {
          var dispatcher = resolveDispatcher();
          return dispatcher.useRef(initialValue);
        }
        function useEffect2(create, deps) {
          var dispatcher = resolveDispatcher();
          return dispatcher.useEffect(create, deps);
        }
        function useInsertionEffect(create, deps) {
          var dispatcher = resolveDispatcher();
          return dispatcher.useInsertionEffect(create, deps);
        }
        function useLayoutEffect(create, deps) {
          var dispatcher = resolveDispatcher();
          return dispatcher.useLayoutEffect(create, deps);
        }
        function useCallback(callback, deps) {
          var dispatcher = resolveDispatcher();
          return dispatcher.useCallback(callback, deps);
        }
        function useMemo(create, deps) {
          var dispatcher = resolveDispatcher();
          return dispatcher.useMemo(create, deps);
        }
        function useImperativeHandle(ref2, create, deps) {
          var dispatcher = resolveDispatcher();
          return dispatcher.useImperativeHandle(ref2, create, deps);
        }
        function useDebugValue(value, formatterFn) {
          {
            var dispatcher = resolveDispatcher();
            return dispatcher.useDebugValue(value, formatterFn);
          }
        }
        function useTransition() {
          var dispatcher = resolveDispatcher();
          return dispatcher.useTransition();
        }
        function useDeferredValue(value) {
          var dispatcher = resolveDispatcher();
          return dispatcher.useDeferredValue(value);
        }
        function useId() {
          var dispatcher = resolveDispatcher();
          return dispatcher.useId();
        }
        function useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot) {
          var dispatcher = resolveDispatcher();
          return dispatcher.useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
        }
        var disabledDepth = 0;
        var prevLog;
        var prevInfo;
        var prevWarn;
        var prevError;
        var prevGroup;
        var prevGroupCollapsed;
        var prevGroupEnd;
        function disabledLog() {
        }
        disabledLog.__reactDisabledLog = true;
        function disableLogs() {
          {
            if (disabledDepth === 0) {
              prevLog = console.log;
              prevInfo = console.info;
              prevWarn = console.warn;
              prevError = console.error;
              prevGroup = console.group;
              prevGroupCollapsed = console.groupCollapsed;
              prevGroupEnd = console.groupEnd;
              var props = {
                configurable: true,
                enumerable: true,
                value: disabledLog,
                writable: true
              };
              Object.defineProperties(console, {
                info: props,
                log: props,
                warn: props,
                error: props,
                group: props,
                groupCollapsed: props,
                groupEnd: props
              });
            }
            disabledDepth++;
          }
        }
        function reenableLogs() {
          {
            disabledDepth--;
            if (disabledDepth === 0) {
              var props = {
                configurable: true,
                enumerable: true,
                writable: true
              };
              Object.defineProperties(console, {
                log: assign({}, props, {
                  value: prevLog
                }),
                info: assign({}, props, {
                  value: prevInfo
                }),
                warn: assign({}, props, {
                  value: prevWarn
                }),
                error: assign({}, props, {
                  value: prevError
                }),
                group: assign({}, props, {
                  value: prevGroup
                }),
                groupCollapsed: assign({}, props, {
                  value: prevGroupCollapsed
                }),
                groupEnd: assign({}, props, {
                  value: prevGroupEnd
                })
              });
            }
            if (disabledDepth < 0) {
              error("disabledDepth fell below zero. This is a bug in React. Please file an issue.");
            }
          }
        }
        var ReactCurrentDispatcher$1 = ReactSharedInternals.ReactCurrentDispatcher;
        var prefix;
        function describeBuiltInComponentFrame(name, source, ownerFn) {
          {
            if (prefix === void 0) {
              try {
                throw Error();
              } catch (x) {
                var match = x.stack.trim().match(/\n( *(at )?)/);
                prefix = match && match[1] || "";
              }
            }
            return "\n" + prefix + name;
          }
        }
        var reentry = false;
        var componentFrameCache;
        {
          var PossiblyWeakMap = typeof WeakMap === "function" ? WeakMap : Map;
          componentFrameCache = new PossiblyWeakMap();
        }
        function describeNativeComponentFrame(fn, construct) {
          if (!fn || reentry) {
            return "";
          }
          {
            var frame = componentFrameCache.get(fn);
            if (frame !== void 0) {
              return frame;
            }
          }
          var control;
          reentry = true;
          var previousPrepareStackTrace = Error.prepareStackTrace;
          Error.prepareStackTrace = void 0;
          var previousDispatcher;
          {
            previousDispatcher = ReactCurrentDispatcher$1.current;
            ReactCurrentDispatcher$1.current = null;
            disableLogs();
          }
          try {
            if (construct) {
              var Fake = function() {
                throw Error();
              };
              Object.defineProperty(Fake.prototype, "props", {
                set: function() {
                  throw Error();
                }
              });
              if (typeof Reflect === "object" && Reflect.construct) {
                try {
                  Reflect.construct(Fake, []);
                } catch (x) {
                  control = x;
                }
                Reflect.construct(fn, [], Fake);
              } else {
                try {
                  Fake.call();
                } catch (x) {
                  control = x;
                }
                fn.call(Fake.prototype);
              }
            } else {
              try {
                throw Error();
              } catch (x) {
                control = x;
              }
              fn();
            }
          } catch (sample) {
            if (sample && control && typeof sample.stack === "string") {
              var sampleLines = sample.stack.split("\n");
              var controlLines = control.stack.split("\n");
              var s = sampleLines.length - 1;
              var c = controlLines.length - 1;
              while (s >= 1 && c >= 0 && sampleLines[s] !== controlLines[c]) {
                c--;
              }
              for (; s >= 1 && c >= 0; s--, c--) {
                if (sampleLines[s] !== controlLines[c]) {
                  if (s !== 1 || c !== 1) {
                    do {
                      s--;
                      c--;
                      if (c < 0 || sampleLines[s] !== controlLines[c]) {
                        var _frame = "\n" + sampleLines[s].replace(" at new ", " at ");
                        if (fn.displayName && _frame.includes("<anonymous>")) {
                          _frame = _frame.replace("<anonymous>", fn.displayName);
                        }
                        {
                          if (typeof fn === "function") {
                            componentFrameCache.set(fn, _frame);
                          }
                        }
                        return _frame;
                      }
                    } while (s >= 1 && c >= 0);
                  }
                  break;
                }
              }
            }
          } finally {
            reentry = false;
            {
              ReactCurrentDispatcher$1.current = previousDispatcher;
              reenableLogs();
            }
            Error.prepareStackTrace = previousPrepareStackTrace;
          }
          var name = fn ? fn.displayName || fn.name : "";
          var syntheticFrame = name ? describeBuiltInComponentFrame(name) : "";
          {
            if (typeof fn === "function") {
              componentFrameCache.set(fn, syntheticFrame);
            }
          }
          return syntheticFrame;
        }
        function describeFunctionComponentFrame(fn, source, ownerFn) {
          {
            return describeNativeComponentFrame(fn, false);
          }
        }
        function shouldConstruct(Component2) {
          var prototype = Component2.prototype;
          return !!(prototype && prototype.isReactComponent);
        }
        function describeUnknownElementTypeFrameInDEV(type, source, ownerFn) {
          if (type == null) {
            return "";
          }
          if (typeof type === "function") {
            {
              return describeNativeComponentFrame(type, shouldConstruct(type));
            }
          }
          if (typeof type === "string") {
            return describeBuiltInComponentFrame(type);
          }
          switch (type) {
            case REACT_SUSPENSE_TYPE:
              return describeBuiltInComponentFrame("Suspense");
            case REACT_SUSPENSE_LIST_TYPE:
              return describeBuiltInComponentFrame("SuspenseList");
          }
          if (typeof type === "object") {
            switch (type.$$typeof) {
              case REACT_FORWARD_REF_TYPE:
                return describeFunctionComponentFrame(type.render);
              case REACT_MEMO_TYPE:
                return describeUnknownElementTypeFrameInDEV(type.type, source, ownerFn);
              case REACT_LAZY_TYPE: {
                var lazyComponent = type;
                var payload = lazyComponent._payload;
                var init = lazyComponent._init;
                try {
                  return describeUnknownElementTypeFrameInDEV(init(payload), source, ownerFn);
                } catch (x) {
                }
              }
            }
          }
          return "";
        }
        var loggedTypeFailures = {};
        var ReactDebugCurrentFrame$1 = ReactSharedInternals.ReactDebugCurrentFrame;
        function setCurrentlyValidatingElement(element) {
          {
            if (element) {
              var owner = element._owner;
              var stack = describeUnknownElementTypeFrameInDEV(element.type, element._source, owner ? owner.type : null);
              ReactDebugCurrentFrame$1.setExtraStackFrame(stack);
            } else {
              ReactDebugCurrentFrame$1.setExtraStackFrame(null);
            }
          }
        }
        function checkPropTypes(typeSpecs, values, location, componentName, element) {
          {
            var has = Function.call.bind(hasOwnProperty);
            for (var typeSpecName in typeSpecs) {
              if (has(typeSpecs, typeSpecName)) {
                var error$1 = void 0;
                try {
                  if (typeof typeSpecs[typeSpecName] !== "function") {
                    var err = Error((componentName || "React class") + ": " + location + " type `" + typeSpecName + "` is invalid; it must be a function, usually from the `prop-types` package, but received `" + typeof typeSpecs[typeSpecName] + "`.This often happens because of typos such as `PropTypes.function` instead of `PropTypes.func`.");
                    err.name = "Invariant Violation";
                    throw err;
                  }
                  error$1 = typeSpecs[typeSpecName](values, typeSpecName, componentName, location, null, "SECRET_DO_NOT_PASS_THIS_OR_YOU_WILL_BE_FIRED");
                } catch (ex) {
                  error$1 = ex;
                }
                if (error$1 && !(error$1 instanceof Error)) {
                  setCurrentlyValidatingElement(element);
                  error("%s: type specification of %s `%s` is invalid; the type checker function must return `null` or an `Error` but returned a %s. You may have forgotten to pass an argument to the type checker creator (arrayOf, instanceOf, objectOf, oneOf, oneOfType, and shape all require an argument).", componentName || "React class", location, typeSpecName, typeof error$1);
                  setCurrentlyValidatingElement(null);
                }
                if (error$1 instanceof Error && !(error$1.message in loggedTypeFailures)) {
                  loggedTypeFailures[error$1.message] = true;
                  setCurrentlyValidatingElement(element);
                  error("Failed %s type: %s", location, error$1.message);
                  setCurrentlyValidatingElement(null);
                }
              }
            }
          }
        }
        function setCurrentlyValidatingElement$1(element) {
          {
            if (element) {
              var owner = element._owner;
              var stack = describeUnknownElementTypeFrameInDEV(element.type, element._source, owner ? owner.type : null);
              setExtraStackFrame(stack);
            } else {
              setExtraStackFrame(null);
            }
          }
        }
        var propTypesMisspellWarningShown;
        {
          propTypesMisspellWarningShown = false;
        }
        function getDeclarationErrorAddendum() {
          if (ReactCurrentOwner.current) {
            var name = getComponentNameFromType(ReactCurrentOwner.current.type);
            if (name) {
              return "\n\nCheck the render method of `" + name + "`.";
            }
          }
          return "";
        }
        function getSourceInfoErrorAddendum(source) {
          if (source !== void 0) {
            var fileName = source.fileName.replace(/^.*[\\\/]/, "");
            var lineNumber = source.lineNumber;
            return "\n\nCheck your code at " + fileName + ":" + lineNumber + ".";
          }
          return "";
        }
        function getSourceInfoErrorAddendumForProps(elementProps) {
          if (elementProps !== null && elementProps !== void 0) {
            return getSourceInfoErrorAddendum(elementProps.__source);
          }
          return "";
        }
        var ownerHasKeyUseWarning = {};
        function getCurrentComponentErrorInfo(parentType) {
          var info = getDeclarationErrorAddendum();
          if (!info) {
            var parentName = typeof parentType === "string" ? parentType : parentType.displayName || parentType.name;
            if (parentName) {
              info = "\n\nCheck the top-level render call using <" + parentName + ">.";
            }
          }
          return info;
        }
        function validateExplicitKey(element, parentType) {
          if (!element._store || element._store.validated || element.key != null) {
            return;
          }
          element._store.validated = true;
          var currentComponentErrorInfo = getCurrentComponentErrorInfo(parentType);
          if (ownerHasKeyUseWarning[currentComponentErrorInfo]) {
            return;
          }
          ownerHasKeyUseWarning[currentComponentErrorInfo] = true;
          var childOwner = "";
          if (element && element._owner && element._owner !== ReactCurrentOwner.current) {
            childOwner = " It was passed a child from " + getComponentNameFromType(element._owner.type) + ".";
          }
          {
            setCurrentlyValidatingElement$1(element);
            error('Each child in a list should have a unique "key" prop.%s%s See https://reactjs.org/link/warning-keys for more information.', currentComponentErrorInfo, childOwner);
            setCurrentlyValidatingElement$1(null);
          }
        }
        function validateChildKeys(node, parentType) {
          if (typeof node !== "object") {
            return;
          }
          if (isArray(node)) {
            for (var i = 0; i < node.length; i++) {
              var child = node[i];
              if (isValidElement(child)) {
                validateExplicitKey(child, parentType);
              }
            }
          } else if (isValidElement(node)) {
            if (node._store) {
              node._store.validated = true;
            }
          } else if (node) {
            var iteratorFn = getIteratorFn(node);
            if (typeof iteratorFn === "function") {
              if (iteratorFn !== node.entries) {
                var iterator = iteratorFn.call(node);
                var step;
                while (!(step = iterator.next()).done) {
                  if (isValidElement(step.value)) {
                    validateExplicitKey(step.value, parentType);
                  }
                }
              }
            }
          }
        }
        function validatePropTypes(element) {
          {
            var type = element.type;
            if (type === null || type === void 0 || typeof type === "string") {
              return;
            }
            var propTypes;
            if (typeof type === "function") {
              propTypes = type.propTypes;
            } else if (typeof type === "object" && (type.$$typeof === REACT_FORWARD_REF_TYPE || // Note: Memo only checks outer props here.
            // Inner props are checked in the reconciler.
            type.$$typeof === REACT_MEMO_TYPE)) {
              propTypes = type.propTypes;
            } else {
              return;
            }
            if (propTypes) {
              var name = getComponentNameFromType(type);
              checkPropTypes(propTypes, element.props, "prop", name, element);
            } else if (type.PropTypes !== void 0 && !propTypesMisspellWarningShown) {
              propTypesMisspellWarningShown = true;
              var _name = getComponentNameFromType(type);
              error("Component %s declared `PropTypes` instead of `propTypes`. Did you misspell the property assignment?", _name || "Unknown");
            }
            if (typeof type.getDefaultProps === "function" && !type.getDefaultProps.isReactClassApproved) {
              error("getDefaultProps is only used on classic React.createClass definitions. Use a static property named `defaultProps` instead.");
            }
          }
        }
        function validateFragmentProps(fragment) {
          {
            var keys = Object.keys(fragment.props);
            for (var i = 0; i < keys.length; i++) {
              var key = keys[i];
              if (key !== "children" && key !== "key") {
                setCurrentlyValidatingElement$1(fragment);
                error("Invalid prop `%s` supplied to `React.Fragment`. React.Fragment can only have `key` and `children` props.", key);
                setCurrentlyValidatingElement$1(null);
                break;
              }
            }
            if (fragment.ref !== null) {
              setCurrentlyValidatingElement$1(fragment);
              error("Invalid attribute `ref` supplied to `React.Fragment`.");
              setCurrentlyValidatingElement$1(null);
            }
          }
        }
        function createElementWithValidation(type, props, children) {
          var validType = isValidElementType(type);
          if (!validType) {
            var info = "";
            if (type === void 0 || typeof type === "object" && type !== null && Object.keys(type).length === 0) {
              info += " You likely forgot to export your component from the file it's defined in, or you might have mixed up default and named imports.";
            }
            var sourceInfo = getSourceInfoErrorAddendumForProps(props);
            if (sourceInfo) {
              info += sourceInfo;
            } else {
              info += getDeclarationErrorAddendum();
            }
            var typeString;
            if (type === null) {
              typeString = "null";
            } else if (isArray(type)) {
              typeString = "array";
            } else if (type !== void 0 && type.$$typeof === REACT_ELEMENT_TYPE) {
              typeString = "<" + (getComponentNameFromType(type.type) || "Unknown") + " />";
              info = " Did you accidentally export a JSX literal instead of a component?";
            } else {
              typeString = typeof type;
            }
            {
              error("React.createElement: type is invalid -- expected a string (for built-in components) or a class/function (for composite components) but got: %s.%s", typeString, info);
            }
          }
          var element = createElement.apply(this, arguments);
          if (element == null) {
            return element;
          }
          if (validType) {
            for (var i = 2; i < arguments.length; i++) {
              validateChildKeys(arguments[i], type);
            }
          }
          if (type === REACT_FRAGMENT_TYPE) {
            validateFragmentProps(element);
          } else {
            validatePropTypes(element);
          }
          return element;
        }
        var didWarnAboutDeprecatedCreateFactory = false;
        function createFactoryWithValidation(type) {
          var validatedFactory = createElementWithValidation.bind(null, type);
          validatedFactory.type = type;
          {
            if (!didWarnAboutDeprecatedCreateFactory) {
              didWarnAboutDeprecatedCreateFactory = true;
              warn("React.createFactory() is deprecated and will be removed in a future major release. Consider using JSX or use React.createElement() directly instead.");
            }
            Object.defineProperty(validatedFactory, "type", {
              enumerable: false,
              get: function() {
                warn("Factory.type is deprecated. Access the class directly before passing it to createFactory.");
                Object.defineProperty(this, "type", {
                  value: type
                });
                return type;
              }
            });
          }
          return validatedFactory;
        }
        function cloneElementWithValidation(element, props, children) {
          var newElement = cloneElement.apply(this, arguments);
          for (var i = 2; i < arguments.length; i++) {
            validateChildKeys(arguments[i], newElement.type);
          }
          validatePropTypes(newElement);
          return newElement;
        }
        function startTransition(scope, options) {
          var prevTransition = ReactCurrentBatchConfig.transition;
          ReactCurrentBatchConfig.transition = {};
          var currentTransition = ReactCurrentBatchConfig.transition;
          {
            ReactCurrentBatchConfig.transition._updatedFibers = /* @__PURE__ */ new Set();
          }
          try {
            scope();
          } finally {
            ReactCurrentBatchConfig.transition = prevTransition;
            {
              if (prevTransition === null && currentTransition._updatedFibers) {
                var updatedFibersCount = currentTransition._updatedFibers.size;
                if (updatedFibersCount > 10) {
                  warn("Detected a large number of updates inside startTransition. If this is due to a subscription please re-write it to use React provided hooks. Otherwise concurrent mode guarantees are off the table.");
                }
                currentTransition._updatedFibers.clear();
              }
            }
          }
        }
        var didWarnAboutMessageChannel = false;
        var enqueueTaskImpl = null;
        function enqueueTask(task) {
          if (enqueueTaskImpl === null) {
            try {
              var requireString = ("require" + Math.random()).slice(0, 7);
              var nodeRequire = module2 && module2[requireString];
              enqueueTaskImpl = nodeRequire.call(module2, "timers").setImmediate;
            } catch (_err) {
              enqueueTaskImpl = function(callback) {
                {
                  if (didWarnAboutMessageChannel === false) {
                    didWarnAboutMessageChannel = true;
                    if (typeof MessageChannel === "undefined") {
                      error("This browser does not have a MessageChannel implementation, so enqueuing tasks via await act(async () => ...) will fail. Please file an issue at https://github.com/facebook/react/issues if you encounter this warning.");
                    }
                  }
                }
                var channel = new MessageChannel();
                channel.port1.onmessage = callback;
                channel.port2.postMessage(void 0);
              };
            }
          }
          return enqueueTaskImpl(task);
        }
        var actScopeDepth = 0;
        var didWarnNoAwaitAct = false;
        function act(callback) {
          {
            var prevActScopeDepth = actScopeDepth;
            actScopeDepth++;
            if (ReactCurrentActQueue.current === null) {
              ReactCurrentActQueue.current = [];
            }
            var prevIsBatchingLegacy = ReactCurrentActQueue.isBatchingLegacy;
            var result;
            try {
              ReactCurrentActQueue.isBatchingLegacy = true;
              result = callback();
              if (!prevIsBatchingLegacy && ReactCurrentActQueue.didScheduleLegacyUpdate) {
                var queue = ReactCurrentActQueue.current;
                if (queue !== null) {
                  ReactCurrentActQueue.didScheduleLegacyUpdate = false;
                  flushActQueue(queue);
                }
              }
            } catch (error2) {
              popActScope(prevActScopeDepth);
              throw error2;
            } finally {
              ReactCurrentActQueue.isBatchingLegacy = prevIsBatchingLegacy;
            }
            if (result !== null && typeof result === "object" && typeof result.then === "function") {
              var thenableResult = result;
              var wasAwaited = false;
              var thenable = {
                then: function(resolve, reject) {
                  wasAwaited = true;
                  thenableResult.then(function(returnValue2) {
                    popActScope(prevActScopeDepth);
                    if (actScopeDepth === 0) {
                      recursivelyFlushAsyncActWork(returnValue2, resolve, reject);
                    } else {
                      resolve(returnValue2);
                    }
                  }, function(error2) {
                    popActScope(prevActScopeDepth);
                    reject(error2);
                  });
                }
              };
              {
                if (!didWarnNoAwaitAct && typeof Promise !== "undefined") {
                  Promise.resolve().then(function() {
                  }).then(function() {
                    if (!wasAwaited) {
                      didWarnNoAwaitAct = true;
                      error("You called act(async () => ...) without await. This could lead to unexpected testing behaviour, interleaving multiple act calls and mixing their scopes. You should - await act(async () => ...);");
                    }
                  });
                }
              }
              return thenable;
            } else {
              var returnValue = result;
              popActScope(prevActScopeDepth);
              if (actScopeDepth === 0) {
                var _queue = ReactCurrentActQueue.current;
                if (_queue !== null) {
                  flushActQueue(_queue);
                  ReactCurrentActQueue.current = null;
                }
                var _thenable = {
                  then: function(resolve, reject) {
                    if (ReactCurrentActQueue.current === null) {
                      ReactCurrentActQueue.current = [];
                      recursivelyFlushAsyncActWork(returnValue, resolve, reject);
                    } else {
                      resolve(returnValue);
                    }
                  }
                };
                return _thenable;
              } else {
                var _thenable2 = {
                  then: function(resolve, reject) {
                    resolve(returnValue);
                  }
                };
                return _thenable2;
              }
            }
          }
        }
        function popActScope(prevActScopeDepth) {
          {
            if (prevActScopeDepth !== actScopeDepth - 1) {
              error("You seem to have overlapping act() calls, this is not supported. Be sure to await previous act() calls before making a new one. ");
            }
            actScopeDepth = prevActScopeDepth;
          }
        }
        function recursivelyFlushAsyncActWork(returnValue, resolve, reject) {
          {
            var queue = ReactCurrentActQueue.current;
            if (queue !== null) {
              try {
                flushActQueue(queue);
                enqueueTask(function() {
                  if (queue.length === 0) {
                    ReactCurrentActQueue.current = null;
                    resolve(returnValue);
                  } else {
                    recursivelyFlushAsyncActWork(returnValue, resolve, reject);
                  }
                });
              } catch (error2) {
                reject(error2);
              }
            } else {
              resolve(returnValue);
            }
          }
        }
        var isFlushing = false;
        function flushActQueue(queue) {
          {
            if (!isFlushing) {
              isFlushing = true;
              var i = 0;
              try {
                for (; i < queue.length; i++) {
                  var callback = queue[i];
                  do {
                    callback = callback(true);
                  } while (callback !== null);
                }
                queue.length = 0;
              } catch (error2) {
                queue = queue.slice(i + 1);
                throw error2;
              } finally {
                isFlushing = false;
              }
            }
          }
        }
        var createElement$1 = createElementWithValidation;
        var cloneElement$1 = cloneElementWithValidation;
        var createFactory = createFactoryWithValidation;
        var Children = {
          map: mapChildren,
          forEach: forEachChildren,
          count: countChildren,
          toArray,
          only: onlyChild
        };
        exports2.Children = Children;
        exports2.Component = Component;
        exports2.Fragment = REACT_FRAGMENT_TYPE;
        exports2.Profiler = REACT_PROFILER_TYPE;
        exports2.PureComponent = PureComponent;
        exports2.StrictMode = REACT_STRICT_MODE_TYPE;
        exports2.Suspense = REACT_SUSPENSE_TYPE;
        exports2.__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED = ReactSharedInternals;
        exports2.act = act;
        exports2.cloneElement = cloneElement$1;
        exports2.createContext = createContext;
        exports2.createElement = createElement$1;
        exports2.createFactory = createFactory;
        exports2.createRef = createRef;
        exports2.forwardRef = forwardRef;
        exports2.isValidElement = isValidElement;
        exports2.lazy = lazy;
        exports2.memo = memo;
        exports2.startTransition = startTransition;
        exports2.unstable_act = act;
        exports2.useCallback = useCallback;
        exports2.useContext = useContext;
        exports2.useDebugValue = useDebugValue;
        exports2.useDeferredValue = useDeferredValue;
        exports2.useEffect = useEffect2;
        exports2.useId = useId;
        exports2.useImperativeHandle = useImperativeHandle;
        exports2.useInsertionEffect = useInsertionEffect;
        exports2.useLayoutEffect = useLayoutEffect;
        exports2.useMemo = useMemo;
        exports2.useReducer = useReducer;
        exports2.useRef = useRef2;
        exports2.useState = useState2;
        exports2.useSyncExternalStore = useSyncExternalStore;
        exports2.useTransition = useTransition;
        exports2.version = ReactVersion;
        if (typeof __REACT_DEVTOOLS_GLOBAL_HOOK__ !== "undefined" && typeof __REACT_DEVTOOLS_GLOBAL_HOOK__.registerInternalModuleStop === "function") {
          __REACT_DEVTOOLS_GLOBAL_HOOK__.registerInternalModuleStop(new Error());
        }
      })();
    }
  }
});

// ../../../tmp/claude-0/repo/node_modules/react/index.js
var require_react = __commonJS({
  "../../../tmp/claude-0/repo/node_modules/react/index.js"(exports2, module2) {
    "use strict";
    if (process.env.NODE_ENV === "production") {
      module2.exports = require_react_production_min();
    } else {
      module2.exports = require_react_development();
    }
  }
});

// ../../../tmp/claude-0/repo/node_modules/react/cjs/react-jsx-runtime.production.min.js
var require_react_jsx_runtime_production_min = __commonJS({
  "../../../tmp/claude-0/repo/node_modules/react/cjs/react-jsx-runtime.production.min.js"(exports2) {
    "use strict";
    var f = require_react();
    var k = Symbol.for("react.element");
    var l = Symbol.for("react.fragment");
    var m = Object.prototype.hasOwnProperty;
    var n = f.__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED.ReactCurrentOwner;
    var p = { key: true, ref: true, __self: true, __source: true };
    function q(c, a, g) {
      var b, d = {}, e = null, h = null;
      void 0 !== g && (e = "" + g);
      void 0 !== a.key && (e = "" + a.key);
      void 0 !== a.ref && (h = a.ref);
      for (b in a)
        m.call(a, b) && !p.hasOwnProperty(b) && (d[b] = a[b]);
      if (c && c.defaultProps)
        for (b in a = c.defaultProps, a)
          void 0 === d[b] && (d[b] = a[b]);
      return { $$typeof: k, type: c, key: e, ref: h, props: d, _owner: n.current };
    }
    exports2.Fragment = l;
    exports2.jsx = q;
    exports2.jsxs = q;
  }
});

// ../../../tmp/claude-0/repo/node_modules/react/cjs/react-jsx-runtime.development.js
var require_react_jsx_runtime_development = __commonJS({
  "../../../tmp/claude-0/repo/node_modules/react/cjs/react-jsx-runtime.development.js"(exports2) {
    "use strict";
    if (process.env.NODE_ENV !== "production") {
      (function() {
        "use strict";
        var React = require_react();
        var REACT_ELEMENT_TYPE = Symbol.for("react.element");
        var REACT_PORTAL_TYPE = Symbol.for("react.portal");
        var REACT_FRAGMENT_TYPE = Symbol.for("react.fragment");
        var REACT_STRICT_MODE_TYPE = Symbol.for("react.strict_mode");
        var REACT_PROFILER_TYPE = Symbol.for("react.profiler");
        var REACT_PROVIDER_TYPE = Symbol.for("react.provider");
        var REACT_CONTEXT_TYPE = Symbol.for("react.context");
        var REACT_FORWARD_REF_TYPE = Symbol.for("react.forward_ref");
        var REACT_SUSPENSE_TYPE = Symbol.for("react.suspense");
        var REACT_SUSPENSE_LIST_TYPE = Symbol.for("react.suspense_list");
        var REACT_MEMO_TYPE = Symbol.for("react.memo");
        var REACT_LAZY_TYPE = Symbol.for("react.lazy");
        var REACT_OFFSCREEN_TYPE = Symbol.for("react.offscreen");
        var MAYBE_ITERATOR_SYMBOL = Symbol.iterator;
        var FAUX_ITERATOR_SYMBOL = "@@iterator";
        function getIteratorFn(maybeIterable) {
          if (maybeIterable === null || typeof maybeIterable !== "object") {
            return null;
          }
          var maybeIterator = MAYBE_ITERATOR_SYMBOL && maybeIterable[MAYBE_ITERATOR_SYMBOL] || maybeIterable[FAUX_ITERATOR_SYMBOL];
          if (typeof maybeIterator === "function") {
            return maybeIterator;
          }
          return null;
        }
        var ReactSharedInternals = React.__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED;
        function error(format) {
          {
            {
              for (var _len2 = arguments.length, args = new Array(_len2 > 1 ? _len2 - 1 : 0), _key2 = 1; _key2 < _len2; _key2++) {
                args[_key2 - 1] = arguments[_key2];
              }
              printWarning("error", format, args);
            }
          }
        }
        function printWarning(level, format, args) {
          {
            var ReactDebugCurrentFrame2 = ReactSharedInternals.ReactDebugCurrentFrame;
            var stack = ReactDebugCurrentFrame2.getStackAddendum();
            if (stack !== "") {
              format += "%s";
              args = args.concat([stack]);
            }
            var argsWithFormat = args.map(function(item) {
              return String(item);
            });
            argsWithFormat.unshift("Warning: " + format);
            Function.prototype.apply.call(console[level], console, argsWithFormat);
          }
        }
        var enableScopeAPI = false;
        var enableCacheElement = false;
        var enableTransitionTracing = false;
        var enableLegacyHidden = false;
        var enableDebugTracing = false;
        var REACT_MODULE_REFERENCE;
        {
          REACT_MODULE_REFERENCE = Symbol.for("react.module.reference");
        }
        function isValidElementType(type) {
          if (typeof type === "string" || typeof type === "function") {
            return true;
          }
          if (type === REACT_FRAGMENT_TYPE || type === REACT_PROFILER_TYPE || enableDebugTracing || type === REACT_STRICT_MODE_TYPE || type === REACT_SUSPENSE_TYPE || type === REACT_SUSPENSE_LIST_TYPE || enableLegacyHidden || type === REACT_OFFSCREEN_TYPE || enableScopeAPI || enableCacheElement || enableTransitionTracing) {
            return true;
          }
          if (typeof type === "object" && type !== null) {
            if (type.$$typeof === REACT_LAZY_TYPE || type.$$typeof === REACT_MEMO_TYPE || type.$$typeof === REACT_PROVIDER_TYPE || type.$$typeof === REACT_CONTEXT_TYPE || type.$$typeof === REACT_FORWARD_REF_TYPE || // This needs to include all possible module reference object
            // types supported by any Flight configuration anywhere since
            // we don't know which Flight build this will end up being used
            // with.
            type.$$typeof === REACT_MODULE_REFERENCE || type.getModuleId !== void 0) {
              return true;
            }
          }
          return false;
        }
        function getWrappedName(outerType, innerType, wrapperName) {
          var displayName = outerType.displayName;
          if (displayName) {
            return displayName;
          }
          var functionName = innerType.displayName || innerType.name || "";
          return functionName !== "" ? wrapperName + "(" + functionName + ")" : wrapperName;
        }
        function getContextName(type) {
          return type.displayName || "Context";
        }
        function getComponentNameFromType(type) {
          if (type == null) {
            return null;
          }
          {
            if (typeof type.tag === "number") {
              error("Received an unexpected object in getComponentNameFromType(). This is likely a bug in React. Please file an issue.");
            }
          }
          if (typeof type === "function") {
            return type.displayName || type.name || null;
          }
          if (typeof type === "string") {
            return type;
          }
          switch (type) {
            case REACT_FRAGMENT_TYPE:
              return "Fragment";
            case REACT_PORTAL_TYPE:
              return "Portal";
            case REACT_PROFILER_TYPE:
              return "Profiler";
            case REACT_STRICT_MODE_TYPE:
              return "StrictMode";
            case REACT_SUSPENSE_TYPE:
              return "Suspense";
            case REACT_SUSPENSE_LIST_TYPE:
              return "SuspenseList";
          }
          if (typeof type === "object") {
            switch (type.$$typeof) {
              case REACT_CONTEXT_TYPE:
                var context = type;
                return getContextName(context) + ".Consumer";
              case REACT_PROVIDER_TYPE:
                var provider = type;
                return getContextName(provider._context) + ".Provider";
              case REACT_FORWARD_REF_TYPE:
                return getWrappedName(type, type.render, "ForwardRef");
              case REACT_MEMO_TYPE:
                var outerName = type.displayName || null;
                if (outerName !== null) {
                  return outerName;
                }
                return getComponentNameFromType(type.type) || "Memo";
              case REACT_LAZY_TYPE: {
                var lazyComponent = type;
                var payload = lazyComponent._payload;
                var init = lazyComponent._init;
                try {
                  return getComponentNameFromType(init(payload));
                } catch (x) {
                  return null;
                }
              }
            }
          }
          return null;
        }
        var assign = Object.assign;
        var disabledDepth = 0;
        var prevLog;
        var prevInfo;
        var prevWarn;
        var prevError;
        var prevGroup;
        var prevGroupCollapsed;
        var prevGroupEnd;
        function disabledLog() {
        }
        disabledLog.__reactDisabledLog = true;
        function disableLogs() {
          {
            if (disabledDepth === 0) {
              prevLog = console.log;
              prevInfo = console.info;
              prevWarn = console.warn;
              prevError = console.error;
              prevGroup = console.group;
              prevGroupCollapsed = console.groupCollapsed;
              prevGroupEnd = console.groupEnd;
              var props = {
                configurable: true,
                enumerable: true,
                value: disabledLog,
                writable: true
              };
              Object.defineProperties(console, {
                info: props,
                log: props,
                warn: props,
                error: props,
                group: props,
                groupCollapsed: props,
                groupEnd: props
              });
            }
            disabledDepth++;
          }
        }
        function reenableLogs() {
          {
            disabledDepth--;
            if (disabledDepth === 0) {
              var props = {
                configurable: true,
                enumerable: true,
                writable: true
              };
              Object.defineProperties(console, {
                log: assign({}, props, {
                  value: prevLog
                }),
                info: assign({}, props, {
                  value: prevInfo
                }),
                warn: assign({}, props, {
                  value: prevWarn
                }),
                error: assign({}, props, {
                  value: prevError
                }),
                group: assign({}, props, {
                  value: prevGroup
                }),
                groupCollapsed: assign({}, props, {
                  value: prevGroupCollapsed
                }),
                groupEnd: assign({}, props, {
                  value: prevGroupEnd
                })
              });
            }
            if (disabledDepth < 0) {
              error("disabledDepth fell below zero. This is a bug in React. Please file an issue.");
            }
          }
        }
        var ReactCurrentDispatcher = ReactSharedInternals.ReactCurrentDispatcher;
        var prefix;
        function describeBuiltInComponentFrame(name, source, ownerFn) {
          {
            if (prefix === void 0) {
              try {
                throw Error();
              } catch (x) {
                var match = x.stack.trim().match(/\n( *(at )?)/);
                prefix = match && match[1] || "";
              }
            }
            return "\n" + prefix + name;
          }
        }
        var reentry = false;
        var componentFrameCache;
        {
          var PossiblyWeakMap = typeof WeakMap === "function" ? WeakMap : Map;
          componentFrameCache = new PossiblyWeakMap();
        }
        function describeNativeComponentFrame(fn, construct) {
          if (!fn || reentry) {
            return "";
          }
          {
            var frame = componentFrameCache.get(fn);
            if (frame !== void 0) {
              return frame;
            }
          }
          var control;
          reentry = true;
          var previousPrepareStackTrace = Error.prepareStackTrace;
          Error.prepareStackTrace = void 0;
          var previousDispatcher;
          {
            previousDispatcher = ReactCurrentDispatcher.current;
            ReactCurrentDispatcher.current = null;
            disableLogs();
          }
          try {
            if (construct) {
              var Fake = function() {
                throw Error();
              };
              Object.defineProperty(Fake.prototype, "props", {
                set: function() {
                  throw Error();
                }
              });
              if (typeof Reflect === "object" && Reflect.construct) {
                try {
                  Reflect.construct(Fake, []);
                } catch (x) {
                  control = x;
                }
                Reflect.construct(fn, [], Fake);
              } else {
                try {
                  Fake.call();
                } catch (x) {
                  control = x;
                }
                fn.call(Fake.prototype);
              }
            } else {
              try {
                throw Error();
              } catch (x) {
                control = x;
              }
              fn();
            }
          } catch (sample) {
            if (sample && control && typeof sample.stack === "string") {
              var sampleLines = sample.stack.split("\n");
              var controlLines = control.stack.split("\n");
              var s = sampleLines.length - 1;
              var c = controlLines.length - 1;
              while (s >= 1 && c >= 0 && sampleLines[s] !== controlLines[c]) {
                c--;
              }
              for (; s >= 1 && c >= 0; s--, c--) {
                if (sampleLines[s] !== controlLines[c]) {
                  if (s !== 1 || c !== 1) {
                    do {
                      s--;
                      c--;
                      if (c < 0 || sampleLines[s] !== controlLines[c]) {
                        var _frame = "\n" + sampleLines[s].replace(" at new ", " at ");
                        if (fn.displayName && _frame.includes("<anonymous>")) {
                          _frame = _frame.replace("<anonymous>", fn.displayName);
                        }
                        {
                          if (typeof fn === "function") {
                            componentFrameCache.set(fn, _frame);
                          }
                        }
                        return _frame;
                      }
                    } while (s >= 1 && c >= 0);
                  }
                  break;
                }
              }
            }
          } finally {
            reentry = false;
            {
              ReactCurrentDispatcher.current = previousDispatcher;
              reenableLogs();
            }
            Error.prepareStackTrace = previousPrepareStackTrace;
          }
          var name = fn ? fn.displayName || fn.name : "";
          var syntheticFrame = name ? describeBuiltInComponentFrame(name) : "";
          {
            if (typeof fn === "function") {
              componentFrameCache.set(fn, syntheticFrame);
            }
          }
          return syntheticFrame;
        }
        function describeFunctionComponentFrame(fn, source, ownerFn) {
          {
            return describeNativeComponentFrame(fn, false);
          }
        }
        function shouldConstruct(Component) {
          var prototype = Component.prototype;
          return !!(prototype && prototype.isReactComponent);
        }
        function describeUnknownElementTypeFrameInDEV(type, source, ownerFn) {
          if (type == null) {
            return "";
          }
          if (typeof type === "function") {
            {
              return describeNativeComponentFrame(type, shouldConstruct(type));
            }
          }
          if (typeof type === "string") {
            return describeBuiltInComponentFrame(type);
          }
          switch (type) {
            case REACT_SUSPENSE_TYPE:
              return describeBuiltInComponentFrame("Suspense");
            case REACT_SUSPENSE_LIST_TYPE:
              return describeBuiltInComponentFrame("SuspenseList");
          }
          if (typeof type === "object") {
            switch (type.$$typeof) {
              case REACT_FORWARD_REF_TYPE:
                return describeFunctionComponentFrame(type.render);
              case REACT_MEMO_TYPE:
                return describeUnknownElementTypeFrameInDEV(type.type, source, ownerFn);
              case REACT_LAZY_TYPE: {
                var lazyComponent = type;
                var payload = lazyComponent._payload;
                var init = lazyComponent._init;
                try {
                  return describeUnknownElementTypeFrameInDEV(init(payload), source, ownerFn);
                } catch (x) {
                }
              }
            }
          }
          return "";
        }
        var hasOwnProperty = Object.prototype.hasOwnProperty;
        var loggedTypeFailures = {};
        var ReactDebugCurrentFrame = ReactSharedInternals.ReactDebugCurrentFrame;
        function setCurrentlyValidatingElement(element) {
          {
            if (element) {
              var owner = element._owner;
              var stack = describeUnknownElementTypeFrameInDEV(element.type, element._source, owner ? owner.type : null);
              ReactDebugCurrentFrame.setExtraStackFrame(stack);
            } else {
              ReactDebugCurrentFrame.setExtraStackFrame(null);
            }
          }
        }
        function checkPropTypes(typeSpecs, values, location, componentName, element) {
          {
            var has = Function.call.bind(hasOwnProperty);
            for (var typeSpecName in typeSpecs) {
              if (has(typeSpecs, typeSpecName)) {
                var error$1 = void 0;
                try {
                  if (typeof typeSpecs[typeSpecName] !== "function") {
                    var err = Error((componentName || "React class") + ": " + location + " type `" + typeSpecName + "` is invalid; it must be a function, usually from the `prop-types` package, but received `" + typeof typeSpecs[typeSpecName] + "`.This often happens because of typos such as `PropTypes.function` instead of `PropTypes.func`.");
                    err.name = "Invariant Violation";
                    throw err;
                  }
                  error$1 = typeSpecs[typeSpecName](values, typeSpecName, componentName, location, null, "SECRET_DO_NOT_PASS_THIS_OR_YOU_WILL_BE_FIRED");
                } catch (ex) {
                  error$1 = ex;
                }
                if (error$1 && !(error$1 instanceof Error)) {
                  setCurrentlyValidatingElement(element);
                  error("%s: type specification of %s `%s` is invalid; the type checker function must return `null` or an `Error` but returned a %s. You may have forgotten to pass an argument to the type checker creator (arrayOf, instanceOf, objectOf, oneOf, oneOfType, and shape all require an argument).", componentName || "React class", location, typeSpecName, typeof error$1);
                  setCurrentlyValidatingElement(null);
                }
                if (error$1 instanceof Error && !(error$1.message in loggedTypeFailures)) {
                  loggedTypeFailures[error$1.message] = true;
                  setCurrentlyValidatingElement(element);
                  error("Failed %s type: %s", location, error$1.message);
                  setCurrentlyValidatingElement(null);
                }
              }
            }
          }
        }
        var isArrayImpl = Array.isArray;
        function isArray(a) {
          return isArrayImpl(a);
        }
        function typeName(value) {
          {
            var hasToStringTag = typeof Symbol === "function" && Symbol.toStringTag;
            var type = hasToStringTag && value[Symbol.toStringTag] || value.constructor.name || "Object";
            return type;
          }
        }
        function willCoercionThrow(value) {
          {
            try {
              testStringCoercion(value);
              return false;
            } catch (e) {
              return true;
            }
          }
        }
        function testStringCoercion(value) {
          return "" + value;
        }
        function checkKeyStringCoercion(value) {
          {
            if (willCoercionThrow(value)) {
              error("The provided key is an unsupported type %s. This value must be coerced to a string before before using it here.", typeName(value));
              return testStringCoercion(value);
            }
          }
        }
        var ReactCurrentOwner = ReactSharedInternals.ReactCurrentOwner;
        var RESERVED_PROPS = {
          key: true,
          ref: true,
          __self: true,
          __source: true
        };
        var specialPropKeyWarningShown;
        var specialPropRefWarningShown;
        var didWarnAboutStringRefs;
        {
          didWarnAboutStringRefs = {};
        }
        function hasValidRef(config) {
          {
            if (hasOwnProperty.call(config, "ref")) {
              var getter = Object.getOwnPropertyDescriptor(config, "ref").get;
              if (getter && getter.isReactWarning) {
                return false;
              }
            }
          }
          return config.ref !== void 0;
        }
        function hasValidKey(config) {
          {
            if (hasOwnProperty.call(config, "key")) {
              var getter = Object.getOwnPropertyDescriptor(config, "key").get;
              if (getter && getter.isReactWarning) {
                return false;
              }
            }
          }
          return config.key !== void 0;
        }
        function warnIfStringRefCannotBeAutoConverted(config, self) {
          {
            if (typeof config.ref === "string" && ReactCurrentOwner.current && self && ReactCurrentOwner.current.stateNode !== self) {
              var componentName = getComponentNameFromType(ReactCurrentOwner.current.type);
              if (!didWarnAboutStringRefs[componentName]) {
                error('Component "%s" contains the string ref "%s". Support for string refs will be removed in a future major release. This case cannot be automatically converted to an arrow function. We ask you to manually fix this case by using useRef() or createRef() instead. Learn more about using refs safely here: https://reactjs.org/link/strict-mode-string-ref', getComponentNameFromType(ReactCurrentOwner.current.type), config.ref);
                didWarnAboutStringRefs[componentName] = true;
              }
            }
          }
        }
        function defineKeyPropWarningGetter(props, displayName) {
          {
            var warnAboutAccessingKey = function() {
              if (!specialPropKeyWarningShown) {
                specialPropKeyWarningShown = true;
                error("%s: `key` is not a prop. Trying to access it will result in `undefined` being returned. If you need to access the same value within the child component, you should pass it as a different prop. (https://reactjs.org/link/special-props)", displayName);
              }
            };
            warnAboutAccessingKey.isReactWarning = true;
            Object.defineProperty(props, "key", {
              get: warnAboutAccessingKey,
              configurable: true
            });
          }
        }
        function defineRefPropWarningGetter(props, displayName) {
          {
            var warnAboutAccessingRef = function() {
              if (!specialPropRefWarningShown) {
                specialPropRefWarningShown = true;
                error("%s: `ref` is not a prop. Trying to access it will result in `undefined` being returned. If you need to access the same value within the child component, you should pass it as a different prop. (https://reactjs.org/link/special-props)", displayName);
              }
            };
            warnAboutAccessingRef.isReactWarning = true;
            Object.defineProperty(props, "ref", {
              get: warnAboutAccessingRef,
              configurable: true
            });
          }
        }
        var ReactElement = function(type, key, ref2, self, source, owner, props) {
          var element = {
            // This tag allows us to uniquely identify this as a React Element
            $$typeof: REACT_ELEMENT_TYPE,
            // Built-in properties that belong on the element
            type,
            key,
            ref: ref2,
            props,
            // Record the component responsible for creating this element.
            _owner: owner
          };
          {
            element._store = {};
            Object.defineProperty(element._store, "validated", {
              configurable: false,
              enumerable: false,
              writable: true,
              value: false
            });
            Object.defineProperty(element, "_self", {
              configurable: false,
              enumerable: false,
              writable: false,
              value: self
            });
            Object.defineProperty(element, "_source", {
              configurable: false,
              enumerable: false,
              writable: false,
              value: source
            });
            if (Object.freeze) {
              Object.freeze(element.props);
              Object.freeze(element);
            }
          }
          return element;
        };
        function jsxDEV(type, config, maybeKey, source, self) {
          {
            var propName;
            var props = {};
            var key = null;
            var ref2 = null;
            if (maybeKey !== void 0) {
              {
                checkKeyStringCoercion(maybeKey);
              }
              key = "" + maybeKey;
            }
            if (hasValidKey(config)) {
              {
                checkKeyStringCoercion(config.key);
              }
              key = "" + config.key;
            }
            if (hasValidRef(config)) {
              ref2 = config.ref;
              warnIfStringRefCannotBeAutoConverted(config, self);
            }
            for (propName in config) {
              if (hasOwnProperty.call(config, propName) && !RESERVED_PROPS.hasOwnProperty(propName)) {
                props[propName] = config[propName];
              }
            }
            if (type && type.defaultProps) {
              var defaultProps = type.defaultProps;
              for (propName in defaultProps) {
                if (props[propName] === void 0) {
                  props[propName] = defaultProps[propName];
                }
              }
            }
            if (key || ref2) {
              var displayName = typeof type === "function" ? type.displayName || type.name || "Unknown" : type;
              if (key) {
                defineKeyPropWarningGetter(props, displayName);
              }
              if (ref2) {
                defineRefPropWarningGetter(props, displayName);
              }
            }
            return ReactElement(type, key, ref2, self, source, ReactCurrentOwner.current, props);
          }
        }
        var ReactCurrentOwner$1 = ReactSharedInternals.ReactCurrentOwner;
        var ReactDebugCurrentFrame$1 = ReactSharedInternals.ReactDebugCurrentFrame;
        function setCurrentlyValidatingElement$1(element) {
          {
            if (element) {
              var owner = element._owner;
              var stack = describeUnknownElementTypeFrameInDEV(element.type, element._source, owner ? owner.type : null);
              ReactDebugCurrentFrame$1.setExtraStackFrame(stack);
            } else {
              ReactDebugCurrentFrame$1.setExtraStackFrame(null);
            }
          }
        }
        var propTypesMisspellWarningShown;
        {
          propTypesMisspellWarningShown = false;
        }
        function isValidElement(object) {
          {
            return typeof object === "object" && object !== null && object.$$typeof === REACT_ELEMENT_TYPE;
          }
        }
        function getDeclarationErrorAddendum() {
          {
            if (ReactCurrentOwner$1.current) {
              var name = getComponentNameFromType(ReactCurrentOwner$1.current.type);
              if (name) {
                return "\n\nCheck the render method of `" + name + "`.";
              }
            }
            return "";
          }
        }
        function getSourceInfoErrorAddendum(source) {
          {
            if (source !== void 0) {
              var fileName = source.fileName.replace(/^.*[\\\/]/, "");
              var lineNumber = source.lineNumber;
              return "\n\nCheck your code at " + fileName + ":" + lineNumber + ".";
            }
            return "";
          }
        }
        var ownerHasKeyUseWarning = {};
        function getCurrentComponentErrorInfo(parentType) {
          {
            var info = getDeclarationErrorAddendum();
            if (!info) {
              var parentName = typeof parentType === "string" ? parentType : parentType.displayName || parentType.name;
              if (parentName) {
                info = "\n\nCheck the top-level render call using <" + parentName + ">.";
              }
            }
            return info;
          }
        }
        function validateExplicitKey(element, parentType) {
          {
            if (!element._store || element._store.validated || element.key != null) {
              return;
            }
            element._store.validated = true;
            var currentComponentErrorInfo = getCurrentComponentErrorInfo(parentType);
            if (ownerHasKeyUseWarning[currentComponentErrorInfo]) {
              return;
            }
            ownerHasKeyUseWarning[currentComponentErrorInfo] = true;
            var childOwner = "";
            if (element && element._owner && element._owner !== ReactCurrentOwner$1.current) {
              childOwner = " It was passed a child from " + getComponentNameFromType(element._owner.type) + ".";
            }
            setCurrentlyValidatingElement$1(element);
            error('Each child in a list should have a unique "key" prop.%s%s See https://reactjs.org/link/warning-keys for more information.', currentComponentErrorInfo, childOwner);
            setCurrentlyValidatingElement$1(null);
          }
        }
        function validateChildKeys(node, parentType) {
          {
            if (typeof node !== "object") {
              return;
            }
            if (isArray(node)) {
              for (var i = 0; i < node.length; i++) {
                var child = node[i];
                if (isValidElement(child)) {
                  validateExplicitKey(child, parentType);
                }
              }
            } else if (isValidElement(node)) {
              if (node._store) {
                node._store.validated = true;
              }
            } else if (node) {
              var iteratorFn = getIteratorFn(node);
              if (typeof iteratorFn === "function") {
                if (iteratorFn !== node.entries) {
                  var iterator = iteratorFn.call(node);
                  var step;
                  while (!(step = iterator.next()).done) {
                    if (isValidElement(step.value)) {
                      validateExplicitKey(step.value, parentType);
                    }
                  }
                }
              }
            }
          }
        }
        function validatePropTypes(element) {
          {
            var type = element.type;
            if (type === null || type === void 0 || typeof type === "string") {
              return;
            }
            var propTypes;
            if (typeof type === "function") {
              propTypes = type.propTypes;
            } else if (typeof type === "object" && (type.$$typeof === REACT_FORWARD_REF_TYPE || // Note: Memo only checks outer props here.
            // Inner props are checked in the reconciler.
            type.$$typeof === REACT_MEMO_TYPE)) {
              propTypes = type.propTypes;
            } else {
              return;
            }
            if (propTypes) {
              var name = getComponentNameFromType(type);
              checkPropTypes(propTypes, element.props, "prop", name, element);
            } else if (type.PropTypes !== void 0 && !propTypesMisspellWarningShown) {
              propTypesMisspellWarningShown = true;
              var _name = getComponentNameFromType(type);
              error("Component %s declared `PropTypes` instead of `propTypes`. Did you misspell the property assignment?", _name || "Unknown");
            }
            if (typeof type.getDefaultProps === "function" && !type.getDefaultProps.isReactClassApproved) {
              error("getDefaultProps is only used on classic React.createClass definitions. Use a static property named `defaultProps` instead.");
            }
          }
        }
        function validateFragmentProps(fragment) {
          {
            var keys = Object.keys(fragment.props);
            for (var i = 0; i < keys.length; i++) {
              var key = keys[i];
              if (key !== "children" && key !== "key") {
                setCurrentlyValidatingElement$1(fragment);
                error("Invalid prop `%s` supplied to `React.Fragment`. React.Fragment can only have `key` and `children` props.", key);
                setCurrentlyValidatingElement$1(null);
                break;
              }
            }
            if (fragment.ref !== null) {
              setCurrentlyValidatingElement$1(fragment);
              error("Invalid attribute `ref` supplied to `React.Fragment`.");
              setCurrentlyValidatingElement$1(null);
            }
          }
        }
        var didWarnAboutKeySpread = {};
        function jsxWithValidation(type, props, key, isStaticChildren, source, self) {
          {
            var validType = isValidElementType(type);
            if (!validType) {
              var info = "";
              if (type === void 0 || typeof type === "object" && type !== null && Object.keys(type).length === 0) {
                info += " You likely forgot to export your component from the file it's defined in, or you might have mixed up default and named imports.";
              }
              var sourceInfo = getSourceInfoErrorAddendum(source);
              if (sourceInfo) {
                info += sourceInfo;
              } else {
                info += getDeclarationErrorAddendum();
              }
              var typeString;
              if (type === null) {
                typeString = "null";
              } else if (isArray(type)) {
                typeString = "array";
              } else if (type !== void 0 && type.$$typeof === REACT_ELEMENT_TYPE) {
                typeString = "<" + (getComponentNameFromType(type.type) || "Unknown") + " />";
                info = " Did you accidentally export a JSX literal instead of a component?";
              } else {
                typeString = typeof type;
              }
              error("React.jsx: type is invalid -- expected a string (for built-in components) or a class/function (for composite components) but got: %s.%s", typeString, info);
            }
            var element = jsxDEV(type, props, key, source, self);
            if (element == null) {
              return element;
            }
            if (validType) {
              var children = props.children;
              if (children !== void 0) {
                if (isStaticChildren) {
                  if (isArray(children)) {
                    for (var i = 0; i < children.length; i++) {
                      validateChildKeys(children[i], type);
                    }
                    if (Object.freeze) {
                      Object.freeze(children);
                    }
                  } else {
                    error("React.jsx: Static children should always be an array. You are likely explicitly calling React.jsxs or React.jsxDEV. Use the Babel transform instead.");
                  }
                } else {
                  validateChildKeys(children, type);
                }
              }
            }
            {
              if (hasOwnProperty.call(props, "key")) {
                var componentName = getComponentNameFromType(type);
                var keys = Object.keys(props).filter(function(k) {
                  return k !== "key";
                });
                var beforeExample = keys.length > 0 ? "{key: someKey, " + keys.join(": ..., ") + ": ...}" : "{key: someKey}";
                if (!didWarnAboutKeySpread[componentName + beforeExample]) {
                  var afterExample = keys.length > 0 ? "{" + keys.join(": ..., ") + ": ...}" : "{}";
                  error('A props object containing a "key" prop is being spread into JSX:\n  let props = %s;\n  <%s {...props} />\nReact keys must be passed directly to JSX without using spread:\n  let props = %s;\n  <%s key={someKey} {...props} />', beforeExample, componentName, afterExample, componentName);
                  didWarnAboutKeySpread[componentName + beforeExample] = true;
                }
              }
            }
            if (type === REACT_FRAGMENT_TYPE) {
              validateFragmentProps(element);
            } else {
              validatePropTypes(element);
            }
            return element;
          }
        }
        function jsxWithValidationStatic(type, props, key) {
          {
            return jsxWithValidation(type, props, key, true);
          }
        }
        function jsxWithValidationDynamic(type, props, key) {
          {
            return jsxWithValidation(type, props, key, false);
          }
        }
        var jsx3 = jsxWithValidationDynamic;
        var jsxs3 = jsxWithValidationStatic;
        exports2.Fragment = REACT_FRAGMENT_TYPE;
        exports2.jsx = jsx3;
        exports2.jsxs = jsxs3;
      })();
    }
  }
});

// ../../../tmp/claude-0/repo/node_modules/react/jsx-runtime.js
var require_jsx_runtime = __commonJS({
  "../../../tmp/claude-0/repo/node_modules/react/jsx-runtime.js"(exports2, module2) {
    "use strict";
    if (process.env.NODE_ENV === "production") {
      module2.exports = require_react_jsx_runtime_production_min();
    } else {
      module2.exports = require_react_jsx_runtime_development();
    }
  }
});

// components/brief/ProfoundVisibilitySection.tsx
var import_react = __toESM(require_react());

// components/brief/InsightBanner.tsx
var import_jsx_runtime = __toESM(require_jsx_runtime());

// lib/profound/sentimentScore.ts
function emptyAgg() {
  return { n: 0, sum: 0, rows: 0 };
}
function addScore(a, v) {
  a.rows++;
  if (v !== null) {
    a.n++;
    a.sum += v;
  }
}
function meanOf(a) {
  return a.n > 0 ? a.sum / a.n : null;
}
function parseScore(raw) {
  if (raw === void 0 || raw === null)
    return null;
  const t = String(raw).trim();
  if (t.length === 0)
    return null;
  const v = Number(t);
  return Number.isFinite(v) ? v : null;
}
var EVAL_RE = /^\s*Evaluate\s+(.+?)\s+on\s+(.+?)\s*$/i;
function parseEvalPrompt(prompt) {
  if (!prompt)
    return null;
  const m = EVAL_RE.exec(String(prompt));
  if (!m)
    return null;
  const brand = m[1].trim();
  const topic = m[2].trim();
  if (!brand || !topic)
    return null;
  return { brand, topic };
}
function rollBuckets(map) {
  return Object.keys(map).map((label) => {
    const a = map[label];
    return { label, n: a.n, rows: a.rows, mean: meanOf(a) };
  }).sort((x, y) => {
    if (x.mean === null && y.mean === null)
      return y.rows - x.rows;
    if (x.mean === null)
      return 1;
    if (y.mean === null)
      return -1;
    return y.mean - x.mean;
  });
}
function isDataRow(row) {
  return Array.isArray(row) && row.length >= 2;
}

// components/brief/ProfoundVisibilitySection.tsx
var import_jsx_runtime2 = __toESM(require_jsx_runtime());
var DEMAND_PROMPT_STORE_CAP = 200;
var SUFFIXES = /* @__PURE__ */ new Set([
  "group",
  "financial",
  "engines",
  "investments",
  "advisors",
  "advisory",
  "planning",
  "llc",
  "inc",
  "llp",
  "management",
  "capital",
  "partners",
  "co",
  "company",
  "the"
]);
function toks(s) {
  const raw = (s || "").toLowerCase().replace(/[^a-z0-9 ]+/g, " ").split(/\s+/).filter((t) => t.length > 0);
  const merged = [];
  for (let i = 0; i < raw.length; i++) {
    if (raw[i].length === 1) {
      let j = i;
      let acc = "";
      while (j < raw.length && raw[j].length === 1) {
        acc += raw[j];
        j++;
      }
      if (acc.length > 1) {
        merged.push(acc);
        i = j - 1;
        continue;
      }
    }
    merged.push(raw[i]);
  }
  return merged.filter((t) => !SUFFIXES.has(t));
}
function brandSig(s) {
  return toks(s).join(" ");
}
function brandIn(brand, mentions) {
  const bt = toks(brand);
  if (bt.length === 0)
    return false;
  for (let m = 0; m < mentions.length; m++) {
    const mt = new Set(toks(mentions[m]));
    let all = true;
    for (let k = 0; k < bt.length; k++) {
      if (!mt.has(bt[k])) {
        all = false;
        break;
      }
    }
    if (all)
      return true;
  }
  return false;
}
var CLIENT_AGREE_MIN = 0.95;
function deriveClientFromFlag(candidates, brandYes, brandNo, yesRows, noRows) {
  const total = yesRows + noRows;
  if (total === 0)
    return null;
  let best = null;
  for (let i = 0; i < candidates.length; i++) {
    const b = candidates[i];
    const agree = (brandYes[b] || 0) + (noRows - (brandNo[b] || 0));
    const score = agree / total;
    if (!best || score > best.score)
      best = { brand: b, score };
  }
  return best && best.score >= CLIENT_AGREE_MIN ? best : null;
}
function clientDomainRoot(clientName) {
  return toks(clientName).join("");
}
var ProfoundReadError = class extends Error {
  fileName;
  bytes;
  cause;
  constructor(fileName, bytes, cause) {
    const why = cause instanceof Error ? cause.message : String(cause || "unknown error");
    super(`The browser could not read ${fileName || "the file"} (${fmtBytes(bytes)}): ${why}`);
    this.name = "ProfoundReadError";
    this.fileName = fileName;
    this.bytes = bytes;
    this.cause = cause;
  }
};
function fmtBytes(n) {
  if (!(n >= 0))
    return "\u2014";
  if (n < 1e3)
    return `${n} B`;
  if (n < 1e6)
    return `${(n / 1e3).toFixed(1)} KB`;
  if (n < 1e9)
    return `${(n / 1e6).toFixed(1)} MB`;
  return `${(n / 1e9).toFixed(2)} GB`;
}
function createCsvFeeder(onRow) {
  let field = "";
  let row = [];
  let inQ = false;
  let idx = 0;
  let carry = "";
  let first = true;
  return {
    rows: () => idx,
    push(chunk, final) {
      let text = carry + chunk;
      carry = "";
      let i = 0;
      if (first && text.length > 0) {
        first = false;
        if (text.charCodeAt(0) === 65279)
          i = 1;
      }
      let len = text.length;
      if (!final) {
        let h = len;
        while (h > i) {
          const d = text.charCodeAt(h - 1);
          if (d === 34 || d === 13)
            h--;
          else
            break;
        }
        carry = text.slice(h, len);
        len = h;
      }
      while (i < len) {
        const c = text[i];
        if (inQ) {
          if (c === '"') {
            if (text[i + 1] === '"') {
              field += '"';
              i += 2;
              continue;
            }
            inQ = false;
            i++;
            continue;
          }
          let j2 = text.indexOf('"', i);
          if (j2 === -1 || j2 > len)
            j2 = len;
          field += text.slice(i, j2);
          i = j2;
          continue;
        }
        if (c === '"') {
          inQ = true;
          i++;
          continue;
        }
        if (c === ",") {
          row.push(field);
          field = "";
          i++;
          continue;
        }
        if (c === "\n" || c === "\r") {
          if (c === "\r" && text[i + 1] === "\n")
            i++;
          row.push(field);
          field = "";
          onRow(row, idx);
          idx++;
          row = [];
          i++;
          continue;
        }
        let j = i + 1;
        while (j < len) {
          const d = text.charCodeAt(j);
          if (d === 44 || d === 10 || d === 13 || d === 34)
            break;
          j++;
        }
        field += text.slice(i, j);
        i = j;
      }
      if (final) {
        if (field.length > 0 || row.length > 0) {
          row.push(field);
          onRow(row, idx);
          idx++;
        }
        field = "";
        row = [];
      }
    }
  };
}
var CSV_YIELD_ROWS = 4e3;
function progressFor(label, setProgress) {
  const passStart = Date.now();
  return (pct, rows, bytes, totalBytes) => setProgress({ label, pct, rows, startedAt: passStart, bytes, totalBytes });
}
async function streamCsv(file, onRow, onProgress) {
  const total = typeof file.size === "number" ? file.size : 0;
  let lastYield = 0;
  const feeder = createCsvFeeder((row, idx) => {
    onRow(row, idx);
  });
  if (typeof file.stream !== "function") {
    let text;
    try {
      text = await file.text();
    } catch (e) {
      throw new ProfoundReadError(file.name, total, e);
    }
    feeder.push(text, true);
    onProgress(1, feeder.rows(), total, total);
    return feeder.rows();
  }
  let reader;
  try {
    reader = file.stream().getReader();
  } catch (e) {
    throw new ProfoundReadError(file.name, total, e);
  }
  const decoder = new TextDecoder("utf-8");
  let bytesRead = 0;
  for (; ; ) {
    let res;
    try {
      res = await reader.read();
    } catch (e) {
      throw new ProfoundReadError(file.name, total, e);
    }
    if (res.done)
      break;
    bytesRead += res.value.byteLength;
    feeder.push(decoder.decode(res.value, { stream: true }), false);
    if (feeder.rows() - lastYield >= CSV_YIELD_ROWS) {
      lastYield = feeder.rows();
      onProgress(total > 0 ? Math.min(1, bytesRead / total) : 0, feeder.rows(), bytesRead, total);
      await new Promise((r) => setTimeout(r));
    }
  }
  feeder.push(decoder.decode(), true);
  onProgress(1, feeder.rows(), bytesRead, total);
  return feeder.rows();
}
function normKey(s) {
  return (s || "").replace(/^﻿/, "").toLowerCase().replace(/[^a-z0-9]+/g, "");
}
var COLS = {
  visibility: [
    { field: "type", aliases: ["type", "run_type", "response_type"], required: true },
    { field: "prompt", aliases: ["prompt", "query", "question"], required: true },
    { field: "platform", aliases: ["platform", "engine", "model"], required: true },
    { field: "topic", aliases: ["topic", "category"], required: true },
    // 2026-07-27: Profound renamed `normalized_mentions` → `mentions`. THE break.
    { field: "normalized_mentions", aliases: ["mentions", "normalized_mentions", "brand_mentions", "brands", "companies"], required: true },
    // Profound's own client-mentioned flag — used as an independent cross-check below.
    { field: "mentioned_flag", aliases: ["mentioned?", "mentioned", "is_mentioned"], required: false },
    // v7.380: run date — drives the coverage window + prompt-inventory-change notice.
    { field: "date", aliases: ["date", "run_date", "timestamp"], required: false }
  ],
  // `sentiment_claims` was REMOVED from the 2026-07-27 export and is absent from EVERY file in
  // the 2026-08-07..09 set (verified 2026-08-10). It is kept OPTIONAL rather than deleted for two
  // reasons: an export that still carries it parses exactly as before, and metrics already saved
  // from an older export keep rendering their per-brand charts. What the current export ships
  // instead is `sentiment_v2_score` (v7.417) — a sparse, client-only 0-1 scalar. The remaining
  // columns are the dimensions the score is rolled up by; all optional, so a thinner Sentiment
  // export still parses and simply yields fewer breakdowns (I.5) rather than failing the upload.
  sentiment: [
    { field: "sentiment_claims", aliases: ["sentiment_claims", "claims", "sentiment_claims_json"], required: false },
    { field: "sentiment_v2_score", aliases: ["sentiment_v2_score", "sentiment_score", "sentiment_v2"], required: false },
    { field: "prompt", aliases: ["prompt", "query", "question"], required: false },
    { field: "platform", aliases: ["platform", "engine", "model"], required: false },
    { field: "topic", aliases: ["topic", "category"], required: false },
    { field: "date", aliases: ["date", "run_date", "timestamp"], required: false }
  ],
  platforms: [],
  // citation_1..N are resolved dynamically below
  demand: [
    { field: "topic", aliases: ["topic"], required: true },
    { field: "prompt", aliases: ["prompt", "query"], required: true },
    { field: "share", aliases: ["share", "volume", "demand_share"], required: true }
  ],
  citations: [
    { field: "hostname", aliases: ["hostname", "host", "domain"], required: true },
    { field: "platform", aliases: ["platform", "engine"], required: true },
    { field: "category", aliases: ["category", "citationcategory", "source_category"], required: true },
    { field: "mentioned", aliases: ["mentioned", "mentioned?"], required: false }
  ]
};
var UNCATEGORISED = "Uncategorised";
var SLOT_FILE = {
  visibility: "Step 1 \xB7 Responses",
  sentiment: "Step 2 \xB7 Sentiment",
  platforms: "Step 3 \xB7 Platforms & Citations",
  demand: "Step 4 \xB7 Prompt Volume",
  citations: "Step 5 \xB7 Citation Landscape"
};
var ProfoundParseError = class extends Error {
  slot;
  missing;
  header;
  looksLike;
  constructor(slot, missing, header, looksLike = null) {
    super(`${SLOT_FILE[slot]}: missing required column${missing.length > 1 ? "s" : ""} ${missing.map((m) => m.field).join(", ")}`);
    this.name = "ProfoundParseError";
    this.slot = slot;
    this.missing = missing;
    this.header = header;
    this.looksLike = looksLike;
  }
};
function identifySlot(header, exclude) {
  const raw = {};
  for (let i = 0; i < header.length; i++) {
    const k = normKey(header[i]);
    if (k)
      raw[k] = true;
  }
  const hits = [];
  Object.keys(COLS).forEach((sk) => {
    if (sk === exclude)
      return;
    const specs = COLS[sk].filter((sp) => sp.required);
    if (specs.length === 0)
      return;
    const all = specs.every((sp) => sp.aliases.some((a) => normKey(a) in raw));
    if (all)
      hits.push(sk);
  });
  return hits.length === 1 ? hits[0] : null;
}
function resolveHeader(slot, header) {
  const raw = {};
  for (let i = 0; i < header.length; i++) {
    const k = normKey(header[i]);
    if (k && !(k in raw))
      raw[k] = i;
  }
  const out = {};
  const missing = [];
  const specs = COLS[slot] || [];
  for (let s = 0; s < specs.length; s++) {
    const spec = specs[s];
    let hit = -1;
    for (let a = 0; a < spec.aliases.length; a++) {
      const nk = normKey(spec.aliases[a]);
      if (nk in raw) {
        hit = raw[nk];
        break;
      }
    }
    if (hit >= 0)
      out[spec.field] = hit;
    else if (spec.required)
      missing.push(spec);
  }
  if (missing.length > 0)
    throw new ProfoundParseError(slot, missing, header, identifySlot(header, slot));
  Object.keys(raw).forEach((k) => {
    if (!(k in out))
      out[k] = raw[k];
  });
  return out;
}
function splitMentions(s) {
  if (!s)
    return [];
  return s.split(",").map((x) => x.trim()).filter((x) => x.length > 0);
}
async function computeAll(files, clientName, setProgress) {
  const slots = {};
  const assets = {};
  const sentByBrand = {};
  const themeByBrand = {};
  const mentionByBrand = {};
  const evalScore = {};
  const openAll = emptyAgg();
  const openByPlatform = {};
  let sentRowsSeen = 0;
  let sentRowsScored = 0;
  let sentHasScoreCol = false;
  if (files.sentiment) {
    let H = {};
    const f = files.sentiment;
    const rows = await streamCsv(f, (row, idx) => {
      if (idx === 0) {
        H = resolveHeader("sentiment", row);
        sentHasScoreCol = H["sentiment_v2_score"] !== void 0;
        return;
      }
      if (sentHasScoreCol && isDataRow(row)) {
        sentRowsSeen++;
        const v = parseScore(row[H["sentiment_v2_score"]]);
        if (v !== null)
          sentRowsScored++;
        const pi = H["prompt"];
        const ev = pi === void 0 ? null : parseEvalPrompt(row[pi]);
        const plat = H["platform"] === void 0 ? "" : (row[H["platform"]] || "").trim();
        if (ev) {
          if (!evalScore[ev.brand])
            evalScore[ev.brand] = { all: emptyAgg(), byTopic: {}, byPlatform: {}, byDate: {} };
          const b = evalScore[ev.brand];
          addScore(b.all, v);
          if (!b.byTopic[ev.topic])
            b.byTopic[ev.topic] = emptyAgg();
          addScore(b.byTopic[ev.topic], v);
          if (plat) {
            if (!b.byPlatform[plat])
              b.byPlatform[plat] = emptyAgg();
            addScore(b.byPlatform[plat], v);
          }
          const d = H["date"] === void 0 ? "" : (row[H["date"]] || "").trim();
          if (d) {
            if (!b.byDate[d])
              b.byDate[d] = emptyAgg();
            addScore(b.byDate[d], v);
          }
        } else {
          addScore(openAll, v);
          if (plat) {
            if (!openByPlatform[plat])
              openByPlatform[plat] = emptyAgg();
            addScore(openByPlatform[plat], v);
          }
        }
      }
      const sci = H["sentiment_claims"];
      const sc = sci === void 0 ? "" : row[sci];
      if (!sc || sc[0] !== "[")
        return;
      let claims;
      try {
        claims = JSON.parse(sc);
      } catch {
        return;
      }
      const rowByAsset = {};
      for (let c = 0; c < claims.length; c++) {
        const a = (claims[c].asset || "").trim();
        const s = (claims[c].sentiment || "").toLowerCase();
        const th = (claims[c].theme || "Other").trim();
        if (!a)
          continue;
        assets[a] = true;
        if (!sentByBrand[a])
          sentByBrand[a] = { pos: 0, neg: 0 };
        if (!themeByBrand[a])
          themeByBrand[a] = {};
        if (!themeByBrand[a][th])
          themeByBrand[a][th] = { pos: 0, neg: 0 };
        if (!rowByAsset[a])
          rowByAsset[a] = { p: 0, n: 0 };
        if (s === "positive") {
          sentByBrand[a].pos++;
          themeByBrand[a][th].pos++;
          rowByAsset[a].p++;
        } else if (s === "negative") {
          sentByBrand[a].neg++;
          themeByBrand[a][th].neg++;
          rowByAsset[a].n++;
        }
      }
      Object.keys(rowByAsset).forEach((a) => {
        const { p, n } = rowByAsset[a];
        if (p + n === 0)
          return;
        if (!mentionByBrand[a])
          mentionByBrand[a] = { pos: 0, neutral: 0, neg: 0 };
        if (p > n)
          mentionByBrand[a].pos++;
        else if (n > p)
          mentionByBrand[a].neg++;
        else
          mentionByBrand[a].neutral++;
      });
    }, progressFor("Sentiment", setProgress));
    slots.sentiment = { fileName: f.name, rows };
  }
  let totalRuns = 0;
  const platRuns = {};
  const topicRuns = {};
  const overallRaw = {};
  const promptInfo = {};
  const evalSubjects = {};
  let flagHits = 0;
  let hasFlagCol = false;
  let scoredRuns = 0;
  const scoredPlatRuns = {};
  const scoredTopicRuns = {};
  const flagPlatYes = {};
  const flagTopicYes = {};
  const brandYes = {};
  const brandNo = {};
  let yesRows = 0;
  let noRows = 0;
  let visRuns = 0;
  const visPlatRuns = {};
  const visPrompts = {};
  const rowsByDate = {};
  const notices = [];
  if (files.visibility) {
    let H = {};
    const f = files.visibility;
    await streamCsv(f, (row, idx) => {
      if (idx === 0) {
        H = resolveHeader("visibility", row);
        return;
      }
      const type = row[H["type"]] || "";
      const ev = /^Evaluate (.+?) on /.exec(row[H["prompt"]] || "");
      if (ev)
        evalSubjects[ev[1].trim()] = true;
      if (type.indexOf("Visibility") === -1)
        return;
      totalRuns++;
      const plat = row[H["platform"]] || "";
      const topic = row[H["topic"]] || "";
      const prompt = (row[H["prompt"]] || "").trim();
      if (type.trim() === "Visibility") {
        visRuns++;
        visPlatRuns[plat] = (visPlatRuns[plat] || 0) + 1;
        if (prompt)
          visPrompts[prompt] = true;
      }
      const di = H["date"];
      if (di !== void 0) {
        const d = (row[di] || "").slice(0, 10);
        if (d)
          rowsByDate[d] = (rowsByDate[d] || 0) + 1;
      }
      platRuns[plat] = (platRuns[plat] || 0) + 1;
      topicRuns[topic] = (topicRuns[topic] || 0) + 1;
      if (!promptInfo[prompt])
        promptInfo[prompt] = { topic, runs: 0 };
      promptInfo[prompt].runs++;
      const seen = {};
      const ms = splitMentions(row[H["normalized_mentions"]] || "");
      for (let k = 0; k < ms.length; k++) {
        if (!seen[ms[k]]) {
          seen[ms[k]] = true;
          overallRaw[ms[k]] = (overallRaw[ms[k]] || 0) + 1;
        }
      }
      const mfi = H["mentioned_flag"];
      const isYes = mfi !== void 0 && (row[mfi] || "").trim().toLowerCase() === "yes";
      if (mfi !== void 0) {
        hasFlagCol = true;
        if (isYes)
          flagHits++;
      }
      if (ms.length > 0) {
        scoredRuns++;
        scoredPlatRuns[plat] = (scoredPlatRuns[plat] || 0) + 1;
        scoredTopicRuns[topic] = (scoredTopicRuns[topic] || 0) + 1;
      }
      if (mfi !== void 0) {
        if (isYes) {
          yesRows++;
          flagPlatYes[plat] = (flagPlatYes[plat] || 0) + 1;
          flagTopicYes[topic] = (flagTopicYes[topic] || 0) + 1;
        } else
          noRows++;
        const bag = isYes ? brandYes : brandNo;
        const ks = Object.keys(seen);
        for (let k = 0; k < ks.length; k++)
          bag[ks[k]] = (bag[ks[k]] || 0) + 1;
      }
    }, progressFor("Responses", setProgress));
    if (totalRuns === 0) {
      throw new ProfoundParseError("visibility", [{ field: "type", aliases: ["type"], required: true, note: 'resolved, but no row matched the "Visibility" run type \u2014 the type vocabulary may have changed' }], []);
    }
    if (Object.keys(overallRaw).length === 0) {
      throw new ProfoundParseError("visibility", [{ field: "normalized_mentions", aliases: COLS.visibility[4].aliases, required: true, note: `resolved, but ${totalRuns} answers yielded zero brand mentions \u2014 the column format may have changed` }], []);
    }
  }
  function dedupeBySig(list) {
    const bySig = {};
    for (let i = 0; i < list.length; i++) {
      const sg = brandSig(list[i]);
      if (!sg)
        continue;
      const cur = bySig[sg];
      if (!cur || (overallRaw[list[i]] || 0) > (overallRaw[cur] || 0))
        bySig[sg] = list[i];
    }
    return Object.keys(bySig).map((k) => bySig[k]);
  }
  const rosterFromData = Object.keys(assets).length > 0 ? Object.keys(assets) : Object.keys(evalSubjects);
  let tracked = dedupeBySig(rosterFromData);
  const cm = deriveClientFromFlag(Object.keys(overallRaw), brandYes, brandNo, yesRows, noRows);
  const clientMatched = !!cm;
  const clientMatchScore = cm ? cm.score : 0;
  let client = cm ? cm.brand : "";
  if (tracked.length === 0) {
    const top = dedupeBySig(Object.keys(overallRaw)).sort((a, b) => overallRaw[b] - overallRaw[a]);
    const picked = [];
    for (let i = 0; i < top.length && picked.length < 7; i++) {
      if (brandSig(top[i]) !== brandSig(client))
        picked.push(top[i]);
    }
    tracked = [client].concat(picked);
  } else if (!tracked.some((b) => brandSig(b) === brandSig(client))) {
    tracked = [client].concat(tracked);
  }
  const brandList = tracked.slice();
  const trackedOverall = {};
  const platBrand = {};
  const topicBrand = {};
  const promptBrand = {};
  const coverage = {};
  let clientHits = 0;
  let visHits = 0;
  const platClient = {};
  const visPlatClient = {};
  const topicClient = {};
  brandList.forEach((b) => {
    trackedOverall[b] = 0;
    coverage[b] = 0;
  });
  if (files.visibility) {
    let H = {};
    const f = files.visibility;
    const rows = await streamCsv(f, (row, idx) => {
      if (idx === 0) {
        H = resolveHeader("visibility", row);
        return;
      }
      const type = row[H["type"]] || "";
      if (type.indexOf("Visibility") === -1)
        return;
      const plat = row[H["platform"]] || "";
      const topic = row[H["topic"]] || "";
      const prompt = (row[H["prompt"]] || "").trim();
      const ms = splitMentions(row[H["normalized_mentions"]] || "");
      for (let bi = 0; bi < brandList.length; bi++) {
        const b = brandList[bi];
        if (!brandIn(b, ms))
          continue;
        trackedOverall[b]++;
        if (!platBrand[plat])
          platBrand[plat] = {};
        platBrand[plat][b] = (platBrand[plat][b] || 0) + 1;
        if (!topicBrand[topic])
          topicBrand[topic] = {};
        topicBrand[topic][b] = (topicBrand[topic][b] || 0) + 1;
        if (!promptBrand[prompt])
          promptBrand[prompt] = {};
        promptBrand[prompt][b] = (promptBrand[prompt][b] || 0) + 1;
        if (b === client) {
          clientHits++;
          platClient[plat] = (platClient[plat] || 0) + 1;
          topicClient[topic] = (topicClient[topic] || 0) + 1;
          if (type.trim() === "Visibility") {
            visHits++;
            visPlatClient[plat] = (visPlatClient[plat] || 0) + 1;
          }
        }
      }
    }, progressFor("Responses (analysing)", setProgress));
    slots.visibility = { fileName: f.name, rows };
    if (hasFlagCol) {
      clientHits = flagHits;
      Object.keys(flagPlatYes).forEach((k) => {
        platClient[k] = flagPlatYes[k];
      });
      Object.keys(flagTopicYes).forEach((k) => {
        topicClient[k] = flagTopicYes[k];
      });
    }
    if (hasFlagCol && totalRuns > 0) {
      const delta = Math.abs(flagHits - clientHits) / totalRuns;
      if (delta > 0.02) {
        notices.push(
          `Cross-check divergence: brand matching found the client in ${clientHits} of ${totalRuns} answers, while Profound's own "mentioned?" flag reports ${flagHits} (${(delta * 100).toFixed(1)}pp apart). Treat both as unconfirmed until the export is reviewed.`
        );
      }
    }
    if (!clientMatched) {
      notices.push(
        hasFlagCol ? `No brand's presence agrees with this export's "mentioned?" column closely enough (best match under ${(CLIENT_AGREE_MIN * 100).toFixed(0)}%) to identify the client, so no client figures are shown. The competitive landscape below is unaffected.` : `${SLOT_FILE.visibility}: this export carries no "mentioned?" column, which is the only field that states which brand is the client. No client figures are shown. The competitive landscape below is unaffected. Re-export from Profound including the mentioned column.`
      );
    }
  }
  if (files.sentiment && Object.keys(assets).length === 0) {
    if (sentHasScoreCol) {
      const pct = sentRowsSeen > 0 ? 100 * sentRowsScored / sentRowsSeen : 0;
      notices.push(
        `${SLOT_FILE.sentiment}: this export no longer carries the per-brand "sentiment_claims" column Profound shipped through 2026-07-27, so net sentiment by brand and sentiment by theme cannot be built from it \u2014 the brand and theme labels are not in the data. It ships "sentiment_v2_score" instead: ${fmt(sentRowsScored)} of ${fmt(sentRowsSeen)} rows scored (${pct.toFixed(1)}%), scored for the client rather than for every brand, so it supports a client sentiment reading but not a competitor comparison. Everything else in this panel is unaffected.`
      );
    } else {
      notices.push(
        `${SLOT_FILE.sentiment}: this export carries neither the per-brand "sentiment_claims" column nor the "sentiment_v2_score" column, so no sentiment reading can be built from it. Everything else is unaffected.`
      );
    }
  }
  const promptKeys = Object.keys(promptInfo);
  promptKeys.forEach((p) => {
    const pb = promptBrand[p] || {};
    brandList.forEach((b) => {
      if ((pb[b] || 0) > 0)
        coverage[b]++;
    });
  });
  const gaps = [];
  let clientPromptCount = 0;
  promptKeys.forEach((p) => {
    const pb = promptBrand[p] || {};
    if ((pb[client] || 0) > 0) {
      clientPromptCount++;
      return;
    }
    let rival = 0;
    let leader = "";
    let leaderCount = 0;
    brandList.forEach((b) => {
      if (b === client)
        return;
      const c = pb[b] || 0;
      rival += c;
      if (c > leaderCount) {
        leaderCount = c;
        leader = b;
      }
    });
    if (rival > 0)
      gaps.push({ prompt: p, topic: promptInfo[p].topic, rivalMentions: rival, leader, leaderCount });
  });
  gaps.sort((a, b) => b.rivalMentions - a.rivalMentions);
  const domainCount = {};
  let totalCites = 0;
  if (files.platforms) {
    let H = {};
    let citeCols = [];
    const f = files.platforms;
    const rows = await streamCsv(f, (row, idx) => {
      if (idx === 0) {
        H = resolveHeader("platforms", row);
        citeCols = Object.keys(H).filter((k) => /^citation\d+$/.test(k)).map((k) => H[k]);
        return;
      }
      for (let c = 0; c < citeCols.length; c++) {
        const u = row[citeCols[c]];
        if (!u || u.indexOf("http") !== 0)
          continue;
        totalCites++;
        let host = "";
        try {
          host = new URL(u).hostname.replace(/^www\./, "").toLowerCase();
        } catch {
          continue;
        }
        if (host)
          domainCount[host] = (domainCount[host] || 0) + 1;
      }
    }, progressFor("Platforms & Citations", setProgress));
    slots.platforms = { fileName: f.name, rows };
  }
  const cRoot = clientDomainRoot(client);
  let clientDomainCites = 0;
  Object.keys(domainCount).forEach((d) => {
    if (cRoot && d.replace(/[^a-z0-9]/g, "").indexOf(cRoot) !== -1)
      clientDomainCites += domainCount[d];
  });
  const compRoots = brandList.filter((b) => b !== client).map((b) => clientDomainRoot(b)).filter((r) => r.length > 2);
  const demandTopicShare = {};
  const demandTopicCount = {};
  const demandPromptsArr = [];
  if (files.demand) {
    let H = {};
    const f = files.demand;
    const rows = await streamCsv(f, (row, idx) => {
      if (idx === 0) {
        H = resolveHeader("demand", row);
        return;
      }
      const topic = (row[H["topic"]] || "").trim();
      const prompt = (row[H["prompt"]] || "").trim();
      const share = parseFloat(row[H["share"]] || "");
      if (!topic && !prompt)
        return;
      const sh = isNaN(share) ? 0 : share;
      demandTopicShare[topic] = (demandTopicShare[topic] || 0) + sh;
      demandTopicCount[topic] = (demandTopicCount[topic] || 0) + 1;
      demandPromptsArr.push({ prompt, share: sh, topic });
    }, progressFor("Prompt Volume", setProgress));
    slots.demand = { fileName: f.name, rows };
  }
  const citeCatCount = {};
  const earnedDomain = {};
  const compDomainCite = {};
  const ownedDomainCite = {};
  const engMix = {};
  const mentionHost = {};
  const mentionPlat = {};
  let citeTotal = 0;
  let citeUncategorised = 0;
  let citeMentions = 0;
  if (files.citations) {
    let H = {};
    const f = files.citations;
    const rows = await streamCsv(f, (row, idx) => {
      if (idx === 0) {
        H = resolveHeader("citations", row);
        return;
      }
      const host = (row[H["hostname"]] || "").replace(/^www\./, "").toLowerCase().trim();
      const plat = (row[H["platform"]] || "").trim();
      const rawCat = (row[H["category"]] || "").trim();
      const cat = rawCat || UNCATEGORISED;
      const mi = H["mentioned"];
      const mentioned = (mi === void 0 ? "" : row[mi] || "").trim().toLowerCase() === "mentioned";
      if (!host && !plat)
        return;
      citeTotal++;
      if (!rawCat)
        citeUncategorised++;
      citeCatCount[cat] = (citeCatCount[cat] || 0) + 1;
      const lc = cat.toLowerCase();
      if (lc === "earned media" && host)
        earnedDomain[host] = (earnedDomain[host] || 0) + 1;
      if (lc === "competition" && host)
        compDomainCite[host] = (compDomainCite[host] || 0) + 1;
      if (lc === "owned" && host)
        ownedDomainCite[host] = (ownedDomainCite[host] || 0) + 1;
      if (plat) {
        if (!engMix[plat])
          engMix[plat] = { total: 0, earned: 0, competition: 0, owned: 0, other: 0 };
        engMix[plat].total++;
        if (lc === "earned media")
          engMix[plat].earned++;
        else if (lc === "competition")
          engMix[plat].competition++;
        else if (lc === "owned")
          engMix[plat].owned++;
        else
          engMix[plat].other++;
      }
      if (mentioned) {
        citeMentions++;
        if (host)
          mentionHost[host] = (mentionHost[host] || 0) + 1;
        if (plat)
          mentionPlat[plat] = (mentionPlat[plat] || 0) + 1;
      }
    }, progressFor("Citation Landscape", setProgress));
    slots.citations = { fileName: f.name, rows };
  }
  const dateKeys = Object.keys(rowsByDate).sort();
  const dateFrom = dateKeys.length ? dateKeys[0] : "";
  const dateTo = dateKeys.length ? dateKeys[dateKeys.length - 1] : "";
  const inventoryChanges = [];
  for (let i = 1; i < dateKeys.length; i++) {
    const delta = rowsByDate[dateKeys[i]] - rowsByDate[dateKeys[i - 1]];
    if (delta !== 0)
      inventoryChanges.push({ date: dateKeys[i], delta });
  }
  if (inventoryChanges.length > 0) {
    notices.push(
      `Prompt set changed mid-window: ` + inventoryChanges.map((c) => `${c.date} (${c.delta > 0 ? "+" : ""}${c.delta.toLocaleString()} answers/day)`).join(", ") + `. Figures below pool every date in ${dateFrom} \u2013 ${dateTo}, so a change in the score across this window partly reflects the new prompts entering the average \u2014 not visibility movement alone.`
    );
  }
  const visEngines = Object.keys(visPlatRuns).map((p) => ({ platform: p, runs: visPlatRuns[p], hits: visPlatClient[p] || 0 })).sort((a, b) => b.hits / Math.max(1, b.runs) - a.hits / Math.max(1, a.runs));
  const engines = Object.keys(scoredPlatRuns).map((p) => ({ platform: p, runs: scoredPlatRuns[p], hits: platClient[p] || 0 })).sort((a, b) => b.hits / Math.max(1, b.runs) - a.hits / Math.max(1, a.runs));
  const sov = brandList.map((b) => ({ brand: b, count: trackedOverall[b] || 0, pct: scoredRuns ? 100 * (trackedOverall[b] || 0) / scoredRuns : 0, isClient: b === client })).sort((a, b) => b.count - a.count);
  const overallTop = Object.keys(overallRaw).map((b) => ({ brand: b, count: overallRaw[b], pct: scoredRuns ? 100 * overallRaw[b] / scoredRuns : 0 })).sort((a, b) => b.count - a.count).slice(0, 10);
  const topics = Object.keys(scoredTopicRuns).map((t) => ({ topic: t, runs: scoredTopicRuns[t], hits: topicClient[t] || 0 })).sort((a, b) => a.hits / Math.max(1, a.runs) - b.hits / Math.max(1, b.runs));
  const coverageStat = brandList.map((b) => ({ brand: b, count: coverage[b] || 0, pct: promptKeys.length ? 100 * (coverage[b] || 0) / promptKeys.length : 0, isClient: b === client })).sort((a, b) => b.count - a.count);
  const sentBrands = brandList.filter((b) => sentByBrand[b]).map((b) => ({ brand: b, pos: sentByBrand[b].pos, neg: sentByBrand[b].neg, isClient: b === client })).sort((a, b) => netPct(b.pos, b.neg) - netPct(a.pos, a.neg));
  const mentionSent = brandList.filter((b) => mentionByBrand[b]).map((b) => {
    const m = mentionByBrand[b];
    return { brand: b, pos: m.pos, neutral: m.neutral, neg: m.neg, total: m.pos + m.neutral + m.neg, isClient: b === client };
  }).sort((a, b) => b.total - a.total);
  const clientThemesRaw = themeByBrand[client] || {};
  const clientThemes = Object.keys(clientThemesRaw).map((t) => ({ theme: t, pos: clientThemesRaw[t].pos, neg: clientThemesRaw[t].neg })).filter((t) => t.pos + t.neg >= 8).sort((a, b) => netPct(b.pos, b.neg) - netPct(a.pos, a.neg));
  const evalCandidates = brandList.concat(
    Object.keys(overallRaw).filter((b) => brandList.indexOf(b) === -1)
  );
  function evalSubjectBrand(subject) {
    let best = "";
    let bestLen = 0;
    for (let i = 0; i < evalCandidates.length; i++) {
      const b = evalCandidates[i];
      const n = toks(b).length;
      if (n > bestLen && brandIn(b, [subject])) {
        best = b;
        bestLen = n;
      }
    }
    return best || subject;
  }
  const evalKeys = Object.keys(evalScore);
  const evalBrandOf = {};
  evalKeys.forEach((k) => {
    evalBrandOf[k] = evalSubjectBrand(k);
  });
  const evalDup = {};
  evalKeys.forEach((k) => {
    evalDup[evalBrandOf[k]] = (evalDup[evalBrandOf[k]] || 0) + 1;
  });
  Object.keys(evalDup).forEach((b) => {
    if (evalDup[b] > 1) {
      notices.push(
        `${SLOT_FILE.sentiment}: ${evalDup[b]} differently-worded evaluation prompts resolve to "${b}". Its direct-evaluation figure reads the largest of them only \u2014 the others are NOT merged, so treat that brand's score as covering part of its rows.`
      );
    }
  });
  const sentScoreBrands = evalKeys.map((b) => {
    const a = evalScore[b].all;
    return { brand: evalBrandOf[b], n: a.n, rows: a.rows, mean: meanOf(a), isClient: evalBrandOf[b] === client };
  }).sort((x, y) => {
    if (x.mean === null && y.mean === null)
      return y.rows - x.rows;
    if (x.mean === null)
      return 1;
    if (y.mean === null)
      return -1;
    return y.mean - x.mean;
  });
  const clientEvalKey = evalKeys.filter((b) => evalBrandOf[b] === client).sort((x, y) => evalScore[y].all.n - evalScore[x].all.n)[0];
  const clientEval = clientEvalKey ? evalScore[clientEvalKey] : null;
  const sentScoreClientTopics = clientEval ? rollBuckets(clientEval.byTopic) : [];
  const sentScoreClientEngines = clientEval ? rollBuckets(clientEval.byPlatform) : [];
  const sentScoreClientDates = clientEval ? rollBuckets(clientEval.byDate).slice().sort((a, b) => a.label < b.label ? -1 : a.label > b.label ? 1 : 0) : [];
  const sentScoreOpen = openAll.rows > 0 ? { label: "Open answers", n: openAll.n, rows: openAll.rows, mean: meanOf(openAll) } : null;
  const sentScoreOpenEngines = rollBuckets(openByPlatform);
  const domainsSorted = Object.keys(domainCount).sort((a, b) => domainCount[b] - domainCount[a]);
  const domains = domainsSorted.slice(0, 25).map((d) => {
    const dd = d.replace(/[^a-z0-9]/g, "");
    return {
      domain: d,
      count: domainCount[d],
      isClient: cRoot ? dd.indexOf(cRoot) !== -1 : false,
      isCompetitor: compRoots.some((r) => dd.indexOf(r) !== -1)
    };
  });
  const demandTopics = Object.keys(demandTopicShare).map((t) => ({ topic: t, share: Math.round(demandTopicShare[t] * 10) / 10, prompts: demandTopicCount[t] })).sort((a, b) => b.share - a.share);
  const demandPrompts = demandPromptsArr.slice().sort((a, b) => b.share - a.share).slice(0, DEMAND_PROMPT_STORE_CAP);
  const ownedDomainsSorted = Object.keys(ownedDomainCite).sort((a, b) => ownedDomainCite[b] - ownedDomainCite[a]);
  const citeOwnedDomain = ownedDomainsSorted[0] || "";
  let citeOwned = 0;
  ownedDomainsSorted.forEach((d) => {
    citeOwned += ownedDomainCite[d];
  });
  const citeCompetition = citeCatCount["Competition"] || 0;
  const citeCategorised = citeTotal - citeUncategorised;
  const citeOwnedShare = citeCategorised ? 100 * citeOwned / citeCategorised : 0;
  const citeCatMix = Object.keys(citeCatCount).map((c) => ({ category: c, count: citeCatCount[c], pct: citeTotal ? 100 * citeCatCount[c] / citeTotal : 0 })).sort((a, b) => b.count - a.count);
  const earnedTargets = Object.keys(earnedDomain).map((h) => ({ hostname: h, count: earnedDomain[h] })).sort((a, b) => b.count - a.count).slice(0, 10);
  const competitorCites = Object.keys(compDomainCite).map((h) => ({ hostname: h, count: compDomainCite[h] })).sort((a, b) => b.count - a.count).slice(0, 10);
  const engineSourceMix = Object.keys(engMix).map((p) => ({ platform: p, total: engMix[p].total, earned: engMix[p].earned, competition: engMix[p].competition, owned: engMix[p].owned, other: engMix[p].other })).sort((a, b) => b.total - a.total);
  const ownedKey = citeOwnedDomain.replace(/[^a-z0-9]/g, "");
  const citeMentionSources = Object.keys(mentionHost).map((h) => ({ hostname: h, count: mentionHost[h], isClient: ownedKey.length > 0 && h.replace(/[^a-z0-9]/g, "").indexOf(ownedKey) !== -1 })).sort((a, b) => b.count - a.count).slice(0, 10);
  const citeMentionByPlatform = Object.keys(mentionPlat).map((p) => ({ platform: p, count: mentionPlat[p] })).sort((a, b) => b.count - a.count);
  return {
    client,
    tracked: brandList,
    totalRuns,
    clientHits,
    engines,
    sov,
    overallTop,
    topics,
    promptN: promptKeys.length,
    coverage: coverageStat,
    gaps,
    clientPromptCount,
    sentBrands,
    mentionSent,
    clientThemes,
    totalCites,
    domains,
    domainTotalDistinct: domainsSorted.length,
    sentScoreCol: sentHasScoreCol,
    sentScoreRows: sentRowsSeen,
    sentScoreScored: sentRowsScored,
    sentScoreBrands,
    sentScoreClientTopics,
    sentScoreClientEngines,
    sentScoreClientDates,
    sentScoreOpen,
    sentScoreOpenEngines,
    clientDomainCites,
    demandTopics,
    demandPrompts,
    demandPromptTotal: demandPromptsArr.length,
    citeTotal,
    citeOwned,
    citeOwnedShare,
    citeOwnedDomain,
    citeCompetition,
    citeCatMix,
    citeUncategorised,
    citeCategorised,
    earnedTargets,
    competitorCites,
    engineSourceMix,
    citeMentions,
    citeMentionSources,
    citeMentionByPlatform,
    slots,
    clientMatched,
    clientMatchScore,
    flagHits,
    hasFlagCol,
    notices,
    scoredRuns,
    visRuns,
    visHits,
    visPromptN: Object.keys(visPrompts).length,
    visEngines,
    dateFrom,
    dateTo,
    dateDays: dateKeys.length,
    inventoryChanges,
    updatedAt: (/* @__PURE__ */ new Date()).toISOString()
  };
}
function netPct(pos, neg) {
  const t = pos + neg;
  return t ? Math.round(100 * (pos - neg) / t) : 0;
}
function fmt(n) {
  return n.toLocaleString();
}

// .runs/oiq498.xIa9Mi/t.tsx
function ref(text) {
  const out = [];
  let i = text.charCodeAt(0) === 65279 ? 1 : 0;
  let field = "";
  let row = [];
  let inQ = false;
  const len = text.length;
  while (i < len) {
    const c = text[i];
    if (inQ) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQ = false;
        i++;
        continue;
      }
      field += c;
      i++;
      continue;
    }
    if (c === '"') {
      inQ = true;
      i++;
      continue;
    }
    if (c === ",") {
      row.push(field);
      field = "";
      i++;
      continue;
    }
    if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n")
        i++;
      row.push(field);
      field = "";
      out.push(row);
      row = [];
      i++;
      continue;
    }
    field += c;
    i++;
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    out.push(row);
  }
  return out;
}
(async () => {
  const alpha = ["a", "b", ",", '"', '""', "\n", "\r", "\r\n", " ", "\xE9", "\u{1F44D}", "\uFEFF"];
  let seed = 98;
  const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
  let fuzzFails = 0, cases = 0;
  for (let t = 0; t < 3e3; t++) {
    let s = rnd() < 0.3 ? "\uFEFF" : "";
    const n = Math.floor(rnd() * 80);
    for (let k = 0; k < n; k++)
      s += alpha[Math.floor(rnd() * alpha.length)];
    const want = JSON.stringify(ref(s));
    for (let r = 0; r < 5; r++) {
      const got = [];
      const f = createCsvFeeder((row) => got.push(row));
      let i = 0;
      while (i < s.length) {
        const step = 1 + Math.floor(rnd() * (r === 0 ? 1 : 9));
        f.push(s.slice(i, i + step), false);
        i += step;
      }
      f.push("", true);
      cases++;
      if (JSON.stringify(got) !== want)
        fuzzFails++;
    }
  }
  const hdr = '\uFEFF"run_id","date","platform","topic","type","prompt","mentions","response","mentioned?"\n';
  let body = "";
  const brands = ["Aflac Insurance", "MetLife", "Guardian", "Cigna"];
  for (let k = 0; k < 6e3; k++) {
    const ms = brands.filter((_, bi) => k * (bi + 3) % 5 < 2);
    const typ = k % 3 === 0 ? "Sentiment, Visibility" : "Visibility";
    body += `"r${k}","2026-09-${10 + k % 5}","${k % 2 ? "ChatGPT" : "Google AI Overviews"}","Topic ${k % 7}","${typ}","Which plan ${k % 40}?","${ms.join(", ")}","line one
line ""two"", three","${ms.includes("Aflac Insurance") ? "Yes" : "No"}"\r
`;
  }
  const csv = hdr + body;
  const blob = new Blob([csv]);
  let textCalls = 0;
  const streamed = { name: "responses.csv", size: blob.size, stream: () => blob.stream(), text: () => {
    textCalls++;
    return blob.text();
  } };
  const textOnly = { name: "responses.csv", size: blob.size, text: () => blob.text() };
  const progress = [];
  const mS = await computeAll({ visibility: streamed }, "x", (p) => {
    if (p)
      progress.push(p);
  });
  const mT = await computeAll({ visibility: textOnly }, "x", () => {
  });
  const strip = (m) => {
    const c = { ...m };
    delete c.updatedAt;
    return JSON.stringify(c);
  };
  const failing = { name: "big.csv", size: 858079417, stream: () => new ReadableStream({ pull(ctl) {
    ctl.error(new Error("NotReadableError: simulated"));
  } }), text: () => {
    throw new Error("text() must not be called");
  } };
  let readErr = null;
  try {
    await computeAll({ visibility: failing }, "x", () => {
    });
  } catch (e) {
    readErr = e;
  }
  const last = progress[progress.length - 1] || {};
  console.log(JSON.stringify({
    cases,
    fuzzFails,
    textCalls,
    same: strip(mS) === strip(mT),
    totalRuns: mS.totalRuns,
    client: mS.client,
    lastBytes: last.bytes,
    lastTotal: last.totalBytes,
    blobSize: blob.size,
    lastPct: last.pct,
    labels: Array.from(new Set(progress.map((p) => p.label))),
    isReadErr: readErr instanceof ProfoundReadError,
    readMsg: readErr && readErr.message,
    gb: fmtBytes(858079417),
    mb: fmtBytes(156081219)
  }));
})();
/*! Bundled license information:

react/cjs/react.production.min.js:
  (**
   * @license React
   * react.production.min.js
   *
   * Copyright (c) Facebook, Inc. and its affiliates.
   *
   * This source code is licensed under the MIT license found in the
   * LICENSE file in the root directory of this source tree.
   *)

react/cjs/react.development.js:
  (**
   * @license React
   * react.development.js
   *
   * Copyright (c) Facebook, Inc. and its affiliates.
   *
   * This source code is licensed under the MIT license found in the
   * LICENSE file in the root directory of this source tree.
   *)

react/cjs/react-jsx-runtime.production.min.js:
  (**
   * @license React
   * react-jsx-runtime.production.min.js
   *
   * Copyright (c) Facebook, Inc. and its affiliates.
   *
   * This source code is licensed under the MIT license found in the
   * LICENSE file in the root directory of this source tree.
   *)

react/cjs/react-jsx-runtime.development.js:
  (**
   * @license React
   * react-jsx-runtime.development.js
   *
   * Copyright (c) Facebook, Inc. and its affiliates.
   *
   * This source code is licensed under the MIT license found in the
   * LICENSE file in the root directory of this source tree.
   *)
*/
