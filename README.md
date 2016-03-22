# cycle-workflows
Provides Plugin-based workflow functionality for cycle.js applications.

## Installation
`npm i cycle-workflows --save`

## Scripts
NOTE: Make sure you've installed all dependencies using `npm install` first.

To generate documentation: `npm run doc`. This will create documentation in the
`build/docs` folder.

To run unit tests: `npm test`

## API
### Workflow
Executes any [WorkflowStep](#WorkflowStep) instances associated withthe name of the Workflow instance, in dependency-safe order,with automatic rollback of executed steps if any steps fail.See the examples for more information.

**Kind**: global class  
**Emits**: <code>[StepsChanged](#Workflow.event_StepsChanged)</code>  
**Inherits**: Plugin  

* [Workflow](#Workflow)
    * [new Workflow(props)](#new_Workflow_new)
    * _instance_
        * [.asReadOnly()](#Workflow+asReadOnly) ⇒ <code>[Workflow](#Workflow)</code>
        * [.asObservable()](#Workflow+asObservable) ⇒ <code>Rx.Observable</code>
        * [.delete()](#Workflow+delete)
        * [.dispatch([args])](#Workflow+dispatch) ⇒ <code>[Promise.&lt;WorkflowResult&gt;](#WorkflowResult)</code>
    * _static_
        * [.States](#Workflow.States) : <code>Object</code>
        * [.Errors](#Workflow.Errors) : <code>Object</code>
        * [.Events](#Workflow.Events) : <code>Object</code>
        * ["Deleted" (instance)](#Workflow.event_Deleted)
        * ["Dispatched" (instance, arguments, promise)](#Workflow.event_Dispatched)
        * ["StepsChanged" (instance, steps)](#Workflow.event_StepsChanged)

<a name="new_Workflow_new"></a>

### new Workflow(props)

| Param | Type | Description |
| --- | --- | --- |
| props | <code>Object</code> | A map of property names and values  to associate with the workflow. The only required attribute  is `name`, which will be used to subscribe to any Plugin  instances targeting this Workflow instance. |

**Example**  
```js
var stepOne = new WorkflowStep({  name: 'step-one',  filter: {any: ['my-workflow']},  execute: function(arg) {    return new Promise(function(resolve) {      // represents a long-running operation      resolve('step one results');    });  });var stepTwo = new WorkflowStep({  name: 'step-two',  after: ['step-one'],  filter: {any: ['my-workflow', 'my-other-workflow']},  execute: function(arg) {    return 'step two results';  });var workflow = new Workflow({name: 'my-workflow'});workflow.dispatch('argument passed to execute methods')  then(function processResults(dispatch) {    // dispatch never rejects, always resolves;    // we need to check the status to see what    // to do next:    switch (dispatch.status) {      case Workflow.States.SUCCESS:        log(dispatch.results); break;      case Workflow.States.CANCELLED:        log(dispatch.reason); break;      case Workflow.States.FAILED:        log(dispatch.error); break;    }  });
```
<a name="Workflow+asReadOnly"></a>

### workflow.asReadOnly() ⇒ <code>[Workflow](#Workflow)</code>
Converts the Workflow into a version that cannot be deleted.Useful when you need to share a workflow without risking itbeing deleted.

**Kind**: instance method of <code>[Workflow](#Workflow)</code>  
**Returns**: <code>[Workflow](#Workflow)</code> - A readonly version of the Workflow instance.  
**Example**  
```js
var myWorkflow = new Workflow({name: 'safe-workflow'});return {  getWorkflow: function() {    return myWorkflow.asReadOnly(); // cannot be deleted  }};
```
<a name="Workflow+asObservable"></a>

### workflow.asObservable() ⇒ <code>Rx.Observable</code>
Provides a shared stream consumers can subscribeto in order to receive subsequent dispatch results.

**Kind**: instance method of <code>[Workflow](#Workflow)</code>  
**Example**  
```js
someWorkflow.asObservable()  .filter(dispatch => dispatch.status === Workflow.States.SUCCESS)  .pluck('results') // the values returned by executed steps  .tap(results => log(results));
```
<a name="Workflow+delete"></a>

### workflow.delete()
Deletes the workflow and any associated streams.Trying to invoke any methods on a deleted workflowwill cause an Error to be thrown.

**Kind**: instance method of <code>[Workflow](#Workflow)</code>  
**Emits**: <code>[Deleted](#Workflow.event_Deleted)</code>  
**Example**  
```js
myWorkflow.delete();myWorkflow.dispatch(); // throws Error
```
<a name="Workflow+dispatch"></a>

### workflow.dispatch([args]) ⇒ <code>[Promise.&lt;WorkflowResult&gt;](#WorkflowResult)</code>
Executes any enabled steps associated with thisWorkflow instance, passing the dispatch argumentsto each step's `execute` method and saving eachstep's `execute` result.

**Kind**: instance method of <code>[Workflow](#Workflow)</code>  
**Returns**: <code>[Promise.&lt;WorkflowResult&gt;](#WorkflowResult)</code> - A promise that will never be rejected. If a step's `execute` method returns a promise that never resolves, this promise will also never resolve. Examine the resulting value's `status` member to determine whether the dispatch ended successfully, failed, or was cancelled.  
**Emits**: <code>[Dispatched](#Workflow.event_Dispatched)</code>  

| Param | Type | Description |
| --- | --- | --- |
| [args] | <code>\*</code> | One or more arguments to pass to  each step's `execute` method. |

**Example**  
```js
myWorkflow.dispatch(arg1, arg2)  .then(dispatch => {    switch (dispatch.status) {      case Workflow.States.CANCELLED:      case Workflow.States.FAILED:        log('dispatch ended early:', dispatch.reason || dispatch.error);        break;      case Workflow.States.SUCCESS:        log(dispatch.results);    }  });
```
<a name="Workflow.States"></a>

### Workflow.States : <code>Object</code>
Represents the state of the Workflowdispatch result. Handlers attachedto the dispatch method should examinethe `state` property to determine howto process the results.

**Kind**: static property of <code>[Workflow](#Workflow)</code>  
**Properties**

| Name | Type | Description |
| --- | --- | --- |
| SUCCESS | <code>String</code> | The dispatch succeeded. Check the `results` property. |
| FAILED | <code>String</code> | The dispatch failed. Check the `error` property. |
| CANCELLED | <code>String</code> | The dispatch was cancelled. Check the `reason` property. |

<a name="Workflow.Errors"></a>

### Workflow.Errors : <code>Object</code>
A collection of possible Error messagesthe Workflow could generate.

**Kind**: static property of <code>[Workflow](#Workflow)</code>  
**Properties**

| Name | Type | Description |
| --- | --- | --- |
| READONLY_MODE | <code>String</code> | A readonly workflow cannot be deleted. |
| WORKFLOW_DELETED | <code>String</code> | A deleted workflow cannot be invoked. |

<a name="Workflow.Events"></a>

### Workflow.Events : <code>Object</code>
Events specific to Workflows. Also includes events related to all Plugin instances.

**Kind**: static property of <code>[Workflow](#Workflow)</code>  
**Properties**

| Name | Type | Description |
| --- | --- | --- |
| WF_DELETED | <code>String</code> | The workflow was deleted. |
| WF_DISPATCHED | <code>String</code> | The workflow was dispatched. |
| WF_STEPS_CHANGED | <code>String</code> | The steps associated with the workflow were changed. |

<a name="Workflow.event_Deleted"></a>

### "Deleted" (instance)
The workflow was deleted.

**Kind**: event emitted by <code>[Workflow](#Workflow)</code>  

| Param | Type |
| --- | --- |
| instance | <code>[Workflow](#Workflow)</code> | 

<a name="Workflow.event_Dispatched"></a>

### "Dispatched" (instance, arguments, promise)
The workflow was dispatched.

**Kind**: event emitted by <code>[Workflow](#Workflow)</code>  

| Param | Type | Description |
| --- | --- | --- |
| instance | <code>[Workflow](#Workflow)</code> |  |
| arguments | <code>Array</code> | The arguments passed to dispatch. |
| promise | <code>Promise</code> | A promise that will be resolved when the dispatch completes. |

<a name="Workflow.event_StepsChanged"></a>

### "StepsChanged" (instance, steps)
**Kind**: event emitted by <code>[Workflow](#Workflow)</code>  

| Param | Type | Description |
| --- | --- | --- |
| instance | <code>[Workflow](#Workflow)</code> |  |
| steps | <code>Array</code> | The updated array of steps. The array will have a toDAG method  to convert it into a structure that respects dependencies between steps. |


### WorkflowStep
Represents a single step in a Workflow instance.Each WorkflowStep has a lifecycle Workflow followsduring dispatch that you can hook into to control whathappens.First, the `init` method is called. This can be usedto initialize instance values used in the other methods.The `init` method is guaranteed to only be called onceper dispatch.Next, the `execute` method is invoked, and passed anyarguments provided to the `Workflow.dispatch` method. If`execute` returns a Promise, any dependent steps willnot run (and the Workflow dispatch promise will not beresolved) until the `execute` promise resolves. Whatevervalue the `execute` method returns (or a returned Promiseresolves with) will be stored in an internal `results`map that is accessible to subsequent steps and providedto the WorkflowResult that the dispatch promise is resolvedwith.If the `execute` method throws an error or returns apromise that rejects, then `retry` will be called andprovided with the error reason. If `retry` returns arejected promise or throws an error (which is the defaultimplementation if none is provided), then the dispatchwill be considered failed. Otherwise, returning anythingelse (or nothing at all) will cause `execute` to be invokedagain -- potentially an unlimited number of times.If the dispatch enters a failed state, then all of theexecuted steps' `rollback` methods will be invoked andprovided with the failure reason. Rollbacks are invoked inthe reverse order the `execute` methods were invoked.This allows your executed steps to perform any cleanupoperations that may be necessary.If the dispatch fails, then ALL steps -- even steps thatnever had a chance to be executed -- will have their`failure` method invoked with the reason the dispatchfailed.Only if all steps succeed will each executed step's`success` method be invoked. This method will be passedthe results object that maps step names to the valuesreturned by their `execute` methods.All step lifecycle methods have access to the followingproperties on their context (i.e., `this`):| Param | Type | Description || --- | --- | --- ||workflow | String | The name of the workflow being dispatched. This is useful when your step might be associated with multiple workflows. ||results | Object | A map of previously executed steps and the results of their `execute` methods. This is useful when your step is set to run after another step, and you would like to access the results of that step. || cancel | Function | A method you can invoke to cancel the dispatch immediately. Note that this method is only available from `init`, `execute`, and `retry`. |

**Kind**: global class  
**Inherits**: Plugin  
**Properties**

| Name | Type | Description |
| --- | --- | --- |
| init | <code>function</code> | A no-op, unless overridden. |
| execute | <code>function</code> | A no-op, unless overridden. |
| retry | <code>function</code> | Rejects, unless overridden. |
| rollback | <code>function</code> | A no-op, unless overridden. |
| success | <code>function</code> | A no-op, unless overridden. |
| failure | <code>function</code> | A no-op, unless overridden. |

<a name="new_WorkflowStep_new"></a>

### new WorkflowStep(props)

| Param | Type | Description |
| --- | --- | --- |
| props | <code>Object</code> | The properties to associate  with this WorkflowStep instance. The only required  property is `name`. You can provide Plugin-specific  values such as `after`, `filter`, and `targetType`  to restrict which Workflows your WorkflowStep will  be associated with. You can also override any of the  built-in WorkflowStep properties, such as `execute`. |

**Example**  
```js
// create a step that attempts to log in 3 times before// failing the dispatch -- if the execute method succeeds,// the dispatch results will contain a property called// 'login-step' whose value will be whatever value the// `postLogin(...)` promise resolves withPlugins.register(new WorkflowStep({  name: 'login-step',  filter: {any: 'login-workflow'},  retryCount: 0, // steps can have instance members  init: () => retryCount = 0, // runs once per dispatch  execute: (user, hash) => postLogin(user, hash), // return promise  retry: err => {    if (++retryCount > 3) {      throw err; // throwing from retry fails the dispatch    }    // wait 1 second and then try again; returning nothing    // would cause execute to be re-invoked immediately    return Promise.delay(1000);  }}));new Workflow({name: 'login-workflow'})  .dispatch(username, hashPassword)  .then(dispatch => {     if (dispatch.status !== Workflow.States.SUCCESS) {       showErrorMessage(dispatch.error || dispatch.reason);     }  });
```

### WorkflowResult
Represents the result of a dispatched workflow. Thedispatch promise will be resolved with an instanceof WorkflowResult that can be examined to learn moreabout how the dispatch concluded.

**Kind**: global class  
**Properties**

| Name | Type | Description |
| --- | --- | --- |
| status | <code>[States](#Workflow.States)</code> | The status of the  dispatch. |
| executed | <code>Array.&lt;String&gt;</code> | The names of the steps  that executed during the dispatch. Useful for  determining where an error may have occurred. |
| error | <code>Error</code> | The error that caused the  dispatch to fail. This property only exists if  `status` is `Workflow.States.FAILED`. |
| reason | <code>String</code> &#124; <code>Error</code> | The reason the dispatch  ended early. This property only exists if `status`  is `Workflow.States.CANCELLED`. |
| results | <code>Object</code> | A map of step names to  the results of that step's `execute` method. This  property only exists if `status` is  `Workflow.States.SUCCESS`. |

<a name="new_WorkflowResult_new"></a>

### new WorkflowResult(data)

| Param | Type | Description |
| --- | --- | --- |
| data | <code>Object</code> | Data about the dispatch. This  information is provided automatically by the dispatch  method. |

