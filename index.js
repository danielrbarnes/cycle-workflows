'use strict';

/**
 * @overview Provides Plugin-based workflow functionality for cycle.js applications.
 * @author Daniel R Barnes
 */

Object.defineProperty(exports, "__esModule", {
    value: true
});
exports.WorkflowStep = exports.WorkflowResult = exports.Workflow = undefined;

var _reduceRight2 = require('lodash\\reduceRight');

var _reduceRight3 = _interopRequireDefault(_reduceRight2);

var _isUndefined2 = require('lodash\\isUndefined');

var _isUndefined3 = _interopRequireDefault(_isUndefined2);

var _isFunction2 = require('lodash\\isFunction');

var _isFunction3 = _interopRequireDefault(_isFunction2);

var _toString2 = require('lodash\\toString');

var _toString3 = _interopRequireDefault(_toString2);

var _attempt2 = require('lodash\\attempt');

var _attempt3 = _interopRequireDefault(_attempt2);

var _assign2 = require('lodash\\assign');

var _assign3 = _interopRequireDefault(_assign2);

var _extend2 = require('lodash\\extend');

var _extend3 = _interopRequireDefault(_extend2);

var _bind2 = require('lodash\\bind');

var _bind3 = _interopRequireDefault(_bind2);

var _map2 = require('lodash\\map');

var _map3 = _interopRequireDefault(_map2);

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

var _get = function get(object, property, receiver) { if (object === null) object = Function.prototype; var desc = Object.getOwnPropertyDescriptor(object, property); if (desc === undefined) { var parent = Object.getPrototypeOf(object); if (parent === null) { return undefined; } else { return get(parent, property, receiver); } } else if ("value" in desc) { return desc.value; } else { var getter = desc.get; if (getter === undefined) { return undefined; } return getter.call(receiver); } };

var _bluebird = require('bluebird');

var _cycleLogger = require('cycle-logger2');

var _rxjs = require('rxjs');

var _cyclePlugins = require('cycle-plugins');

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

function _possibleConstructorReturn(self, call) { if (!self) { throw new ReferenceError("this hasn't been initialised - super() hasn't been called"); } return call && (typeof call === "object" || typeof call === "function") ? call : self; }

function _inherits(subClass, superClass) { if (typeof superClass !== "function" && superClass !== null) { throw new TypeError("Super expression must either be null or a function, not " + typeof superClass); } subClass.prototype = Object.create(superClass && superClass.prototype, { constructor: { value: subClass, enumerable: false, writable: true, configurable: true } }); if (superClass) Object.setPrototypeOf ? Object.setPrototypeOf(subClass, superClass) : subClass.__proto__ = superClass; }

var data = new WeakMap(),
    Errors = {
    WORKFLOW_DELETED: 'The workflow has been deleted.',
    READONLY_MODE: 'This method cannot be invoked in readonly mode.'
},
    throwIfDeleted = function throwIfDeleted(wf) {
    if (!data.has(wf)) {
        throw new Error(Errors.WORKFLOW_DELETED);
    }
},
    readOnlyMethod = function readOnlyMethod() {
    throw new Error(Errors.READONLY_MODE);
};

/**
 * @classdesc
 * Executes any {@link WorkflowStep} instances associated with
 * the name of the Workflow instance, in dependency-safe order,
 * with automatic rollback of executed steps if any steps fail.
 * See the examples for more information.
 * @class Workflow
 * @inherits Plugin
 * @param {Object} props A map of property names and values
 *  to associate with the workflow. The only required attribute
 *  is `name`, which will be used to subscribe to any Plugin
 *  instances targeting this Workflow instance.
 * @fires Workflow.StepsChanged
 * @example
 * var stepOne = new WorkflowStep({
 *   name: 'step-one',
 *   filter: {any: ['my-workflow']},
 *   execute: function(arg) {
 *     return new Promise(function(resolve) {
 *       // represents a long-running operation
 *       resolve('step one results');
 *     });
 *   }
 * );
 *
 * var stepTwo = new WorkflowStep({
 *   name: 'step-two',
 *   after: ['step-one'],
 *   filter: {any: ['my-workflow', 'my-other-workflow']},
 *   execute: function(arg) {
 *     return 'step two results';
 *   }
 * );
 *
 * var workflow = new Workflow({name: 'my-workflow'});
 * workflow.dispatch('argument passed to execute methods')
 *   then(function processResults(dispatch) {
 *     // dispatch never rejects, always resolves;
 *     // we need to check the status to see what
 *     // to do next:
 *     switch (dispatch.status) {
 *       case Workflow.States.SUCCESS:
 *         log(dispatch.results); break;
 *       case Workflow.States.CANCELLED:
 *         log(dispatch.reason); break;
 *       case Workflow.States.FAILED:
 *         log(dispatch.error); break;
 *     }
 *   });
 */

