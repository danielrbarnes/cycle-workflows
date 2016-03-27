'use strict';

var merge = require('lodash').merge;
var expect = require('chai').expect;
var Workflow = require('../index').Workflow;
var WorkflowStep = require('../index').WorkflowStep;
var Plugins = require('cycle-plugins').Plugins;
var Loggers = require('cycle-logger2').Loggers;

function getStep(name, after, methods) {
    return getStepForWorkflow('test', name, after, methods);
}

function getStepForWorkflow(wf, name, after, methods) {
    return new WorkflowStep(merge({
        name: name,
        after: after || [],
        filter: {any: [wf]},
        execute: function execute() {
            return new Promise(function(resolve) {
                setTimeout(function() {
                    resolve(name);
                }, 10);
            });
        }
    }, methods || {}));
}

function addSteps() {
    Plugins.add(
        getStep('a'),
        getStep('b', ['a']),
        getStep('c', ['a']),
        getStep('d', ['c'])
    );
}

function removeSteps() {
    Plugins.get({targetType: Workflow})
        .subscribe(function(plugins) {
            Plugins.remove(plugins);
        }).unsubscribe();
}

describe('Workflow', function() {

    beforeEach(addSteps);
    afterEach(removeSteps);

    describe('constructor', function() {

        beforeEach(function() {
            this.workflow = new Workflow({name: 'test'});
        });

        afterEach(function() {
            this.workflow.delete();
        });

        it('retrieves matching steps', function() {
            expect(this.workflow.toString()).to.equal(
                'test: root : [a : [b : [], c : [d : []]]]'
            );
        });

        it('updates steps when new ones registered', function() {
            Plugins.add(getStep('e', ['b']));
            expect(this.workflow.toString()).to.equal(
                'test: root : [a : [b : [e : []], c : [d : []]]]'
            );
        });

    });

    describe('States', function() {

        it('has expected members', function() {
            expect(Workflow.States).to.have.any.keys(['SUCCESS', 'FAILED', 'CANCELLED']);
        });

    });

    describe('Errors', function() {

        it('has expected members', function() {
            expect(Workflow.Errors).to.have.any.keys(['WORKFLOW_DELETED', 'READONLY_MODE']);
        });

    });

    describe('Events', function() {

        it('has expected members', function() {
            expect(Workflow.Events).to.have.any.keys(['WF_DELETED', 'WF_DISPATCHED', 'WF_STEPS_CHANGED']);
        });

    });

    describe('.toString', function() {

        it('throws if workflow deleted', function() {
            var workflow = new Workflow({name: 'test'});
            workflow.delete();
            expect(function() {
                workflow.delete();
            }).to.throw(Workflow.Errors.WORKFLOW_DELETED);
        });

    });

    describe('.asReadOnly', function() {

        it('can still dispatch', function(done) {
            new Workflow({name: 'test'})
                .asReadOnly()
                .dispatch()
                .then(function() {
                    done();
                });
        });

        it('throws if delete is called', function() {
            var workflow = new Workflow({name: 'test'}).asReadOnly();
            expect(function() {
                workflow.delete();
            }).to.throw(Workflow.Errors.READONLY_MODE);
        });

        it('throws if workflow deleted', function() {
            var workflow = new Workflow({name: 'test'});
            workflow.delete();
            expect(function() {
                workflow.asReadOnly();
            }).to.throw(Workflow.Errors.WORKFLOW_DELETED);
        });

        it('receives values from original dispatch', function(done) {
            var original = new Workflow({name: 'test'}),
                readonly = original.asReadOnly(),
                stream$ = readonly.asObservable();
            stream$.subscribe(function onNext(result) {
                done();
            });
            original.dispatch();
        });

        it('defers to original dispatch', function(done) {
            var original = new Workflow({name: 'test'}),
                readonly = original.asReadOnly(),
                stream$ = original.asObservable();
            stream$.subscribe(function onNext(result) {
                done();
            });
            readonly.dispatch();
        });

    });

    describe('.delete', function() {

        it('throws if workflow deleted', function() {
            var workflow = new Workflow({name: 'test'});
            workflow.delete();
            expect(function() {
                workflow.delete();
            }).to.throw(Workflow.Errors.WORKFLOW_DELETED);
        });

        it('logs deletion', function(done) {
            var token = Loggers.asObservable()
                .byName('log.wf.test')
                .subscribe(function(event) {
                    expect(event.message).to.equal('Workflow deleted.');
                    token.unsubscribe();
                    done();
                });
            new Workflow({name: 'test'}).delete();
        });

    });

    describe('.asObservable', function() {

        it('returns Observable', function() {
            var workflow = new Workflow({name: 'test'});
            expect(workflow.asObservable()).to.respondTo('subscribe');
        });

        it('throws if workflow deleted', function() {
            var workflow = new Workflow({name: 'test'});
            workflow.delete();
            expect(function() {
                workflow.asObservable();
            }).to.throw(Workflow.Errors.WORKFLOW_DELETED);
        });

        it('receives dispatch results', function(done) {
            var successCount = 0,
                workflow = new Workflow({name: 'test'});
            workflow.asObservable().subscribe(function onNext(result) {
                expect(result.status).to.equal(Workflow.States.SUCCESS);
                if (++successCount === 2) {
                    workflow.delete();
                    done();
                }
            });
            workflow.dispatch();
            workflow.dispatch();
        });

    });

    describe('.dispatch', function() {

        it('throws if workflow deleted', function() {
            var workflow = new Workflow({name: 'test'});
            workflow.delete();
            expect(function() {
                workflow.dispatch();
            }).to.throw(Workflow.Errors.WORKFLOW_DELETED);
        });

        it('returns Promise', function() {
            var result = new Workflow({name: 'test'}).dispatch();
            expect(result).to.respondTo('then', 'catch');
        });

        it('logs dispatch', function() {
            removeSteps();
            Plugins.add(
                getStepForWorkflow('temp', '1'),
                getStepForWorkflow('temp', '2', ['1']),
                getStepForWorkflow('temp', '3', ['2']),
                getStepForWorkflow('temp', '4', ['3'])
            );
            var messages = [
                    'Workflow dispatched.',
                    'Executing 1.',
                    'Executing 2.',
                    'Executing 3.',
                    'Executing 4.',
                    'Dispatch succeeded.'
                ],
                token = Loggers.asObservable()
                    .byName('temp')
                    .subscribe(function(event) {
                        expect(event.message).to.equal(messages.shift());
                        if (messages.length === 0) {
                            token.unsubscribe();
                        }
                    });
            new Workflow({name: 'temp'}).dispatch();
        });

        it('accepts multiple arguments', function(done) {
            Plugins.add(getStep('e', ['a'], {
                execute : function(arg1, arg2, arg3) {
                    expect(arg1).to.equal(1);
                    expect(arg2).to.equal(2);
                    expect(arg3).to.equal(3);
                }
            }));
            new Workflow({name: 'test'})
                .dispatch(1, 2, 3)
                .then(function(result) {
                    expect(result.status).to.equal(Workflow.States.SUCCESS);
                    done();
                });
        });

        it('accepts array of arguments', function(done) {
            Plugins.add(getStep('e', ['a'], {
                execute : function(arg) {
                    expect(arg).to.be.an('array');
                    expect(arg[0]).to.equal(1);
                    expect(arg[1]).to.equal(2);
                    expect(arg[2]).to.equal(3);
                }
            }));
            new Workflow({name: 'test'})
                .dispatch([1, 2, 3])
                .then(function(result) {
                    expect(result.status).to.equal(Workflow.States.SUCCESS);
                    done();
                });
        });

        it('never rejects - even if cancelled', function(done) {
            Plugins.add(getStep('e', ['a'], {
                execute : function() {
                    this.cancel('cancel reason');
                }
            }));
            new Workflow({name: 'test'})
                .dispatch()
                .then(function(result) {
                    expect(result.status).to.equal(Workflow.States.CANCELLED);
                    expect(result.reason).to.equal('cancel reason');
                    done();
                });
        });

        it('never rejects - even if error in step execute', function(done) {
            Plugins.add(getStep('e', ['a'], {
                execute : function() {
                    throw new Error('error occurred');
                }
            }));
            new Workflow({name: 'test'})
                .dispatch()
                .then(function(result) {
                    expect(result.status).to.equal(Workflow.States.FAILED);
                    expect(result.error).to.be.an.instanceof(Error);
                    expect(result.error.message).to.equal('error occurred');
                    done();
                });
        });

        it('never rejects - even if step execute rejects', function(done) {
            Plugins.add(getStep('e', ['a'], {
                execute : function() {
                    return Promise.reject('rejected');
                }
            }));
            new Workflow({name: 'test'})
                .dispatch()
                .then(function(result) {
                    expect(result.status).to.equal(Workflow.States.FAILED);
                    expect(result.error).to.be.an.instanceof(Error);
                    expect(result.error.message).to.equal('rejected');
                    done();
                });
        });

        it('successful dispatch contains results from all steps', function(done) {
            new Workflow({name: 'test'}).dispatch()
                .then(function(result) {
                    expect(result.results).to.have.all.keys({a: 'a', b: 'b', c: 'c', d: 'd'});
                    done();
                });
        });

        it('cancelled dispatch contains executed step names', function(done) {
            Plugins.add(getStep('e', ['b'], {
                execute: function() {
                    this.cancel();
                }
            }));
            new Workflow({name: 'test'}).dispatch()
                .then(function(result) {
                    expect(result.status).to.equal(Workflow.States.CANCELLED);
                    expect(result.executed).to.include('a');
                    expect(result.executed).to.include('b');
                    expect(result.executed).to.include('e');
                    done();
                });
        });

        it('failed dispatch contains executed step names', function(done) {
            Plugins.add(getStep('e', ['b'], {
                execute: function() {
                    throw new Error();
                }
            }));
            new Workflow({name: 'test'}).dispatch()
                .then(function(result) {
                    expect(result.status).to.equal(Workflow.States.FAILED);
                    expect(result.executed).to.include('a');
                    expect(result.executed).to.include('b');
                    expect(result.executed).to.include('e');
                    done();
                });
        });

        it('step context has workflow name', function(done) {
            Plugins.add(getStep('e', ['b'], {
                execute: function() {
                    expect(this.workflow).to.equal('test');
                }
            }));
            new Workflow({name: 'test'}).dispatch()
                .then(function() {
                    done();
                });
        });

        it('step context has results object (with values)', function(done) {
            Plugins.add(getStep('e', ['d'], {
                execute: function() {
                    expect(this.results).to.contain({a: 'a', b: 'b', c: 'c', d: 'd'});
                }
            }));
            new Workflow({name: 'test'}).dispatch()
                .then(function() {
                    done();
                });
        });

        it('step context has cancel method', function(done) {
            Plugins.add(getStep('e', ['b'], {
                execute: function() {
                    expect(this).to.respondTo('cancel');
                }
            }));
            new Workflow({name: 'test'}).dispatch()
                .then(function() {
                    done();
                });
        });

        it('step members are available in context', function(done) {
            Plugins.add(getStep('e', ['b'], {
                instance: 'variable',
                execute: function() {
                    expect(this.instance).to.equal('variable');
                }
            }));
            new Workflow({name: 'test'}).dispatch()
                .then(function() {
                    done();
                });
        });

        it('steps do not share custom context', function(done) {
            Plugins.add(
                getStep('e', ['b'], {
                    instance: 'variable',
                    execute: function() {
                        expect(this.instance).to.equal('variable');
                    }
                }),
                getStep('f', ['e'], {
                    execute: function() {
                        /* jshint -W030 */
                        expect(this.instance).not.to.be.defined;
                    }
                })
            );
            new Workflow({name: 'test'}).dispatch()
                .then(function() {
                    done();
                });
        });

        it('init called before execute', function(done) {
            Plugins.add(getStep('e', ['b'], {
                instance: 'variable',
                init: function() {
                    this.instance = 'other value';
                },
                execute: function() {
                    expect(this.instance).to.equal('other value');
                }
            }));
            new Workflow({name: 'test'}).dispatch()
                .then(function() {
                    done();
                });
        });

        it('init not re-invoked if execute fails', function(done) {
            var callCount = 0;
            Plugins.add(getStep('e', ['b'], {
                init: function() {
                    callCount++;
                },
                execute: function() {
                    throw new Error();
                }
            }));
            new Workflow({name: 'test'}).dispatch()
                .then(function() {
                    expect(callCount).to.equal(1);
                    done();
                });
        });

        it('retry method given failure reason', function(done) {
            var callCount = 0;
            Plugins.add(getStep('e', ['b'], {
                execute: function() {
                    throw new Error('reason');
                },
                retry: function(err) {
                    if (0 === callCount++) {
                        expect(err).to.be.an.instanceof(Error);
                        expect(err.message).to.equal('reason');
                    } else {
                        return Promise.reject();
                    }
                }
            }));
            new Workflow({name: 'test'}).dispatch()
                .then(function(result) {
                    expect(result.status).to.equal(Workflow.States.FAILED);
                    expect(result.error.message).to.equal('Error occurred in e.');
                    done();
                });
        });

        it('ignores disabled steps', function(done) {
            Plugins.add(getStep('e', ['b'], {
                enabled: false
            }));
            new Workflow({name: 'test'}).dispatch()
                .then(function(result) {
                    expect(result.executed).not.to.contain.key('e');
                    done();
                });
        });

        it('on failed dispatch, rollback only executed methods', function(done) {
            var rollbacks = [];
            Plugins.add(
                getStep('e', ['b'], {
                    execute: function() { throw new Error('execute failure'); },
                    rollback: function() { rollbacks.push(this.name); }
                }),
                getStep('f', ['e'])
            );
            expect(rollbacks.length).to.equal(0);
            new Workflow({name: 'test'}).dispatch()
                .then(function(result) {
                    expect(rollbacks.length).to.equal(1);
                    expect(rollbacks[0]).to.equal('e');
                    expect(result.executed).not.to.contain('f');
                    expect(result.error.rollbackErrors.length).to.equal(0);
                    done();
                });
        });

        it('if rollback fails, add it to the rollbackErrors result', function(done) {
            Plugins.add(
                getStep('e', ['b'], {
                    execute: function() { throw new Error('execute failure'); },
                    rollback: function() { throw new Error('rollback failed'); }
                })
            );
            new Workflow({name: 'test'}).dispatch()
                .then(function(result) {
                    expect(result.executed).not.to.contain('f');
                    expect(result.error.rollbackErrors.length).to.equal(1);
                    expect(result.error.rollbackErrors[0].message).to.equal('rollback failed');
                    done();
                });
        });

        it('on failed dispatch, all steps failure', function(done) {
            var failures = [];
            Plugins.add(
                getStep('e', ['b'], {
                    execute: function() { throw new Error('execute failure'); },
                    failure: function() { failures.push(this.name); }
                }),
                getStep('f', ['e'], {
                    failure: function() { failures.push(this.name); }
                })
            );
            expect(failures.length).to.equal(0);
            new Workflow({name: 'test'}).dispatch()
                .then(function(result) {
                    expect(failures.length).to.equal(2);
                    expect(failures[0]).to.equal('e');
                    expect(failures[1]).to.equal('f');
                    done();
                });
        });

        it('on failed dispatch, no steps succeed', function(done) {
            var successes = [];
            Plugins.add(
                getStep('e', ['b'], {
                    execute: function() { throw new Error('execute failure'); },
                    success: function() { successes.push(this.name); }
                }),
                getStep('f', ['e'], {
                    success: function() { successes.push(this.name); }
                })
            );
            expect(successes.length).to.equal(0);
            new Workflow({name: 'test'}).dispatch()
                .then(function(result) {
                    expect(successes.length).to.equal(0);
                    done();
                });
        });

        it('cancel method not available in rollback and failure', function(done) {
            Plugins.add(getStep('e', ['b'], {
                execute: function() { throw new Error('execute failure'); },
                rollback: function() {
                    expect(this).not.to.respondTo('cancel');
                },
                failure: function() {
                    expect(this).not.to.respondTo('cancel');
                }
            }));
            new Workflow({name: 'test'}).dispatch().then(function() {
                done();
            });
        });

        it('cancel method not available in success', function(done) {
            Plugins.add(getStep('e', ['b'], {
                success: function() {
                    expect(this).not.to.respondTo('cancel');
                }
            }));
            new Workflow({name: 'test'}).dispatch().then(function() {
                done();
            });
        });

        it('on success dispatch, all steps succeed', function(done) {
            var successes = [];
            Plugins.add(
                getStep('e', ['b'], {
                    success: function() { successes.push(this.name); }
                }),
                getStep('f', ['e'], {
                    success: function() { successes.push(this.name); }
                })
            );
            expect(successes.length).to.equal(0);
            new Workflow({name: 'test'}).dispatch()
                .then(function(result) {
                    expect(successes.length).to.equal(2);
                    expect(successes[0]).to.equal('e');
                    expect(successes[1]).to.equal('f');
                    done();
                });
        });

        it('on success dispatch, no steps failure', function(done) {
            var failures = [];
            Plugins.add(
                getStep('e', ['b'], {
                    failure: function() { failures.push(this.name); }
                }),
                getStep('f', ['e'], {
                    failure: function() { failures.push(this.name); }
                })
            );
            expect(failures.length).to.equal(0);
            new Workflow({name: 'test'}).dispatch()
                .then(function(result) {
                    expect(failures.length).to.equal(0);
                    done();
                });
        });

    });

});
