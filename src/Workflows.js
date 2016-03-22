'use strict';

/**
 * @overview Provides Plugin-based workflow functionality for cycle.js applications.
 * @author Daniel R Barnes
 */

import {Promise} from 'bluebird';
import {Observable, Subject} from 'rxjs';
import {Plugin, Plugins} from 'cycle-plugins';
import {
    map,
    bind,
    extend,
    assign,
    attempt,
    toString,
    isFunction,
    isUndefined,
    reduceRight
} from 'lodash';

const
    data = new WeakMap(),
    Errors = {
        WORKFLOW_DELETED: 'The workflow has been deleted.',
        READONLY_MODE: 'This method cannot be invoked in readonly mode.'
    },
    
    throwIfDeleted = wf => {
        if (!data.has(wf)) {
            throw new Error(Errors.WORKFLOW_DELETED);
        }
    },
    
    readOnlyMethod = () => {
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
export class Workflow extends Plugin {
    
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
    static get States() {
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
    static get Errors() {
        return extend({}, Errors, super.Errors);
    }

    /**
     * Events specific to Workflows. Also includes events related to all Plugin instances.
     * @member Workflow.Events
     * @type {Object}
     * @property {String} WF_DELETED The workflow was deleted.
     * @property {String} WF_DISPATCHED The workflow was dispatched.
     * @property {String} WF_STEPS_CHANGED The steps associated with the workflow were changed.
     */
    static get Events() {
        return extend({
            WF_DELETED: 'workflow-deleted',
            WF_DISPATCHED: 'workflow-dispatched',
            WF_STEPS_CHANGED: 'workflow-steps-changed'
        }, super.Events);
    }

    constructor(props) {
        super(props);
        let subject = new Subject(),
            properties = {
                name: props.name,
                subject: subject,
                stream$: subject.share(),
                steps$: Plugins.get({
                    filter: props.name,
                    targetType: Workflow,
                    baseType: WorkflowStep
                })
            };
        data.set(this, properties);
        properties.steps$ = properties.steps$.subscribe(steps => {
            properties.steps = steps.toDAG();
            this.emit(Workflow.Events.WF_STEPS_CHANGED, this, steps);
        });
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
    asReadOnly() {
        throwIfDeleted(this);
        // NOTE: when real Proxy support arrives,
        // switch to that; in the meantime, users
        // can still delete workflows by manually
        // traversing the prototype chain
        let proxy = Object.create(this);
        ['asObservable', 'asReadOnly', 'toString', 'dispatch']
            .forEach(name => proxy[name] = bind(proxy[name], this));
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
    asObservable() {
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
    delete() {
        throwIfDeleted(this);
        let {subject, steps$} = data.get(this);
        subject.unsubscribe();
        steps$.unsubscribe();
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
    dispatch(...args) {

        throwIfDeleted(this);

        let executed = new Set(),
            {name, steps, subject} = data.get(this),
            promise = new Promise((resolve, reject, update) => {
                
                const
                    getExecuted = () => map(Array.from(executed.values()), 'name'),
                    context = {
                        results: {},
                        workflow: name,
                        cancel: reason => {
                            resolve(new WorkflowResult({
                                reason,
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

                steps.forEach((step, next, percent) => {

                    if (!step.enabled) {
                        next();
                    }

                    const
                        stepContext = extend({}, context, step),
                        execute = step.execute.apply.bind(step.execute, stepContext, args),
                        execLoop = () => {
                            executed.add(step);
                            return Promise.try(execute)
                                .catch(err => Promise.try(bind(step.retry, stepContext, err)).then(execLoop));
                        };

                    Promise.try(bind(step.init, stepContext))
                        .then(execLoop)
                        .tap(result => context.results[step.name] = result)
                        .finally(() => update(percent))
                        .then(() => next(), err =>
                            next(isUndefined(err) && `Error occurred in ${step.name}.` || err));

                }, error => {
                    
                    if (!isUndefined(error)) {
                        
                        error = error instanceof Error ? error : new Error(toString(error));
                        error.rollbackErrors = [];
                        
                        reduceRight(Array.from(executed.values()), (result, step) => {
                                let rollback = bind(step.rollback, extend({}, context, step), error);
                                return result.then(() => Promise.try(rollback).catch(err => error.rollbackErrors.push(err)));
                            }, Promise.resolve()).finally(() => {
                            
                                steps.toArray().reduce((result, step) => {
                                    let success = bind(step.failure, extend({}, context, step), error);
                                    return result.finally(() => Promise.try(success));
                                }, Promise.resolve()).finally(() => {
                                    resolve(new WorkflowResult({
                                        status: Workflow.States.FAILED,
                                        executed: getExecuted(),
                                        error
                                    }));
                                });
                            
                        });
                        
                    } else {

                        Array.from(executed.values())
                            .reduce((result, step) => {
                                let success = bind(step.success, extend({}, context, step), context.results);
                                return result.finally(() => Promise.try(success));
                            }, Promise.resolve()).finally(() => {
                                resolve(new WorkflowResult({
                                    status: Workflow.States.SUCCESS,
                                    executed: getExecuted(),
                                    results: context.results
                                }));
                            });

                    }

                });

            }).tap(result => subject.next(result));

        this.emit(Workflow.Events.WF_DISPATCHED, this, args, promise);

        return promise;
        
    }
    
    toString() {
        let {name, steps = {}} = data.get(this);
        return `${name}: ${steps.toString()}`;
    }
    
}

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
export class WorkflowResult {
    
    constructor(data) {
        assign(this, data);
    }
    
}

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
export class WorkflowStep extends Plugin {

    constructor(props) {
        super(extend({ targetType: Workflow }, props));
    }
    
    init() {}
    execute() {}
    rollback() {}
    success() {}
    failure() {}

    retry(err) {
        return Promise.reject(err || new Error(`Error occurred in ${this.name}.`));
    }

}