var Workflow = exports.Workflow = function (_Plugin) {
    _inherits(Workflow, _Plugin);

    _createClass(Workflow, null, [{
        key: 'States',


        /**
         * The workflow was deleted.
         * @event Workflow.Deleted
         * @param {Workflow} instance
         */

        /**
         * The workflow was dispatched.
         * @event Workflow.Dispatched
         * @param {Workflow} instance
         * @param {Array} arguments The arguments passed to dispatch.
         * @param {Promise} promise A promise that will be resolved when the dispatch completes.
         */

        /**
         * @event Workflow.StepsChanged
         * @param {Workflow} instance
         * @param {Array} steps The updated array of steps. The array will have a toDAG method
         *  to convert it into a structure that respects dependencies between steps.
         */

        /**
         * Represents the state of the Workflow
         * dispatch result. Handlers attached
         * to the dispatch method should examine
         * the `state` property to determine how
         * to process the results.
         * @member Workflow.States
         * @type {Object}
         * @property {String} SUCCESS The dispatch succeeded. Check the `results` property.
         * @property {String} FAILED The dispatch failed. Check the `error` property.
         * @property {String} CANCELLED The dispatch was cancelled. Check the `reason` property.
         */
        get: function get() {
            return {
                SUCCESS: 'success',
                FAILED: 'failed',
                CANCELLED: 'cancelled'
            };
        }

        /**
         * A collection of possible Error messages
         * the Workflow could generate.
         * @member Workflow.Errors
         * @type {Object}
         * @property {String} READONLY_MODE A readonly workflow cannot be deleted.
         * @property {String} WORKFLOW_DELETED A deleted workflow cannot be invoked.
         */

    }, {
        key: 'Errors',
        get: function get() {
            return (0, _extend3.default)({}, Errors, _get(Object.getPrototypeOf(Workflow), 'Errors', this));
        }

        /**
         * Events specific to Workflows. Also includes events related to all Plugin instances.
         * @member Workflow.Events
         * @type {Object}
         * @property {String} WF_DELETED The workflow was deleted.
         * @property {String} WF_DISPATCHED The workflow was dispatched.
         * @property {String} WF_STEPS_CHANGED The steps associated with the workflow were changed.
         */

    }, {
        key: 'Events',
        get: function get() {
            return (0, _extend3.default)({
                WF_DELETED: 'workflow-deleted',
                WF_DISPATCHED: 'workflow-dispatched',
                WF_STEPS_CHANGED: 'workflow-steps-changed'
            }, _get(Object.getPrototypeOf(Workflow), 'Events', this));
        }
    }]);

    function Workflow(props) {
        _classCallCheck(this, Workflow);

        var _this = _possibleConstructorReturn(this, Object.getPrototypeOf(Workflow).call(this, props));

        var subject = new _rxjs.Subject(),
            properties = {
            name: props.name,
            subject: subject,
            stream$: subject.share(),
            logger: _cycleLogger.Loggers.get('log.wf.' + props.name),
            steps$: _cyclePlugins.Plugins.get({
                filter: props.name,
                targetType: Workflow,
                baseType: WorkflowStep
            })
        };
        data.set(_this, properties);
        properties.steps$ = properties.steps$.subscribe(function (steps) {
            properties.steps = steps.toDAG();
            _this.emit(Workflow.Events.WF_STEPS_CHANGED, _this, steps);
        });
        return _this;
    }

    /**
     * Converts the Workflow into a version that cannot be deleted.
     * Useful when you need to share a workflow without risking it
     * being deleted.
     * @function Workflow#asReadOnly
     * @returns {Workflow} A readonly version of the Workflow instance.
     * @example
     * var myWorkflow = new Workflow({name: 'safe-workflow'});
     * return {
     *   getWorkflow: function() {
     *     return myWorkflow.asReadOnly(); // cannot be deleted
     *   }
     * };
     */


    _createClass(Workflow, [{
        key: 'asReadOnly',
        value: function asReadOnly() {
            var _this2 = this;

            throwIfDeleted(this);
            // NOTE: when real Proxy support arrives,
            // switch to that; in the meantime, users
            // can still delete workflows by manually
            // traversing the prototype chain
            var proxy = Object.create(this);
            ['asObservable', 'asReadOnly', 'toString', 'dispatch'].forEach(function (name) {
                return proxy[name] = (0, _bind3.default)(proxy[name], _this2);
            });
            proxy.delete = readOnlyMethod;
            return proxy;
        }

        /**
         * Provides a shared stream consumers can subscribe
         * to in order to receive subsequent dispatch results.
         * @function Workflow#asObservable
         * @returns {Rx.Observable}
         * @example
         * someWorkflow.asObservable()
         *   .filter(dispatch => dispatch.status === Workflow.States.SUCCESS)
         *   .pluck('results') // the values returned by executed steps
         *   .tap(results => log(results));
         */

    }, {
        key: 'asObservable',
        value: function asObservable() {
            throwIfDeleted(this);
            return data.get(this).stream$;
        }

        /**
         * Deletes the workflow and any associated streams.
         * Trying to invoke any methods on a deleted workflow
         * will cause an Error to be thrown.
         * @function Workflow#delete
         * @fires Workflow.Deleted
         * @example
         * myWorkflow.delete();
         * myWorkflow.dispatch(); // throws Error
         */

    }, {
        key: 'delete',
        value: function _delete() {
            throwIfDeleted(this);

            var _data$get = data.get(this);

            var subject = _data$get.subject;
            var steps$ = _data$get.steps$;
            var logger = _data$get.logger;

            subject.unsubscribe();
            steps$.unsubscribe();
            logger.info('Workflow deleted.');
            data.delete(this);
            this.emit(Workflow.Events.WF_DELETED, this);
        }

        /**
         * Executes any enabled steps associated with this
         * Workflow instance, passing the dispatch arguments
         * to each step's `execute` method and saving each
         * step's `execute` result.
         * @function Workflow#dispatch
         * @param {*} [args] One or more arguments to pass to
         *  each step's `execute` method.
         * @returns {Promise<WorkflowResult>} A promise that will never be
         *  rejected. If a step's `execute` method returns a
         *  promise that never resolves, this promise will
         *  also never resolve. Examine the resulting value's
         *  `status` member to determine whether the dispatch
         *  ended successfully, failed, or was cancelled.
         * @fires Workflow.Dispatched
         * @example
         * myWorkflow.dispatch(arg1, arg2)
         *   .then(dispatch => {
         *     switch (dispatch.status) {
         *       case Workflow.States.CANCELLED:
         *       case Workflow.States.FAILED:
         *         log('dispatch ended early:', dispatch.reason || dispatch.error);
         *         break;
         *       case Workflow.States.SUCCESS:
         *         log(dispatch.results);
         *     }
         *   });
         */

    }, {
        key: 'dispatch',
        value: function dispatch() {
            for (var _len = arguments.length, args = Array(_len), _key = 0; _key < _len; _key++) {
                args[_key] = arguments[_key];
            }

            throwIfDeleted(this);

            var executed = new Set();

            var _data$get2 = data.get(this);

            var name = _data$get2.name;
            var steps = _data$get2.steps;
            var subject = _data$get2.subject;
            var logger = _data$get2.logger;
            var promise = new _bluebird.Promise(function (resolve, reject, update) {

                var getExecuted = function getExecuted() {
                    return (0, _map3.default)(Array.from(executed.values()), 'name');
                },
                    context = {
                    results: {},
                    workflow: name,
                    cancel: function cancel(reason) {
                        resolve(new WorkflowResult({
                            reason: reason,
                            status: Workflow.States.CANCELLED,
                            executed: getExecuted()
                        }));
                    }
                };

                if (!steps) {
                    resolve(new WorkflowResult({
                        executed: [],
                        status: Workflow.States.SUCCESS,
                        results: context.results
                    }));
                }

                update = update || Function.prototype;

                steps.forEach(function (step, next, percent) {

                    if (!step.enabled) {
                        next();
                    }

                    var stepContext = (0, _extend3.default)({}, context, step),
                        execute = step.execute.apply.bind(step.execute, stepContext, args),
                        execLoop = function execLoop() {
                        executed.add(step);
                        logger.info('Executing ' + step.name + '.');
                        return _bluebird.Promise.try(execute).catch(function (err) {
                            return _bluebird.Promise.try((0, _bind3.default)(step.retry, stepContext, err)).then(execLoop);
                        });
                    };

                    _bluebird.Promise.try((0, _bind3.default)(step.init, stepContext)).then(execLoop).tap(function (result) {
                        return context.results[step.name] = result;
                    }).finally(function () {
                        return update(percent);
                    }).then(function () {
                        return next();
                    }, function (err) {
                        return next((0, _isUndefined3.default)(err) && 'Error occurred in ' + step.name + '.' || err);
                    });
                }, function (error) {

                    delete context.cancel;

                    if (!(0, _isUndefined3.default)(error)) {

                        error = error instanceof Error ? error : new Error((0, _toString3.default)(error));
                        error.rollbackErrors = [];

                        (0, _reduceRight3.default)(Array.from(executed.values()), function (result, step) {
                            var rollback = (0, _bind3.default)(step.rollback, (0, _extend3.default)({}, context, step), error);
                            return result.then(function () {
                                return _bluebird.Promise.try(rollback).catch(function (err) {
                                    return error.rollbackErrors.push(err);
                                });
                            });
                        }, _bluebird.Promise.resolve()).finally(function () {
                            logger.info('Dispatch failed: %s', error);
                            steps.toArray().reduce(function (result, step) {
                                var failure = (0, _bind3.default)(step.failure, (0, _extend3.default)({}, context, step), error);
                                return result.finally(function () {
                                    return _bluebird.Promise.try(failure);
                                });
                            }, _bluebird.Promise.resolve()).finally(function () {
                                resolve(new WorkflowResult({
                                    status: Workflow.States.FAILED,
                                    executed: getExecuted(),
                                    error: error
                                }));
                            });
                        });
                    } else {

                        Array.from(executed.values()).reduce(function (result, step) {
                            var success = (0, _bind3.default)(step.success, (0, _extend3.default)({}, context, step), context.results);
                            return result.finally(function () {
                                return _bluebird.Promise.try(success);
                            });
                        }, _bluebird.Promise.resolve()).finally(function () {
                            logger.info('Dispatch succeeded.');
                            resolve(new WorkflowResult({
                                status: Workflow.States.SUCCESS,
                                executed: getExecuted(),
                                results: context.results
                            }));
                        });
                    }
                });
            }).tap(function (result) {
                return subject.next(result);
            });

            logger.info('Workflow dispatched.');
            this.emit(Workflow.Events.WF_DISPATCHED, this, args, promise);

            return promise;
        }
    }, {
        key: 'toString',
        value: function toString() {
            var _data$get3 = data.get(this);

            var name = _data$get3.name;
            var _data$get3$steps = _data$get3.steps;
            var steps = _data$get3$steps === undefined ? {} : _data$get3$steps;

            return name + ': ' + steps.toString();
        }
    }]);

    return Workflow;
}(_cyclePlugins.Plugin);

