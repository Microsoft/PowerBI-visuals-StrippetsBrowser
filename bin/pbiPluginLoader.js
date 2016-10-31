'use strict';

const path = require('path');
const cp = require('child_process');
const crypto = require('crypto');
const pbiviz = require(path.join(process.cwd(), 'pbiviz.json'));
const packageJson = require(path.join(process.cwd(), 'package.json'));

const userName = cp.execSync('whoami').toString();
const userHash = crypto.createHash('md5').update(userName).digest('hex');
console.log('User Hash: ' + userHash);

const patchAPI = function (version) {
    /* source code must be ES 5 */
    var essexAPIPatcherVersion = '0.0.1';
    var essexAPIPatcherKey = '__essex_patcher__';

    var fetchAPIObject = function (version) {
        var apiVersions = powerbi.extensibility.visualApiVersions;
        for (var i = 0, n = apiVersions.length; i < n; ++i) {
            if (apiVersions[i].version === version) {
                return apiVersions[i];
            }
        }
        return null;
    };

    var isAPIObjectPatched = function (api) {
        return !!(api.overloads && api.overloads[essexAPIPatcherKey]);
    };

    var isESSEXVisual = function (visual) {
        return !!(visual.__essex_visual__);
    };

    var patchAPIObject = function (api) {
        var overloads = api.overloads;
        api.overloads = function (visual, host) {

            if (!isESSEXVisual(visual)) {
                return overloads(visual, host);
            }

            var proxy = {
                update: function(/*...*/) {
                    var args = Array.prototype.slice.call(arguments);

                    if (proxy.options) {
                        var apiOptions = args[0];
                        for (var key in proxy.options) {
                            if (proxy.options.hasOwnProperty(key) && !apiOptions.hasOwnProperty(key)) {
                                apiOptions[key] = proxy.options[key];
                            }
                        }

                        proxy.options = null;
                    }

                    visual.update.apply(visual, args);
                },

                options: null
            };
            var overloadedProxy = overloads(proxy, host);

            return {
                update: function(options) {
                    if (visual.update) {
                        proxy.options = options;
                        overloadedProxy.update(options);
                    }
                }
            }
        };

        api.overloads[essexAPIPatcherKey] = essexAPIPatcherVersion;

        return api;
    };

    var api = fetchAPIObject(version);
    if (api && !isAPIObjectPatched(api)) {
        patchAPIObject(api);
    }
};

function pbivizPluginTemplate (pbiviz) {
    return `(function (powerbi) {
        var visuals;
        (function (visuals) {
            var plugins;
            (function (plugins) {
                plugins['${pbiviz.visual.guid}'] = {
                    name: '${pbiviz.visual.guid}',
                    displayName: '${pbiviz.visual.name}',
                    class: '${pbiviz.visual.visualClassName}',
                    version: '${packageJson.version}',
                    apiVersion: ${pbiviz.apiVersion ? `'${pbiviz.apiVersion}'` : undefined },
                    capabilities: {}, // will be overridden by capabilities.json (needed for debug visual for somehow)
                    create: function (/*options*/) {
                        var instance = Object.create(${pbiviz.visual.visualClassName}.prototype);
                        ${pbiviz.visual.visualClassName}.apply(instance, arguments);
                        return instance;
                    },
                    custom: true
                };

                /* save version number to visual */
                ${pbiviz.visual.visualClassName}.__essex_build_info__ = '${packageJson.version} ${Date.now()} [${userHash}]';
                Object.defineProperty(${pbiviz.visual.visualClassName}.prototype, '__essex_build_info__', { get: function() { return ${pbiviz.visual.visualClassName}.__essex_build_info__; } } );

                /* ESSEX API Patcher */
                ${pbiviz.visual.visualClassName}.prototype.__essex_visual__ = true;
                (${patchAPI.toString()})(${pbiviz.apiVersion ? `'${pbiviz.apiVersion}'` : `''`})
            })(plugins = visuals.plugins || (visuals.plugins = {}));
        })(visuals = powerbi.visuals || (powerbi.visuals = {}));
    })(window['powerbi'] || (window['powerbi'] = {}));`;
}

/**
 * Webpack loader function that appends pbiviz plugin code at the end of the provided source
 */
function pluginLoader (source, map) {
  this.cacheable();
  source = source + '\n' + pbivizPluginTemplate(pbiviz);
  this.callback(null, source, map);
}

module.exports = pluginLoader;