/**
 * @classdesc
 * Represents the result of a dispatched workflow. The
 * dispatch promise will be resolved with an instance
 * of WorkflowResult that can be examined to learn more
 * about how the dispatch concluded.
 * @class WorkflowResult
 * @param {Object} data Data about the dispatch. This
 *  information is provided automatically by the dispatch
 *  method.
 * @property {Workflow.States} status The status of the
 *  dispatch.
 * @property {String[]} executed The names of the steps
 *  that executed during the dispatch. Useful for
 *  determining where an error may have occurred.
 * @property {Error} error The error that caused the
 *  dispatch to fail. This property only exists if
 *  `status` is `Workflow.States.FAILED`.
 * @property {String|Error} reason The reason the dispatch
 *  ended early. This property only exists if `status`
 *  is `Workflow.States.CANCELLED`.
 * @property {Object} results A map of step names to
 *  the results of that step's `execute` method. This
 *  property only exists if `status` is
 *  `Workflow.States.SUCCESS`.
 */


var WorkflowResult = exports.WorkflowResult = function WorkflowResult(data) {
    _classCallCheck(this, WorkflowResult);

    (0, _assign3.default)(this, data);
};

/**
 * @class WorkflowStep
 * @inherits Plugin
 * @param {Object} props The properties to associate
 *  with this WorkflowStep instance. The only required
 *  property is `name`. You can provide Plugin-specific
 *  values such as `after`, `filter`, and `targetType`
 *  to restrict which Workflows your WorkflowStep will
 *  be associated with. You can also override any of the
 *  built-in WorkflowStep properties, such as `execute`.
 * @property {Function} init A no-op, unless overridden.
 * @property {Function} execute A no-op, unless overridden.
 * @property {Function} retry Rejects, unless overridden.
 * @property {Function} rollback A no-op, unless overridden.
 * @property {Function} success A no-op, unless overridden.
 * @property {Function} failure A no-op, unless overridden.
 * @classdesc
 * Represents a single step in a Workflow instance.
 *
 * Each WorkflowStep has a lifecycle Workflow follows
 * during dispatch that you can hook into to control what
 * happens.
 *
 * First, the `init` method is called. This can be used
 * to initialize instance values used in the other methods.
 * The `init` method is guaranteed to only be called once
 * per dispatch.
 *
 * Next, the `execute` method is invoked, and passed any
 * arguments provided to the `Workflow.dispatch` method. If
 * `execute` returns a Promise, any dependent steps will
 * not run (and the Workflow dispatch promise will not be
 * resolved) until the `execute` promise resolves. Whatever
 * value the `execute` method returns (or a returned Promise
 * resolves with) will be stored in an internal `results`
 * map that is accessible to subsequent steps and provided
 * to the WorkflowResult that the dispatch promise is resolved
 * with.
 *
 * If the `execute` method throws an error or returns a
 * promise that rejects, then `retry` will be called and
 * provided with the error reason. If `retry` returns a
 * rejected promise or throws an error (which is the default
 * implementation if none is provided), then the dispatch
 * will be considered failed. Otherwise, returning anything
 * else (or nothing at all) will cause `execute` to be invoked
 * again -- potentially an unlimited number of times.
 *
 * If the dispatch enters a failed state, then all of the
 * executed steps' `rollback` methods will be invoked and
 * provided with the failure reason. Rollbacks are invoked in
 * the reverse order the `execute` methods were invoked.
 * This allows your executed steps to perform any cleanup
 * operations that may be necessary.
 *
 * If the dispatch fails, then ALL steps -- even steps that
 * never had a chance to be executed -- will have their
 * `failure` method invoked with the reason the dispatch
 * failed.
 *
 * Only if all steps succeed will each executed step's
 * `success` method be invoked. This method will be passed
 * the results object that maps step names to the values
 * returned by their `execute` methods.
 *
 * All step lifecycle methods have access to the following
 * properties on their context (i.e., `this`):
 *
 * | Param | Type | Description |
 * | --- | --- | --- |
 * |workflow | String | The name of the workflow being dispatched. This is useful when your step might be associated with multiple workflows. |
 * |results | Object | A map of previously executed steps and the results of their `execute` methods. This is useful when your step is set to run after another step, and you would like to access the results of that step. |
 * | cancel | Function | A method you can invoke to cancel the dispatch immediately. Note that this method is only available from `init`, `execute`, and `retry`. |
 * @example
 * // create a step that attempts to log in 3 times before
 * // failing the dispatch -- if the execute method succeeds,
 * // the dispatch results will contain a property called
 * // 'login-step' whose value will be whatever value the
 * // `postLogin(...)` promise resolves with
 * Plugins.register(new WorkflowStep({
 *   name: 'login-step',
 *   filter: {any: 'login-workflow'},
 *   retryCount: 0, // steps can have instance members
 *   init: () => retryCount = 0, // runs once per dispatch
 *   execute: (user, hash) => postLogin(user, hash), // return promise
 *   retry: err => {
 *     if (++retryCount > 3) {
 *       throw err; // throwing from retry fails the dispatch
 *     }
 *     // wait 1 second and then try again; returning nothing
 *     // would cause execute to be re-invoked immediately
 *     return Promise.delay(1000);
 *   }
 * }));
 *
 * new Workflow({name: 'login-workflow'})
 *   .dispatch(username, hashPassword)
 *   .then(dispatch => {
 *      if (dispatch.status !== Workflow.States.SUCCESS) {
 *        showErrorMessage(dispatch.error || dispatch.reason);
 *      }
 *   });
 */


var WorkflowStep = exports.WorkflowStep = function (_Plugin2) {
    _inherits(WorkflowStep, _Plugin2);

    function WorkflowStep(props) {
        _classCallCheck(this, WorkflowStep);

        return _possibleConstructorReturn(this, Object.getPrototypeOf(WorkflowStep).call(this, (0, _extend3.default)({ targetType: Workflow }, props)));
    }

    _createClass(WorkflowStep, [{
        key: 'init',
        value: function init() {}
    }, {
        key: 'execute',
        value: function execute() {}
    }, {
        key: 'rollback',
        value: function rollback() {}
    }, {
        key: 'success',
        value: function success() {}
    }, {
        key: 'failure',
        value: function failure() {}
    }, {
        key: 'retry',
        value: function retry(err) {
            return _bluebird.Promise.reject(err || new Error('Error occurred in ' + this.name + '.'));
        }
    }]);

    return WorkflowStep;
}(_cyclePlugins.Plugin);
